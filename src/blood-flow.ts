// Corriente de glóbulos dentro de un modelo (corazón o arteria), con la misma
// idea de fluxapp: el modelo trae esferas guía animadas por dentro de las
// cavidades. En vez de mostrarlas, se leen sus fotogramas clave, se convierten
// en un recorrido y por él circulan muchos glóbulos en bucle.

const {THREE} = window as any

export type ConfigFlujo = {
  objetivo: string                    // lado de la tarjeta (para atenuar con la ficha abierta)
  urlModelo: string                   // .glb del que se leen las guías
  urlGlobulo: string                  // .glb con la forma del glóbulo
  patronGuia: RegExp                  // nombres de las mallas guía
  color: (nombreGuia: string) => 'rojo' | 'azul'
  densidad?: number                   // glóbulos por diámetro de recorrido (más = más juntos)
  duracion?: number                   // segundos que tarda un glóbulo en hacer el recorrido
}

const COLORES = {
  rojo: {color: 0xff2b2b, emissive: 0x330000},
  azul: {color: 0x3366ff, emissive: 0x001133},
}
const OPACIDAD_ATENUADA = 0.18
const TRAMO_EXTREMO = 0.08   // fracción del recorrido donde la corriente se estrecha
const DISPERSION = 0.35      // cuánto se separan del eje, en diámetros de glóbulo

// ---------- Lectura de .glb (sin GLTFLoader, que no está expuesto) ----------
type Glb = {json: any, bin: ArrayBuffer}
const cacheGlb = new Map<string, Promise<Glb>>()

const leerGlb = (url: string): Promise<Glb> => {
  if (!cacheGlb.has(url)) {
    cacheGlb.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${url} (${r.status})`)
      return r.arrayBuffer()
    }).then((buf) => {
      const dv = new DataView(buf)
      const largoJson = dv.getUint32(12, true)
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, largoJson)))
      const inicioBin = 20 + largoJson
      const largoBin = dv.getUint32(inicioBin, true)
      return {json, bin: buf.slice(inicioBin + 8, inicioBin + 8 + largoBin)}
    }))
  }
  return cacheGlb.get(url)!
}

const COMPONENTES: Record<string, number> = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}
const TIPOS: Record<number, any> = {5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array}

// Devuelve los valores de un accessor como arreglo plano (respeta byteStride)
const leerAccessor = ({json, bin}: Glb, indice: number): number[] => {
  const acc = json.accessors[indice]
  const vista = json.bufferViews[acc.bufferView]
  const Tipo = TIPOS[acc.componentType]
  const n = COMPONENTES[acc.type]
  const tamano = Tipo.BYTES_PER_ELEMENT
  const paso = vista.byteStride || n * tamano
  const base = (vista.byteOffset || 0) + (acc.byteOffset || 0)
  const dv = new DataView(bin)
  const leer = (off: number) => {
    switch (acc.componentType) {
      case 5126: return dv.getFloat32(off, true)
      case 5123: return dv.getUint16(off, true)
      case 5125: return dv.getUint32(off, true)
      default: return dv.getUint8(off)
    }
  }
  const salida: number[] = []
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) salida.push(leer(base + i * paso + c * tamano))
  }
  return salida
}

type Guia = {nombre: string, puntos: any[], duracion: number, escalaBase: number[]}

const leerGuias = async (url: string, patron: RegExp): Promise<Guia[]> => {
  const glb = await leerGlb(url)
  const {json} = glb
  const guias: Guia[] = []
  for (const anim of json.animations || []) {
    for (const canal of anim.channels) {
      if (canal.target.path !== 'translation') continue
      const nodo = json.nodes[canal.target.node]
      if (!nodo || !patron.test(nodo.name || '')) continue
      if (guias.some((g) => g.nombre === nodo.name)) continue
      const muestreo = anim.samplers[canal.sampler]
      const tiempos = leerAccessor(glb, muestreo.input)
      const valores = leerAccessor(glb, muestreo.output)
      // Con interpolación suave glTF guarda tangente, valor, tangente: solo el valor
      const suave = muestreo.interpolation === 'CUBICSPLINE'
      const paso = suave ? 9 : 3
      const desde = suave ? 3 : 0
      const puntos: any[] = []
      for (let i = desde; i + 2 < valores.length; i += paso) {
        puntos.push(new THREE.Vector3(valores[i], valores[i + 1], valores[i + 2]))
      }
      if (puntos.length < 2) continue
      guias.push({
        nombre: nodo.name,
        puntos,
        duracion: Math.max(0.5, tiempos[tiempos.length - 1] - tiempos[0]),
        escalaBase: nodo.scale || [1, 1, 1],
      })
    }
  }
  return guias
}

// Geometría del glóbulo normalizada a diámetro 1, con el disco en el plano XZ
const leerGeometriaGlobulo = async (url: string) => {
  const glb = await leerGlb(url)
  const prim = glb.json.meshes[0].primitives[0]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(leerAccessor(glb, prim.attributes.POSITION), 3))
  if (prim.attributes.NORMAL !== undefined) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(leerAccessor(glb, prim.attributes.NORMAL), 3))
  }
  if (prim.indices !== undefined) geo.setIndex(leerAccessor(glb, prim.indices))
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  geo.computeBoundingBox()
  const tam = geo.boundingBox.getSize(new THREE.Vector3())
  const mayor = Math.max(tam.x, tam.y, tam.z) || 1
  geo.scale(1 / mayor, 1 / mayor, 1 / mayor)
  return geo
}

// Recorrido poligonal con avance por longitud (los tramos de Blender son lineales)
const crearRecorrido = (puntos: any[]) => {
  const acumulado = [0]
  for (let i = 1; i < puntos.length; i++) acumulado.push(acumulado[i - 1] + puntos[i].distanceTo(puntos[i - 1]))
  const total = acumulado[acumulado.length - 1] || 1
  const ubicar = (t: number) => {
    const d = Math.min(1, Math.max(0, t)) * total
    let i = 1
    while (i < acumulado.length - 1 && acumulado[i] < d) i++
    const largo = acumulado[i] - acumulado[i - 1]
    return {i, f: largo > 0 ? (d - acumulado[i - 1]) / largo : 0}
  }
  return {
    longitud: total,
    punto: (t: number, destino: any) => {
      const u = ubicar(t)
      return destino.copy(puntos[u.i - 1]).lerp(puntos[u.i], u.f)
    },
    direccion: (t: number, destino: any) => {
      const u = ubicar(t)
      return destino.copy(puntos[u.i]).sub(puntos[u.i - 1]).normalize()
    },
  }
}

// Qué lados de la tarjeta tienen la ficha de anatomía abierta (lo marca el visor)
export const marcarSeleccion = (objetivo: string, activa: boolean) => {
  const mapa = ((window as any).__fluxSeleccion = (window as any).__fluxSeleccion || {})
  mapa[objetivo] = activa
}
const haySeleccion = (objetivo: string) => !!((window as any).__fluxSeleccion || {})[objetivo]

// Monta la corriente sobre el modelo de la entidad y devuelve la limpieza
export const montarFlujo = (world: any, eid: any, cfg: ConfigFlujo) => {
  let cancelado = false
  let cuadro = 0
  const corrientes: any[] = []
  const materiales: any[] = []

  const raizModelo = () => {
    const mapa = world.three.entityToObject
    return (mapa && mapa.get && mapa.get(eid)) || null
  }

  const _pos = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  const _normal = new THREE.Vector3()
  const _binormal = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _giro = new THREE.Quaternion()
  const _escala = new THREE.Vector3()
  const _matriz = new THREE.Matrix4()
  const EJE_X = new THREE.Vector3(1, 0, 0)

  const suavizar = (x: number) => x * x * (3 - 2 * x)

  const animar = (ahora: number, antes: number) => {
    const dt = Math.min(0.1, (ahora - antes) / 1000)
    const atenuar = haySeleccion(cfg.objetivo)
    for (const m of materiales) {
      const meta = atenuar ? OPACIDAD_ATENUADA : 1
      m.opacity += (meta - m.opacity) * Math.min(1, dt * 8)
      m.transparent = m.opacity < 0.99
      m.depthWrite = !m.transparent
    }
    for (const c of corrientes) {
      for (let i = 0; i < c.globulos.length; i++) {
        const g = c.globulos[i]
        g.progreso = (g.progreso + dt / c.duracion) % 1
        const t = g.progreso
        c.recorrido.punto(t, _pos)
        c.recorrido.direccion(t, _dir)
        // Separados del eje para que no vayan en fila; juntos al entrar y salir
        const borde = Math.min(suavizar(Math.min(1, t / TRAMO_EXTREMO)), suavizar(Math.min(1, (1 - t) / TRAMO_EXTREMO)))
        const radio = DISPERSION * c.diametro * g.radio * borde
        _normal.set(0, 1, 0).cross(_dir)
        if (_normal.lengthSq() < 1e-6) _normal.set(1, 0, 0)
        _normal.normalize()
        _binormal.crossVectors(_dir, _normal).normalize()
        _pos.addScaledVector(_normal, Math.cos(g.angulo) * radio)
        _pos.addScaledVector(_binormal, Math.sin(g.angulo) * radio)
        // Disco de canto en la dirección del flujo, girando sobre sí mismo
        _quat.setFromUnitVectors(EJE_X, _dir)
        g.giro += dt * g.velocidadGiro
        _giro.setFromAxisAngle(_dir, g.giro)
        _quat.premultiply(_giro)
        _escala.setScalar(c.diametro)
        _matriz.compose(_pos, _quat, _escala)
        c.malla.setMatrixAt(i, _matriz)
      }
      c.malla.instanceMatrix.needsUpdate = true
    }
  }

  const iniciar = async () => {
    let guias: Guia[] = []
    let geometria: any = null
    try {
      ;[guias, geometria] = await Promise.all([
        leerGuias(cfg.urlModelo, cfg.patronGuia),
        leerGeometriaGlobulo(cfg.urlGlobulo),
      ])
    } catch (err) {
      console.warn('Flujo de glóbulos:', err)
      return
    }
    if (cancelado || guias.length === 0) return

    // Esperar a que el modelo esté en la escena para colgar los glóbulos en el
    // mismo espacio que las guías (sus fotogramas son relativos a ese padre)
    const buscar = () => {
      if (cancelado) return
      try { montar() } catch (err) {
        console.error('Flujo de glóbulos no se pudo montar:', err)
        apagar()
      }
    }
    const montar = () => {
      const raiz = raizModelo()
      const mallas = raiz ? guias.map((g) => raiz.getObjectByName(g.nombre)) : []
      if (!raiz || mallas.some((m: any) => !m)) { window.setTimeout(buscar, 400); return }

      guias.forEach((guia, k) => {
        const malla = mallas[k]
        malla.visible = false
        // Diámetro: el de la esfera guía, que se modeló para pasar por los conductos
        malla.geometry.computeBoundingBox()
        const tam = malla.geometry.boundingBox.getSize(new THREE.Vector3())
        const s = guia.escalaBase.map((v: number) => Math.abs(v))
        const diametro = Math.min(tam.x * s[0], tam.y * s[1], tam.z * s[2])
        const recorrido = crearRecorrido(guia.puntos)
        const cantidad = Math.max(6, Math.min(36, Math.round(recorrido.longitud / (diametro * 1.8) * (cfg.densidad || 1))))

        const tono = COLORES[cfg.color(guia.nombre)]
        const material = new THREE.MeshStandardMaterial({
          color: tono.color, emissive: tono.emissive, roughness: 0.35, metalness: 0,
          transparent: false, opacity: 1,
        })
        materiales.push(material)
        const instancias = new THREE.InstancedMesh(geometria, material, cantidad)
        instancias.frustumCulled = false   // la caja de la geometría base no cubre el recorrido
        instancias.name = `flujo_${guia.nombre}`
        malla.parent.add(instancias)

        const globulos = []
        for (let i = 0; i < cantidad; i++) {
          globulos.push({
            progreso: (i + Math.random() * 0.5) / cantidad,   // escalonados, no en racimos
            angulo: Math.random() * Math.PI * 2,
            radio: Math.sqrt(Math.random()),
            giro: Math.random() * Math.PI * 2,
            velocidadGiro: (Math.random() - 0.5) * 3,
          })
        }
        corrientes.push({malla: instancias, recorrido, diametro, duracion: cfg.duracion || guia.duracion, globulos})
      })

      let antes = performance.now()
      const bucle = (ahora: number) => {
        if (cancelado) return
        try {
          animar(ahora, antes)
        } catch (err) {
          // Si algo falla, se apaga la corriente sin tumbar el resto de la escena
          console.error('Flujo de glóbulos detenido:', err)
          apagar()
          return
        }
        antes = ahora
        cuadro = requestAnimationFrame(bucle)
      }
      cuadro = requestAnimationFrame(bucle)
    }
    buscar()
  }
  function apagar() {
    cancelado = true
    cancelAnimationFrame(cuadro)
    for (const c of corrientes) {
      try {
        if (c.malla.parent) c.malla.parent.remove(c.malla)
        c.malla.dispose()
      } catch (e) { /* ya no está en la escena */ }
    }
    corrientes.length = 0
    for (const m of materiales) m.dispose()
    materiales.length = 0
  }

  iniciar().catch((err) => { console.error('Flujo de glóbulos:', err); apagar() })
  return apagar
}
