# G · Muros interiores verde limón + recalibrado de la luz diurna

Archivos que son míos: `modulo/paleta.js`, `demo/herramientas/casa.py`, `demo/herramientas/mejora.py`,
`demo/casa.js` (generado) y esta memoria. Nada de commits: solo en disco.

## 1 · Qué encontré

### El dato se genera con Python, y `python3` sí está en esta máquina

`demo/casa.js` es GENERADO. La cadena es:

```sh
python3 demo/herramientas/casa.py        # escribe demo/casa.js (CASA y CASA_MEJORA)
CASA=demo npm run check                  # node --check visor.js && node --check demo/casa.js
node herramientas/build.mjs              # copia a dist/
```

- `demo/herramientas/casa.py` importa `mejora.py` (`import mejora`, línea final) y escribe
  `window.CASA` y `window.CASA_MEJORA` en el mismo archivo. **Si tocas la paleta, toca las dos**:
  `mejora.py` sobrescribe `pared` de salón, cocina y estudio con `e.update(nuevos.get(e['id'], {}))`.
- El aviso del propio archivo: *"GENERADO por demo/herramientas/casa.py: no se edita a mano"*.
- `python3` = 3.14.4, `node` = 22.23.1. No hizo falta editar `casa.js` a mano.

### Dónde vive el color de pared

`INT.estancias[].pared` (un hex, o `'azulejo'` / `'piedra'`). En el visor, `construyeEstancias`
(visor.js:1111) hace:

```js
var pinta = function(p){ return p === 'piedra' || p === 'azulejo' ? MI[p] : mate({color:p}); };
var mp = pinta(e.pared), otras = {};
Object.keys(e.paredes || {}).forEach(function(l){ otras[l] = pinta(e.paredes[l]); });
```

- `mate()` (visor.js:1010) = `MeshPhongMaterial` con `shininess 4`, `specular '#141414'` y **sin mapa**.
- `paredes:{O:'piedra'}` = ese lado es `MI.piedra` (material **global**, con textura) → no se pinta.
- El baño con `pared='azulejo'` usa `MI.azulejo` (con textura) → no se pinta.
- El revestimiento de cada lado se hace en `reviste()` (visor.js:1155) con `pano()` (visor.js:136),
  y **la geometría de `pano()` lleva `g.userData.muro = true`**. Es la única marca que distingue
  un paño de muro de cualquier otra cosa.

### Las luces y quién las manda

`visor.js` tiene su propio bloque de luz (3612-3680) y su propia UI:

| Qué | Dónde | Valor |
|---|---|---|
| exposición | `renderer.toneMappingExposure` (visor.js:193) | 1,0 inicial |
| hemisférica | `hemi` (visor.js:214) | 0,62 inicial |
| sol | `sol` (visor.js:215) | 1,5 inicial, `castShadow = true` |
| relleno | `relleno` (visor.js:222) | 0,12 inicial |

Y luego `actualizarSol()` (3583) + `aplicaLuz()` (3630) los reescriben **en crudo** en cada cambio
de hora o de deslizador:

```js
renderer.toneMappingExposure = LUC.exp;
sol.intensity   = SOLB.s;              // 0,22 + 0,55·t   (0,02 si el sol está bajo el horizonte)
hemi.intensity  = SOLB.h * LUC.rebote; // 0,20 + 0,13·t   (0,10 de noche)
relleno.intensity = 0.07 * LUC.rebote;
```

`LUC` (exposición, rebote, bruma) y los cuatro ambientes (`natural`, `suave`, `dramatico`,
`nocturno`) son controles que YA existen, con sus deslizadores. `LUC` se guarda en
`localStorage['arsdomus-luz']`.

**Clave**: si el módulo pone los valores a pelo (`renderer.toneMappingExposure = 0.84`), el visor
los vuelve a escribir en cuanto se mueve la hora o un deslizador, y la recalibración se pierde.
Por eso aquí no se fijan valores: se **escala lo que el visor escribe**.

### El contrato y el botón que ya existía

- `modulo/fabrick.js` (del coordinator) ya tiene el botón de la paleta:
  `AD.boton({id:'paleta', etiqueta:'Color', icono:'paleta', alPulsar: … AD.paleta.alterna(),
  activo: … AD.paleta.tema() === 'limon'})`. **No hay que hacer botón propio.**
- `index.html` ya carga `modulo/paleta.js` (línea 570), entre `visor.js` y el resto de módulos, y
  `modulo/fabrick.js` va el último → cuando la barra se pinta, todos los módulos ya existen.
- `ponVersion()` no está expuesto. `AD.api.VERSION` sí es un getter → se detecta el cambio en un
  `AD.onFrame`.
- `AD.api` expone: `escena, camara, renderer, capas, pie, TOUR, TOURS, PUERTAS, PUNTOS, pick,
  VISTAS, VERSIONES, GRUPOS_V, LZ, GIRO, SUELO, aMundo, d2r, entraPie, salirPie, aplicaVista,
  eligeVista, mueve, visible, estanciaActiva, reloj, poneCapa, MUEBLE, MAT, C0` + los getters
  `C`, `INT`, `VERSION`. **No expone las luces**: hay que encontrarlas en la escena.

## 2 · Qué decidí

### La paleta (en el dato y en runtime)

En `casa.py` (y en `mejora.py` para que las dos versiones Digamos lo mismo):

| Estancia | Código | Verde limón | Neutro (el de antes) |
|---|---|---|---|
| salón comedor | SAL | `#c8db8a` | `#f2efe8` |
| recibidor | REC | `#c8db8a` | `#f2efe8` |
| pasillo | PAS | `#c8db8a` | `#f2efe8` |
| cocina | COC | `#cfe0a0` | `#f4f4f2` |
| dormitorio principal | DOR | `#d7e3ab` | `#e9e4da` |
| dormitorio de invitados | DO2 | `#d7e3ab` | `#dfe6e3` |
| dormitorio pequeño | DO3 | `#d7e3ab` | `#efe3cf` |
| estudio | EST | `#c3d49a` | `#a9b3c3` |
| lavadero | LAV | `#e2eccb` | `#f4f4f2` |
| baño | BAN | — (azulejo) | — |
| porche | POR | — (exterior) | — |

Los de estar llevan el verde más presente, los de dormir más suave, el lavadero casi blanco. El
baño se queda en azulejo y el porche no tiene `pared` (es exterior). La fachada no se toca: piedra
y encalado. **El verde va al muro, nunca al piso**: los suelos no se han tocado.

### La luz: los valores exactos que dejé

Lo que el visor escribe en crudo, a las 13:00 (la hora con la que abre) y con el ambiente
«natural», es: exposición 1,00 · sol 0,757 · hemisférica 0,327 · relleno 0,070.
Con los factores, la escena queda en:

| Canal | Crudo del visor | **Factor (día)** | **Queda** | Por qué |
|---|---|---|---|---|
| exposición | 1,00 | **0,840** | **0,84** | Con ACES, 1,0 recorta los muros claros a blanco. 0,84 es el punto en el que el porcelanato y el gres no se queman y el interior no se ensucia. |
| sol | 0,757 | **1,753** | **1,33** | El sol de mediodía, no un foco. 1,5 quemaba; con 1,33 las sombras tienen cuerpo. |
| hemisférica | 0,327 | **1,697** | **0,56** | Es el rebote del cielo, lo que llena los interiores: sin subirlo, el interior se va a negro con el techo puesto. |
| relleno | 0,070 | **2,000** | **0,14** | La luz de contra que separa la sombra del cielo. |

Los factores salen de dividir el objetivo por el crudo: 0,84/1,00 · 1,35/0,77 · 0,56/0,33 · 0,14/0,07.
En junio y septiembre (t = 1) el crudo es 0,77/0,33 y queda 1,35/0,56: los números del brief.

**De noche** los factores bajan, porque a esas horas el interior lo iluminan las luminarias, no el
sol, y con el cielo entrando igual que de día la casa no «duerme»:

| Canal | Factor de noche | Queda (crudo de noche: sol 0,02 · hemi 0,10 · relleno 0,07) |
|---|---|---|
| exposición | 0,840 | 0,84 (el preset «nocturno» del visor lo sube a 1,45 → 1,22) |
| sol | 0,964 | 0,019 |
| hemisférica | 1,222 | 0,122 |
| relleno | 1,200 | 0,084 |

La mezcla día/noche es continua: `k = (solCrudo − 0,02) / 0,20`, con 0 de noche y 1 de día.

### Cómo se aplica la recalibración sin pelear con la UI

Se **intercepta la escritura** de cuatro propiedades con `Object.defineProperty`:

```js
Object.defineProperty(renderer, 'toneMappingExposure', {get, set});
Object.defineProperty(sol,  'intensity', {get, set});   // y hemi, relleno
```

El `set` multiplica por el factor. Así:

- el visor sigue mandando (hora, ambiente, deslizadores): sus valores se reescalan solos;
- la recalibración no se pierde al cambiar la hora ni al mover un deslizador;
- la noche baja sola, porque el factor depende del sol crudo que el visor acaba de escribir.

`renderer.toneMappingExposure` en r128 es un uniform que se pone en cada cuadro
(`p_uniforms.setValue(_gl,'toneMappingExposure', _this.toneMappingExposure)`), así que el getter se
lee en cada frame ✓. Las luces se localizan en la escena: la hemisférica es la única
`HemisphereLight`, el sol es la `DirectionalLight` con `castShadow`, y el relleno la otra.

### El interruptor de paleta

- `aplica('limon'|'neutro')`: **clona** el material de cada estancia y le pone el color; el
  material original no se muta nunca. El color de partida queda guardado en
  `material.userData.paletaOrig` y el código en `paletaCod`, para poder volver a neutro.
- Un «grupo» = las mallas que **comparten material**: el paño de la pared **y las mochetas de sus
  huecos** (jambas, alféizar, dintel), que en el visor se crean con el mismo material. Si se
  pintara solo el paño, el hueco quedaría blanco en medio del muro verde.
- Cómo se reconoce un muro interior: `geometry.userData.muro === true` (solo lo pone `pano()`) **y**
  `userData.info.tipo === 'Estancia'` (descarta los muros de fuera, los dinteles de ventana y el
  vidrio). Se descartan los materiales **con textura** (piedra, azulejo) y los que no son de una
  estancia.
- El tema se guarda en `localStorage['arsdomus-paleta']`, como hace el visor con la luz.
- Al cambiar de versión de casa (V) se repinta: `ponVersion` no está expuesto, así que se mira
  `AD.api.VERSION` en un `AD.onFrame`.

## 3 · Contrato (API pública)

```js
AD.paleta = {
  aplica: function(tema){ ... },   // 'limon' | 'neutro' → devuelve el tema aplicado
  alterna: function(){ ... },      // pasa de un tema al otro → devuelve el nuevo
  tema:   function(){ ... },       // 'limon' | 'neutro'
  temas:  ['limon', 'neutro'],
  estancias: function(){ ... },    // [{codigo, nombre, verde, neutro, dato}] (para el hub)
  calibraLuz: function(){ ... },   // reengancha la recalibración de la luz
  luz: LUZ                        // {dia:{exp,sol,hemi,relleno}, noche:{…}}
};
```

- `AD.paleta.alterna()` y `AD.paleta.tema()` son lo que usa la barra de Fabrick (ya escrito).
- No se crea ningún botón ni panel propio: el botón «Color» de la barra de Fabrick es el interruptor.
- Carga: `index.html` ya lo carga (línea 570). El módulo es un script plano, sin `import`.

## 4 · Trampas (documentadas antes de que muerdan)

1. **Pintar solo el paño** deja las mochetas de los huecos con el color viejo. Se pintan por
   material compartido (y solo si su ficha es de una estancia: un muro de fuera puede compartir
   material).
2. **Fijar la luz a pelo** no vale: `aplicaLuz()` del visor la reescribe en el siguiente cambio de
   hora o de deslizador. Hay que escalar.
3. **El dato manda, pero el dato también es el neutro**: si el `pared` del dato es igual al neutro
   de la tabla, se usa la tabla del módulo (así el módulo funciona aunque `casa.js` no se regenere).
4. `mejora.py` sobrescribe `pared` de salón, cocina y estudio: si no se actualiza, la versión
   mejorada se queda en los blancos de antes y el interruptor «neutro» no coincide con ella.
5. `Material.clone()` en r128 copia `userData` con `JSON.parse(JSON.stringify(...))`: dentro solo
   puede haber datos simples (aquí, dos cadenas).
6. `Object.defineProperty` sobre `renderer.toneMappingExposure` y sobre `luz.intensity`: son
   propiedades de datos propias del objeto, se pueden redefinir (`configurable: true`).
   Si otro módulo las reescribe por su cuenta, se pierde el escalado (no lo hace nadie hoy).
7. El material de un paño **no** se puede mutar: `mp` lo comparte con las mochetas de la estancia
   y las dos versiones de la casa construyen el suyo propio, pero el `MI.*` (piedra, azulejo) son
   globales: nunca se tocan.

## 5 · Pruebas hechas

Sin navegador, con `three@0.128.0` de verdad (`node_modules/three`) y objetos reales
(`MeshPhongMaterial`, `Scene`, `traverse`): 24 comprobaciones — el paño conserva el verde del
dato, la mocheta comparte el clon, el material original no se muta, el azulejo y la piedra no se
tocan, el clon conserva `shininess`/`specular`, el neutro y el vuelta a limón, los cuatro valores
de luz de día y de noche, y el repintado al cambiar de versión. La prueba está en
`/tmp/opencode/test-paleta3d.js` (fuera del repo).

## 6 · Qué falta / pendientes

- **No verificado en un navegador real**: los valores se han calculado con la fórmula de `posSol`
  del visor (altura 27,3° a las 13:00 del 20-10-2026, lat 40, huso 1) y comprobados en Node, pero
  falta una captura con la casa a plein écran para ajustar a ojo si el interior quedó demasiado
  apagado. Con ACES y `#c8db8a` (luminancia 0,65) los muros son más oscuros que los blancos de
  antes (0,86): si el interior queda oscuro, el siguiente paso es subir las luces de relleno
  interiores del visor (`RELLENO`, 0,45 por estancia), que aquí **no** se han tocado.
- Las luces de punto interiores del visor (`RELLENO.forEach(l => l.intensity = 0.45*dia)`) y las
  luminarias quedan como estaban: son del visor y no se han tocado.
- `localStorage['arsdomus-paleta']` no tiene botón para olvidarlo: se borra desde la consola.
- La lista `estancias()` está por si el hub (agente C) quiere listar los ambientes y sus colores.
- **Ojo**: durante este trabajo, otro agente escribió `modulo/paleta.js` encima (versión con
  `aplicaLuz()` a pelo y `neutro()` que devolvía el color del dato: con el dato ya en verde, el
  tema «neutro» no hacía nada). La versión que queda aquí es la que está probada; si vuelve a
  aparecer la otra, hay que volver a esta.

## 7 · Cambios en el repositorio (sin commit)

- `demo/herramientas/casa.py`: paleta verde en `ESTANCIAS` + constantes `LIMON_*` y el diccionario
  `NEUTRO` (documenta el color de antes).
- `demo/herramientas/mejora.py`: la versión mejorada usa la misma familia de verde.
- `demo/casa.js`: regenerado (`python3 demo/herramientas/casa.py`).
- `modulo/paleta.js`: nuevo.
- `TAREAS.md`: fila G marcada.
