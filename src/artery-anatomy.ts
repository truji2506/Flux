import * as ecs from '@8thwall/ecs'
import {montarVisor, Pieza} from './anatomy-viewer'

// Capas de la arteria proximal (elástica), de afuera hacia adentro. La llave es
// el nombre de la malla en Osorio_ArteriaProx_Animacion.glb.
const CAPAS: Record<string, Pieza> = {
  tejido_fibroso: {
    nombre: 'Capa externa (adventicia)',
    descripcion: 'Tejido conectivo rico en colágeno que envuelve la arteria, la fija a los tejidos vecinos y evita que se distienda de más.',
  },
  musculo_suave: {
    nombre: 'Capa media (músculo liso)',
    descripcion: 'Células musculares que se contraen o relajan para cambiar el calibre del vaso y así regular la presión y el flujo.',
  },
  tejido_elastico: {
    nombre: 'Tejido elástico',
    descripcion: 'Fibras de elastina que se estiran con cada latido y luego recuperan su forma, empujando la sangre durante la diástole (efecto Windkessel).',
  },
  endotelio: {
    nombre: 'Capa interna (endotelio)',
    descripcion: 'Una sola capa de células en contacto con la sangre: mantiene el flujo liso, evita coágulos y libera sustancias que dilatan el vaso.',
  },
}

const RECORRIDO = ['tejido_fibroso', 'musculo_suave', 'tejido_elastico', 'endotelio']

ecs.registerComponent({
  name: 'artery-anatomy',
  stateMachine: ({world, eid}) => {
    let limpiar: (() => void) | null = null
    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        limpiar = montarVisor(world, eid, {
          objetivo: 'tarjeta-flux-reverso',
          titulo: 'Capas de la arteria',
          textoBoton: 'Capas de la arteria',
          pista: 'Toca "Capas de la arteria" o una capa',
          partes: CAPAS,
          recorrido: RECORRIDO,
          // En fluxapp estos glóbulos solo guían el flujo: no se muestran
          ocultar: /^globulo/,
        })
      })
      .onExit(() => { if (limpiar) limpiar() })
  },
})
