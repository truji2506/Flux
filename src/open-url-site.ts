import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'open-url-site',
  stateMachine: ({world, eid}) => {
    ecs.defineState('default')
      .initial()
      .listen(eid, ecs.input.UI_CLICK, () => {
        window.open('https://fluxapp.site', '_blank')
      })
  },
})
