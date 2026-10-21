# Memoria del agente A — plano 2D y planta 3D elevada

> Archivo propio: `modulo/plano.js` · rama `fabrick` · sin commits.
> Esta versión es la segunda: la primera no se había visto nunca en un
> teléfono. Todo lo que hay aquí está comprobado con
> `node /tmp/opencode/test-plano-cam.js` (banco propio: 0 fallos) y con
> `node /tmp/opencode/banco.js` (0 fallos).

## Qué entrega

`modulo/plano.js` — dos cosas en un módulo:

1. **Panel con plano 2D (SVG)**, dibujado con el **mismo contrato de datos**
   que la escena 3D: `C.muros`, `C.huecos`, `INT.estancias`, `INT.muebles`.
   No hay ninguna planta dibujada a mano: si se mueve un muro en `casa.js`,
   el plano se mueve con él.
2. **Plano 3D elevado**: corte de planta, capa de anotación y códigos, con
   órbita al tacto.

API pública:

```js
AD.plano = {abrir(), cerrar(), alternar(), esPlan3D(), setCodigos(bool)}
```

## Decisiones clave (y por qué)

| Decisión | Por qué |
|---|---|
| `CORTE = 1,15 m` **sobre el piso terminado** (`cota + 1,15`) | La altura a la que un plano se lee. Copiado del visor 390-1. |
| **La cámara de la planta mira casi vertical** (`phi = 0,30 rad` = 17° de caída) | La lección del visor 390-1: con el corte a 1,15 m, mirar de lado hace que **cada tabique tape el ambiente de al lado** (un muro de 1,27 m tapa 1,8 m de suelo a 35° de caída; a 17° sólo tapa 0,39 m). El rango de la órbita es φ ∈ [0,05 ; 1,05]. |
| Poché de **0,026 m** con el **espesor real** de cada muro (0,45 exterior / 0,12 interior) | Así se lee qué muro es y de qué tipo. Verificado en el banco: en la geometría aparecen las dos huellas (±0,227 y ±0,062). |
| **Una malla por material** (muro, poché, vidrio, puertas, pasos) = **5 draw calls** | Antes eran ~100 mallas (una por muro y otra por hueco). En un móvil, 100 mallas son 100 cambios de estado. Las cajas se fusionan con `fusionCajas()` (BoxGeometry → `toNonIndexed()` → un solo BufferGeometry). |
| Material **neutro** en planta | El color de la casa (piedra, cal, madera) se queda para el 3D. En la planta manda el código, no el color. |
| Capa de anotación como **una sola textura de canvas** | Un sprite por etiqueta son cientos de draw calls. Una textura es un draw call. Sin sprites ni DOM por etiqueta. |
| El **alto de los rótulos se mide en METROS del plano** (0,45–1,05 m), no en píxeles de textura | A 16 px/m en un móvil de 390 px, un texto de 34 px de textura mide 5 px de pantalla: no se lee. Con 0,45 m mínimo, el rótulo mide 7,4 px… por eso además el nombre **se reparte en varias líneas** antes de encoger la letra (`envuelve()`), y el mínimo del banco es 10 px en pantalla. |
| El nombre se **reparte en varias líneas** y puede passar 1,45× el ancho del ambiente | «DORMITORIO PRINCIPAL» en un cuarto de 4,3 m no cabe: encogerlo lo dejaba en 6 px. Repartido en dos líneas se queda en 13 px. |
| El 2D (SVG) mide sus textos **en píxeles de pantalla** (`fp()`) | El SVG se dibuja a ancho completo del panel: en un móvil el nombre de un ambiente medía 5 px. |
| La **distancia** de la cámara se calcula con el FOV real y la inclinación (`distanciaAjuste`) | Con la fórmula anterior (`max(12, lado*1,35)`) la planta no cabía en vertical. Ahora: `max(extU/tan(h/2), extV·cos(φ)/tan(v/2))` con un 12 % de margen. |
| **FOV en horizontal** (70°) convertido a vertical con `2·atan(tan(h/2)/aspect)`, límites 50–94° | El visor guarda el vertical. En vertical (aspect 0,46) el vertical se recorta a 94° y el **horizontal real queda en 52,7°**: la distancia de encuadre usa ese horizontal, no el pedido. |
| Entrar a un ambiente **tocando el piso**, con umbral de **10 px y 0,7 s** | Con el umbral pequeño (8 px) orbitar acababa entrando en una habitación. Ahora se mide la distancia **máxima** al punto de partida (un toque es un toque aunque el dedo tiemble). |
| La órbita no pelea con el paseo: `if(a.pie && a.pie.activo) return` | El modo "a pie" manda siempre. |
| La planta **guarda y restaura** el estado (cubierta, árboles, mallas recortadas y cámara) | Si no, al salir de la planta la casa se queda sin techo. |
| Planta y cine son **excluyentes** | Los dos escriben la cámara en cada cuadro. `entraPlan3D()` cierra el cine y `AD.camaras.abrir()` cierra la planta (con `AD.plano.esPlan3D()`). |
| Botón del plano **abajo a la derecha** (`bottom:52px`) | La barra de Fabrick (`#fabrick`, `right:12px; top:84px`) ocupaba la esquina superior derecha. |
| `body.adc-plano` aparta el HUD del visor | Su brújula y su escala estorban (la planta trae las suyas) y su botón de cine no puede coexistir con la planta. |

## El corte, en detalle

- `cota = C.cotaSuelo` (0,12) → `corte = cota + 1,15` → en el mundo, el corte
  está a `SUELO + 1,27` (1,52 m sobre el terreno).
- El grupo de la planta se coloca en `C.origen` con `rotation.y = GIRO`, igual
  que la casa, y dentro se trabaja en `(u, v)`.
- Los muros de la casa (capas `muros` e `interior`) que asoman por encima del
  corte se ocultan: el corte lo dibuja la propia planta.
  `cortaPorEncima()` usa la caja de la **geometría** (no `setFromObject`, que
  recorre todo el subárbol por cada malla: 500 mallas → 250 000 pasos).
- El alféizar de una ventana **queda como muro**; la ventana se dibuja como una
  raya de vidrio en el corte. El umbral de la puerta = raya del color de la
  puerta. La hoja se dibuja tumbada en el suelo (a `cota + 0,014`, no a 0,02:
  antes quedaba bajo el piso terminado).

## Conversión de coordenadas (la trampa)

- El **dato** (`C.muros`, `INT.estancias`) vive en el marco del plano: `u` (x) y `v` (z).
- La **geometría 3D** vive en coordenadas de mundo, con la casa girada por `GIRO`
  alrededor de `C.origen`.
- El módulo **no reutiliza** los grupos de la casa: crea un grupo propio con la
  misma transformación y trabaja dentro en `(u, v)`.
- `aMundo(u,v)` / `uvDe(x,z)` están **reimplementados** en el módulo, por si
  `AD.api.aMundo` no estuviera.

## Robustez del contrato (lo que faltaba)

- `AD.api.C` puede ser **la casa entera** (`CASA`) o **su parte de construcción**
  (`CASA.casa`). `casaDatos()` normaliza; si no, el módulo leía `muros` de un
  `undefined` y se quedaba sin planta.
- Lo mismo con el interior: `intDatos()` cae a `C.interior` si `AD.api.INT` no
  viene (que es justo lo que pasa en el banco del coordinator).
- Todos los `querySelector` del panel van con guarda: si el DOM no es el
  esperado, el módulo sigue sirviendo el plano en vez de reventar la página.

## Contrato que consume

- `AD.api`: `escena, camara, renderer, capas, C, INT, SUELO, GIRO, aMundo, d2r,
  aplicaVista, pie, salePie, poneCapa, VISTAS, eligeVista`.
- `AD.avisaListo(fn)` para montarse; si no existe, reintenta cada 150 ms hasta 30 s.
- `AD.onFrame(fn)` para la cámara de planta (FOV adaptativo por aspecto).
- Registra la pieza `PLANO-3D` en `AD.piezas` (estado 1/0) para que el hub la
  pueda abrir.

## Cómo se probó

`node /tmp/opencode/test-plano-cam.js "/sdcard/Documents/Build house/repo"`:

- el corte está a 1,15 m sobre el piso y el poché lleva los dos espesores;
- la planta son **6 mallas**, no 100;
- la planta **entra entera** en la pantalla del móvil y la cámara va casi vertical;
- los rótulos miden **≥ 0,40 m** de alto y **≥ 10 px** en un móvil de 390 px;
- los códigos M/F/P se escriben al activar la capa;
- al salir de la planta vuelven la cubierta, los árboles y la cámara.

## Qué queda sin hacer

1. **No se ha visto en pantalla.** Todo está validado con datos, no con píxeles:
   falta la prueba en el teléfono (que el corte se lea, que las etiquetas no se
   pisen y que el toque de ambiente entre donde toca).
2. La planta no se puede desplazar (arrastrar gira, pero no se hace *panning*):
   con el móvil en vertical, la planta de 20×15 m no cabe en horizontal y sólo
   se ve el centro. Habría que permitir arrastrar con dos dedos o un botón de
   desplazamiento.
3. No hay **chequeo de solapes de muebles** en planta (como el `plano390Audit`):
   aquí la vista es un dibujo, no un dato.
4. La lista de muebles del 2D usa una tabla de huellas (`HUELLA`) que cubre los
   tipos de la casa de ejemplo; una casa real con otros tipos saldría con la
   huella por defecto.
5. El texto de la capa de anotación se ve a 1,15 m de altura: si la cámara se
   aleja mucho, hay que pinzar.
