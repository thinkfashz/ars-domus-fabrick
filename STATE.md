# STATE — Build House (visor 3D)

Última actualización: 2026-10-22 · versión **v7**

## Producción

| Alias | Estado |
|---|---|
| `https://build-house-fabrick.vercel.app` | v7, 16 scripts, `diagnostico.js` 200 |
| `https://casa-build-house.vercel.app` | v7, igual |
| `https://ars-domus-fabrick.vercel.app` | v7 (dominio del proyecto, se actualiza solo) |

Los alias **no** se mueven solos: después de cada `vercel deploy --prod` hay que
`vercel alias set <deployment> <alias>.vercel.app`, si no siguen sirviendo la
versión anterior. Es lo que pasó con v7 (los alias servían v6 y `diagnostico.js`
daba 404).

Deployment de referencia: `ars-domus-fabrick-kbv66sks6-think-fastzs-projects.vercel.app`

## Hecho en v7

- `modulo/diagnostico.js` — se carga **antes** de three.js; captura `error` y
  `unhandledrejection`; chip arriba a la derecha con versión y nº de fallos;
  panel con WebGL/API/módulos/error y botón copiar. `AD.avisa`, `AD.anota`,
  `AD.parte`, `AD.recargaDura`.
- Controles que hablan: el `catch` de la barra avisa en pantalla; el cine
  devuelve motivo (`noVa(t)`); el tour avisa si no hay caminos.
- `modulo/cctv.js` — movimiento real: domos ±17°, cine ±2,6°, zoom lento,
  botón «Mover», focal en mm, contador de Reality.
- `modulo/recorrido.js` — recorrido interior a 1,62 m, registrado como camino
  del tour.
- Cocina (`CASA_MEJORA` en `demo/casa.js`): isla de cara al salón, banquetas al
  sur, nevera al final de la encimera. Sin piezas inventadas.

## Verificación antes de entregar

```sh
node herramientas/banco.js     # 13 módulos, 7 modos, 0 fallos
node herramientas/build.mjs    # genera dist/ con ?v=<VERSION>
```

El build y el deploy se interrumpen si se reinicia el servidor de OpenCode:
lanzarlos desacoplados (`setsid nohup … &`) y leer el log.

## Pendientes

1. La puerta se queda abierta al terminar el recorrido.
2. La planta 3D no se puede desplazar.
3. El botón «Alta/4K» casi no aporta en móvil.
4. Falta control de volumen visible.
5. Horno, microondas y campana no existen en el dato: no se dibujan.
6. Nada se ha visto en píxeles (headless + WebGL por software tumba el
   renderizador en este teléfono). La verificación es por datos/banco/HTTP.

## Bitácora

`memoria/errores.md` — 001 a 007.
