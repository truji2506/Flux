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

ecs.registerComponent({
  name: 'heart-anatomy',
  stateMachine: ({world}) => {
    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        const {renderer, scene, activeCamera} = world.three as any
        const lienzo: HTMLElement = renderer.domElement

        // Piezas encontradas por nombre (se buscan al primer toque, cuando el
        // modelo ya cargó) y su estado original.
        const piezas = new Map<string, any>()
        const emisivoBase = new Map<string, number>()
        let seleccion = ''
        let inicio: {x: number, y: number} | null = null

        // ---------- Panel de información (HTML sobre la escena) ----------
        const panel = document.createElement('div')
        panel.style.cssText = [
          'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
          'width:min(86vw,340px)', 'padding:12px 14px', 'border-radius:14px',
          'background:rgba(10,18,28,0.86)', 'border:1px solid #64ffda',
          'color:#eaf2ff', 'font:400 13px/1.45 system-ui,sans-serif',
          'z-index:9999', 'display:none', 'pointer-events:none',
        ].join(';')
        const titulo = document.createElement('div')
        titulo.style.cssText = 'font:600 15px/1.2 system-ui,sans-serif;margin-bottom:6px;color:#64ffda'
        const texto = document.createElement('div')
        texto.style.cssText = 'color:rgba(234,242,255,0.85)'
        panel.appendChild(titulo)
        panel.appendChild(texto)
        document.body.appendChild(panel)

        const pista = document.createElement('div')
        pista.textContent = 'Toca una pieza del corazón'
        pista.style.cssText = [
          'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
          'padding:6px 12px', 'border-radius:999px', 'background:rgba(10,18,28,0.78)',
          'border:1px solid rgba(255,255,255,0.18)', 'color:#eaf2ff',
          'font:500 12px/1.2 system-ui,sans-serif', 'z-index:9999', 'pointer-events:none',
        ].join(';')
        document.body.appendChild(pista)

        // ---------- Estado de la detección de la tarjeta (diagnóstico) ----------
        let estado = 'Cargando tarjeta…'
        const textoPista = () => {
          pista.textContent = estado
          pista.style.whiteSpace = 'normal'
          pista.style.maxWidth = '86vw'
          pista.style.textAlign = 'center'
        }
        const ev = (ecs as any).events
        const gid = (world as any).events.globalId
        const escuchas: Array<[string, (e: any) => void]> = []
        const oir = (nombre: string, fn: (e: any) => void) => {
          if (!nombre) return
          ;(world as any).events.addListener(gid, nombre, fn)
          escuchas.push([nombre, fn])
        }
        oir(ev?.REALITY_IMAGE_LOADING, (e: any) => {
          estado = 'Cargando tarjeta (' + ((e.data?.imageTargets || []).map((t: any) => t.name).join(', ') || '?') + ')'
          textoPista()
        })
        oir(ev?.REALITY_IMAGE_SCANNING, () => { estado = 'Apunta a la tarjeta'; textoPista() })
        oir(ev?.REALITY_IMAGE_FOUND, (e: any) => { estado = 'Tarjeta detectada ✓ ' + (e.data?.name || ''); textoPista() })
        oir(ev?.REALITY_IMAGE_LOST, () => { estado = 'Tarjeta perdida'; textoPista() })
        textoPista()

        // Prueba directa: ¿existen en el sitio los archivos del objetivo de imagen?
        const probar = (ruta: string, etiqueta: string) => {
          fetch(ruta, {cache: 'no-store'})
            .then((r) => { estado += ' | ' + etiqueta + ' ' + r.status; textoPista() })
            .catch(() => { estado += ' | ' + etiqueta + ' error'; textoPista() })
        }
        probar('image-targets/tarjeta-flux-frente.json', 'json')
        probar('image-targets/tarjeta-flux-frente_luminance.png', 'img')
        setTimeout(() => {
          const xr = (window as any).XR8
          estado += ' | XR8 ' + (xr ? 'si' : 'no')
          textoPista()
        }, 1500)

        // ---------- Piezas ----------
        const buscarPiezas = () => {
          if (piezas.size > 0) return
          scene.traverse((obj: any) => {
            if (!obj.isMesh || !PARTES[obj.name]) return
            // Cada pieza con su propio material: si se comparte, resaltar una
            // encendería varias a la vez.
            obj.material = obj.material.clone()
            piezas.set(obj.name, obj)
            emisivoBase.set(obj.name, obj.material.emissive ? obj.material.emissive.getHex() : 0)
          })
        }

        const aplicar = () => {
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
          if (hay) {
            titulo.textContent = PARTES[seleccion].nombre
            texto.textContent = PARTES[seleccion].descripcion
            panel.style.display = 'block'
            pista.style.display = 'none'
          } else {
            panel.style.display = 'none'
            pista.style.display = 'block'
          }
        }

        const piezaBajoElPuntero = (e: PointerEvent): string => {
          buscarPiezas()
          if (piezas.size === 0) return ''
          const caja = lienzo.getBoundingClientRect()
          puntero.x = ((e.clientX - caja.left) / caja.width) * 2 - 1
          puntero.y = -((e.clientY - caja.top) / caja.height) * 2 + 1
          activeCamera.updateMatrixWorld()
          scene.updateMatrixWorld(true)
          raycaster.setFromCamera(puntero, activeCamera)
          const choques = raycaster.intersectObjects(Array.from(piezas.values()), false)
          return choques.length > 0 ? choques[0].object.name : ''
        }

        // ---------- Toques ----------
        const alBajar = (e: PointerEvent) => { inicio = {x: e.clientX, y: e.clientY} }
        const alSubir = (e: PointerEvent) => {
          if (!inicio) return
          const movido = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y)
          inicio = null
          if (movido > UMBRAL_CLIC) return
          const tocada = piezaBajoElPuntero(e)
          // Tocar la misma pieza o el vacío quita la selección
          seleccion = tocada === seleccion ? '' : tocada
          aplicar()
        }
        lienzo.addEventListener('pointerdown', alBajar)
        lienzo.addEventListener('pointerup', alSubir)

        // Limpieza al salir del estado
        ;(world as any).__heartAnatomyCleanup = () => {
          lienzo.removeEventListener('pointerdown', alBajar)
          lienzo.removeEventListener('pointerup', alSubir)
          panel.remove()
          pista.remove()
          escuchas.forEach(([n, f]) => (world as any).events.removeListener(gid, n, f))
        }
      })
      .onExit(() => {
        const limpiar = (world as any).__heartAnatomyCleanup
        if (limpiar) limpiar()
      })
  },
})
