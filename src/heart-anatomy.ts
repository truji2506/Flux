import * as ecs from '@8thwall/ecs'
import {montarVisor, Pieza} from './anatomy-viewer'

// Piezas del corazón: la llave es el nombre de la malla en el .glb.
// Los textos son los mismos del catálogo anatómico de fluxapp.
const PARTES: Record<string, Pieza> = {
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

// Orden del recorrido con las flechas: el camino que sigue la sangre
const RECORRIDO = [
  'auricula_derecha', 'valvula_tricuspide', 'tabique_interventricular',
  'valvula_pulmonar', 'arteria_pulmonar', 'auricula_izquierda',
  'valvula_mitral', 'valvula_aortica', 'aorta',
]

ecs.registerComponent({
  name: 'heart-anatomy',
  stateMachine: ({world, eid}) => {
    let limpiar: (() => void) | null = null
    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        limpiar = montarVisor(world, eid, {
          objetivo: 'tarjeta-flux-frente',
          titulo: 'Anatomía del corazón',
          textoBoton: 'Anatomía',
          pista: 'Toca "Anatomía" o una pieza del corazón',
          partes: PARTES,
          recorrido: RECORRIDO,
          principal: true,
          congelar: true,
          enlaces: true,
        })
      })
      .onExit(() => { if (limpiar) limpiar() })
  },
})
