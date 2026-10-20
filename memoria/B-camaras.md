# B · Cámaras cinematográficas y recorrido automático interior

Agente B · archivo propio: `modulo/camaras.js` · rama `fabrick` · sin commits.

## Qué encontré

**El visor (`visor.js`, 5255 líneas) tiene tres regímenes de cámara y solo dos
sirven para cine:**

| Régimen | Cómo coloca la cámara | Límites |
|---|---|---|
| Órbita (`aplicaVista` + `colocar()`) | `objetivo` + `dist` + `theta` + `phi` | `dist ≥ 2 m`, `phi ∈ [0,08 ; π/2+0,25]`, `y ≥ 0,4`, `objetivo.y ∈ [0,12]` |
| A pie (`entraPie` + `andar()`) | `pie.x/z/y` + `pie.yaw/pitch` | altura fija `suelo + 1,65 m` (OJOS) |
| Tour de caminos (`andaTour`) | `pie.*` como el anterior | altura fija 1,65 m |

El régimen "a pie" **no sirve para cine**: la altura de la cámara es
`pie.y + 1,65` y `andar()` la vuelve a poner cada cuadro, así que no hay
contrapicado (0,62 m) ni cenital (2,35 m). Por eso el cine va **en órbita** y
el paseo también (la altura la calculo yo desde `INT.estancias[].cota`).

**Claves que usa el visor (y que no están en el contrato pero sí en el código):**

- `aplicaVista({desde, hacia, fov, sinTejado})` → pone `dist/theta/phi/objetivo`
  **y** `camara.fov` (¡vertical!) **y** cambia `capas.cubierta` y `capas.arboles`
  cuando le pasas `sinTejado`. Es la única puerta limpia para colocar la cámara.
- `colocar()` (en `bucle()`) es quien aplica de verdad la posición: `objetivo +
  dist·(sinφ·sinθ, cosφ, sinφ·cosθ)` y `lookAt(objetivo)`.
- `PIERRE`: `colocar()` **recorta** `dist` a 2 m, `phi` a 104,3° y `y` a 0,4 m.
  → una toma a menos de 2 m se ve desde 2 m; una toma que mire hacia arriba
  desde muy abajo se ve desde un pelín más alta. Las dos cosas las designsé
  para no depender de los recortes.
- `capas.interior` y `capas.cubierta` son grupos; `GRUPOS_V` tiene una versión
  por cada versión de la casa. El techo de las estancias vive en **cubierta**,
  no en interior: para un cenital interior hay que ocultar la cubierta
  (`sinTejado: true`), que es justo lo que hacen las vistas "Dentro".
- `PUERTAS` = `[{g, local, nombre, aplica, t, obj, w}]`; `t` es la animación y
  `obj` el objetivo (0 cerrada, 1 abierta). Todas salen abiertas. El visor
  anima `t → obj` en `animaPuertas(dt)`; para abrir sola basta con `p.obj = 1`.
- `INT.estancias[]`: `{id, nombre, codigo, caja:[u0,v0,u1,v1], cota, suelo,
  pared, techo}`. `cota` es la altura del suelo **en el marco local** (0,12).
  El suelo en el mundo queda en `SUELO + cota` (0,25 + 0,12 = 0,37).
- `INT.muebles[]`: `{id, tipo, uv:[u,v], giro, largo, ancho, alto, fondo…}`.
  La pieza está en el centro de su planta y **mira a +z local**; con `giro` su
  frente en el plano es `(sin g, cos g)` y su derecha `(cos g, −sin g)`.
  Ojo: `largo` es el **ancho** en los sofás/mesas (x local) y la **longitud**
  en la cama (z local). Hay que leer el constructor de cada mueble en
  `visor.js` (`MUEBLE.cama`, `MUEBLE.sofa_tela`…) para no cambiarse el eje.

## Cómo definí las tomas (por datos, no a ciegas)

Cada estancia da sus tomas a partir de **la pieza que manda**: se puntúa cada
mueble de la estancia por tipo (`PESO`), por tamaño y por altura, y la primera
es la protagonista.

| Plano | Cómo se coloca | Altura de cámara |
|---|---|---|
| `general` | la esquina de la estancia más alejada de la pieza, metida 0,55 m | 1,62 m |
| `lateral` | de perfil respecto a la segunda pieza, a 1,9 m de su canto | 1,45 m |
| `detalle` | de frente a la pieza, a 0,9 m de su canto, FOV corto | la del detalle (0,45–1,9 m) |
| `contrapicado` | de frente y **abajo** (0,62 m), mirando arriba | 0,62 m |
| `cenital` | 0,85 m sobre la pieza, mirando al suelo, **sin cubierta** | techo − 0,35 m (≤ 2,35) |
| `travelling` | arco de 46° alrededor de la pieza, radio el que cabe | 1,62 m |

Además, dos exteriores: la casa desde el jardín y la casa desde el aire (24 m).
En total 18 tomas (tope) para la casa de ejemplo.

**FOV**: siempre horizontal (52–80°) y convertido con
`2·atan(tan(h/2)/aspect)`, con los límites 50–94° en vertical. En vertical
(0,46) el horizontal de 72° da 114,9° → se recorta a 94° (el horizontal
efectivo queda en 52,7°). En horizontal (1,78) da 44,4° → se sube a 50°.

## Validación anti-muros (la parte que más trabajo dio)

Los muros vienen **troceados**: entre dos trozos hay un hueco. Eso obliga a
agruparlos por línea (la `v` de un muro horizontal, la `u` de uno vertical) y
sacar de cada línea dos listas:

- `solido` = el muro **más las ventanas** → sirve para el retiro: la cámara no
  se acerca a menos de 0,25 m de la cara de un muro (tampoco de una ventana).
- `muro` = solo el material → sirve para caminar: por una ventana no se pasa.

Y una lista aparte: `PASABLES` (puerta, paso, vidriera, ventanal, arco,
garaje) son los únicos vanos por los que se camina.

Reglas que se comprueban antes de aceptar una posición:

1. `distMuro ≥ 0,25 m` a la cara del muro.
2. La cámara no está dentro de ninguna pieza **más alta que ella** (una mesa
   de 0,78 m no contiene una cámara a 1,62 m; un armario de 2,55 m sí).
3. `distPieza ≥ 0,60 m` al mueble que se enseña (0,90 m en el detalle).
4. La línea de visión a la pieza no está cortada por nada más alto
   (`lineaLibre`): por eso la isla se mira desde el comedor y no desde la barra.
5. El tramo entre dos puntos del recorrido no atraviesa muros ni muebles
   (`segmentoLibre`, con 0,30 m de margen para el cuerpo de la cámara).

Si una posición no vale, se prueban **ángulos de 12° alrededor del sujeto** y
distancias más cortas; si nada vale, la toma se descarta (no se inventa).

## El recorrido automático interior

El tour que ya existía (`TOURS`) es solo de caminos de la finca. El mío es
interior y se construye con el **grafo de las estancias**:

1. Dos estancias están conectadas si comparten borde y en ese borde hay un
   hueco pasable (o no hay muro: un paso abierto).
2. Se camina el grafo en el orden en que la casa da las estancias; si se llega
   a un callejón sin salida **se vuelve por donde se vino** (y se vuelve
   pasando otra vez por la vista de la estancia de la que se vuelve: si no, la
   línea entre dos vanos atraviesa el muro que hay entre medias).
3. Cada estancia tiene una parada informativa en el punto libre desde el que
   se ve mejor su pieza, con **1,7 s de parada** y el rótulo en pantalla.
4. Avance a **1,15 m/s** con rampa (0,25–1) al arrancar y al parar, y el
   rumbo se saca mirando 1 m atrás y 2,2 m adelante (como `enTour`), para que
   las curvas no den un latigazo.
5. Las puertas se **abren solas a menos de 2,9 m** (se pone `p.obj = 1`; el
   visor las anima en `animaPuertas`).

En la casa de ejemplo: 74,9 m, 31 puntos, 11 paradas (salón, cocina, recibidor,
pasillo, dormitorio, baño, dormitorios, porche, estudio, lavadero).

## El HUD (creado en el DOM, sin tocar index.html)

Se inyecta un `<style>` con prefijo `adc-` y cinco capas: la banda del
letterbox (z 24), el fundido (25), el rótulo (26), el botón "Cine" (27) y la
tarjeta (28). Botones de 44 px mínimo, en la esquina superior derecha (debajo
de la brújula, que acaba a 82 px). La tarjeta lleva: anterior / pausa /
siguiente, la lista de tomas, la velocidad (0,25–2×), los interruptores
(letterbox, rótulos, fundido, 4K) y el botón de recorrido interior.

## Contrato que consume

Solo `AD.api`: `C0`, `INT`, `VERSION`, `SUELO`, `GIRO`, `aplicaVista`, `capas`,
`renderer`, `escena`, `PUERTAS`. **No** usa `aMundo` (no está en el contrato):
la recalculo con `C.origen` y `GIRO`, que es la misma fórmula del visor.
Tampoco usa `pie` ni `entraPie`: el modo "a pie" y el cine son excluyentes y
el cine necesita la órbita (alturas libres).

## API pública

```js
AD.camaras = {
  abrir(), cerrar(), alternar(),
  reproduce(), pausa(),
  tomas: [],            // la lista viva de las tomas
  irA(i), modoCine(bool), calidad4K(bool),
  paseo(bool), rutas(), estado(), refresca()
};
```

Se registra además la pieza `CINE-camara` en `AD.piezas` (estado 1/0) para que
el hub (agente C) pueda mostrar el modo cine.

## Trampas (las que casi me cuestan el módulo)

1. **El hook puede ir antes o después del movimiento.** Por eso la cámara se
   coloca con `aplicaVista` (que fija el estado de la órbita) y no solo
   escribiendo `camara.position`: si el coordinator mete los hooks antes de
   `colocar()`, el visor reproduce la misma cámara igual.
2. **El visor gira la órbita con el dedo sobre el lienzo** y sus manejadores
   están en el mismo elemento que el canvas → no se pueden quitar. Se
   bloquean con un listener en **fase de captura sobre `#escena`** (el padre
   del canvas): `e.stopPropagation()` ahí impide que el evento llegue al
   canvas. Las flechas del teclado y la rueda se paran igual.
3. **`aplicaVista` pone el FOV vertical** y no el horizontal. Hay que pasarle
   el vertical ya convertido.
4. **`sinTejado` ata la cubierta y los árboles**: no se pueden poner por
   separado con esa llamada. Los árboles se gobiernan a mano con
   `capas.arboles.visible` + la casilla del panel.
5. **Las ventanas son huecos entre trozos de muro**: si se calcula "el muro"
   como la lista de tramos, una ventana parece un paso y el recorrido se
   mete por la ventana. Hay que tratar los vanos no pasables como muro.
6. **`colocar()` recorta**: distancia ≥ 2 m, elevación ≤ 13°, cámara ≥ 0,4 m.
   El "primer plano" se consigue con FOV corto, no acercando la cámara.
7. El "a pie" no sirve para el cine (altura fija) y el cine no debe tocar el
   modo "a pie": son excluyentes.
8. `AD.api` puede no existir al cargar el módulo: todo pasa por `datos()`,
   que devuelve `null`, y el enganche del bucle espera a `window.load`.

## Qué falta

- **La integración es del coordinator**: `<script src="modulo/camaras.js">`
  después de `visor.js` en `index.html`, y la llamada a `AD.hooks` en
  `bucle()`. El módulo ya aguanta que los hooks no existan (rAF propio de
  reserva, que solo mueve la cámara y no dibuja).
- Botón "Cine" en el panel principal: el coordinator puede añadir un
  `<button>` que llame a `AD.camaras.alternar()`.
- **No hay exportación de vídeo** (a propósito): el modo queda listo para
  grabar la pantalla, sin inventar un pipeline.
- "Rendir en 4K" sube el `pixelRatio` a 2 y el mapa de sombras del sol a 4096
  (reutilizando el del sol, sin crear otro). Ojo: el visor ya limita el
  `pixelRatio` a 2, así que en un móvil con DPR 3 el 4K solo cambia las
  sombras.
- El recorrido interior es **uno solo** (toda la casa). Con más tiempo se
  podrían hacer rutas cortas por zona (solo la cocina, solo los dormitorios).
- No se ha probado en el teléfono: la validación es de datos (Node, con un
  arnés que carga `demo/casa.js` y comprueba las 983 muestras de la ruta: **0
  cruces de muro**; y las 38 colocaciones del cine contra los límites del
  visor: **0 problemas**).

## Cómo se probó

`node --check modulo/camaras.js` (sintaxis) y un arnés en
`/tmp/opencode/test-camaras2.js` que carga `demo/casa.js`, monta un `AD.api`
falso y comprueba:

- las 18 tomas: ninguna dentro de un muro o de un mueble;
- las 983 muestras de la ruta: 0 cruces de muro;
- los 38 `aplicaVista`: distancia ≥ 2 m, `phi` en rango, `y ≥ 0,4`, FOV 50–94;
- el bucle: 400 cuadros en cine y 600 en el recorrido, sin excepciones.
