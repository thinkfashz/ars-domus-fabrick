# C — Exterior: iluminación de la finca + luz volumétrica

Módulo: `modulo/exterior.js` (nuevo, solo mío).
Estado: `node herramientas/banco.js` → **0 fallos** · `CASA=demo npm run check` OK ·
`node herramientas/build.mjs` OK · `node --check modulo/exterior.js` OK.

---

## 1. Lo que encontré (el terreno de juego)

### El dato exterior NO está en `AD.api.C0.exterior`
El brief dice que el exterior está en `C0.exterior`. **No es así en este repo**:

- `visor.js:30` → `var F = window.CASA || window.FINCA, C = F.casa, X = F.exterior;`
- `visor.js:49` → `C0 = C` → **`AD.api.C0` es `CASA.casa`, que NO tiene clave `exterior`**.
- El exterior real está en `CASA.exterior` (la raíz) y el visor lo llama `X`.

Solución en `datos()`: se busca primero `AD.api.C0.exterior`, y si no está, se cae a
`window.CASA.exterior` / `window.FINCA.exterior`. Así funciona con la demo y con
cualquier casa que meta el exterior donde indique el brief.

### Las coordenadas del exterior son del MUNDO, no del plano
`farolas[].mundo`, `piscina.centro`, `construcciones[].centro`, `caminos[].eje` y
`porton.a/b` ya están en metros de mundo (la casa va de `C0.origen` = [-10,-8]).
`AD.api.aMundo(u,v)` solo hace falta para lo que venga en `uv`.

### Cotas del suelo (para que el charco de luz caiga en el suelo, no flotando)
- Explanada / casa: `AD.api.SUELO` = 0,25.
- Caminos: `SUELO + 0,03 + i*0,004` (el índice `i` es el orden en `X.caminos`).
- Plataforma de la piscina: `SUELO + piscina.plataforma.alto` = 0,55.
- Plataforma de las construcciones: `SUELO + construccion.cota` (pérgola 0,3 → 0,55; caseta sin cota → 0,25).
- Terreno llano: 0.

`modulo/exterior.js` calcula la cota con `sueloEn(x,z,datos)`: primero la
plataforma de la piscina (si el punto cae dentro del polígono `plataforma.cesped`),
luego los caminos (distancia al eje ≤ ancho/2 + 0,3), y si no, el terreno.

### Rotación de las construcciones
`visor.js:2821` → `grupoRumbo`: `rotation.y = Math.PI - d2r(rumbo)`. **Ojo, no es
`d2r(rumbo)`**. La pérgola y la caseta del demo salen con rumbo 90 → el ángulo
efectivo es 90°, pero para otras casas hay que aplicar `PI - rumbo`.

### El «weir» no existe en el dato
No hay weir en `piscina`. Lo deduje: la weir es el borde del vaso **más lejos de
los escalones** (`piscina.escalones[0]`). Con los ejes del visor
(`EJE_L = [sin(r), -cos(r)]`, `EJE_A = [-cos(r), -sin(r)]`) sale el punto
`[3, 20,25]` en la demo. La luz va 0,50 m hacia dentro y 0,30 m bajo la lámina
(agua = `SUELO + plataforma.alto - 0,14` = 0,41 → luz a 0,11).

---

## 2. El criterio de iluminación que apliqué

**Regla de oro:** una lámpara ilumina su entorno y nada más. Alcance corto,
intensidad baja, y la suma no satura la exposición. La exposición general
(`renderer.toneMappingExposure`) **no se toca nunca**.

| Luz | Dónde | Color | Intensidad | Alcance | Decay |
|---|---|---|---|---|---|
| Farolillo del camino (×4) | `farolas` tipo `farolillo`, en la posición de su bombilla | `#ffbe86` (2700 K) | 0,55 | 4,4 m | 1,8 |
| Bajo el agua (weir) | `piscina`, en la weir | `#63e6df` (turquesa) | 1,00 | 7,0 m | 1,5 |
| Acento del portalón | `porton.a`, en el pilar, 0,42 m hacia el camino | `#ffc78d` (2800 K) | 0,42 | 3,8 m | 1,8 |
| Pérgola | `construcciones` (no caseta), bajo la viga | `#ffe0b8` (3200 K) | 0,22 | 4,6 m | 1,8 |
| Caseta | `construcciones` (caseta), en la puerta | `#ffdcae` (3000 K) | 0,20 | 3,4 m | 1,8 |

**8 luces puntuales fuera, ni una más** (`MAX_LUCES = 8`): 4 farolillos + agua +
portón + pérgola + caseta.

Lo que acompaña a cada luz:
- **Farolillo**: una esfera emisiva (`MeshBasicMaterial`, `toneMapped:false`, r = 0,115)
  en la bombilla (sustituye visualmente a la caja 0,18×0,2×0,18 que pone el visor)
  + un charco de luz en el suelo (plano tumbado, aditivo, 3,4 m) + su `PointLight`.
- **Farolas de globo de la piscina** (2): el visor ya pone la esfera de 0,2 m, así que
  no se duplica; solo el charco de luz en el suelo (5,2 m) — su luz la pone el
  reparto del visor, y no meto una novena.
- **Weir**: luz turquesa bajo el agua + reflejo en la piedra del borde (3,4 m).
- **Pérgola**: una regleta de LED (caja 0,05×0,03) bajo la viga larga, emisiva, y
  una luz baja dentro que marca el volumen sin bañarlo.
- **Caseta**: una rendija emisiva en el hueco de la puerta (1,3×1,8) y una luz
  baja en el umbral.
- **Portalón**: un charco de luz en la base del pilar.

### Lo que NO tiene luz (decisión, no olvido)
El huerto y la era. `EST.oscuras` los deja escritos: `"Huerto"`, `"Era de piedra"`
(salen de `exterior.zonas` con `mat === 'huerto'` o `'losa'`). De noche, la
oscuridad del huerto es lo correcto; con un «foco en medio del jardín» se pierde.

### Los halos
Una sola textura, generada con canvas (degradado radial 64×64), usada por todos:
- **charco en el suelo**: `Mesh` + `PlaneGeometry` tumbado, `AdditiveBlending`,
  `depthWrite:false`, `toneMapped:false`. 8 charcos (4 farolillos, 2 globos de la
  piscina, la weir y el portalón).
- **halo de fuente**: `Sprite` + `AdditiveBlending` (siempre mira a la cámara).
  Lo llevan las 4 luces que no son del visor: el agua (2,2 m, opacidad 0,75), el
  portalón (1,1 m, 0,85), la pérgola (1,6 m, 0,55) y la caseta (1,3 m, 0,8). Los
  farolillos **no** llevan halo propio: el visor ya pone un `Sprite` aditivo en
  su bombilla y dos halos se verían el doble.
- 6 emisores: 4 esferas de farolillo + la rendija de la caseta + la regleta de la
  pérgola.

Cero assets nuevos, cero texturas en disco.

---

## 3. La luz volumétrica: qué cambié y por qué

`modulo/luz.js` **no lo toqué** (es del coordinator). Lo que hice fue usar su API
pública y mejorarla desde fuera:

### a) Densidad por ambiente, y que cambie sola con la hora
`AD.luz.ponDensidad(d)` con:
- altura del sol < 0° → **0,010** (noche)
- 0° a 8° → **0,007** (penumbra)
- ≥ 8° → **0,004** (día)

La altura del sol se lee de la posición de la `DirectionalLight` con `castShadow`
(`asin(y/longitud)`), **sin tocar el deslizador**: así el aire se espesa o se
aclara solo cuando el usuario mueve la hora. Se aplica en cada cuadro, pero solo
se llama a `ponDensidad` cuando el valor cambia.

### b) El mapa de sombras, parcheado en runtime
`visor.js:207` pone `renderer.shadowMap.type = THREE.PCFSoftShadowMap` y
`visor.js:229` pone `sol.shadow.radius = 0.01` con el comentario *«sombra marcada:
borde duro, sin difuminado»*. **Ese comentario es falso**: en `PCFSoftShadowMap`
el `shadowRadius` no se usa (mira `three/src/renderers/shaders/ShaderChunk/
shadowmap_pars_fragment.glsl.js`: el radio solo aparece en la rama
`SHADOWMAP_TYPE_PCF`).

Parche (en el **primer cuadro**, no al montar, para no retrasar el primer render):
- `renderer.shadowMap.type = THREE.PCFShadowMap` → el radio pasa a mandar.
- `sol.shadow.radius = 1` (un téxel: borde nítido, no aliased).
- `sol.shadow.blurSamples = 4` (solo lo usaba PCFSoft).
- Como cambiar el tipo recompila los materiales, se hace `material.needsUpdate`
  una sola vez, con `try/catch`.

### c) El velo de aire (la niebla) en el jardín de noche
`escena.fog` es un `THREE.Fog` lineal. Valores:
- noche → `near 22 / far 240`
- penumbra → `near 30 / far 300`
- fuera del modo → los del visor (`220/700` con el ajuste natural)

Por qué esos números: a 42 m (la vista «casa») el velo es del 9 %, o sea que la
casa se lee nítida; a 90–150 m (los olivos y la vista de la finca) es del 20–55 %,
que es donde se ve la profundidad. **El cielo no se borra** porque el domo del
cielo (`visor.js:213`) es un `ShaderMaterial` sin niebla: la niebla no lo toca.
La casa tampoco: a 42 m solo le afecta un 9 %.

El velo se vuelve a poner en cada cuadro, porque `aplicaLuz()` del visor lo
resetea cada vez que se mueve la hora.

### d) La exposición
`renderer.toneMappingExposure` **no se toca jamás**. Si la noche se ve quemada,
el arreglo es bajar intensidades (o `LZ.rebote`), no subir exposición.

---

## 4. El interruptor de ambiente exterior

`AD.boton({id:'exterior', etiqueta:'Exterior', icono:'lámpara', alPulsar, activo})`
en la barra de Fabrick. Ciclo: **noche → penumbra → todo apagado → noche**.

| Ambiente | Hora del sol | Grupos de fuera | Luces propias | Velo |
|---|---|---|---|---|
| noche | sol a **−9°** (≈21:58 en la demo) | encendidos | 100 % | 22/240 |
| penumbra | sol a **+2,5°** (≈20:13) | encendidos | 55 % | 30/300 |
| todo apagado | sol a −9° | **todos apagados** | 0 % | sin velo |
| día (fuera del modo) | la que hubiera | los que marque el panel | 75 % | el del visor |

La hora no se escribe: se **busca**. Se mueve el deslizador `#slider-hora` y se
mide la altura del sol, por búsqueda binaria en la rama de la tarde (720–1440 min,
donde la altura baja sin parar): 12 iteraciones como mucho. La hora del deslizador
del visor es la fuente de verdad; el módulo no calcula astronomía propia.

**Al salir, todo vuelve como estaba** (`foto()` / `restaura()`):
`LZ.grupos` (copia exacta), `LZ.todo`, la hora del deslizador (y con ella
`LZ.noche`, el sol, el cielo y la niebla del visor), `escena.fog.near/far`, el
emisivo del agua (`MAT.agua.emissive` y `emissiveIntensity`) y la densidad
volumétrica.

### API pública
```js
AD.exterior = {
  abrir:   function(){},   // abre la noche de la finca; devuelve el modo
  cerrar:  function(){},   // devuelve el visor a su estado; devuelve el modo
  alterna: function(){},   // da vueltas por los ambientes; devuelve el modo
  abierto: function(){},   // boolean: ¿está abierto el ambiente exterior?
  estado:  function(){},   // 'dia' | 'noche' | 'penumbra' | 'apagado'
  detalle: function(){}    // intensidades, alcances, colores, densidad, sinLuz
};
```

---

## 5. Trampas (las que me kostaron tiempo)

1. **`AD.api.C0.exterior` no existe** → el exterior está en `CASA.exterior`.
2. **El botón de la barra**: `modulo/fabrick.js` se carga **el último**, así que
   al montar mi módulo `AD.boton` todavía no existe. `registraBoton()` se vuelve a
   llamar **en cada cuadro** hasta que se registra (`if(!EST.boton) registraBoton()`).
   Sin eso, el botón no aparece nunca. (Igual le pasa a `modulo/luz.js`, que solo
   llama a `AD.boton` una vez al montar: **revisar**.)
3. **`luz.js` se come los 8 globos con los interiores**: `MAX_GLOBOS = 8` y
   `creaGlobos()` recorre la escena buscando `userData.info.tipo === 'Iluminación'`.
   En la casa real hay más de 8 luminarias **interiores** (y van dos versiones de
   casa), así que **los globos exteriores de `luz.js` nunca se crean**. Por eso
   este módulo es el dueño de la luz de fuera. **Aviso al coordinator.**
4. **El icono 'lámpara' no existe en `AD.iconos`** (`modulo/fabrick.js` solo tiene
   plano, camara, hub, sonido, sonidoMudo, paleta, cocina, cine, cctv). El SVG
   salía vacío. `modulo/exterior.js` añade el suyo con `||` (si ya está, no lo
   pisa). **Mismo problema en `modulo/luz.js`**, que usa `icono:'lámpara'`.
5. **`repartirLuces()` decide `p.on` con `p.mallas[0].visible`**: si se oculta la
   malla de la bombilla, el punto de luz del visor se apaga. Por eso la esfera
   emisiva del farolillo es una malla **nueva** y la del visor se queda como
   estaba (queda dentro de la esfera).
6. **`p.mat.emissiveIntensity` lo pisa `repartirLuces()`** (pone 1 o 0). El único
   mando del color del emisivo es `p.mat.emissive` (el color), no la intensidad.
7. **`MAT.agua.emissive` lo pone el `alEncender` del foco de piscina**
   (`visor.js:3269`, color blanco `#d8f8ff`). Este módulo lo pone turquesa
   (`#2fbfae`) cada cuadro, y **restaura el color original al salir**. Efecto
   colateral: también arregla que el agua se quede brillando cuando el visor
   apaga el foco (el visor no restaura ese color).
8. **`LUC.sombras`**: `aplicaLuz()` del visor recompila los materiales cada vez
   que cambia `shadowMap.enabled`. Mi parche a PCF convive con eso (el `enabled`
   no se toca).
9. **Las fichas de luz del panel quedan desfasadas**: al cambiar `LZ.grupos` a
   mano, los *chips* del panel (`pintaGruposLuz()`) no se repintan hasta que el
   usuario pulsa uno. Es cosmético (el estado real es `LZ.grupos`).

---

## 6. Lo que falta (para el coordinator)

1. **Cargar el módulo en `index.html`** — es el único cambio pendiente y **no lo
   hice yo** porque el brief prohibe tocar `index.html`:
   ```html
   <script src="modulo/luz.js"></script>      <!-- línea 579 -->
   <script src="modulo/exterior.js"></script> <!-- <- añadir aquí -->
   <script src="modulo/cctv.js"></script>     <!-- línea 580 -->
   ```
   Sin esa línea el módulo existe pero no se carga. (Va antes de `fabrick.js`:
   así `AD.boton` ya existe y el botón sale en el primer pintado.)
2. **`herramientas/build.mjs`**: la lista `MODULOS` (línea 42) no incluye
   `'exterior'`, así que el build no avisa si falta el archivo. El archivo sí se
   copia a `dist/modulo/` (copia el directorio entero). Añadirlo es una línea.
3. **`herramientas/banco.js`**: ya lo añadí a la lista de módulos (línea 156) y
   también aparece en la lista de APIs comprobadas (línea 187). Ojo: otro agente
   está tocando el mismo archivo a la vez (`recorrido`); si se pisan, que lo
   repongan las dos líneas.
4. **Coste de luces en el teléfono**: la escena queda con 8 puntuales del reparto
   del visor + 8 de `luz.js` + **8 mías** = 24. En un gama baja eso se nota. Si
   hace falta: `?luces=4` (el visor lo acepta por URL) y bajar `MAX_GLOBOS` de
   `luz.js` a 4–5.
5. **Acné con PCF**: al pasar a `PCFShadowMap` puede aparecer acne con el bias del
   visor (`-0,0006`). Si se ve, subir `sol.shadow.normalBias` de 0,03 a 0,05.
6. **No está probado en el navegador**: el banco de Node y una prueba con escena
   real en memoria lo validan, pero el navegador con WebGL por software tumba el
   renderizador en este teléfono. Falta la prueba en la handset.

---

## 7. Cómo se probó

- `node herramientas/banco.js` → 0 fallos (el módulo monta, crea 8 puntuales,
  8 charcos y 6 emisores; la lista de luces del banco sube a 8).
- Prueba aparte (`/tmp/opencode/prueba-exterior.js`, montada como el visor:
  `PUNTOS` de fuera, `LZ` con grupos, sol que se mueve con `#slider-hora`):
  - noche → hora 21:58, `LZ.noche` true, grupos `Camino/Piscina/Porche` encendidos,
    niebla 22/240, densidad 0,010, intensidades 0,55×4 / 1,00 / 0,22 / 0,20 / 0,42;
  - penumbra → hora 20:13, intensidades al 55 %;
  - todo apagado → grupos a false, intensidades a 0;
  - cerrar → hora 780, grupos `{}`, niebla 220/700, densidad del visor, agua a negro;
  - sombras → `shadowMap.type = 1` (PCF) y `shadow.radius = 1`;
  - de día con «Camino» encendido en el panel → las luces al 75 % (0,41);
  - sin `AD.luz` → no falla.
