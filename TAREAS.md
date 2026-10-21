# TAREAS — ars-domus-fabrick

Fork de trabajo sobre [ars-magna-lab/ars-domus](https://github.com/ars-magna-lab/ars-domus) (MIT).
Meta: llevar el visor a un nivel **de videogameo arquitectónico**: recorrido 3D inmersivo,
plano desde arriba, cámaras cinematográficas, hub de control, cocina con herrajes reales,
música, carga estilo videojuego y muros interiores verde limón.

Repo remoto: <https://github.com/thinkfashz/ars-domus-fabrick> (rama `main`).
Rama local de trabajo: `fabrick`. La historia original queda en `upstream-main` y en `origin`.

## Reglas de la casa (las que no se negocian)

1. **Datos primero.** El plano, las medidas, los ambientes y los muebles salen de
   `casa.js` (`C.muros`, `C.huecos`, `INT.estancias`, `INT.muebles`, `INT.luces`).
   El 3D solo dibuja. Nadie inventa una planta aparte: se desincroniza.
2. **Cero assets nuevos.** No se descargan texturas ni sounds. Texturas
   procedurales con canvas, música sintetizada con WebAudio.
3. **Un archivo por agente.** Cada agente es dueño de **un** archivo de `modulo/`
   y de **un** archivo de `memoria/`. Nadie toca `visor.js`, `index.html`,
   `demo/casa.js` ni el archivo de otro agente: eso lo integra el coordinator.
4. **Móvil primero.** Se prueba con el pulgar, en vertical, con una mano.
   Objetivo táctil mínimo 44 px. Nada de hover.
5. **Memoria escrita antes de cerrar.** Cada agente deja en `memoria/` lo que
   descubrió, qué decidió y qué le falta. Sin memoria no hay entrega.
6. **Documentar el error antes de corregirlo** (síntoma, causa, fix, cómo evitarlo).
7. **Idioma**: comentarios, textos de UI y documentación en español técnico.

## Contrato de integración (lo define el coordinator)

Los módulos son scripts planos que se cargan **después** de `visor.js` y se
registran en el espacio global `AD`:

```js
AD.api = { escena, camara, renderer, capas, pie, TOUR, TOURS, PUERTAS, PUNTOS,
           pick, VISTAS, C, INT, VERSION, entraPie, aplicaVista, eligeVista,
           mueve, visible, d2r, SUELO, GIRO, C0, LZ, capas };
AD.hooks = [];                 // funciones (dt) que se llaman cada cuadro
AD.onFrame = function(fn){ AD.hooks.push(fn); };
AD.piezas = { items: [], registra: function(p){ AD.piezas.items.push(p); } };
```

Cada módulo **debe**:

- empezar con `var AD = window.AD || (window.AD = {});`
- registrarse en `AD.<nombre>` con su API pública (abrir, cerrar, alternar…);
- enganchar su animación con `AD.onFrame(function(dt){...})`;
- **no romper** si `AD.api` todavía no existe (se carga antes que `visor.js`).
- No tocar `visor.js` ni `index.html`: si necesita un contenedor en el HTML,
  lo crea él mismo dentro de `#escena` o de `document.body`.

Cada pieza animable (cajón, puerta de mueble, nevera, luz) se anuncia con:

```js
AD.piezas.registra({ id:'COC-01-cajon-1', etiqueta:'Cajón de la encimera',
  tipo:'cajon', grupo:'Cocina', abre:function(){}, cierra:function(){}, estado:function(){ return 0; } });
```

## Tablero

| # | Tarea | Dueño | Archivo | Estado | Entregable |
|---|---|---|---|---|---|
| A | Plano 2D + plano 3D elevado con corte de planta y capa de códigos | agente A | `modulo/plano.js` | ☑ | Panel con SVG del mismo contrato de datos y planta 3D con corte a 1,15 m, poché del espesor real, retícula, medidas, m², norte, escala y códigos M/F/P; órbita y pinza al tacto, y un toque entra en la estancia |
| B | Cámaras cinematográficas + recorrido automático interior | agente B | `modulo/camaras.js` | ☑ | Modo cine: 18 tomas por datos (general, lateral, detalle, contrapicado, cenital, travelling) validadas contra muros y muebles, cortes/fundidos, letterbox 2.35:1, rótulos, 4K y recorrido interior por los vanos con puertas que se abren solas |
| C | Hub de control (puertas, cajones, nevera, luces) | agente C | `modulo/hub.js` | ☑ | Panel propio (no usa `#panel`) con puertas por estancia y nombre real del hueco, cajones y nevera de `AD.piezas.items`, luces por grupo de `LZ.grupos` + todo, escenas día/atardecer/noche sobre `#slider-hora` y ambiente que solo **enlaza** los deslizadores del visor |
| D | Cocina con herrajes, bisagras de cajón y mobiliario mejorado | agente D | `modulo/cocina.js` | ☑ | Frentes con holgura de 1 mm, tiradores de barra de 16 cm, bisagras de basculante y guías; dos cajones y la puerta del fregadero se mueven, la nevera abre con luz dentro; colchones, cojines y patas en el mobiliario |
| E | Música y ambiente sonoro | agente E | `modulo/audio.js` | ☑ | Pista 100 % sintetizada con WebAudio (pad de 3 osciladores con detune y LFO, arpegio, reverb con `ConvolverNode` e impulso generado, viento filtrado, golpeo al cambiar de estancia), botón «Activar sonido» de 44 px, volumen en un `GainNode` maestro y estado en `localStorage` |
| F | Pantalla de carga estilo videojuego | agente F | `modulo/carga.js` | ☑ | Overlay propio con wordmark «ARS DOMUS / FABRICK», barra de progreso real (parche de `TextureLoader` + recuento de texturas en vuelo), tips de arquitectura que rotan, puerta «TOCÁ PARA ENTRAR» que desbloquea el audio y pide pantalla completa, fundido y timeout de seguridad de 12 s |
| G | Muros interiores verde limón + recalibrado de luz diurna | agente G | `modulo/paleta.js` + `demo/herramientas/casa.py` | ☑ | Verde limón por ambiente en el dato (casa.py regenerado) y en runtime; interruptor limón/neutro con material clonado; luz recalibrada (exposición 0,84 · sol 1,33 · hemi 0,56 · relleno 0,14) escalando lo que escribe el visor |
| — | Integración: `visor.js`, `index.html`, build, deploy, README | coordinator | `visor.js`, `index.html` | ☐ | Todo junto, publicado en GitHub Pages |

## Segunda vuelta (2026-10-20, tarde) — lo que pidió el usuario

| Pedido | Dónde | Estado |
|---|---|---|
| Recorrido completo | `modulo/camaras.js` | ☑ Ruta por los vanos: 100,1 m, 46 puntos, 12 paradas, todas las estancias |
| Cámaras CCTV cinematográfico | `modulo/cctv.js` | ☑ Una por estancia + cuatro de exterior, con cambio de toma, auto y lista |
| Modo cine con cambio de cámara | `modulo/camaras.js` | ☑ Arreglado `marcaCine()` (no existía) y las alturas con la cota del suelo |
| Sacar las coordenadas al tocar un muro | `visor.js` | ☑ La ficha dice qué es y dónde; sin chincheta ni «x · z · altura» |
| Forro exterior azul oscuro | `visor.js` | ☑ `MAT.azul` + `matMuro()`; la piedra se queda para portal, pilares y chimenea |
| Sombras radio 0,01 | `visor.js` | ☑ `sol.shadow.radius = 0.01` (borde duro) |
| Luz globo dentro y fuera | `modulo/luz.js` | ☑ Esferas con `PointLight` de alcance corto |
| Sol a las luces interiores | `modulo/luz.js` | ☑ Segunda direccional sin sombra, en la misma dirección |
| Luz volumétrica, densidad 0,005 | `modulo/luz.js` | ☑ Conos aditivos desde cada ventana; `ponDensidad()` la ajusta |

Bugs de fondo que salieron al pulir (ver `memoria/errores.md` y las memorias):

- `LUC` se usaba antes de declararse → **tumbaba el visor entero** (bug del upstream).
- `AD.alListo` era un array y la mitad de los módulos lo llamaba como función.
- `marcaCine()` no existía → el modo cine no arrancaba.
- Las alturas de las tomas no sumaban la cota del suelo (12 cm bajas).
- `distMuro` medía contra la recta: la cámara se metía en un tabique y el
  recorrido pasaba por una ventana.
- La barra llamaba `alterna()` y los módulos exponen `alternar()`: no hacía nada.
- El hub nombraba todas las puertas igual (la clave era un objeto).
- `salirTour` no estaba en el contrato: el tour no se paraba al abrir la planta.

## Tercera vuelta (2026-10-21) — Build House

| Pedido | Dónde | Estado |
|---|---|---|
| Renombrar a **Build House** | `visor.js`, `index.html`, `manifest.webmanifest` | ☑ El producto se llama Build House; la casa conserva su nombre en el subtítulo |
| Logo y carga de videogame | `modulo/carga.js`, `icono.svg` | ☑ Logo propio (corte de planta), retícula de fondo, cartel «Nivel 01», barra por segmentos, botón con pulso |
| Recorrido a **altura de persona** | `modulo/recorrido.js` | ☑ 1,62 m sobre el suelo terminado (verificado 1,990 m), FOV 72° horizontal |
| Recorrido por **todas las estancias** | `modulo/recorrido.js` | ☑ Por el grafo de vanos, puertas cruzadas de perfil, 0 muestras dentro de un muro |
| Cámaras **cinematográficas** y de **realidad** | `modulo/cctv.js` | ☑ 32 de cine (1,62 m, lente corta) y 25 de realidad (domo alto, FOV amplio) |
| Cámaras por la casa **y el terreno** | `modulo/cctv.js` | ☑ Cada una nacida de un dato: puerta, portón, camino, explanada, pérgola, piscina, huerto, caseta |
| **Iluminación exterior** diseñada | `modulo/exterior.js` | ☑ Farolillos, weir, pérgola, caseta y portalón con intensidades de proyecto; huerto y era sin luz |
| **Luz volumétrica** para el motor | `modulo/exterior.js` + `modulo/luz.js` | ☑ Densidad por hora (0,004 / 0,007 / 0,010) y nunca se toca la exposición |

Bugs de fondo que aparecieron en esta vuelta:

- **`shadow.radius` no hacía nada**: el visor usaba `PCFSoftShadowMap`, donde el radio
  se ignora. El «radio 0,01» era una promesa falsa: ahora es `PCFShadowMap` y el radio
  **sí** manda.
- **`C0.exterior` no existe**: el bloque exterior vive en `window.CASA.exterior`.
- Las luces de fuera y las de globo **bajan en móvil** (4 y 3): con el reparto del
  visor y las de relleno por estancia se llegaban a treinta puntuales.

## Estado de la entrega (2026-10-20)

El entorno (Android en PRoot) se reinició **diez veces** durante el trabajo y se
llevó por delante a cinco agentes a mitad. Lo que quedó:

- **Agentes que entregaron módulo y memoria**: B (cámaras), C (hub), G (paleta).
- **Agentes que entregaron el módulo y la memoria la escribió el coordinator**: A (plano).
- **Módulos que implementó el coordinator** porque el agente murió antes
  (la memoria de cada uno está en `memoria/`): D (cocina), E (audio), F (carga).
- **Coordinator**: `visor.js` (contrato `AD`), `index.html` (barra de Fabrick),
  `herramientas/build.mjs`, `sw.js`, `modulo/fabrick.js` (la barra), README y tablero.

**Reglas de construcción heredadas del visor 390-1 (lecciones caras)

- **Plano = corte.** Una vista de planta sin corte de muros a ~1,15 m se lee como
  una maqueta desordenada: cada tabique tapa el ambiente de al lado. Con corte +
  poché del espesor real, el plano se lee.
- **Un solo material de planta neutro.** El color de la casa se queda para el 3D.
- **La capa de códigos va en una textura de canvas** sobre un plano horizontal:
  en un teléfono, 100 sprites o etiquetas DOM matan el frame rate.
- **FOV en horizontal, no en vertical.** `2·atan(tan(h/2)/aspect)`, límites 50–94°.
- **La cámara no puede estar dentro de un mueble**: ≥ 0,25 m al muro, ≥ 0,60 m al mueble.
- **Con ACES, un material muy liso se quema**: porcelain roughness 0,38, env 0,48,
  exposición 0,78 de día.
- **Las texturas de «calle» no sirven de césped**: la mitad es hormigón.
- **El verde va al muro, nunca al piso.** El contraste muro/piso es lo que hace
  leer la arquitectura.
- **Puertas y cajones se animan con `dt`, no con CSS**, y con arranque/frenado suave.

## Entrega de cada agente

1. Código en su archivo, sin tocar los de otros.
2. `memoria/<letra>-<tema>.md`: qué encontré, qué decidí, contrato que consume,
   trampas y qué falta.
3. Actualizar su fila del tablero en `TAREAS.md` (estado + una línea de entrega).
4. Comprobación: `node --check modulo/<archivo>.js` y, si toca datos,
   `CASA=demo npm run check`.
