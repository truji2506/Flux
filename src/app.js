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
