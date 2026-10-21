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
