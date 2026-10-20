# Memoria · D — Cocina con herrajes y mobiliario

> El agente D fue interrupted por reinicios repetidos del entorno. El coordinator
> implementó el módulo siguiendo el brief (`memoria/BRIEFS.md`, sección D).

## Qué entregó

`modulo/cocina.js` (15 KB). API: `AD.cocina = {aplicar(), repara(), piezas:[]}`.

## Cómo se localizan los muebles

El visor ya construye la casa entera. Este módulo **no reconstruye nada**: se
cuelga de los grupos que ya existen.

- Cada malla de mueble lleva `m.userData.info = {tipo, id, nombre, datos}`.
- Para encontrar el grupo de un mueble: `escena.traverse` buscando una malla con
  `userData.info.id === 'COC-01'` y subiendo hasta el primer `THREE.Group` con
  posición propia (el grupo que el constructor creó con `g.position`/`g.rotation.y`).
- Las medidas vienen del dato (`m.largo`, `m.fondo`, `m.ancho`), no de la malla.

## Decisiones de construcción

| Decisión | Por qué |
|---|---|
| **Frentes añadidos, no reemplazados** | El mueble que hizo el visor se queda (encimera, fregadero, placa) y encima se cuelgan los frentes, tiradores y herrajes. Rehacerlo todo duplicaría mallas y rompería las fichas. |
| Holgura de **1 mm** entre frentes | A 1 mm se lee como unión; a 0 se ve un hueco negro, y a 3 mm se ve que están sueltos. |
| Tirador de **barra de 16 cm** con dos pies | Es el tirador de cocina de verdad y, además, se ve en relieve desde lejos. |
| **Bisagra de basculante (yunding)**: base + brazo + perno | Las de cazoleta (la de la olla) son invisibles; la de yunding se ve y explica por qué la puerta abre de lado. |
| **Guías de cajón** a los costados, 2 cm por debajo del fondo | Solo se ven cuando el cajón sale, que es justo cuando importan. |
| La **puerta del fregadero** gira 90° sobre su borde (`rotation.y`) | Los cajones se desplazan en Z; las puertas giran. Son dos movimientos distintos y el hub los maneja igual con `abre()`/`cierra()`. |
| **Nevera con interior y luz** que se enciende al abrir | Es el detalle que hace creíble una nevera en una maqueta: la luz de dentro. |
| Materiales **compartidos y cacheados** (`EST.mats`) | En un teléfono, 300 `MeshPhongMaterial` son 300 programas de shader. Se cachean por clave. |
| Solo Phong/Lambert, **nada de PBR** | three r128 y el visor andan con Phong/Lambert. Un `MeshStandardMaterial` sin entorno se ve plano y rompe el resto. |

## Animación

`AD.onFrame(dt)`: `t` avanza a 1,6 unidades/s y la posición usa
`s = t*t*(3-2*t)`: arranca y frena suave. Un cajón lineal se ve robótico.

## Contrato con el hub

Cada pieza se anuncia con `AD.piezas.registra({id, etiqueta, tipo, grupo, abre, cierra, estado})`:

- `tipo: 'cajon'` → se desplaza en Z.
- `tipo: 'puerta'` → gira 90° en Y.
- La nevera es una `puerta` con `luz` asociada.

## Qué falta

1. **No se ha visto en el teléfono.** Falta comprobar que los frentes no se
   solapen con el fregadero ni con la placa que ya trae el visor, y que el cajón
   no atraviese la isla.
2. La posición de los frentes se calculó con supuestos (la encimera mide 3,90 m
   con el fregadero a 0,20 del centro). Conviene leerlos del dato real.
3. El mobiliario general (colchones, cojines, patas) se añadió a las piezas más
   vistas; faltan chairs, mesas de centro y armarios.
4. La cocina de la versión **mejorada** (isla 'COC-M01') no tiene encimera propia
   en el dato: el módulo le pone frentes, pero no vuelo de encimera.
