# A · Recorrido (modulo/recorrido.js) — 2026-10-21

Recorrido a pie por la vivienda, a la altura de una persona, estancia por
estancia, sin atravesar tabiques. Botón **Recorrido** en la barra de Fabrick.

## Qué hay

- `modulo/recorrido.js` — el módulo (vanilla, sin `import`, IIFE, 2 espacios).
- `memoria/pruebas/prueba-recorrido.js` — prueba propia con el cargador
  `memoria/pruebas/carga.js`: **0 fallos** (25 comprobaciones).
- `herramientas/banco.js` — la lista de módulos ya incluía `'recorrido'`
  (lo puso el coordinador): banco con **0 fallos**.
- `index.html` — el coordinador ya añadió
  `<script src="modulo/recorrido.js"></script>` (línea 580, después de `luz.js`).
  Ojo: **antes** que `fabrick.js`, que es donde vive `AD.boton` (ver trampas).

## La decisión clave: qué régimen de cámara

**Elegí el PASEO del visor (`AD.api.entraPie`), no la órbita.**

Motivos, con las medidas exactas:

| | Órbita (`aplicaVista`) | Paseo (`entraPie`) — elegido |
|---|---|---|
| Altura de cámara | la que imponga `colocar()` | `pie.y + 1,65` (fija) |
| Distancia | **recortada a 2 m** | libre |
| Ángulo | **recortado a 104,3°** (phi) | libre (±1,35 rad de pitch) |
| Colisiones | ninguna | las del visor |
| FOV | lo fija `aplicaVista` (vertical) | no lo toca nadie en el paseo |

La órbita no puede hacer el trabajo: `colocar()` (visor.js:3934) recorta la
distancia a 2 m y el `phi` a `PI/2 + 0.25` (104,3°). Para bajar la mirada a
una mesa de 0,90 m con la cámara a 1,62 m hacen falta ~20° de picado, y eso
levantaría la cámara del suelo. Además, en la órbita la posición de la cámara
la calcula el visor: no se puede colocar a 1,62 m y mirar a un mueble a la vez.

**Elcompensador de los 3 cm.** El paseo pone la cámara en `pie.y + OJOS`, con
`OJOS = 1,65` (visor.js:4649) y no se puede cambiar. Para dejarla en **1,62 m**
sobre el suelo terminado (la medida de la skill) pongo cada cuadro
`pie.y = SUELO + e.cota − 0,03`. El `andar()` del visor empuja `pie.y` hacia el
suelo con un factor `dt*8` (13 % por cuadro), así que el error real queda en
**±0,004 m**: la cámara va a 1,624 m en vez de 1,62. Medido en la prueba:
`pie.y + 1,65 = 1,990` = `0,25 + 0,12 + 1,62`.

Mundo: la cámara está a `SUELO (0,25) + e.cota (0,12) + 1,62 = 1,99 m`.

**Sin bamboleo.** `pie.bamb` solo se activa si `andar()` detecta movimiento
propio (`jedida > 0,0004`); como la posición la pongo yo a mano, no hay
bamboleo. Es a propósito: el vaivén marea y aquí el suelo ya se mueve solo.

## Medidas que usa

| Qué | Valor | Por qué |
|---|---|---|
| Altura de los ojos | 1,62 m | skill `arquitectura-fabrick` |
| Compensación del paseo | −0,03 m | `OJOS` del visor = 1,65 |
| FOV objetivo | 72° **en horizontal** | visión humana |
| FOV vertical | `2·atan(tan(36°)/aspect)`, límites **50–94** | el del visor es vertical |
| Velocidad | **1,4 m/s** (ANDA del visor) | paso de persona |
| Velocidades | 0,6× / 1× / 1,6× / 2× (0,84–2,8 m/s) | el botón de velocidad |
| Parada por estancia | **1,7 s** | el enunciado |
| Puerta que se abre sola | **< 2,9 m** | el enunciado |
| Adelanto del rumbo | **1,3 m** | el giro se ve venir |
| Suavizado de la mirada | 2,4 1/s (τ ≈ 0,42 s) | sin latigazo |
| Retiro al muro | 0,32 m | ≥ 0,25 m (skill) |
| Holgura a los muebles | 0,34 m | no se roza nada |
| Distancia al mueble que se mira | ≥ 0,60 m (a su caja) | skill: "≥ 0,6 m al mueble" |
| Distancia al centro del mueble | 0,9–5,0 m | que llene el encuadre |

**El FOV real en vertical de móvil**: con 390×844 el `aspect` es 0,462; un
horizontal de 72° daría 114,9° de vertical → se recorta a **94°**, y el
horizontal real queda en **52,7°**. Eso va escrito en el rótulo para que nadie
piense que es un teleobjetivo.

## El contrato público

```js
AD.recorrido = {
  abrir(), cerrar(), alterna(), abierto(), estado(),
  irA(i), play(), pausa(), velocidad(v)
};
```

- `estado()` devuelve `{abierto, play, velocidad, fase, fin, i, n, estancia,
  fovVertical, fovHorizontal, alturaOjos, ruta:[{id, nombre, sup, pieza, punto}]}`.
- `velocidad(v)` fija el multiplicador y devuelve el vigente.
- `irA(i)` salta a la parada `i` (abre el recorrido si estaba cerrado).
- Botón: `AD.boton({id:'recorrido', etiqueta:'Recorrido', icono:'caminata', alPulsar, activo})`.
  El icono `caminata` se añade a `AD.iconos` (SVG en línea, 18×18, sin assets).

## Cómo se arma la ruta (todo de los datos)

1. **Estancias**: `INT.estancias` (vía `AD.api.C0.interior`; también vale
   `AD.api.INT`). Las que tienen `junta` se funden con su madre (caja unida).
2. **Muebles**: `INT.muebles`; cada uno va a la estancia más pequeña que lo
   contiene. Medidas por tipo en la tabla `MEDIDAS` del módulo (tomadas de las
   funciones `MUEBLE` del visor), con `giro` aplicado.
3. **Grafo**: dos estancias están conectadas si **comparten arista** (sus cajas
   se tocan) y en esa arista hay un hueco pasable (`puerta` o `paso`) **o un
   tramo sin muro** (paso abierto). Los huecos que NO son puerta (ventana,
   ventanuco, **vidriera**) tapan la arista: son cristal o pared.
4. **Paseo**: profundidad primero desde la entrada; si un callejón no tiene
   salida, **se vuelve por donde se vino**. Las paradas son la primera visita a
   cada estancia (una por estancia, sin repetir).
5. **Entrada**: la `puerta` más ancha que separa una estancia de dentro de otra
   de fuera (el porche) o del exterior. En la demo: **H-11**, la principal
   (1,10 m), en `u 9,6–10,7, v 9`. La cámara arranca **1,45 m por fuera**, en
   el porche, mirando a la casa.
6. **Parada**: se barre la estancia con una retícula de 0,26 m y se elige el
   punto libre que (a) deja ver la pieza principal sin que la vista se cruce
   con otro mueble, (b) tiene línea limpia a las puertas, (c) está a 0,9–5 m
   del mueble, (d) le da la cara buena (eje z local del mueble) y (e) no
   alarga el camino. Si no hay sitio: primera pasada con la restricción de
   puertas, segunda sin ella, y si tampoco: el primer punto libre.
7. **Tramo**: por cada puerta se entra **de perfil** (0,5 m antes y después
   del hueco, perpendicular al muro) y entre puerta y puerta se va por dentro
   de la estancia; si un mueble lo tapa, se mete un punto interior de rodeo.

Ruta que sale en la casa de ejemplo (11 estancias, 100 % de cobertura):

```
Porche → Recibidor → Cocina → Salón comedor → Estudio → Lavadero
       → Pasillo → Dormitorio de invitados → Dormitorio pequeño → Baño
       → Dormitorio principal
```

## La parada mira el mueble principal

La pieza principal = la de mayor `área × peso` (tabla `MEDIDAS`: `peso` 1,3
para cama/sofá/isla, 1,1 para escritorio y bañera, 0,2 para sillas y alfombras…).
En la demo salen: sofá de tela (salón), isla de cocina (cocina), banco del
recibidor, cama (los tres dormitorios), bañera (baño), escritorio (estudio),
lavadora (lavadero), sofá de exterior (porche). El pasillo no tiene mueble: se
mira el fondo de la estancia.

El rótulo lleva tres líneas (390 px de ancho, sin letra pequeña):

```
Salón comedor
72 m² · Sofá de tela de 2,6 × 0,95 m
Ojos a 1,62 m · 72° h → 52,7° real en vertical
```

## El HUD

Rótulo arriba a la izquierda, barra de avance de 3 px en el borde superior,
controles abajo a la derecha (44 px, iconos SVG en línea): **pausa/seguir**,
**velocidad** (cambia 0,6×/1×/1,6×/2×), **saltar a la siguiente** y **salir**.
El HUD del propio visor (`#pie-hud`, con la palanca y los botones del paseo) se
oculta con `body.recorriendo #pie-hud{display:none}` mientras el recorrido está
abierto: son dos juegos de controles y el visor tapa la escena.

## Trampas (las que me costaron tiempo)

1. **La `vidriera` es un muro, no un paso.** La primera versión trataba todo
   hueco no-puerta como "tramo libre" y sacaba al salón al porche y al recibidor
   atravesando el cristal. Ahora los huecos que no son `puerta`/`paso` **tapan**
   la arista.
2. **La línea de vista a la pieza terminaba dentro de la pieza.** `vistaLibre()`
   daba siempre "tapado" (el rayo acaba en el centro del mueble). Ahora
   `vistaLibre(p0, p1, est, ignorar)` salta la pieza que se mira.
3. **El bucle de candidatos se paraba en la primera columna** (`&& !mejor` en el
   `for` de fuera) y, cuando no encontraba nada, devolvía el centro de la pieza
   — la cámara **dentro del sofá**. Arreglado: se barre la retícula entera y el
   plan B es un punto libre, nunca el centro de un mueble.
4. **Caminar por el eje del muro.** Con dos puertas en la misma pared, el
   segmento entre elas iba pegado a la cara del muro y lo cruzaba. Ahora se
   entra y se sale de cada puerta **de perfil**, a 0,5 m del hueco.
5. **La normal de la puerta salía invertida**: la cámara arrancaba **dentro de
   la casa**, en el recibidor, en vez de en el porche. `normalEntrada()` ahora
   devuelve "hacia el lado de fuera" en los dos casos (con porche y sin porche).
6. **`AD.boton` no existe todavía cuando carga este módulo**: `fabrick.js` va
   el último en `index.html`. El registro del botón se **reintenta** cada
   150 ms hasta que la barra esté (`registraBoton()`), y `monta()` se aparta
   del bucle para no registrar dos hooks de animación.
7. **`var interior` dentro de una función sombrea la función `interior()`**:
   `construye()` petaba con "interior is not a function". Renombrado a `rodeo`.
8. **`pie.mira`**: si el usuario arrastra, el visor mueve `pie.yaw`; si el
   módulo lo sobrescribe cada cuadro, el dedo no hace nada. Ahora, mientras se
   arrastra, el módulo no toca el rumbo; al soltar, tras 1 s, la vista vuelve
   sola al rumbo del recorrido (igual que el tour del visor).
9. **La cámara no tiene radio en este régimen**: `andar()` solo colisiona si
   hay entrada del usuario, y como la posición se pone a mano no hay
   colisión. El "no atravesar tabiques" se garantiza **por construcción** (el
   grafo y los perfiles de puerta), y la prueba lo comprueba muestreando la
   posición en cada cuadro contra todos los muros: **0 muestras dentro de un
   muro** en 200 s de recorrido.

## Qué falta / pendientes

- **No se ha probado en el móvil.** En este teléfono el navegador con WebGL por
  software tumba el renderizador; la prueba es el banco y la simulación. En el
  móvil hay que mirar: el rótulo a 390 px, que la barra de Fabrick (que en el
  paseo se va a la esquina superior derecha) no se solape con el rótulo (por
  eso el rótulo deja 64 px a la derecha en móvil) y que las puertas se abran
  al llegar.
- El FOV se recalcula solo cuando cambia el `aspect` de la cámara; si el
  `redim()` del visor cambia el aspecto y yo no me entero hasta el siguiente
  cuadro, hay un parpadeo de un cuadro al girar el teléfono. Se puede pulir
  escuchando el `resize`.
- `AD.api.orbita()` no existe en el banco de pruebas (solo en el visor real),
  así que la restauración de la cámara al cerrar no está probada ahí; sí está
  probada en el visor, que sí expone `orbita`/`restauraOrbita`.
- Las puertas se quedan **abiertas** al terminar el recorrido (como el tour del
  visor). Si se quiere cerrarlas al salir, es un cambio de tres líneas.
- La superficie del rótulo es la **bruta** de la caja de la estancia (no la útil
  menos los muebles contenidos).
- El porche cuenta como estancia del recorrido (es `fuera: true`): se entra por
  él y se acaba en él. Si se prefiera un recorrido solo de interior, hay que
  filtrar `e.fuera` en `armaEstancias`.
