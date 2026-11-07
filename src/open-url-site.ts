import * as ecs from '@8thwall/ecs'

const URL_ENLACE = 'https://fluxapp.site'

ecs.registerComponent({
  name: 'open-url-site',
  stateMachine: ({world, eid}) => {
    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        // Se registra para que heart-anatomy detecte el toque sobre el ícono:
        // en AR el clic de UI no llega a botones anidados en el objetivo.
        const lista = ((window as any).__fluxEnlaces = (window as any).__fluxEnlaces || [])
        if (!lista.some((x: any) => x.eid === eid)) lista.push({eid, url: URL_ENLACE})
      })
      .listen(eid, ecs.input.UI_CLICK, () => {
        const abrir = (window as any).__fluxAbrirEnlace
        if (abrir) abrir(URL_ENLACE)
        else window.open(URL_ENLACE, '_blank')
      })
  },
})
