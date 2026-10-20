# Los datos de una casa

El visor dibuja lo que hay en `casa.js`: `window.CASA` (la casa tal cual) y, si existe,
`window.CASA_MEJORA` (la propuesta de reforma). `casa.js` lo escribe un script (en la demo,
`demo/herramientas/casa.py`) y no se edita a mano. Esta página es la referencia de todo lo que
entiende el visor; la casa de ejemplo usa casi todo y es el mejor sitio para ver cada cosa en uso.

Si algo no está aquí, la verdad está en `visor.js`: cada mueble es una función de `MUEBLE`, y los
parámetros que lee son los `m.<algo>` de esa función.

## Marcos de referencia

| Marco | Ejes | Para qué |
|---|---|---|
| **Plano** `(u, v)` | metros; `u` a la derecha del plano, `v` hacia abajo | la casa: muros, huecos, estancias, muebles, luces |
| **Mundo** `(x, z)` | metros; `x` al este, `z` al sur; `y` es la altura | el exterior, los árboles y lo que lleva `mundo` |

`casa.rumbo` es hacia dónde apunta el eje `u` (en grados desde el norte, en el sentido del reloj) y
`casa.origen`, dónde cae `(0, 0)` del plano en el mundo. Con `rumbo: 90` la casa va sin girar:
`x = origen.x + u`, `z = origen.z + v`.

Los giros de los muebles: `0` = el frente mira a `+v` (o `+z`), `90` = a `+u`, `-90` = a `-u`, `180` = a `-v`.

## `CASA`

### `meta`

| Campo | Qué es |
|---|---|
| `nombre`, `subtitulo` | cabecera del panel y título de la pestaña (`subtitulo` admite `<br>`) |
| `clave` | prefijo de lo que se guarda en el navegador; uno distinto por casa |
| `lat`, `lon` | para el sol; `huso` (horas sobre UTC, 1 por defecto) y `verano: false` si no hay horario de verano |
| `tandas` | nombres de las tandas de fotos: `{defecto: 'interior', t5: 'quinta tanda'}`; `foto: 't5: 12'` sale como «quinta tanda, 12» |
| `enlace` | `{texto, url}`: un enlace bajo el subtítulo del panel |
| `notaMueble` | la nota de la ficha de los muebles que no traen la suya |

### Parcela

| Campo | Qué es |
|---|---|
| `parcela` | polígono `[[x, z], …]` del terreno |
| `lindeReal` | otro polígono, si el lindero de verdad no es el oficial (el terreno sigue este) |
| `huellaCatastral` | huella oficial del edificio; con ella aparece la capa «Huella del Catastro» |
| `fichaParcela`, `notaParcela`, `notaArboles` | filas `[[nombre, valor], …]` y notas de las fichas |

### `vistas` y `sitios`

`vistas`: `[grupo, id, nombre, vista]`, con `grupo` `'fuera'` o `'dentro'`. La vista es una órbita
`{d, t, p, c}` (distancia, ángulo horizontal, ángulo desde arriba, centro: `[x, z]`, `'parcela'` o
`{uv: [u, v]}`), un `{desde: [x, y, z], hacia: [x, y, z]}` o `{estancias: [ids]}`, que encuadra esas
estancias desde arriba y sin tejado. `sinTejado: false` las deja puestas. Sin `vistas`, una por
estancia y tres de fuera.

`sitios`: los atajos de fuera del paseo, `[nombre, punto]`, con el punto `[x, z]`, `{zona: id}`,
`{construccion: id}`, `{uv: [u, v]}`, `'piscina'` o `'porton'`.

### `casa`

| Campo | Qué es |
|---|---|
| `rumbo`, `origen`, `cotaSuelo` | ver arriba; `cotaSuelo`, la altura de la losa de la casa sobre el terreno |
| `contorno` | polígono de la planta, en el plano: la losa |
| `muros` | `[u0, v0, u1, v1, espesor, alto0, alto1, acabado, id]` |
| `huecos` | `[u0, v0, u1, v1, tipo, cara, espesor, alto0, alto1, acabado, opciones]` |
| `cubiertas`, `pilares`, `vigas`, `celosias`, `losas`, `escaleras`, `chimeneas` | ver abajo |
| `tendedero`, `lenero`, `azoteaSO` | extras opcionales: tendedero y máquinas sobre una azotea, leñero adosado |
| `ficha`, `nota`, `notaMuros` | filas y notas de la ficha de la casa y de los muros |
| `interior` | `{estancias, muebles, luces}` |

**Muros.** Rectas por el eje del muro. `alto0` y `alto1`, la altura en cada punta (bajo una cubierta
inclinada no son iguales). `acabado`: `piedra`, `blanco`, `crema`, `interior`, `mares`, `bloque`… (los de
`MAT` en `visor.js`). Los trozos de un mismo muro comparten `id`. Donde hay un hueco, el muro se corta: el
hueco ocupa ese tramo y pone él mismo el antepecho y el dintel.

**Huecos.** `tipo`: `ventana` (con dos mallorquinas abiertas), `ventana_negra`, `mallorquina`, `ventanuco`,
`ventanal`, `puerta`, `vidriera` (doble, de cuarterones), `ventana_int`, `garaje` (basculante), `arco`,
`paso` (un vano sin carpintería) y `acristalado` (de suelo a techo). `cara`: hacia dónde queda el
exterior (`N`, `S`, `E`, `O`); en un tabique, hacia dónde abre la puerta. Opciones: `id`, `nombre`,
`y0`/`y1` (alféizar y dintel), `bisagra: 'fin'`, `giro` (grados), `abre` (lado), `hoja` y `dentro`
(material por fuera y por dentro), `mirilla`, `persiana` (`true` o `'plegable'`), `lado: 'ini'`,
`abierta` (las mallorquinas), `giros` (las dos hojas de una vidriera), `marco`.

**Cubiertas.** `{id, nombre, tipo, caja: [u0, v0, u1, v1], …}`:
- `dos_aguas`: cumbrera a lo largo de `u`, `alero`, `cumbrera`; `faldon: ['O', 'E']` en vez de hastial;
  `pegada: 'O'`/`'E'`, el lado que apoya en otro volumen (sin vuelo).
- `una_agua`: `cae` (`N`, `S`, `E`, `O`), `alto`, `bajo`, `vuelo`, `pegada`.
- `plana`: azotea con `alto` (forjado) y `peto`; `paso_n`/`paso_s: [u0, u1]`, un tramo sin peto.

**Resto de la casa.** `pilares`: `[u, v, lado, alto, material]`. `vigas`: `[u0, v0, u1, v1, cota, 'madera'|'jacena']`.
`celosias`: `[u0, v0, u1, v1, alto]`. `losas`: `{caja, alto, mat, base}`. `escaleras`: `{tipo: 'obra'|'metal',
nombre, tramos: [{pie, cabeza, ancho, y0, y1}], rellanos: [{caja, y, barandilla: ['N', …]}]}`.
`chimeneas`: `{uv, lado, alto, base}` (o `barbacoa: true`). `tendedero`: `{cubierta, postes}`.
`lenero`: `{caja, alto, tejado}`. `azoteaSO`: `{cubierta, maquinas: [[u, v], …], parabolica: [u, v]}`.

### Estancias

`{id, nombre, codigo, caja: [u0, v0, u1, v1], cota, suelo, pared, techo}` y, si hace falta:

| Campo | Qué es |
|---|---|
| `codigo` | prefijo de los IDs de sus muebles y luces (`SAL` → `SAL-04`, `SAL-L02`) |
| `suelo` | `tarima`, `barro`, `laminado`, `gres`, `porcelanico`, `beige`, `parquet`, `hidraulica`, `microcemento`, `hormigon` |
| `pared`, `paredes` | color (`'#f2efe8'`), `'piedra'` o `'azulejo'`; `paredes: {O: 'piedra'}` para un lado distinto |
| `techo` | `{alto}` plano; `{alto0, alto1}` inclinado de `v0` a `v1`; `{alto, cumbrera, vc}` a dos aguas. `mat`: `'blanco'`, `'tablero'`, `'madera'`… `vigas: 0.9` (una cada tanto) o `huecos: 6` |
| `fuera` | porche o similar: sus luces van con las de fuera, por grupos |
| `luz: false` | sin luz de relleno (estancias pequeñas) |
| `junta` | es un trozo de otra estancia (una L): comparte vista y sitio del paseo |
| `fotos`, `nota`, `idea` | procedencia, nota de la ficha e idea (en la mejorada) |

### Muebles y luces

`{id, tipo, uv: [u, v], giro, …}` o, fuera de la casa, `{…, mundo: [x, z]}`. Comunes: `cota` (altura de la
base), `nombre` (en vez del del tipo), `foto`, `nota` e `idea`. Las luces van aparte, en
`interior.luces`, con ID `<código>-Lnn`: `foco`, `colgante`, `plafon`, `aplique`, `tira`, `farol`,
`lampara_pie`, `proyector`, `flexo`. Sus opciones: `luz` (`'calida'`, `'neutra'`, `'fria'` o un color),
`techo` (fuera de una estancia), `y` (altura de un aplique o una tira), `diametro` y `grupo` (el botón del panel
que las enciende, para las de fuera).

Tipos de mueble: ver `NOMBRE_MUEBLE` y `MUEBLE` en `visor.js`. Hay de casa (sofás, camas, cocina, baño,
oficina, armarios…), de jardín (tumbonas, pérgolas, barbacoas, bancales, hamaca, emparrado…), coches y, para
soñar, superdeportivos, helipuerto, pádel, jacuzzi, chiringuito, cine, fuente con estatua, sauna y green.

### `exterior`

| Campo | Qué es |
|---|---|
| `piscina` | `{centro, rumbo, largo, ancho, profundidad, coronacion, plataforma: {alto, cesped}, losas, tierra, tierraBorde, escalones, escalerasTierra, leon, ficha, nota}`. `rumbo` es el del eje largo |
| `construcciones` | `{id: 'pergola'|'caseta', nombre, centro, rumbo, ancho, largo, alto, cumbrera, cota, etiqueta, nota}` |
| `zonas` | suelos: `{id, nombre, mat, poly | circulo: [x, z, r], alto, lado, banco, aprox, nota}`. `mat`: `grava`, `tierra`, `explanada`, `huerto`, `cesped`, `losa`, `arena`… |
| `caminos` | `{id, nombre, mat, ancho, eje: [[x, z], …], piedras: true|'fuera', bordillo, pasoFinal}` |
| `pasos` | losas sueltas a lo largo de polilíneas: `[[[x, z], …], …]` |
| `lindes` | `{desde, hasta, tipo}`: tramos del polígono de la parcela (por índice de vértice) y su cerramiento (`paret`, `mares_malla`, `bloque_canizo`…) |
| `porton` | `{a, b, alto, pilar, pilarAlto, abierta}`: dos vértices de la parcela, el hueco entre ellos |
| `tapias`, `placas`, `rampas`, `rebaje` | paredes sueltas, campo solar (`{filas: [{desde, hasta, n}], panel, inclinacion, cota}`), rampas y un rebaje del terreno |
| `farolas` | `{id, tipo: 'globo'|'farolillo'|'piscina'|'foco_viga'|'pilar', mundo, grupo, hacia, y}` |
| `sueltos` | `{tipo: 'monton'|'piedras'|'monton_piedras'|'lena', centro, …}` |

### `arboles`

`[especie, x, z, radio de copa, id, cota]`. Especies: `pino`, `encina`, `olivo`, `cipres`,
`cipres_muro` (más bajo), `frutal`, `algarrobo`, `nogal`, `pimentero`, `higuera`, `yuca`, `almez`,
`botella`, `laurel`, `granado`, `naranjo`, `limonero`, `almendro`, `morera`, `lavanda`, `baladre`,
`romero`, `santolina`, `lentisco`.

## `CASA_MEJORA`

La propuesta de reforma. Se genera a partir de la actual (en la demo, `mejora.aplica(casa)`), así que lo
que se corrija de la casa le llega solo.

| Campo | Qué es |
|---|---|
| `casa` | `{muros, huecos, interior}` propios; lo demás de la casa (cubiertas, porches) es común |
| `quita` | IDs de lo de fuera que desaparece (`A-012`, `EXT-…`); `'lena'` y `'monton'` quitan esos sueltos |
| `exterior` | `{zonas, caminos, placas, arboles, sinRejilla, escaleras, aceras, canales}` nuevos |
| `propuestas` | texto del panel por vista: `{general: '…', salon: '…'}` |

Lo nuevo lleva `idea` (sale en su ficha) y sus propios IDs (`COC-M01`, `EXT-X02`, `A-M01`); lo que se
queda conserva el de la actual.

## La URL

| Parámetro | Qué hace |
|---|---|
| `?vista=salon` | abre una vista |
| `?version=mejorada` | abre la mejorada |
| `?hora=1260` | minutos desde las 0:00 (21:00); `?fecha=21jun`, `21sep`, `21dic` |
| `?pie=x,z,rumbo` | entra en el paseo en ese punto |
| `?desde=x,y,z&hacia=x,y,z&fov=n` | coloca la cámara |
| `?id=SAL-04` | enfoca un objeto y abre su ficha; `?ids` enciende la capa de IDs |
| `?ocultar=muros,arboles` | apaga capas |
| `?limpio` | sin panel ni etiquetas (capturas); `?anonimo` sin el nombre de la casa; `?sombras` con sombras |
