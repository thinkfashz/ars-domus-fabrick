# R · Revisión y pulido de la barra, el hub y la carga

> Revisión de integración hecha **después** de que el visor volviera a funcionar
> (el bug de `LUC` usado antes de declararse y el de `AD.alListo` ya están
> corregidos y desplegados). Esta revisión **no toca** `visor.js`, `index.html`
> ni los módulos de otros agentes: `modulo/fabrick.js`, `modulo/carga.js` y
> `modulo/hub.js` son los míos; `memoria/R-revision.md`, este archivo.

---

## 1. Cómo se comprobó

| Comprobación | Resultado |
|---|---|
| `node /tmp/opencode/banco.js "<repo>"` (banco del coordinator) | 0 fallos |
| `node /tmp/opencode/banco-R.js "<repo>"` (banco propio, ver §6) | 36 comprobaciones OK, 0 fallos |
| `node --check` de los tres archivos tocados | OK |
| `CASA=demo npm run check` | sintaxis OK |
| `node herramientas/build.mjs` | `dist/` listo (8 módulos copiados) |

El banco del coordinator **no alcanza** para dos de los tres archivos: su DOM de
mentira no parsea `innerHTML` (el hub y el panel del plano se quedan a ciegas) y
su `AD.api` no trae `C0` (la cocina no llega a registrar herrajes: `piezas
registradas: 1`). Por eso hay un banco propio (§6). **El del coordinator se
deja como estaba**: es compartido y lo usan otros agentes.

---

## 2. Qué se cambió

### 2.1 `modulo/fabrick.js` — la barra (3 fallos reales)

| # | Síntoma | Causa | Arreglo |
|---|---|---|---|
| F1 | Los botones «Plano» y «Cine» **no hacían nada** (solo un `console.warn`) | La barra llamaba `AD.plano.alterna()` y `AD.camaras.alterna()`, pero esos módulos exponen **`alternar`** | `AD.metodoAlterna(obj)` busca el primer método que exista (`alterna` → `alternar` → `toggle`) y lo devuelve ligado a su módulo. Si no hay ninguno, **no se registra el botón** y se avisa por consola |
| F2 | **Todos** los botones salían apagados (`aria-pressed="false"`), siempre | Los cierres de `activo()` compartían la **misma variable** `m`, reasignada en cada módulo: al leer el estado, todos leían el último módulo (audio) | Cada botón se registra con su propio módulo (`botonDe(id, etiqueta, icono, modulo, estado)`); el estado se lee de `AD.plano`, `AD.camaras`… en el momento, no de una copia |
| F3 | La barra de abajo tapaba **«Salir»** y **la puerta cercana** en el paseo del móvil | `#fabrick` en móvil está en `bottom:12px; right:12px` y `#salir-pie`/`#puerta-pie` también (`right:16px; bottom:16px` / `bottom:60px`). Z-index 30 contra 20: la barra se comía los dos botones | CSS propio desde el módulo: en `max-width:860px` los botones van **solo con icono** (44×44, caben en una fila y no se apilan sobre el HUD) y, con `body.a-pie`, la barra **sube a la esquina** (`top:78px`, en columna), libre del pulgar derecho |

Además:

- `AD.boton` **reemplaza** el botón con el mismo id (no duplica) y repinta la
  barra si ya estaba en pantalla: un módulo que se registre tarde se ve igual.
- `pintaBarra` solo repinta si **cambia la lista** de botones: si no, se perdería
  el `aria-pressed` y el foco del botón que se está usando.
- El icono del sonido cambia con el estado (`sonido` / `sonidoMudo`).
- `alPulsar` va en `try/catch`: un módulo que revienta **no se lleva el visor**
  (queda el aviso en consola y la barra sigue viva).
- El reloj de refresco (600 ms) no hace nada con la pestaña en segundo plano.

### 2.2 `modulo/hub.js` — el hub y la cocina (4 fallos reales)

| # | Síntoma | Causa | Arreglo |
|---|---|---|---|
| H1 | **Todas las puertas se llamaban igual** (la última que se encontró en la escena) | `mapaPuertas()` usaba la **puerta (un objeto)** como clave de un objeto plano: todas las claves valen `'[object Object]'` | El mapa es ahora una **lista** `[{p, info}]` y se busca **por identidad** |
| H2 | El hub ofrecía **dos «Cajón inferior»** (uno de la casa actual y otro de la mejorada) y el que se abría era el de la casa que **no se estaba mirando** | La cocina construye **las dos versiones** (la escena tiene las dos a la vez) y registra los herrajes de las dos; `piezas()` devolvía la lista entera | `piezas()` filtra por la versión actual: los ids de la cocina la llevan al final (`COC-01-caj-1-actual`, `…-mejorada`) y las piezas sin versión (cámaras, plano 3D) se muestran siempre |
| H3 | Al cambiar de versión, las filas del hub se quedaban **a medias** (pulsaban y no pasaba nada) | La lista solo se rehacía si cambiaba el **número** de piezas; al cambiar de versión puede haber las mismas en cantidad y ser otras | Se rehace con una **firma** (id + etiqueta + grupo) **y** comparando la **identidad** de los objetos (si la cocina se rehace con `AD.cocina.aplicar()`, las piezas son objetos nuevos con los mismos ids) |
| H4 | Las puertas de la otra versión también salían (y el mapa de nombres se quedaba viejo al cambiar de versión) | `puertas()` no filtraba por versión y `H.mapa` solo se vaciaba al abrir el hub | `puertas()` filtra por versión (`versionDe(p.g)` subiendo por `AD.api.GRUPOS_V`) y el mapa se relee cuando la versión cambia |

Además:

- La sección «Cajones y nevera» pasa a llamarse **«Piezas animables»**: ahora
  contiene los cajones, la nevera, las puertas de mueble **y** las piezas que
  registran otros módulos (cámaras, plano 3D), agrupadas por su `grupo`
  (`Cocina`, `Visor`, `Plano`). Antes todo salía bajo «Cajones y nevera».
- `AD.audio.alterna()` y `AD.audio.suena()` se comprueban antes de llamar: si el
  módulo de audio no está, el hub no se rompe.
- La lista de piezas del hub se rehace sola (cada 2 s) cuando cambian, ya no
  solo cuando cambia el número.

### 2.3 `modulo/carga.js` — la carga (4 fallos reales)

| # | Síntoma | Causa | Arreglo |
|---|---|---|---|
| C1 | Un error que llegaba **durante el fundido** se escribía en una capa invisible: el usuario no veía nada | El aviso se metía en el overlay aunque ya estuviera desvaneciéndose (`clase .fuera`) o retirado del DOM | El aviso va al overlay **solo si se ve**; si no, al `#cargando` del visor, que es el avisador de errores de la casa |
| C2 | El `#cargando` **tapaba la casa** para siempre si había habido un error | `entra()` lo escondía siempre | `entra()` lo esconde solo si **no** hubo errores; si los hubo, se queda con el aviso a la vista (un error que no se ve es un error que no se arregla) |
| C3 | Un error **rompía el manejador** (`EST.pctTxt`/`EST.barra`/`querySelector` a null) y podía dejar la carga colgada | Sin comprobaciones | Todo va protegido; `error()` llama a `listo()` (no pone el flag a mano) para que la puerta se ofrezca igual y el auto-entrante siga funcionando |
| C4 | La barra se quedaba en **99 %** si una textura fallaba | El parche de `TextureLoader` contaba la carga, pero el `onError` no sumaba | El `onError` también suma (una textura que falla **terminó** de cargar) |

Además:

- El recorrido de la escena para contar texturas **no se hace cada 300 ms**: la
  escena tiene miles de mallas y recorrerla tres veces por segundo se nota en
  el móvil. Ahora se limita a **una vez por segundo** y para cuando ya no queda
  nada.
- La pantalla completa y el bloqueo de orientación **solo se piden con gesto**
  (el toque en «Tocá para entrar»): pedirlos sin gesto es una promesa
  rechazada y el navegador avisa por consola.
- `AD.audio.suena()` / `quiereSonido()` / `activa()` se comprueban antes de
  llamar (si el módulo de audio no cargó, la carga no se rompe).

---

## 3. Fallos en archivos de OTROS agentes (no tocados)

### 3.1 `visor.js` — falta `salirTour` en el contrato `AD.api` (**importante**)

- **Dónde**: `visor.js:5291-5297` (el bloque `AD.api = {…}`) y `visor.js:5287`
  (`window.__visor = {…}`). La función existe en `visor.js:5050`.
- **Quién lo sufre**: `modulo/plano.js:733-736`.

```js
if(a.TOUR && a.TOUR.activo){
  var salirT = a.salirTour || (window.__visor && window.__visor.salirTour);
  if(salirT) salirT(true);
}
```

- **Síntoma**: `salirTour` no está en ninguna de las dos listas → `salirT` es
  `undefined` → **el tour no se para** y se abre el plano 3D encima. El tour
  escribe la cámara cada cuadro, así que el plano 3D se vegee y es inusable.
- **Arreglo propuesto** (en `visor.js`, una línea): añadir `salirTour:salirTour`
  al objeto `AD.api` (y, si se quiere, a `window.__visor`):

```js
AD.api = {escena:escena, /* … */ poneCapa:poneCapa, MUEBLE:MUEBLE, MAT:MAT, C0:C0,
          salirTour:salirTour};
```

> Es el único `AD.api.X` que usan los módulos y que el core no publica: se
> comprobó uno por uno contra el bloque `AD.api` de `visor.js`
> (`escena, camara, renderer, capas, pie, TOUR, TOURS, PUERTAS, PUNTOS, pick,
> VISTAS, VERSIONES, GRUPOS_V, LZ, GIRO, SUELO, aMundo, d2r, entraPie, salirPie,
> aplicaVista, eligeVista, mueve, visible, estanciaActiva, reloj, poneCapa,
> MUEBLE, MAT, C0` + los getters `C, INT, VERSION`). Todo lo demás que piden los
> módulos está publicado.

### 3.2 `modulo/plano.js` — `querySelector` sin comprobar (robustez)

- **Dónde**: `modulo/plano.js:1060` y `:1061`.

```js
p.querySelector('.pl-x').addEventListener('click', function(){ cierraPanel(); });
p.querySelector('#plano-ver3d').addEventListener('click', function(){ … });
```

- **Síntoma**: si el HTML del panel cambia (o el navegador no parsea igual), el
  `null` revienta el módulo **al abrir el plano**, no al cargarlo: el error sale
  justo cuando el usuario toca el botón.
- **Arreglo propuesto**: guardar los botones en variables y comprobar:

```js
var bx = p.querySelector('.pl-x'); if(bx) bx.addEventListener('click', function(){ cierraPanel(); });
var b3 = p.querySelector('#plano-ver3d'); if(b3) b3.addEventListener('click', function(){ … });
```

### 3.3 `modulo/camaras.js` — ídem (`HUD.rango`)

- **Dónde**: `modulo/camaras.js:891` y `:895`.

```js
HUD.rango.addEventListener('input', function(){ … });
HUD.rango.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
```

- **Síntoma**: `HUD.rango` sale de `panel.querySelector('[data-vel-range]')`
  (`camaras.js:868`): si ese atributo no está en el panel, `HUD.rango` es `null`
  y el módulo revienta al montar su HUD.
- **Arreglo propuesto**: `if(HUD.rango){ … }` en las dos líneas, y el mismo
  cuidado en `pintaLista` (`HUD.lista.innerHTML`), que también se usa sin
  comprobar.

> Nota: en el banco propio (DOM con parser de `innerHTML`) el módulo de
> cámaras **carga y abre bien**; el fallo aparece solo si el panel se deforma.

---

## 4. Lo que queda sin hacer (y por qué)

| Queda | Por qué |
|---|---|
| Publicar `salirTour` en `AD.api` | Es `visor.js`, que no es mío (queda en §3.1 para el coordinator) |
| Guardar los `querySelector` de plano y cámaras | Archivos de otros agentes (§3.2 y §3.3) |
| Que el **visor** avise a los módulos cuando cambia de versión | Ahora el hub lo deduce de `AD.api.VERSION` y `AD.api.GRUPOS_V`, que ya se actualizan solos. Un `AD.alCambiarVersion(fn)` sería más limpio, pero exigiría tocar `visor.js` |
| Que la cocina **no** registre las dos versiones | El filtro está en el hub (el que muestra). La cocina registra las dos porque las dos cocinas están en la escena; si se filtrara en la cocina, el idserviría de menos |
| Probar en un navegador de verdad | En este teléfono el Chromium con WebGL por software tumba el renderizador; la comprobación es con el banco de Node + DOM de mentira |
| Un botón de «Control» que abra el plano en el móvil sin pisar el paseo | Resuelto con CSS (icono + esquina), pero falta probarlo con el pulgar |

---

## 5. Trampas que costaron tiempo (para que no se repitan)

1. **Un cierre que captura una variable compartida.** Todos los `activo()` de la
   barra leían el mismo `m` (el último módulo asignado). Con `var` dentro de
   una función, el cierre captura la **variable**, no el valor. Ahora cada
   botón recibe su módulo como argumento.
2. **Un objeto no puede ser la clave de un objeto plano.** `m[puerta] = info`
   con `puerta` siendo un objeto → `'[object Object]'` para todas. Buscar por
   identidad en una lista.
3. **La escena tiene las DOS versiones a la vez.** Todo lo que se liste por
   piezas o por puertas hay que filtrarlo por versión: si no, aparecen
   duplicados y se anima lo que no se ve. Los ids de la cocina ya lo dicen
   (`…-actual`, `…-mejorada`); para las puertas hay que subir por
   `AD.api.GRUPOS_V`.
4. **Los módulos no llaman todos al mismo método.** `alterna` (hub),
   `alternar` (plano, cámaras). La barra no debe suponerlo.
5. **`var` y el orden de las declaraciones.** El bug de `LUC` (usada en la
   línea 3526 y declarada en la 3630) tumbó el visor entero: el IIFE muere y
   no se ve ni la casa ni la barra. En un visor, una excepción en el arranque
   es una pantalla en negro: **todo lo que se ejecuta al cargar va en
   `try/catch`**.
6. **El `#cargando` del visor es también el avisador de errores.** Si la carga
   lo tapa, el aviso tiene que replicarse en otro sitio (o devolverse a él).

---

## 6. El banco propio: `/tmp/opencode/banco-R.js`

No se toca el banco del coordinator (lo usan otros agentes). Este copia su
esqueleto y le añade:

- un **DOM de mentira que parsea `innerHTML`** (con `className` → `classList`,
  `firstChild`, `textContent` que concatena, selectores de etiqueta) — sin
  esto el hub y el plano se quedaban a ciegas;
- `C0` y `GRUPOS_V` en `AD.api`, con dos grupos de versión y una puerta en
  cada uno;
- **36 comprobaciones**: los 8 módulos montan sin excepciones, la barra pinta
  5 botones, cada botón llama al método de su módulo, el `aria-pressed` sigue
  al estado real, el hub filtra por versión (piezas y puertas), la lista se
  rehace al cambiar de versión, la carga no bloquea y el aviso de error sigue
  viéndose en el `#cargando`.

```
node /tmp/opencode/banco-R.js "/sdcard/Documents/Build house/repo"
→ comprobaciones OK: 36 · fallos: 0
```

Es de lectura y no toca el repo: sirve de red de seguridad para lo que se toque
después (el que siga con el hub o con la barra no tiene que reconstruir el
caso).
