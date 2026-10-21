# B · Cámaras por toda la casa, en dos niveles (CCTV)

> Archivo propio: `modulo/cctv.js` · rama `fabrick` · **sin commits**.
> Reescrito desde cero: la versión anterior sacaba una cámara por estancia en
> la esquina a 2,60 m y cuatro exteriores inventados. Ahora hay **dos niveles**
> (cine y realidad), cámaras **en toda la casa y en el terreno**, y el cambio de
> cámara con cuadrícula de miniaturas.
> Verificado con `node herramientas/banco.js` (0 fallos), `CASA=demo npm run check`,
> `node herramientas/build.mjs`, `node --check modulo/cctv.js` y la prueba propia
> `memoria/pruebas/prueba-cctv.js` (0 fallos: encuadre, esquinas opuestas, API).

---

## 1. Lo que hay hoy en los datos (esto es lo que manda)

| Dato | Dónde | Para qué lo usa el módulo |
|---|---|---|
| `AD.api.C` / `C0` | la casa | muros, huecos, contorno, interior |
| `AD.api.INT.estancias` | 11 estancias | una o dos cámaras por estancia |
| `AD.api.INT.muebles` | 60 piezas | la pieza principal, los obstáculos |
| `CASA.exterior` | piscina, construcciones, zonas, caminos, pasos, lindes, portón, farolas | las 10 cámaras de fuera |
| `CASA.arboles` | 51 árboles | la cámara del linde |

### El `exterior` NO está en `C0` (aviso para el core)

El contrato dice `AD.api.C0.exterior`, pero en el visor `C0 = CASA.casa` y **la
casa no trae `exterior`**: el bloque vive en `window.CASA.exterior` (el visor lo
llama `X`). El módulo resuelve las dos rutas:

```js
var ext = (base && base.exterior) || (a.C0 && a.C0.exterior) ||
          (window.CASA && window.CASA.exterior) || {};
```

*Arreglo propuesto para el core* (no lo he tocado, es de otro agente):
`AD.api.C0 = Object.assign({}, C0, {exterior: F.exterior, arboles: F.arboles})`.

### Los dos sistemas de coordenadas (¡no mezclarlos!)

- **Interior** (`INT.estancias`, `INT.muebles`): marco del **plano** (u, v).
  `aMundo(u,v)` los lleva al mundo.
- **Exterior** (`CASA.exterior`, `CASA.arboles`): coordenadas del **mundo** (x, z).
  La piscina está en (3, 18) y el camino de entrada entre (22, 30, 5) y (17, 8).
- En la casa de ejemplo `GIRO = 0` y `origen = [-10, -8]`: `aMundo(u,v) = [u-10, v-8]`.
  El inverso (`planDe`) está implementado en el módulo por si el rumbo cambia.

---

## 2. Las reglas de encuadre (lo que separa una cámara de una foto)

Se aplican **a las dos listas** y se comprueban con la prueba:

| Regla | Medida | Cómo se cumple |
|---|---|---|
| A la cara del muro | ≥ **0,25 m** | `distMuro()`: distancia al **tramo** de muro (no a la recta) contra la lista `solido` (muros + ventanas) |
| A la pieza que enseña | ≥ **0,60 m** | `distPieza()` sobre la huella rotada de la pieza; en el detalle, ≥ 0,80 m |
| Nunca dentro de un mueble | — | `dentroDeMueble(u,v,altura)`: un mueble que no llega a la altura de la cámara no la contiene, pero tampoco se le puede pasar rozando |
| Nunca dentro de un muro | — | por el `distMuro` de arriba |
| La línea de visión no está cortada | — | `lineaLibre()`: se muestrea el rayo cada 0,22 m y se mira si algo más alto que la línea se interpone. **La pieza que se filma se excluye** (si no, la pieza se tapa a sí misma y el detalle nunca sale) |

### El fallo de la línea de visión (costó tres horas)

La primera versión no excluía la pieza filmada: el rayo terminaba dentro de la
pieza, la pieza tapaba el rayo y **el detalle no se colocaba nunca** en las
estancias con piezas altas (la cama, el escritorio, la estantería). Se
corrige con un parámetro `excepto`.

### El "sitio" cuando la esquina está ocupada

Si la esquina exacta tiene un mueble, `sitioCerca()` busca en espiral (0,2 m,
0,4 m… hasta 0,8 m) un punto libre. Sin eso, el segundo domo de las estancias
grandes se perdía.

---

## 3. Las dos listas de cámaras (lo que sale de los datos)

### CINE — 32 cámaras (22 de interior + 10 de fuera)

Cámara a **1,62 m sobre el suelo terminado** (`SUELO + cota + 1,62` = 1,99 m en
el mundo), lente **corta** (35–55° en horizontal), se mueve despacio.

| Tipo | Cuántas | Altura | FOV horizontal | Notas |
|---|---|---|---|---|
| Plano general | 10 (uno por estancia) | 1,62 m | 50° | mira a la pieza principal; si no hay pieza, al centro |
| Detalle de la pieza | 9 | la altura de la pieza (0,52–1,20 m) | 38° | a 0,85–1,00 m de la cara de la pieza; si con la pieza principal no hay sitio, se prueba con la siguiente |
| Contrapicado | 3 (salón, dormitorio, lavadero) | 0,62 m | 45° | solo donde la pieza principal pasa de 1,10 m de alto |
| Travelling | en 19 de las 32 | — | — | deslizamiento lateral de 0,6–0,9 m a 0,16 m/s; solo si **todo** el recorrido está libre |

### REALIDAD — 25 cámaras (15 de interior + 10 de fuera)

Cámara **alta** (2,40–2,70 m), lente **ancha** (70–90°), **fija**, con estética
de seguridad: marca de tiempo, identificador de cámara y cuadrícula.

| Tipo | Cuántas | Altura | FOV horizontal |
|---|---|---|---|
| Domo | 15 | 2,45–2,70 m (colgado a 0,15 m del techo) | 78° |
| Domo opposite (2ª de la estancia grande) | 5 | idem | 88° |

* Regla de tamaño: **≥ 18 m²** → dos cámaras en **esquinas opuestas** (la más
  lejana de la primera). Comprobado: saló 10,49 m de separación (diagonal 12,04),
  cocina 4,82 (6,22), recibidor 3,60 (6,51), dormitorio 4,41 (6,08), estudio
  5,27 (6,85).
* La esquina es la de **mayor techo**; a igual techo, la más alejada de la pieza.
* El techo manda: en el baño (2,60 m) el domo queda a 2,45 m y en el lavadero
  (2,45–2,63 m) a 2,45 m. Nunca se atraviesa el techo.

### Las 10 cámaras de fuera (cada una nace de un dato)

| Cámara | De dónde sale la posición |
|---|---|
| Fachada principal | la puerta principal (hueco tipo `puerta` con orientación `S`), a 4,5 m del borde del porche |
| Porche | la estancia `fuera` (caja 6,9–20,11,5), en su extremo oeste, colgada de su techo (2,8→2,4 m) |
| Portón y entrada | el `porton` (a,b) + el eje del camino `entrada`, 22 % del eje y medio camino de ancho |
| Farola del camino | la farola `farolillo` del grupo "Camino" más cercana a la casa, mirando al final del eje del camino |
| Aparcamiento (cochera) | la zona `explanada` (polígono), en su esquina más lejana, mirando al centroide |
| Pérgola | la construcción `pergola` (centro, largo), en su borde, mirando a la piscina |
| Piscina | el vaso (`piscina.centro`, `rumbo`, `ancho`, `largo`), en la esquina exterior de la plataforma |
| Huerto | la zona `huerto` (polígono), en su esquina, mirando al centroide |
| Caseta de la depuradora | la construcción `caseta`, en el tejado, mirando los `pasos` |
| Árbol del linde | el árbol de mayor radio (≥ 2,5 m) más cercano a la casa (el encina), mirando a la fachada este |

---

## 4. El FOV: horizontal, y el límite de 94° verticales

`aplicaVista` pone `camara.fov`, que es **VERTICAL**. El FOV humano se define en
horizontal y se convierte: `2·atan(tan(h/2)/aspecto)`.

| Nivel | Límite vertical | Por qué |
|---|---|---|
| REALIDAD | 50–94° | el límite del visor: evita el ojo del pez |
| CINE | **22–94°** | una lente corta en horizontal da 20–32° verticales; con el mínimo de 50° del visor, una toma de cine a 50° horizontales salía a 80° reales: no era cine |

**Consecuencia que hay que saber**: en vertical (aspect 0,46) el horizontal
efectivo se recorta a 52,7°, porque 94° verticales es el tope. O sea:

- en **horizontal** (aspect 1,78): el nivel realidad muestra los 70–90° pedidos;
- en **vertical** (aspect 0,46): el tope de 94° verticales deja **52,7°** de
  horizontal. Se pide el ancho completo y se recorta; el HUD enseña el FOV
  pedido y el módulo tiene `horizontalEfectivo()` para el que quiera el real.

## 5. La distancia mínima de 2 m del visor

`colocar()` recorta: `dist ≥ 2 m`. Un primer plano a 0,9 m **no** se consigue
acercando la cámara (la empujaría a 2 m), sino con **lente corta**: el punto de
mira se estira sobre el mismo rayo (`miraLejana()`) y la dirección no cambia.

---

## 6. El HUD (cambia con el nivel)

| | CINE | REALIDAD |
|---|---|---|
| Franja | letterbox 5,5 % arriba y abajo | ninguna |
| Arriba izquierda | `CAM-07` + nombre | `CAM-07` + nombre + FOV |
| Arriba derecha | — | `● REC 13:42:07` (la hora es la de la casa, el `#hora` del visor) |
| Encuadre | rótulo del plano: «Detalle · chimenea · 38°» | — |
| Pantalla | — | cuadrícula 3×3 transparente |
| Abajo | 6 botones de 44 px: ◀ ▶ Auto · Nivel · Cámaras · ✕ | los mismos |

- El HUD persistente ocupa ~10 % de la pantalla; el letterbox (11 %) es el
  **encuadre**, no el HUD.
- Mientras el CCTV está abierto se ocultan la barra de Fabrick, la brújula, la
  escala, el HUD del paseo, el panel lateral y el botón de «Controles»
  (`body.ad-cctv`).
- El panel de miniaturas es un cajón que se abre a petición (hasta el 54 % de
  alto), con **una miniatura por cámara**.

## 7. Las miniaturas: canvas, no renderizados

Veinticinco o treinta y dos escenas renderizadas en WebGL tumban el móvil. Las
miniaturas son un **croquis de planta** por cámara, dibujado con canvas 2D:
fondo `#081014`, la casa en verde limón `#c9ef63`, las estancias en trazo fino,
la piscina en `#7fd3ff`, el cono de visión en ámbar translúcido y la cámara como
un punto. Se dibujan **al abrir el panel**, no antes.

---

## 8. El API público

```js
AD.cctv = {
  abrir(), cerrar(), alterna(), alternar(), abierto(),
  irA(i), siguiente(), anterior(),
  camaras(nivel),      // sin argumento: la lista del nivel actual
  nivel(), setNivel('cine'|'realidad'),
  auto(v),             // sin argumento: consulta
  panel(v),            // el cajón de miniaturas (extra)
  estado()             // {abierto, nivel, i, auto, camaras} (extra)
};
```

- `alterna` (y `alternar`) es lo que busca `AD.metodoAlterna` de
  `modulo/fabrick.js`: por eso el botón de la barra funciona.
- El botón se registra con `AD.boton({id:'cctv', etiqueta:'CCTV', icono:'cctv',
  alPulsar, activo})`. Como `modulo/cctv.js` carga **antes** que
  `modulo/fabrick.js`, el módulo **vuelve a registrarlo** en el `load` y con un
  `setTimeout(...,0)`: así gana al de la barra (que usa `alterna`, igual de
  válido) y el botón vivo usa el handler nuevo.

---

## 9. Trampas (las que casi me cuestan el módulo)

1. **La pieza filmada tapa su propio rayo.** `lineaLibre()` necesita el
   parámetro `excepto`, si no el detalle no se coloca nunca.
2. **La distancia al muro se mide contra el tramo**, no contra la recta: con la
   recta, una cámara al final de un muro pasa el filtro y se mete en el tabique.
3. **La ventana es un hueco entre dos trozos de muro**: la lista de retiro
   (`solido`) tiene que incluir los vanos que **no** se pueden pasar
   (ventana, ventanuco); las puertas y los pasos no.
4. **El `cota` de la estancia**: el suelo terminado está a `SUELO + cota`
   (0,25 + 0,12 = 0,37). La cámara a 1,62 m del suelo está a 1,99 m del mundo,
   no a 1,62.
5. **El `exterior` no está en `C0`** (ver §1) y **las coordenadas del exterior
   son del mundo**, no del plano.
6. **`aplicaVista` pone el FOV vertical** y **recorta** la distancia a 2 m.
7. **El modo cine y el CCTV son excluyentes**: los dos escriben la cámara. Al
   abrir el CCTV se cierra `AD.camaras.cierra()`; y al revés, en cada cuadro se
   mira si el panel del cine (`#adc-panel` con la clase `on`) está activo: si lo
   está, el CCTV se aparta **sin restaurar la órbita** (la cámara ya es del cine).
8. **La órbita**: se guarda con `AD.api.orbita()` al abrir y se devuelve con
   `restauraOrbita()` al cerrar, y mientras el CCTV está abierto se llama a
   `bloqueaOrbita(true)` para que el dedo no mueva la toma.
9. `AD.api` puede no existir al cargar el módulo: todo pasa por `datos()` y el
   arranque espera con `AD.alListo()`.
10. `AD.onFrame` es el único reloj fiable: la rotación automática y el
    travelling se cuentan con `dt` acumulado, no con `setInterval` (que sigue
    corriendo con la página en segundo plano).

---

## 10. Qué falta

- **La escena 3D no se ha visto en un teléfono**: la validación es de datos
  (0 fallos en las dos listas, en las reglas y en la API), no visual.
- **El HUD sí se ha visto**, en un viewport de 390 × 844 (con el headless shell,
  sin WebGL): sale el letterbox, la fila de 6 botones de 44 px, el rótulo, la
  cuadrícula 3×3, el reloj y el panel de miniaturas en dos columnas. Lo que no
  se ha probado es el HUD **sobre la escena** (contraste sobre un fondo claro).
- La marca de tiempo usa la hora de la casa (`#hora` del visor, que sigue el
  ciclo de día/noche). Si no está, cae a una cuenta de 24 h desde la apertura.
- No hay exportación de vídeo (a propósito).
- Las miniaturas son un croquis de planta, no una foto de la toma: se podría
  hacer una captura 2D del cono por cámara, pero eso ya es otra cosa.
- El nivel cine y el nivel realidad **no comparten las cámaras**: son dos
  inventarios distintos (32 y 25). Es a propósito (las reglas son distintas),
  pero implica que el `CAM-07` del cine no es el `CAM-07` de la realidad.
- La cámara del árbol y la de la caseta se montan en el tronco y en el tejado
  respectivamente: en el visor no hay carcasa 3D que las dibuje (el visor de
  este repo no dibuja cámaras), así que solo se ven por su encuadre.
