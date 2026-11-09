// Visor de anatomía compartido por el corazón (frente de la tarjeta) y la
// arteria (reverso). Cada modelo monta su propia ficha con botón y flechas, que
// solo aparece mientras su lado de la tarjeta está a la vista.
import * as ecs from '@8thwall/ecs'
import {marcarSeleccion} from './blood-flow'

const {THREE} = window as any

export type Pieza = {nombre: string, descripcion: string}

export type ConfigVisor = {
  objetivo: string                 // nombre del objetivo de imagen (lado de la tarjeta)
  titulo: string                   // cabecera de la ficha
  textoBoton: string
  pista: string                    // texto cuando ese lado está a la vista
  partes: Record<string, Pieza>    // llave = nombre de la malla en el .glb
  recorrido: string[]              // orden de las flechas
  principal?: boolean              // muestra "Apunta a la tarjeta" si no se ve ningún lado
  congelar?: boolean               // deja el modelo quieto (sin morph targets)
  ocultar?: RegExp                 // mallas auxiliares que no se deben ver
  enlaces?: boolean                // resuelve el toque sobre los íconos de Flux e Instagram
}

const COLOR_RESALTE = 0x2a6ea8
const OPACIDAD_ATENUADA = 0.15
const UMBRAL_CLIC = 8       // px: más que esto es un arrastre, no un toque
const TOLERANCIA_TOQUE = 40 // px: radio para aceptar un toque cercano

const raycaster = new THREE.Raycaster()
const puntero = new THREE.Vector2()
const _centro = new THREE.Vector3()
const _caja = new THREE.Box3()

// El Raycaster de Three ignora .visible: sin esto se tocarían piezas ocultas
export const esVisible = (obj: any) => {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false
  return true
}

// Abre un enlace una sola vez aunque lleguen dos eventos del mismo toque
let _ultimoEnlace = 0
export const abrirEnlace = (url: string) => {
  const ahora = Date.now()
  if (ahora - _ultimoEnlace < 800) return
  _ultimoEnlace = ahora
  const w = window.open(url, '_blank')
  if (!w) window.location.href = url
}
;(window as any).__fluxAbrirEnlace = abrirEnlace

// Qué lados de la tarjeta se ven ahora; los visores se avisan entre sí
const objetivosVisibles = new Set<string>()
const EVENTO_OBJETIVOS = 'flux-objetivos'

const ESTILOS = `
.flux-anatomia { position: fixed; left: 0; right: 0; bottom: 20px; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  font-family: system-ui, -apple-system, sans-serif; pointer-events: none; }
.flux-anatomia * { box-sizing: border-box; }
.flux-anatomia button { font-family: inherit; -webkit-tap-highlight-color: transparent; }
.flux-anatomia .pista { padding: 6px 12px; border-radius: 999px; color: #eaf2ff;
  background: rgba(10,18,28,0.78); border: 1px solid rgba(255,255,255,0.18);
  font-size: 12px; font-weight: 500; }
.flux-anatomia .abrir { pointer-events: auto; min-height: 44px; padding: 0 22px;
  border-radius: 999px; border: 1px solid #64ffda; background: rgba(10,18,28,0.88);
  color: #64ffda; font-size: 15px; font-weight: 600; cursor: pointer; }
.flux-anatomia .ficha { pointer-events: auto; width: min(92vw, 380px); padding: 12px;
  border-radius: 16px; background: rgba(10,18,28,0.9); border: 1px solid #64ffda;
  color: #eaf2ff; }
.flux-anatomia .fila { display: flex; align-items: center; gap: 8px; }
.flux-anatomia .flecha, .flux-anatomia .cerrar { flex: none; width: 44px; height: 44px;
  border-radius: 12px; border: 1px solid rgba(100,255,218,0.45); background: transparent;
  color: #64ffda; font-size: 20px; line-height: 1; cursor: pointer; }
.flux-anatomia .cerrar { width: 32px; height: 32px; font-size: 16px; border: none; }
.flux-anatomia .titulo { flex: 1; min-width: 0; text-align: center; }
.flux-anatomia .nombre { font-size: 16px; font-weight: 700; color: #64ffda; }
.flux-anatomia .contador { font-size: 11px; color: rgba(234,242,255,0.6); margin-top: 2px; }
.flux-anatomia .descripcion { margin-top: 10px; font-size: 13px; line-height: 1.45;
  color: rgba(234,242,255,0.88); }
.flux-anatomia .cabecera { display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: rgba(234,242,255,0.6); }
.flux-anatomia [hidden] { display: none !important; }
`
let estiloMontado: HTMLStyleElement | null = null

// Monta el visor para la entidad `eid` y devuelve la función de limpieza
export const montarVisor = (world: any, eid: any, cfg: ConfigVisor) => {
  const {renderer, scene, activeCamera} = world.three
  const lienzo: HTMLElement = renderer.domElement

  const piezas = new Map<string, any>()
  const emisivoBase = new Map<string, number>()
  let seleccion = ''
  let inicio: {x: number, y: number} | null = null

  if (!estiloMontado) {
    estiloMontado = document.createElement('style')
    estiloMontado.textContent = ESTILOS
    document.head.appendChild(estiloMontado)
  }

  // ---------- Interfaz ----------
  const raiz = document.createElement('div')
  raiz.className = 'flux-anatomia'
  raiz.innerHTML = `
    <div class="pista" hidden></div>
    <button class="abrir" type="button" hidden></button>
    <div class="ficha" hidden>
      <div class="cabecera"><span class="encabezado"></span>
        <button class="cerrar" type="button" aria-label="Cerrar">✕</button></div>
      <div class="fila">
        <button class="flecha anterior" type="button" aria-label="Anterior">◀</button>
        <div class="titulo"><div class="nombre"></div><div class="contador"></div></div>
        <button class="flecha siguiente" type="button" aria-label="Siguiente">▶</button>
      </div>
      <div class="descripcion"></div>
    </div>`
  document.body.appendChild(raiz)
  const $ = (sel: string) => raiz.querySelector(sel) as HTMLElement
  const pista = $('.pista')
  const botonAbrir = $('.abrir')
  const ficha = $('.ficha')
  botonAbrir.textContent = cfg.textoBoton
  $('.encabezado').textContent = cfg.titulo

  // ---------- Modelo ----------
  const raizModelo = () => {
    const mapa = world.three.entityToObject
    return (mapa && mapa.get && mapa.get(eid)) || scene
  }

  // El .glb carga después de montar el componente: se prepara cuando aparece
  const prepararModelo = () => {
    if (piezas.size > 0) return true
    raizModelo().traverse((obj: any) => {
      if (!obj.isMesh) return
      if (cfg.ocultar && cfg.ocultar.test(obj.name)) { obj.visible = false; return }
      if (!cfg.partes[obj.name]) return
      // Material propio por pieza: si se comparte, resaltar una encendería varias
      obj.material = obj.material.clone()
      if (cfg.congelar && obj.morphTargetInfluences) obj.morphTargetInfluences.fill(0)
      piezas.set(obj.name, obj)
      emisivoBase.set(obj.name, obj.material.emissive ? obj.material.emissive.getHex() : 0)
    })
    return piezas.size > 0
  }
  const espera = window.setInterval(() => { if (prepararModelo()) window.clearInterval(espera) }, 400)

  const pintar = () => {
    prepararModelo()
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
    const visible = objetivosVisibles.has(cfg.objetivo)
    const ningunoVisible = objetivosVisibles.size === 0
    const enFicha = visible && seleccion !== ''
    ficha.hidden = !enFicha
    botonAbrir.hidden = !visible || enFicha
    pista.hidden = enFicha || !(visible || (ningunoVisible && cfg.principal))
    pista.textContent = visible ? cfg.pista : 'Apunta a la tarjeta Flux'
    if (enFicha) {
      const i = cfg.recorrido.indexOf(seleccion)
      $('.nombre').textContent = cfg.partes[seleccion].nombre
      $('.contador').textContent = `${i + 1} / ${cfg.recorrido.length}`
      $('.descripcion').textContent = cfg.partes[seleccion].descripcion
    }
  }

  const seleccionar = (nombre: string) => {
    seleccion = nombre
    // Con la ficha abierta, los glóbulos se atenúan para no tapar la pieza
    marcarSeleccion(cfg.objetivo, nombre !== '')
    pintar()
    actualizarInterfaz()
  }

  const mover = (paso: number) => {
    const i = cfg.recorrido.indexOf(seleccion)
    const n = cfg.recorrido.length
    seleccionar(cfg.recorrido[((i < 0 ? 0 : i + paso) % n + n) % n])
  }

  botonAbrir.addEventListener('click', () => seleccionar(cfg.recorrido[0]))
  $('.anterior').addEventListener('click', () => mover(-1))
  $('.siguiente').addEventListener('click', () => mover(1))
  $('.cerrar').addEventListener('click', () => seleccionar(''))

  // ---------- Lados de la tarjeta ----------
  const ev = (ecs as any).events
  const gid = world.events.globalId
  const escuchas: Array<[string, (e: any) => void]> = []
  const oir = (nombre: string, fn: (e: any) => void) => {
    if (!nombre) return
    world.events.addListener(gid, nombre, fn)
    escuchas.push([nombre, fn])
  }
  const avisar = () => window.dispatchEvent(new Event(EVENTO_OBJETIVOS))
  oir(ev?.REALITY_IMAGE_FOUND, (e: any) => {
    if (e?.data?.name === cfg.objetivo) { objetivosVisibles.add(cfg.objetivo); avisar() }
  })
  oir(ev?.REALITY_IMAGE_LOST, (e: any) => {
    if (e?.data?.name === cfg.objetivo) { objetivosVisibles.delete(cfg.objetivo); avisar() }
  })
  window.addEventListener(EVENTO_OBJETIVOS, actualizarInterfaz)
  actualizarInterfaz()

  // ---------- Toque sobre los íconos de Flux e Instagram ----------
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

  // Los botones de UI anidados en el objetivo de imagen no reciben el clic en
  // AR, así que el toque sobre los íconos se resuelve aquí.
  const enlaceBajoElPuntero = (e: PointerEvent, caja: DOMRect): string => {
    const enlaces = (window as any).__fluxEnlaces || []
    const mapa = world.three.entityToObject
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

  const alBajar = (e: PointerEvent) => { inicio = {x: e.clientX, y: e.clientY} }
  const alSubir = (e: PointerEvent) => {
    if (!inicio) return
    const movido = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y)
    inicio = null
    if (movido > UMBRAL_CLIC) return
    // Toques sobre cualquier ficha o botón: los manejan sus propios botones
    if ((e.target as HTMLElement)?.closest?.('.flux-anatomia button, .flux-anatomia .ficha')) return
    // Las piezas se recorren solo con el botón y las flechas; el toque en la
    // escena queda únicamente para los íconos de Flux e Instagram.
    const url = enlaceBajoElPuntero(e, prepararRayo(e))
    if (url) abrirEnlace(url)
  }
  // En toda la ventana y en captura: si 8th Wall pone una capa encima del
  // lienzo, el toque igual llega.
  if (cfg.enlaces) {
    window.addEventListener('pointerdown', alBajar, true)
    window.addEventListener('pointerup', alSubir, true)
  }

  return () => {
    window.clearInterval(espera)
    window.removeEventListener('pointerdown', alBajar, true)
    window.removeEventListener('pointerup', alSubir, true)
    window.removeEventListener(EVENTO_OBJETIVOS, actualizarInterfaz)
    escuchas.forEach(([n, f]) => world.events.removeListener(gid, n, f))
    raiz.remove()
  }
}
