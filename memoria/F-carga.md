# Memoria · F — Pantalla de carga de videogame

> El agente F entregó la memoria y el análisis, pero el entorno se reinició antes
> de que escribiera `modulo/carga.js`. El coordinator implementó el módulo con los
> hallazgos del agente, y esta memoria describe **el código que está en disco**.

## Lo que encontró el agente (y sigue siendo cierto)

- `index.html` tiene `<div id="cargando">` (z-index 40) y `visor.js` lo esconde
  **al final** de su IIFE. Como los módulos se cargan **después** de `visor.js`,
  ese `#cargando` ya está oculto cuando entra el módulo: por eso hace falta un
  **overlay propio**.
- **No se puede tocar `visor.js`**, pero sí se puede **parchear three.js**:
  `THREE.TextureLoader.prototype.load` es una función normal.
- El `#cargando` es también el **avisador de errores**: `window.onerror` escribe
  ahí. Si lo dejas hidden para siempre, los errores se pierden. Por eso este
  módulo **replica el aviso** en su propio overlay y además pone su propio
  `window.onerror`.
- `texturas/` no está en la raíz del repo (está en `demo/texturas/`): en
  desarrollo muchas texturas dan 404. Una imagen que falla **igual** acaba con
  `complete === true`, así que el progreso no se queda colgado.

## Qué entrega el módulo en disco

`modulo/carga.js` (10 KB). API: `AD.carga = {progreso(p), listo(), entra()}`.

- **Overlay propio** (`#fab-carga`, z-index 120) con wordmark "Ars Domus",
  subtítulo, pista de arquitectura que rota, barra de progreso y botón
  "Entrar en la casa".
- **Progreso real**: se parchea `THREE.TextureLoader.prototype.load` para contar
  las cargas; el contador sube cuando la textura entra. Si no hay texturas
  (o al principio), la barra avanza por tiempo hasta el 92 %.
- **Puerta de entrada**: a los 2,2 s de estar listo, la pantalla **entra sola**.
  El botón sirve para entrar antes y para quien quiera hacerlo a su ritmo.
- **Timeout de seguridad**: a los 12 s entra igual, aunque el progreso no haya
  llegado. El visor nunca se queda en negro.
- **Aviso de errores replicado** en el overlay (caja roja con el mensaje).
- Al entrar pide **pantalla completa** y **bloquea la orientación** en horizontal
  (con `catch` por si el navegador no lo soporta), y deja el botón
  "Activar sonido" porque ese toque es el **gesto** que el navegador exige.

## Decisiones

| Decisión | Por qué |
|---|---|
| Overlay propio en vez de reusar `#cargando` | `visor.js` lo oculta al final; si el módulo lo usara, su contenido desaparecería justo cuando tiene que verse. |
| Progreso **contado**, no inventado | Una barra de 100 % falsa enseña a no mirar la barra. |
| Entrada **automática** a los 2,2 s | Nadie espera un botón para ver una casa. |
| Timeout de **12 s** | Un fallo de carga no puede dejar la pantalla en negro. |
| `prefers-reduced-motion` respetado | Sin transiciones si el sistema las pide. |
| El botón de sonido se crea **al entrar** | El audio necesita un gesto: ese es el gesto. |

## Qué falta

1. **No se ha visto en el teléfono.** Falta comprobar que el overlay tapa bien, que
   la barra se mueve de verdad y que el botón "Entrar" es alcanzable con el pulgar.
2. Las texturas que fallan con 404 cuentan igual: si en desarrollo salen 404, la
   barra llega al 100 % por tiempo, no por texturas. En producción (`dist/`) sí
   están todas.
3. Falta un contador de **assets** (geometrías, no solo texturas) para que la
   barra signifique algo en una casa con muchas mallas.
