# Ars Domus — Fabrick

Visor 3D de una casa en primera persona, con **recorrido cinematográfico**, **plano
desde arriba**, **cámaras con ángulo profesional**, **hub de control** (puertas,
cajones, nevera y luces), **cocina con herrajes reales**, **música sintetizada** y
**carga de videogame**.

Es un fork de trabajo de [ars-magna-lab/ars-domus](https://github.com/ars-magna-lab/ars-domus)
(**MIT**). La historia original queda intacta en la rama `upstream-main` de este
repositorio y en el remoto `origin`; aquí se desarrolla la versión Fabrick.

> Este repositorio es **independiente** del de Soluciones Fabrick: no comparte
> código, despliegue ni dominio con `solucionfabrick2.5`.

## Arrancar

```bash
sh "/sdcard/Documents/Build house/arrancar.sh"     # servidor local en :5173
```

O, para una versión estática (sin servidor), para GitHub Pages o cualquier
hosting de ficheros:

```bash
cd repo
node herramientas/build.mjs          # genera dist/
CASA=ruta node herramientas/build.mjs   # otra casa: su casa.js y sus texturas/
```

El build es **Node puro**: no necesita Vite ni symlinks (la SD no los admite).
Comprobación rápida de sintaxis: `CASA=demo npm run check`.

## Qué hay de nuevo frente al visor original

| Antes | Ahora |
|---|---|
| Solo la maqueta y el paseo | **Plano 2D** (SVG) y **plano 3D elevado** con corte de planta, retícula, medidas y códigos `M-xx`/`F-xx`/`P-xx` |
| Un recorrido por los caminos de la finca | **Modo cine**: tomas con ángulo profesional, cortes, rótulos, letterbox 2.35:1 y recorrido automático **interior** |
| Puertas que se abren con la tecla E | **Hub de control**: puertas por estancia, cajones y nevera que se abren, luces por grupo, escenas y ambiente |
| Muebles de块的 básicos | **Cocina con herrajes**: frentes con holgura de 1 mm, tiradores de barra, **bisagras de basculante** y guías visibles; mobiliario con colchón, cojines y patas |
| Sin sonido | **Música y ambiente sintetizados** con WebAudio (sin descargar un solo archivo) |
| «Levantando la maqueta…» | **Carga de videogame**: progreso real, tips y puerta de entrada |
| Muros de color neutro | **Muros interiores verde limón** (el verde va al muro, nunca al piso), **forro exterior en pintura azul oscuro** y **luz diurna recalibrada** |
| Al tocar un muro sale un «x · z · altura» | Ya no: la ficha dice **qué** es y **dónde** está, sin coordenadas |

Todo se controla desde la **barra de Fabrick** (arriba a la derecha en escritorio,
abajo en móvil): Plano · Cine · CCTV · Control · Color · Sonido.

### La luz, en cuatro capas

1. **Sol** — direccional, con sombra marcada (radio 0,01: borde duro).
2. **Sol interior** — una segunda direccional sin sombra, en la misma dirección,
   para que las estancias que dan al patio no queden negras.
3. **Luz globo** — esferas con `PointLight` de alcance corto: una bombilla no
   ilumina la casa entera. Las de dentro cuelgan de las luminarias que ya dibuja
   el visor; las de fuera, en los farolillos del camino.
4. **Luz volumétrica** — conos aditivos desde cada ventana hacia el sol, con
   degradado. La **densidad es 0,005**: se insinúa. `AD.luz.ponDensidad(0.03)`
   la convierte en humo.

### Cámaras CCTV

Un muro de cámaras, pero de cine: letterbox, REC, reloj y **cambio de toma** con
◀ ▶, en automático cada 8 s, o eligiendo en la lista. Las cámaras **se sacan de
los datos**: una por estancia (en la esquina, a 2,60 m, mirando al centro) y
cuatro de exterior. CCTV y modo cine son excluyentes.

## Arquitectura: datos primero, 3D que solo dibuja

```
casa.js            el dato: muros, huecos, estancias, muebles, luces  (GENERADO)
visor.js           el motor: construye la casa, la cámara, las luces     (5.2k líneas)
index.html         el HUD y el CSS
modulo/            las funciones nuevas, en módulos sueltos
  paleta.js        muros verde limón + luz diurna
  cocina.js        cocina con herrajes + cajones que se abren
  plano.js         plano 2D + plano 3D elevado + capa de códigos
  camaras.js       modo cine: tomas, recorrido, letterbox
  hub.js           hub de control
  audio.js         música y ambiente (WebAudio)
  carga.js         pantalla de carga
  luz.js           sol interior, luz globo y luz volumétrica (densidad 0,005)
  cctv.js          cámaras de vigilancia con cambio de toma
  fabrick.js       la barra que junta a todos
memoria/           la memoria de cada agente: qué encontró, qué decidió, qué falta
TAREAS.md          el tablero de tareas
```

### El contrato `AD`

`visor.js` publica un espacio de nombres global para que los módulos se enganchen
sin tocar el motor:

```js
AD.api     // escena, camara, renderer, capas, pie, PUERTAS, PUNTOS, C, INT, VERSION, …
AD.onFrame(fn)          // fn(dt) cada cuadro, dt en segundos
AD.piezas.registra(p)   // cajones, puertas de mueble, nevera, luces
AD.alListo(fn)          // avisa cuando el visor terminó de cargar
AD.boton({...})         // registra un botón en la barra de Fabrick
```

`AD.api.C` e `AD.api.INT` son **getters**: siempre devuelven la versión de casa
activa (`actual` / `mejorada`). Un módulo que guardara una copia se quedaría con
la planta equivocada al cambiar de versión.

### Reglas de la casa (heredadas del visor 390-1)

1. **Datos primero.** El plano sale de `casa.js`; nadie dibuja una planta aparte.
2. **Un archivo por módulo.** Para que varios agentes trabajen sin pisarse.
3. **Cero assets nuevos.** Texturas procedurales con canvas, música sintetizada.
4. **Móvil primero.** 44 px por botón, sin hover, sin overlays que tapen la escena.
5. **Memoria escrita antes de cerrar.** Cada módulo deja su `memoria/*.md`.

### Lecciones que ya costaron plata (y que están en la memoria)

- **Un plano sin corte es una maqueta desordenada.** Los muros a 2,80 m vistos en
  oblicuo tapan el ambiente de al lado. Con corte a 1,15 m + tapa de poché del
  espesor real, el plano se lee.
- **Con ACES, un material muy liso se quema.** Porcelanato `roughness ≥ 0,38`,
  entorno `≤ 0,5`, exposición ~0,8 de día.
- **El FOV se define en horizontal**, nunca en vertical, y se limita a 50–94°.
- **La cámara no puede estar dentro de un mueble**: ≥ 0,25 m al muro, ≥ 0,60 m al mueble.
- **Las texturas de «calle» no sirven de césped**: la mitad es hormigón.

## Créditos y licencia

- Código original: [ars-magna-lab/ars-domus](https://github.com/ars-magna-lab/ars-domus), MIT.
- Mejoras Fabrick: © Soluciones Fabrick.
- three.js r128 (MIT), texturas y tipografías según lo indicado en el repo original.
