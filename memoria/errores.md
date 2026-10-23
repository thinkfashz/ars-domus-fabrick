# Errores — visor Fabrick (ars-domus-fabrick)

Cada error: **síntoma**, **causa raíz**, **fix** y **cómo evitarlo**.
Regla de la casa: un error repetido es un fallo del proceso, no del código.

---

## 001 — El visor no arrancaba: `LUC` se usaba antes de declararse (2026-10-20)

**Síntoma**: la página abría, pero se quedaba en negro. En el móvil aparecía la
pantalla de carga con el aviso rojo:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'sombras') — visor.js:3526
```

No se veía la casa, no aparecía la barra de acciones y el único mensaje era el
error. La escena 3D no se renderizaba nunca.

**Causa raíz**: el bloque de preferencias de luz estaba **más abajo** del que lo
usaba. En el panel de la UI, la línea 3557 (antes 3526) hacía:

```js
checkbox('opt-sombras','Proyectar sombras', LUC.sombras, null, function(e){ … });
```

pero `var LUC = {…}` estaba **124 líneas más abajo** (3624 → ahora 3506). Con
`var`, la declaración se sube pero **la asignación no**: al llegar a la línea del
panel, `LUC` era `undefined`, y `LUC.sombras` reventaba. Como el error estaba en
el **cuerpo del IIFE del visor**, moría todo lo que venía después: la cámara, el
bucle de render, la publicación de `AD.api` y la barra de Fabrick.

Era un bug **del upstream** (`ars-magna-lab/ars-domus`), no de este trabajo: el
bloque de luz se había añadido al panel y se había dejado al final del archivo.

**Fix**: mover el bloque entero (`SOLB`, `PRELUC`, `LUC`, `leeLuz`, `guardaLuz`,
`aplicaLuz`) **antes** de su primer uso, a la sección de la UI. Ninguna lógica
cambió: solo el orden. Se comprobó que el bloque, en su nueva posición, solo
depende de cosas ya definidas (`renderer`, `sol`, `hemi`, `relleno`, `escena`),
y que su punto de llamada (`aplicaLuz()`) sigue después.

**Cómo evitarlo**:
- En JS, `var` sube la **declaración**, no el **valor**. Un bloque de
  configuración tiene que ir **antes** de la UI que lo lee.
- Revisión estática: buscar usos de identificadores en MAYÚSCULAS antes de su
  `var`. Se escribió un chequeo (ver más abajo) que ahora da limpio.
- Si un error de runtime aparece en la línea N y todo lo posterior deja de
  funcionar, sospechá de una excepción **no capturada en el cuerpo principal**:
  mata la mitad de la app sin que se note.

---

## 002 — `AD.alListo` era un array y los módulos lo llamaban como función (2026-10-20)

**Síntoma**: la pantalla de carga mostraba

```
Uncaught TypeError: AD.alListo is not a function — carga.js:323
```

y el botón de la barra de acciones no aparecía nunca.

**Causa raíz**: el core publicaba el aviso de "ya estoy listo" así:

```js
AD.alListo = AD.alListo || [];                                   // un array
AD.avisaListo = function(fn){ if(AD.listo) fn(); else AD.alListo.push(fn); };
```

La mitad de los módulos lo usaban como **función** (`AD.alListo(fn)`, el nombre
que decía en el brief) y la otra mitad con `AD.avisaListo(fn)`. Los que usaban
la forma de función morían al cargarse, y como el core publicaba `AD.listo` al
final, los que se quedaron esperando nunca recibían el aviso.

**Fix**: `AD.alListo` es ahora **una función** que registra el callback (en
`AD.pendientes` si el visor todavía no está listo), y `AD.avisaListo` es su
alias. Las dos formas sirven.

**Cómo evitarlo**:
- Un contrato compartido se **escribe una vez y se nombra en un solo sitio**.
  Un mismo nombre con dossignaturas (array y función) es una bomba de relojería.
- El bench de Node (`/tmp/opencode/banco.js`) carga los ocho módulos y lo
  detecta: ahora da **0 fallos**. Sin ese banco, el bug se habría vuelto a descubrir en el teléfono en el teléfono.

---

## 003 — La pantalla de carga tapaba una casa que ya estaba lista (2026-10-20)

**Síntoma**: hasta 12 s de pantalla de carga antes de entrar, y un botón
"Activar sonido" suelto abajo a la derecha **encima de la barra de Fabrick**
(que en móvil vive justo ahí).

**Causa raíz**: la pantalla se mostraba siempre y esperaba su propio temporizador,
en vez de reaccionar al estado real. Y el audio creaba su propio botón flotante
sin saber que la barra ya tenía un botón de sonido.

**Fix**:
- La pantalla **nace oculta** y solo se revela si a los 800 ms la casa no está
  lista. Si las texturas ya están, entra de inmediato: una pantalla de carga
  sobre una escena lista es una espera tonta.
- El botón de sonido **lo pone la barra de Fabrick** (que ya lo tenía). El toque
  de entrada en la casa es el gesto que desbloquea el audio, si el usuario lo
  había dejado activado (`AD.audio.quiereSonido()`).

**Cómo evitarlo**:
- Un overlay de carga tiene dos estados: **todavía no se necesita** y **está
  esperando**. Mostrarlo siempre es la forma de perder al usuario.
- Un botón flotante en una esquina, en móvil, choca con cualquier barra. **Un solo
  lugar decide los botones**: la barra.

---

## El chequeo que faltaba

`/tmp/opencode/banco.js` carga la casa real (`demo/casa.js`), monta los ocho
módulos en Node con un DOM y un `THREE` de mentira, ejecuta un cuadro de
animación y mide:

- módulos que cargan sin excepción;
- APIs públicas expuestas;
- hooks de animación registrados;
- piezas de cocina registradas y con `userData.info` (el panel sigue vivo);
- mallas y luces en escena.

Se ejecuta **antes** de cada entrega:

```bash
node /tmp/opencode/banco.js "/sdcard/Documents/Build house/repo"
CASA=demo npm run check
node herramientas/build.mjs
```

El navegador headless con WebGL por software **tumba el renderizador en este
teléfono** (`GPU state invalid after WaitForGetOffsetInRange`): no sirve para
verificar. El banco en Node sí.


---

## 004 — La barra se quedaba vacía si el core no llegaba al final (2026-10-21)

**Síntoma**: en el teléfono, el botón de «Cine» no aparecía (y el de «Recorrido»
tampoco), y el usuario decía que "el modo cine no carga".

**Causa raíz**: la barra se pintaba **solo** dentro del aviso de "el visor está
listo" (`AD.alListo`), que el core lanza **al final** de su IIFE. Si algo falla
antes — un contexto WebGL que no se puede crear, por ejemplo — el aviso nunca
llega, la barra nunca se pinta y solo quedan los botones que registrando sus
propios módulos al cargarse. La app parecía no tener botones.

**Fix**: la barra se pinta **en el acto**, con los módulos que ya estén
cargados, y otra vez cuando el core avisa. Además, la barra registra ella misma
los nueve módulos conocidos (Plano, Cine, Control, Color, Sonido, CCTV,
Recorrido, Exterior, Luz): si un módulo falta, no hay botón, pero si el core
se cae, los botones siguen ahí.

**Cómo evitarlo**: una interfaz no puede depender de que el motor termine bien.
La barra es del usuario: se pinta siempre, y cada botón comprueba su módulo al
pulsarse.

---

## 005 — Un service worker viejo servía un visor.js que ya no existía (2026-10-21)

**Síntoma**: en el teléfono, la pestaña decía «Maqueta de El Olivar» (el título
antiguo) y salía `Uncaught ReferenceError: varJedida is not defined — visor.js:4706`.
Ese `varJedida` **no estaba en ningún commit, ni en el upstream, ni en el
servido**: salía de un `visor.js` cacheado de un build que ya no existía.

**Causa raíz**: el service worker servía **cache primero**. Aunque la página
nueva se descargara, el SW entregaba el `index.html` y el `visor.js` cacheados.
Un service worker es una caché con permisos: si guarda lo equivocado, **esconde
el arreglo** hasta que se limpia a mano.

**Fix**, tres capas:

1. **La versión va en la URL de cada script** (`visor.js?v=v6`): ninguna caché
   coincide con esa URL, así que todo sale de la red. La inyecta el build desde
   `herramientas/VERSION`.
2. **El service worker pasa el esqueleto a red primero** (index, visor, casa,
   módulos, three.js) y solo cae a la caché si no hay red. Las texturas siguen
   en caché primero, porque no cambian.
3. **La versión se ve en el panel**: si el teléfono va viejo, se ve de un
   vistazo, sin adivinar.

**Cómo evitarlo**: cachear el esqueleto de una app es una decisión con
consecuencias: si el usuario no sabe limpiar la caché, la app queda clavada en
un error que ya no existe en el código. O red primero, o versión en la URL.

**Y una más**: para el usuario Affected, la solución fue además **un origen
nuevo** (`build-house-fabrick.vercel.app`): otro host es otro registro de
service workers, así que la caché venenosa no aplica.


---

## 006 — Un botón que falla en silencio es un botón roto (2026-10-22)

**Síntoma**: «el modo cine no agarra», «el tour tampoco», pero la app se ve y la barra
está. Sin mensaje. En el escritorio no había nada, porque el `catch` del botón solo
hacía `console.warn`.

**Causa raíz**: la interfaz no distinguía entre *no se pudo abrir* y *no pasó nada*.
`abre()` del cine devolvía `false` en tres sitios y nadie lo contaba; el handler lo
ignoraba. Lo mismo con `entraTour()` cuando la casa no trae caminos.

**Fix**:

1. `AD.avisa(texto)` pinta el motivo en pantalla (módulo `diagnostico.js`), y el
   `catch` de la barra lo usa.
2. `abre()` del cine devuelve un **motivo** (`noVa(t)`) y `alterna()` lo enseña.
3. `entraTour()` avisa si no hay caminos y manda a «Recorrido».
4. `modulo/diagnostico.js` captura `error` y `unhandledrejection` **desde el primer
   byte** (se carga antes de three.js) y deja un chip arriba a la derecha con la
   versión, el número de fallos y el parte completo (WebGL, API, módulos, error con
   archivo:línea, botón de copiar).

**Cómo evitarlo**: todo handler de usuario que pueda fallar tiene que poder decirlo.
Un `console.warn` en el teléfono no existe.

---

## 007 — La isla de la cocina tapaba el paso del salón (2026-10-22)

**Síntoma**: la cocina se veía apretada y el paso desde el salón quedaba incómodo.

**Causa raíz**: en `CASA_MEJORA`, la isla `COC-M01` estaba girada `-90` con el
voladizo hacia el oeste (`+z` local = `-u`). Eso ponía las banquetas en `u=8,35`,
contra la pared, y dejaba solo 0,15 m de paso al hueco `H-19` del salón. Además las
banquetas quedaban a 0,35 m del borde de la isla: no se podía ni salir.

**Fix** (medidas de uso, sin piezas nuevas):

| Pieza | Antes | Ahora | Por qué |
|---|---|---|---|
| Isla `COC-M01` | `[9.2,2.4]` giro `-90` | `[10.0,2.3]` giro `0` | deja 0,8 m al salón y 0,95 m a la encimera |
| Banquetas | `u=8,35` v=1.6/2.2/2.8 | `v=3.5`, u=9.4/10.0/10.6 | 0,7 m al voladizo, 0,55 m a la pared sur |
| Nevera `COC-02` | `[12.05,2.6]` | `[12.05,1.3]` | cierra el triángulo contra el final de la encimera |

**Lo que NO se hizo**: añadir horno, microondas o campana. **No están en el dato** y
el contrato es datos primero. Queda anotado como pendiente para cuando el dato los
traiga.

**Cómo evitarlo**: una isla con voladizo necesita 0,45–0,60 m para la banqueta y
0,90 m de paso libre por el lado de trabajo. Se comprueba con las cotas de la
estancia, no a ojo.
