import * as ecs from '@8thwall/ecs'
import {montarVisor, Pieza} from './anatomy-viewer'
import {montarFlujo} from './blood-flow'

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
    let limpiarFlujo: (() => void) | null = null
    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        limpiar = montarVisor(world, eid, {
          objetivo: 'tarjeta-flux-reverso',
          titulo: 'Capas de la arteria',
          textoBoton: 'Capas de la arteria',
          pista: 'Toca "Capas de la arteria" para explorarla',
          partes: CAPAS,
          recorrido: RECORRIDO,
          // Glóbulos guía del modelo: no se ven, solo marcan el camino
          ocultar: /^globulo/,
        })
        limpiarFlujo = montarFlujo(world, eid, {
          objetivo: 'tarjeta-flux-reverso',
          urlModelo: 'assets/arteria-proximal.glb',
          urlGlobulo: 'assets/globulo.glb',
          patronGuia: /^globulo_/,
          duracion: 4,
          densidad: 0.5,   // cinco corrientes en un tubo corto: más espaciadas
          color: () => 'rojo',   // arteria: sangre oxigenada
        })
      })
      .onExit(() => {
        if (limpiar) limpiar()
        if (limpiarFlujo) limpiarFlujo()
      })
  },
})
