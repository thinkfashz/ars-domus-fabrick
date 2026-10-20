# BRIEFS — agentes (se relanzan desde aquí)

Contexto común a todos:
- Repo: `/sdcard/Documents/Build house/repo` (rama `fabrick`). **No commits ni push**: solo archivos en disco.
- Vanilla JS plano (three.js r128), scripts `<script>` planos cargados **después** de `visor.js`, sin `import`, sin bundler.
- Contrato de integración y reglas: `TAREAS.md`. Skills obligatorias: `visor-casa-fabrick` y `arquitectura-fabrick` (+ `references/checklist-geometria.md`).
- `AD.api` lo define el coordinator en `visor.js`: `escena, camara, renderer, capas, pie, TOUR, TOURS, PUERTAS, PUNTOS, pick, VISTAS, C, INT, VERSION, entraPie, aplicaVista, eligeVista, mueve, visible, d2r, SUELO, GIRO, C0, LZ`.
  `AD.onFrame(fn)` (dt en s) · `AD.piezas.registra({id,etiqueta,tipo,grupo,abre,cierra,estado})`.
- Datos: `C.muros`=[u0,v0,u1,v1,espesor,ySuelo,yDintel,mat,id] · `C.huecos`=[u0,v0,u1,v1,tipo,lado,espesor,ySuelo,yDintel,mat,{id,hoja,bisagra,giro,giros}] · `INT.estancias`=[{id,nombre,codigo,caja:[u0,v0,u1,v1],cota,suelo,pared,techo,fuera}] · `INT.muebles`=[{id,tipo,uv:[u,v],giro,largo,ancho,alto,color,…}]. `u,v` son metros del plano; el mundo usa `aMundo(u,v)` con `C.origen` y `GIRO`.
- Cada agente escribe su módulo, su `memoria/<letra>-*.md` y actualiza su fila en `TAREAS.md`. Nada más.

---

## D — `modulo/cocina.js` (cocina, herrajes, mobiliario)

Rehace la cocina con lógica constructiva y **herrajes reales**, y mejora el mobiliario.
- Cocina: base 0,60 fondo × 0,90 alto con zócalo 0,10; encimera 0,04; fregadero 0,80; placa 0,60 con campana; **alacenas 0,35 fondo × 0,70 alto**, nunca tapando la ventana; refrigerador 0,70 × 2,00; isla con vuelo de encimera ≥ 0,30 y barra a 1,05.
- **Cajones con herrajes visibles**: frentes con holgura de 1 mm, guías, **tiradores de barra 0,16 m** y **bisagras de basculante (yunding) de 90°** en las puertas altas, todo en metal con `MeshPhongMaterial` (el visor usa Phong/Lambert, no PBR). Los cajones **se abren y se cierran con animación por `dt`** (arranque/frenado suave, no lineal).
- Registra cada pieza animable con `AD.piezas.registra(...)` (tipo `cajon` / `puerta` / `nevera`), con `abre()`, `cierra()` y `estado()` (0 cerrado, 1 abierto).
- Mobiliario: mejora camas (colchón + almohadas + nordicos), sofás (cojines y patas), armarios, mesas y sillas. Medidas reales, apoyo en el piso, nada flotando.
- Piso: la cocina **no** puede quedar con el mismo rodapié que el salón; la segunda versión (CASA_MEJORA) tiene isla de 2,40: el módulo debe servir para **ambas versiones** (`GRUPOS_V['actual']` y `['mejorada']`), sin duplicar mallas.
- Truco clave: las mallas de mueble ya llevan `userData.info` con `id` ('COC-01'), `nombre` y `datos`. Búscalas con `escena.traverse` para colgarte de los grupos existentes en vez de reconstruirlos a ciegas; si reconstruyes, quita la versión vieja.
- API: `AD.cocina = {aplicar(), repara(), piezas:[]}`.
- Memoria: `memoria/D-cocina.md`.

---

## C — `modulo/hub.js` (hub de control)

Panel de control: puertas, cajones, nevera, luces, por ambiente y global.
- Consume `AD.piezas.items` (que announce D) y `AD.api.PUERTAS` (puertas de la casa, con `mueve(p)` para abrir/cerrar) y `AD.api.PUNTOS` (puntos de luz, con `mat`/`halo`).
- Secciones: **Puertas** (todas / por estancia, abrir y cerrar), **Cajones y nevera** (por mueble, con el nombre real del mueble), **Luces** (por grupo/estancia + todo), **Escenas** (día, atardecer, noche) y **Ambiente** (exposición, rebote, niebla; ya existen en `visor.js`: busca `luz-exp`, `luz-rebote`, `luz-niebla`).
- UI propia en el DOM, **panel plegable** con al menos 44 px por botón, que en móvil ocupe como máximo el 60 % del alto y se pueda cerrar. No uses el `#panel` del visor.
- API: `AD.hub = {abrir(), cerrar(), alternar(), refresca()}`.
- Memoria: `memoria/C-hub.md`.

---

## E — `modulo/audio.js` (música y ambiente)

Música **sintetizada** con WebAudio (prohibido descargar assets).
- Pad ambiental (2-3 osciladores con detune), arpegio suave, y una reverberación corta con `ConvolverNode` e impulso **generado** (ruido con caída exponencial).
- Ambiente: viento (ruido filtrado), y un "golpeo" suave al cambiar de estancia. Todo con gain bajo: es una visita, no una discoteca.
- **El navegador bloquea el audio sin gesto**:必须有 un botón explícito "Activar sonido" (44 px) y arranque en silencio; el estado se guarda en `localStorage`.
- Cambiar el volumen no debe re-crear el grafo (usa un `GainNode` maestro).
- Debe seguir funcionando si `AD.api` no existe.
- API: `AD.audio = {activa(), silencia(), alterna(), volumen(v), suena()}`. Se engancha a `AD.onFrame` solo si hace falta.
- Memoria: `memoria/E-audio.md`.

---

## F — `modulo/carga.js` (pantalla de carga de videojuego)

Rehace `#cargando` (existe en `index.html` y lo oculta `visor.js` al final).
- Wordmark "ARS DOMUS / FABRICK", barra de **progreso real** (cuenta de texturas cargadas con `THREE.DefaultLoadingManager` o el `onProgress` del `TextureLoader`), tips de arquitectura que rotan, y una **puerta de entrada**: "TOCÁ PARA ENTRAR" (necesaria también para el audio y para el fullscreen en móvil). Fundido elegante a la escena.
- Debe respetar `prefers-reduced-motion` y no bloquear la app si algo falla (timeout de seguridad: si pasan 12 s sin llegar al 100 %, entra igual).
- API: `AD.carga = {progreso(p), listo(), entrar()}`; engancha con `DOMContentLoaded`/`load`.
- Memoria: `memoria/F-carga.md`.

---

## G — `modulo/paleta.js` + `demo/herramientas/casa.py` (verde limón y luz)

- Muros interiores **verde limón** (`#c8db8a` y familia), con variación por ambiente; **el verde va al muro, nunca al piso**. Tonos: salón, recibidor y pasillo más saturados; dormitorios más suaves; baño en azulejo (no se pinta).
- El color de pared vive en el **dato** (`INT.estancias[].pared`), generado por `demo/herramientas/casa.py`: edita el generador y **regenera** `demo/casa.js` (`CASA=demo npm run check` y el propio generador). Verifica cómo se regenera: mira la cabecera de `demo/herramientas/casa.py` y `demo/herramientas/mejora.py` (el archivo dice "GENERADO por demo/herramientas/casa.py: no se edita a mano").
- Recalibra la luz diurna: exposición, sol, hemisférica y rebote, para que el interior no se queme ni se ensucie. Regla: con ACES, un material muy liso se quema (roughness ≥ 0,38, env ≤ 0,5, exposición ~0,78-0,85 de día).
- Añade un **interruptor de paleta** (limón / neutro) para poder comparar, y deja el modo noche coherente.
- Además, en runtime, aplica el verde a los muros ya construidos (los muros interiores se pintan con `INT.estancias[].pared`; busca `construyeEstancias` y `MAT`).
- API: `AD.paleta = {aplica(tema), temas:['limon','neutro'], tema()}`.
- Memoria: `memoria/G-paleta.md`.

---

## Notas del coordinator (2026-10-20, cierre)

- **El build borra `dist/` entero**, y con él el vínculo de Vercel (`.vercel/`).
  Sin vínculo, `vercel deploy` crea un proyecto nuevo con el nombre de la carpeta
  (salió uno llamado `dist`). `herramientas/build.mjs` ahora **guarda y restaura**
  el vínculo. Si vuelve a pasar, `vercel api /v9/projects/<x> --method DELETE
  --dangerously-skip-permissions` borra el proyecto espurio.
- **Vercel Auth**: un proyecto nuevo del equipo nace con `ssoProtection:
  all_except_custom_domains`, o sea, **protegido**. Para publicarlo:
  `vercel api /v9/projects/<proyecto> --method PATCH --input <archivo.json>` con
  `{"ssoProtection":{"deploymentType":"preview"}}`.
- **El token de git de este entorno no tiene scope `workflow`**: no se puede subir
  un archivo de `.github/workflows/`. Por eso el flujo de GitHub Pages queda
  pendiente de un token con ese scope, y la URL pública seArma con Vercel.
- Los agentes seirds parenting: el entorno (Android en PRoot) reinició el servidor
  **diez veces** en la sesión. Los que dejaron su módulo escrito a destiempo
  (D y F) lo hicieron con la versión final; el resto se reescribió a mano.
  **Regla para la próxima**: los briefings van a `memoria/BRIEFS.md` en disco, no
  solo en el prompt, y los agentes deben escribir el archivo pronto.
