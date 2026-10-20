# Memoria del agente A — plano 2D y planta 3D elevada

> El agente A terminó su módulo pero el entorno se reinició antes de que escribiera
> esta memoria. El coordinator la redacta a partir del código entregado
> (`modulo/plano.js`, 51,9 KB) y de la lectura del mismo. Queda como memoria viva:
> lo que se escriba abajo sigue siendo válido.

## Qué entregó

`modulo/plano.js` — dos cosas en un módulo:

1. **Panel con plano 2D (SVG)**, dibujado con el **mismo contrato de datos** que la
   escena 3D: `C.muros`, `C.huecos`, `INT.estancias`, `INT.muebles`. No hay ninguna
   planta dibujada a mano: si se mueve un muro en `casa.js`, el plano se mueve con él.
2. **Plano 3D elevado**: corte de planta, capa de anotación y códigos, con órbita
   al tacto.

API pública:

```js
AD.plano = {abrir(), cerrar(), alternar(), esPlan3D(), setCodigos(bool)}
```

## Decisiones clave

| Decisión | Por qué |
|---|---|
| `CORTE = 1,15 m` sobre el piso terminado | Es la altura a la que un plano se lee: por debajo de la línea de ojos de un adulto, por encima de los muebles bajos. Copiado del visor 390-1, donde se resolvió el mismo problema. |
| Tapa de **poché** de 0,026 m sobre cada muro | Sin tapa, el corte se ve como un muro abierto y la planta se ensucia. La tapa lleva el **espesor real** (0,45 exterior / 0,12 interior), así que se lee qué muro es y de qué tipo. |
| Material **neutro** en planta | El color de la casa (piedra, cal, madera) se queda para el 3D. En la planta manda el código, no el color. |
| Capa de anotación como **una sola textura de canvas** | Un sprite por etiqueta son cientos de draw calls; en un teléfono eso es 30 fps menos. Una textura es un draw call. |
| El alféizar de una ventana **queda como muro**; la ventana se dibuja como una raya de vidrio en el corte | Un hueco con el alféizar por encima del corte es un hueco entero: la planta tiene que mostrar el muro, no el vacío. |
| Umbral de la puerta = raya del color de la puerta | Marca dónde se pasa, sin tapar el paso en planta. |
| Entrar a un ambiente **tocando el piso**, con umbral de 8 px | Un `click` sobre el piso compite con el arrastre de la órbita: sin umbral, orbitar entra a una habitación. |
| La órbita no pelea con el paseo: `if(a.pie && a.pie.activo) return` | El modo "a pie" manda siempre. |
| La planta **guarda y restaura** el estado de las capas (cubierta, árboles) | Si no, al salir de la planta la casa se queda sin techo. |

## Conversión de coordenadas (la trampa)

- El **dato** (`C.muros`, `INT.estancias`) vive en el marco del plano: `u` (x) y `v` (z).
- La **geometría 3D** vive en coordenadas de mundo, con la casa girada por `GIRO`
  alrededor de `C0.origen`.
- El módulo **no reutiliza** los grupos de la casa: crea un grupo propio con la misma
  transformación (`g.rotation.y = GIRO`, `g.position = origen`) y trabaja dentro en
  `(u, v)`. Así el plano y la casa no se desincronizan al cambiar de versión.
- `aMundo(u,v)` / `uvDe(x,z)` están **reimplementados** en el módulo (líneas 82-93)
  como respaldo, por si `AD.api.aMundo` no estuviera.

## Contrato que consume

- `AD.api`: `escena, camara, renderer, capas, C, INT, SUELO, GIRO, aMundo, d2r,
  aplicaVista, pie, poneCapa, VISTAS`.
- `AD.api.C` e `AD.api.INT` son **getters** (los arreglaró el coordinator): si
  hubieran sido copias, el plano mostraría siempre la planta de la versión inicial.
- `AD.avisaListo(fn)` para montarse; si no existe, reintenta cada 150 ms hasta 30 s.
- `AD.onFrame(fn)` para la cámara de planta (FOV adaptativo por aspect).

## Qué falta / riesgos

1. **No se ha visto en pantalla.** El módulo es sintácticamente válido y respeta el
   contrato, pero falta la prueba en el teléfono: que el corte se lea, que las
   etiquetas no se pisen y que el toque de ambiente entre donde toca.
2. El texto de la capa de anotación se ve a **1,15 m de altura**: si la cámara se
   aleja mucho, hay que pinzar. Falta decidir el radio inicial.
3. La lista de muebles del 2D usa una tabla de huellas (`HUELLA`) que cubre los
   tipos de la casa de ejemplo. Una casa real con otros tipos de mueble saldría
   con la huella por defecto.
4. Conviene un **chequeo de solapes** de muebles en planta, como el que tiene el
   visor 390-1 (`plano390Audit.ts`): aquí la vista es un dibujo, no un dato, y un
   mueble mal puesto se ve pero no se denuncia.
