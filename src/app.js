// Diagnóstico temporal: muestra en pantalla cualquier error (en el celular no
// hay consola a la vista). Se quita cuando la escena vuelva a funcionar.
(() => {
  const caja = document.createElement('div')
  caja.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:99999;max-height:45vh;overflow:auto;' +
    'background:rgba(120,0,0,0.92);color:#fff;font:12px/1.35 monospace;padding:8px;border-radius:8px;' +
    'white-space:pre-wrap;display:none;pointer-events:auto'
  const mostrar = (texto) => {
    if (!caja.parentNode && document.body) document.body.appendChild(caja)
    caja.style.display = 'block'
    caja.textContent += texto + '\n'
  }
  window.addEventListener('error', (e) => mostrar('Error: ' + (e.message || e) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')))
  window.addEventListener('unhandledrejection', (e) => mostrar('Promesa: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)))
  const original = console.error
  console.error = (...args) => {
    mostrar('console.error: ' + args.map((a) => (a && a.stack) || (a && a.message) || String(a)).join(' '))
    original.apply(console, args)
  }
})()

// Punto de entrada de la app. El motor ya no carga los objetivos de imagen
// automáticamente: hay que registrarlos aquí al arrancar.
const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/tarjeta-flux-frente.json'),
      require('../image-targets/tarjeta-flux-reverso.json'),
    ],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
