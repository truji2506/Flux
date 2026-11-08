import * as ecs from '@8thwall/ecs'

const {THREE} = window as any

// Piezas del corazón: la llave es el nombre de la malla en el .glb.
// Los textos son los mismos del catálogo anatómico de fluxapp.
const PARTES: Record<string, {nombre: string, descripcion: string}> = {
  tabique_interventricular: {
    nombre: 'Tabique interventricular',
    descripcion: 'Pared muscular que separa el ventrículo derecho del izquierdo e impide que se mezclen la sangre con oxígeno y la que no lo tiene.',
  },
  auricula_derecha: {
    nombre: 'Aurícula derecha',
    descripcion: 'Recibe la sangre sin oxígeno que vuelve de todo el cuerpo por las venas cavas.',
  },
  auricula_izquierda: {
    nombre: 'Aurícula izquierda',
    descripcion: 'Recibe la sangre ya oxigenada que llega de los pulmones por las venas pulmonares.',
  },
  valvula_tricuspide: {
    nombre: 'Válvula tricúspide',
    descripcion: 'Deja pasar la sangre de la aurícula derecha al ventrículo derecho y le impide devolverse cuando el ventrículo se contrae.',
  },
  valvula_mitral: {
    nombre: 'Válvula mitral',
    descripcion: 'Comunica la aurícula izquierda con el ventrículo izquierdo. Es la que soporta más presión de las cuatro.',
  },
  valvula_pulmonar: {
    nombre: 'Válvula pulmonar',
    descripcion: 'Puerta de salida del ventrículo derecho hacia la arteria pulmonar.',
  },
  valvula_aortica: {
    nombre: 'Válvula aórtica',
    descripcion: 'Puerta de salida del ventrículo izquierdo hacia la aorta. Se abre en cada sístole para expulsar el volumen sistólico.',
  },
  arteria_pulmonar: {
    nombre: 'Arteria pulmonar',
    descripcion: 'Lleva la sangre sin oxígeno del corazón a los pulmones. Es la única arteria del cuerpo que transporta sangre venosa.',
  },
  aorta: {
    nombre: 'Aorta',
    descripcion: 'Saca del corazón toda la sangre oxigenada y la reparte al resto del cuerpo.',
  },
}

const COLOR_RESALTE = 0x2a6ea8
const OPACIDAD_ATENUADA = 0.15
const UMBRAL_CLIC = 8  // píxeles: más que esto es un arrastre, no un toque

const raycaster = new THREE.Raycaster()
const puntero = new THREE.Vector2()
const _centro = new THREE.Vector3()
const _caja = new THREE.Box3()
// Radio, en píxeles, para aceptar un toque que cae cerca de algo sin acertarlo
const TOLERANCIA_TOQUE = 40

// Un objeto solo cuenta si se ve: el Raycaster de Three ignora .visible, y sin
// esto se podían tocar piezas con la tarjeta fuera de cámara.
const esVisible = (obj: any) => {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false
  return true
}

// Abre un enlace una sola vez aunque lleguen dos eventos del mismo toque
let _ultimoEnlace = 0
const abrirEnlace = (url: string) => {
  const ahora = Date.now()
  if (ahora - _ultimoEnlace < 800) return
  _ultimoEnlace = ahora
  const w = window.open(url, '_blank')
  if (!w) window.location.href = url
}
;(window as any).__fluxAbrirEnlace = abrirEnlace

// Orden del recorrido con las flechas: el camino que sigue la sangre
const RECORRIDO = [
  'auricula_derecha', 'valvula_tricuspide', 'tabique_interventricular',
  'valvula_pulmonar', 'arteria_pulmonar', 'auricula_izquierda',
  'valvula_mitral', 'valvula_aortica', 'aorta',
]

const ESTILOS = `
#flux-anatomia { position: fixed; left: 0; right: 0; bottom: 20px; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  font-family: system-ui, -apple-system, sans-serif; pointer-events: none; }
#flux-anatomia * { box-sizing: border-box; }
#flux-anatomia button { font-family: inherit; -webkit-tap-highlight-color: transparent; }
#flux-anatomia .pista { padding: 6px 12px; border-radius: 999px; color: #eaf2ff;
  background: rgba(10,18,28,0.78); border: 1px solid rgba(255,255,255,0.18);
  font-size: 12px; font-weight: 500; }
#flux-anatomia .abrir { pointer-events: auto; min-height: 44px; padding: 0 22px;
  border-radius: 999px; border: 1px solid #64ffda; background: rgba(10,18,28,0.88);
  color: #64ffda; font-size: 15px; font-weight: 600; cursor: pointer; }
#flux-anatomia .ficha { pointer-events: auto; width: min(92vw, 380px); padding: 12px;
  border-radius: 16px; background: rgba(10,18,28,0.9); border: 1px solid #64ffda;
  color: #eaf2ff; }
#flux-anatomia .fila { display: flex; align-items: center; gap: 8px; }
#flux-anatomia .flecha, #flux-anatomia .cerrar { flex: none; width: 44px; height: 44px;
  border-radius: 12px; border: 1px solid rgba(100,255,218,0.45); background: transparent;
  color: #64ffda; font-size: 20px; line-height: 1; cursor: pointer; }
#flux-anatomia .cerrar { width: 32px; height: 32px; font-size: 16px; border: none; }
#flux-anatomia .titulo { flex: 1; min-width: 0; text-align: center; }
#flux-anatomia .nombre { font-size: 16px; font-weight: 700; color: #64ffda; }
#flux-anatomia .contador { font-size: 11px; color: rgba(234,242,255,0.6); margin-top: 2px; }
#flux-anatomia .descripcion { margin-top: 10px; font-size: 13px; line-height: 1.45;
  color: rgba(234,242,255,0.88); }
#flux-anatomia .cabecera { display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: rgba(234,242,255,0.6); }
#flux-anatomia [hidden] { display: none !important; }
`

ecs.registerComponent({
  name: 'heart-anatomy',
  stateMachine: ({world}) => {
    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        const {renderer, scene, activeCamera} = world.three as any
        const lienzo: HTMLElement = renderer.domElement

        // Piezas encontradas por nombre (se buscan cuando el modelo ya cargó)
        const piezas = new Map<string, any>()
        const emisivoBase = new Map<string, number>()
        let seleccion = ''
        let modoAnatomia = false
        let tarjetaVisible = false
        let inicio: {x: number, y: number} | null = null

        // ---------- Interfaz (HTML sobre la escena) ----------
        const estilo = document.createElement('style')
        estilo.textContent = ESTILOS
        document.head.appendChild(estilo)

        const raiz = document.createElement('div')
        raiz.id = 'flux-anatomia'
        raiz.innerHTML = `
          <div class="pista">Apunta a la tarjeta Flux</div>
          <button class="abrir" type="button" hidden>Anatomía</button>
          <div class="ficha" hidden>
            <div class="cabecera"><span>Anatomía del corazón</span>
              <button class="cerrar" type="button" aria-label="Cerrar anatomía">✕</button></div>
            <div class="fila">
              <button class="flecha anterior" type="button" aria-label="Pieza anterior">◀</button>
              <div class="titulo"><div class="nombre"></div><div class="contador"></div></div>
              <button class="flecha siguiente" type="button" aria-label="Pieza siguiente">▶</button>
            </div>
            <div class="descripcion"></div>
          </div>`
        document.body.appendChild(raiz)
        const $ = (sel: string) => raiz.querySelector(sel) as HTMLElement
        const pista = $('.pista')
        const botonAbrir = $('.abrir')
        const ficha = $('.ficha')

        // ---------- Piezas ----------
        const buscarPiezas = () => {
          if (piezas.size > 0) return
          scene.traverse((obj: any) => {
            if (!obj.isMesh || !PARTES[obj.name]) return
            // Material propio por pieza: si se comparte, resaltar una
            // encendería varias a la vez.
            obj.material = obj.material.clone()
            // Quieto, como en el visor de anatomía de fluxapp
            if (obj.morphTargetInfluences) obj.morphTargetInfluences.fill(0)
            piezas.set(obj.name, obj)
            emisivoBase.set(obj.name, obj.material.emissive ? obj.material.emissive.getHex() : 0)
          })
        }

        const pintar = () => {
          buscarPiezas()
          const hay = seleccion !== ''
          piezas.forEach((malla, nombre) => {
            const m = malla.material
            const esta = hay && nombre === seleccion
            const atenuada = hay && !esta
            if (m.emissive) m.emissive.setHex(esta ? COLOR_RESALTE : emisivoBase.get(nombre) || 0)
            m.transparent = atenuada
            m.opacity = atenuada ? OPACIDAD_ATENUADA : 1
            m.depthWrite = !atenuada
            m.needsUpdate = true
          })
        }

        const actualizarInterfaz = () => {
          const enFicha = modoAnatomia && seleccion !== ''
          ficha.hidden = !enFicha
          botonAbrir.hidden = enFicha || !tarjetaVisible
          pista.hidden = enFicha
          pista.textContent = tarjetaVisible
            ? 'Toca "Anatomía" o una pieza del corazón'
            : 'Apunta a la tarjeta Flux'
          if (enFicha) {
            const i = RECORRIDO.indexOf(seleccion)
            $('.nombre').textContent = PARTES[seleccion].nombre
            $('.contador').textContent = `${i + 1} / ${RECORRIDO.length}`
            $('.descripcion').textContent = PARTES[seleccion].descripcion
          }
        }

        const seleccionar = (nombre: string) => {
          seleccion = nombre
          modoAnatomia = nombre !== ''
          pintar()
          actualizarInterfaz()
        }

        const mover = (paso: number) => {
          const i = RECORRIDO.indexOf(seleccion)
          const n = RECORRIDO.length
          seleccionar(RECORRIDO[((i < 0 ? 0 : i + paso) % n + n) % n])
        }

        botonAbrir.addEventListener('click', () => seleccionar(RECORRIDO[0]))
        $('.anterior').addEventListener('click', () => mover(-1))
        $('.siguiente').addEventListener('click', () => mover(1))
        $('.cerrar').addEventListener('click', () => seleccionar(''))

        // ---------- Detección de la tarjeta ----------
        const ev = (ecs as any).events
        const gid = (world as any).events.globalId
        const escuchas: Array<[string, (e: any) => void]> = []
        const oir = (nombre: string, fn: (e: any) => void) => {
          if (!nombre) return
          ;(world as any).events.addListener(gid, nombre, fn)
          escuchas.push([nombre, fn])
        }
        oir(ev?.REALITY_IMAGE_FOUND, () => { tarjetaVisible = true; actualizarInterfaz() })
        oir(ev?.REALITY_IMAGE_LOST, () => { tarjetaVisible = false; actualizarInterfaz() })
        actualizarInterfaz()

        // ---------- Toque directo sobre piezas e íconos ----------
        const distanciaEnPantalla = (obj: any, e: PointerEvent, caja: DOMRect) => {
          _caja.setFromObject(obj).getCenter(_centro).project(activeCamera)
          if (_centro.z > 1) return Infinity
          const x = (_centro.x * 0.5 + 0.5) * caja.width + caja.left
          const y = (-_centro.y * 0.5 + 0.5) * caja.height + caja.top
          return Math.hypot(e.clientX - x, e.clientY - y)
        }

        const prepararRayo = (e: PointerEvent) => {
          const caja = lienzo.getBoundingClientRect()
          puntero.x = ((e.clientX - caja.left) / caja.width) * 2 - 1
          puntero.y = -((e.clientY - caja.top) / caja.height) * 2 + 1
          activeCamera.updateMatrixWorld()
          scene.updateMatrixWorld(true)
          raycaster.setFromCamera(puntero, activeCamera)
          return caja
        }

        // Los botones de UI anidados en el objetivo de imagen no reciben el clic
        // en AR, así que el toque sobre los íconos se resuelve aquí.
        const enlaceBajoElPuntero = (e: PointerEvent, caja: DOMRect): string => {
          const enlaces = (window as any).__fluxEnlaces || []
          const mapa = (world as any).three.entityToObject
          let mejor = ''
          let menor = TOLERANCIA_TOQUE
          for (const enlace of enlaces) {
            const obj = mapa && mapa.get ? mapa.get(enlace.eid) : null
            if (!obj || !esVisible(obj)) continue
            if (raycaster.intersectObject(obj, true).length > 0) return enlace.url
            const d = distanciaEnPantalla(obj, e, caja)
            if (d < menor) { menor = d; mejor = enlace.url }
          }
          return mejor
        }

        const piezaBajoElPuntero = (e: PointerEvent, caja: DOMRect): string => {
          buscarPiezas()
          const visibles = Array.from(piezas.values()).filter(esVisible)
          if (visibles.length === 0) return ''
          const choques = raycaster.intersectObjects(visibles, false)
          if (choques.length > 0) return choques[0].object.name
          let mejor = ''
          let menor = TOLERANCIA_TOQUE
          for (const malla of visibles) {
            const d = distanciaEnPantalla(malla, e, caja)
            if (d < menor) { menor = d; mejor = malla.name }
          }
          return mejor
        }

        const alBajar = (e: PointerEvent) => { inicio = {x: e.clientX, y: e.clientY} }
        const alSubir = (e: PointerEvent) => {
          if (!inicio) return
          const movido = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y)
          inicio = null
          if (movido > UMBRAL_CLIC) return
          // Los toques sobre la ficha y sus botones los manejan ellos
          if (raiz.contains(e.target as Node)) return
          const caja = prepararRayo(e)
          const url = enlaceBajoElPuntero(e, caja)
          if (url) { abrirEnlace(url); return }
          const tocada = piezaBajoElPuntero(e, caja)
          if (tocada) seleccionar(tocada === seleccion ? '' : tocada)
        }
        // En toda la ventana y en captura: si 8th Wall pone una capa encima del
        // lienzo, el toque igual llega.
        window.addEventListener('pointerdown', alBajar, true)
        window.addEventListener('pointerup', alSubir, true)

        // Limpieza al salir del estado
        ;(world as any).__heartAnatomyCleanup = () => {
          window.removeEventListener('pointerdown', alBajar, true)
          window.removeEventListener('pointerup', alSubir, true)
          raiz.remove()
          estilo.remove()
          escuchas.forEach(([n, f]) => (world as any).events.removeListener(gid, n, f))
        }
      })
      .onExit(() => {
        const limpiar = (world as any).__heartAnatomyCleanup
        if (limpiar) limpiar()
      })
  },
})
