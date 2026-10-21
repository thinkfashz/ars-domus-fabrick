# D — Cocina con herrajes reales (`modulo/cocina.js`)

Entrega del agente D. Archivo propio: `modulo/cocina.js`.
No se tocan `visor.js`, `index.html` ni `demo/casa.js`.

## Revisión del 2026-10-20 (segunda vuelta: verificación + arreglos)

Todo se comprobó con bancos de prueba en Node (three@0.128.0 de verdad, sin
navegador). Los tres están en `/tmp/opencode/` y se pueden volver a correr:

```bash
cd memoria/pruebas
node carga.js             # el montador compartido (casa real + escena + DOM de mentira)
node prueba-cocina.js     # 45 comprobaciones de la cocina
# (copia en /tmp/opencode/ también; en el repo no se pierde con un reinicio)
```

| Lo que se pidió | Resultado |
|---|---|
| 44 piezas, **sin duplicar** al calling `repara()` dos veces | ✅ 44 → 44, 26 cajones / 16 puertas / 2 neveras, ids únicos y **el mismo número de mallas** (nada duplicado) |
| el cajón sale **0,46 m** | ✅ el cajón alto de la encimera (`COC-01-caj-3-*`) recorre Δz = 0,4600 exacto; los demás 0,42 y 0,44, y **ninguno pasa de 0,46** |
| la puerta basculante gira **exactamente 90°** | ✅ rot.x = −1,570796… = **−90,0000°** (no 89, ni 91) |
| la isla de la versión mejorada (**COC-M01**) tiene vuelo y barra | ✅ vuelo de la barra **0,42 m** (la actual, COC-03, 0,32) y barra a **1,05** en las dos |
| la nevera abre **sobre su bisagra** y su luz se enciende | ✅ el pivote está en el canto (x = −0,35 = la mitad del ancho), la hoja desplazada 0,349 (= (0,70 − 2 mm) / 2): gira **sobre la bisagra**, no sobre su centro. La `PointLight` pasa de 0 a **0,75** al abrir y vuelve a 0 al cerrar |
| horno y microondas | **NO están en el dato** (`INT.muebles` no los tiene) → **no se inventan**. La placa y la campana sí, porque el brief las pedía |

### Arreglos que salieron de la revisión

1. **El mobiliario general era código muerto.** `repara()` filtraba
   `if(!m.id || m.id.indexOf('COC') !== 0) return;`, así que la rama
   `mejoraMueble()` (cojín, listón y faldón) **nunca se ejecutaba**: el módulo
   prometía mejorar las sillas y la mesa y no lo hacía.
   **Arreglo**: ahora se separan los dos casos —
   ```js
   var esCoc = (m.id.indexOf('COC') === 0);
   var esGeneral = (m.tipo === 'silla_madera' || m.tipo === 'mesa_madera');
   if(!esCoc && !esGeneral) return;
   ```
   La cocina se **rehace** (se quita el grupo viejo y se construye otro), el
   mobiliario general **se mejora** (se le añade lo que le falta, sin tocar lo que
   el visor ya dibujó). `mejoraMueble()` es idempotente (marca `__cocina`).
2. **El listón del respaldo era invisible.** Estaba en z −0,188 y el respaldo del
   visor ocupa de −0,2025 a −0,1775: el listón quedaba **dentro** de la madera.
   Ahora va en z −0,169, en la cara anterior, y se ve.
3. **Las mallas nuevas del mobiliario general llevan ficha** (`userData.info`),
   como las de la cocina: el panel del visor sigue funcionando al tocarlas.
   Se copian de la malla hermana del mismo mueble.

### Lo que sigue igual (no se ha tocado)

- El reparto de la encimera, las medidas, los materiales cacheados, la animación
  por `dt` con `smoothstep`, el giro de 180° del cuerpo de la isla, el pivote
  superior de las basculantes, la nevera de dos hojas con su luz: todo igual.
- La lista de piezas (`AD.cocina.piezas`) y sus ids (`COC-01-caj-3-actual`,
  `COC-02-nevera-mejorada`, `COC-M01-caj-1-mejorada`…) no ha cambiado: 44.

---

## Qué hace

La cocina del visor era un bloque de cajas: un cuerpo blanco de 0,82 de alto,
sin zócalo, sin frentes, sin tiradores y sin nada que se pueda abrir. Este
módulo la rehace con lógica constructiva y **herrajes que se ven**:

| Pieza | Cómo está resuelta |
|---|---|
| Base de la encimera | 0,60 de fondo × 0,90 de alto, **zócalo de 0,10 retranqueado 0,06**, carcasa de 5 piezas (costados, fondo, base, tabla) para que se vea el interior al abrir |
| Encimera | 0,04 de canto con vuelo de 0,02; superficie a 0,90 |
| Frentes | 0,019 de canto con **1 mm de holgura** a cada lado (`MED.holgura`) |
| Tiradores | barra de **0,16 m** en `MeshPhongMaterial` (`#c9c6bd`, shininess 70) con dos soportes, horizontal en cajones y vertical en puertas |
| Alacenas | 0,35 de fondo × 0,70 de alto, base a 1,40, con tira de LED en el canto |
| Bisagra de basculante (yunding) | **pivote (cilindro) + brazo + soporte fijo**, a la vista; la hoja bascula 90° (rotación X de −π/2) |
| Guías de cajón | guía **fija** en el mueble y guía **móvil** en el cajón: al salir se ve el deslizamiento |
| Nevera | 0,70 × 2,00 × 0,65, dos hojas (frigorífico a la izquierda, congelador a la derecha), baldas, cajón de verduras, cesta y **luz interior** (panel emisivo + `PointLight` que se enciende al abrir) |
| Isla | cuerpo de 0,60, encimera de trabajo a 0,90, **barra a 1,05** sobre patas de metal y **vuelo de 0,32** (actual) / **0,42** (mejorada) |
| Banquetas | asiento con cojín, patas cónicas y aro de apoyo en metal |
| Mobiliario general | a las sillas de madera y a la mesa de madera: cojín de asiento, listón de respaldo y faldón (el visor ya traía colchón, almohadas, nórdico, cojines y patas) |

## Reparto de la encimera corrida (3,90 m)

`A 0,60 cajones · B 0,65 puerta · C 1,30 fregadero (2 puertas) · D 0,60 cajones · E 0,75 puerta`
+ alacena izquierda de 1,20 (dos hojas basculantes) y alacena derecha de 0,60 (una hoja).

**La ventana manda**: la ventana H-03 va de u 9,60 a 10,80 con el alféizar a 0,95
y el dintel a 2,15 (`TIPO_HUECO.ventana = {y0:0.95, y1:2.15}`). En coordenadas
locales del mueble (centro en u 10,30) es la franja x −0,70 … +0,50. Las alacenas
se quedan fuera de esa franja (izquierda hasta −0,75, derecha desde +0,60) y el
fregadero (0,80 de ancho, centro en x 0,20 según el dato) queda debajo. Comprobado
con `Box3`: en la banda de la ventana (y 1,30 … 2,20) no hay ninguna malla entre
u 9,53 y u 10,92.

## Contrato que consume

- `AD.api.escena`, `AD.api.GRUPOS_V`, `AD.api.C0` (la `casa` de la versión actual, que
  lleva `.interior`), `AD.api.pick` (la lista de mallas seleccionables), `AD.api.INT`.
- `AD.avisaListo(fn)`, `AD.onFrame(fn)`, `AD.piezas.registra({id, etiqueta, tipo, grupo, abre, cierra, estado})`.
- Datos: `INT.muebles[]` con `{id, tipo, uv, giro, largo, fondo, frente, tapa, fregadero, placa}`.

## API pública

```js
AD.cocina = {
  piezas:  PIEZAS,          // las piezas animables, en vivo
  aplicar: function(){...}, // rehace la cocina (devuelve cuántas piezas rehízo)
  repara:  function(){...}, // lo mismo: vuelve a construir desde cero
  estado:  function(id){}   // cuánto abierta está una pieza (0 cerrado, 1 abierto)
};
```

Piezas registradas: **44** (26 cajones, 16 puertas, 2 neveras), con id único
`COC-01-caj-3-actual`, `COC-02-nevera-mejorada`, `COC-M01-caj-1-mejorada`…
Los tipos son `cajon`, `puerta` y `nevera` (la nevera va como `nevera`, el
congelador como `puerta`). El hub (agente C) las puede listar tal cual.

## Decisiones

1. **Rehacer el mueble, no pegarle encima.** El visor dibuja la cocina como
   cajas opacas; para que un cajón se vea al salir (caja, guías, interior) hay
   que rehacer el mueble. Se quita el grupo viejo, se copian `position`,
   `rotation` y `scale` a un grupo nuevo en el mismo padre, y se cuelga la
   ficha (`userData.info`) de las mallas nuevas para que el panel del visor
   siga funcionando.
2. **Un solo recorrido de la escena** en `repara()`: se agrupan los muebles por
   `info.id` y se filtra por versión con `versionDe()` (el ancestro que está en
   `GRUPOS_V`). Así se atienden **las dos versiones** con el mismo código.
3. **El cuerpo de la isla va girado 180°** (`gb.rotation.y = Math.PI`): el frente
   de los cajones mira a −z (el lado de trabajo, a 1,30 m de la encimera) y el
   vuelo de la barra queda hacia +z, donde están las banquetas. Es lo contrario
   de lo que hacía el visor (el frente daba a las banquetas).
4. **La animación va con `dt` y `smoothstep`**: `t += vel·dt/dur` y
   `s = t²(3−2t)`. Arranque y frenado suaves; al invertir a mitad de camino no
   hay tirón porque la posición es función suave de `t`.
5. **Materiales cacheados** en un diccionario: el visor usa Lambert/Phong (no
   PBR) y una cocina con herrajes son ~120 mallas; con un material por malla
   el teléfono se ahoga.

## Trampas (las que costaron tiempo)

1. **Coordenadas relativas dentro de un pivote.** El tirador de una puerta se
   añadió con su coordenada absoluta (x del mueble) siendo hijo del pivote de
   la bisagra: quedó **1,2 m fuera de la puerta**, flotando en el aire. Dentro
   de un pivote, todo es relativo a él. Lo detectó la prueba geométrica (la
   caja de la encimera llegaba a u 13,47 con una encimera de 3,90).
2. **Hay dos muebles con el mismo id.** `COC-01` y `COC-02` existen en las dos
   versiones y **las dos están en la escena a la vez** (una visible, otra no).
   Buscar "el primero que encuentre" deja media casa sin cocina.
3. **El interior no está donde parece.** Está en `CASA.casa.interior`, no en
   `CASA.interior`. `AD.api.C0` es la `casa` de la versión actual (con
   `.interior` dentro) y la de la mejorada está en
   `window.CASA_MEJORA.casa.interior`. `AD.api.INT` solo da la versión activa.
4. **`AD.api.C` e `AD.api.INT` son getters**: dan la versión activa. Si el
   módulo los lee una vez y los guarda, se queda con la planta equivocada
   cuando se cambia de versión.
5. **`pick` es una lista de mallas, no un método.** Al quitar un grupo hay que
   sacar sus mallas de `AD.api.pick` (con `splice`, mutando el array) o el
   raycaster sigue acertando con las mallas viejas, ya fuera de la escena.
   Las mallas nuevas hay que añadirlas a `pick` para que se puedan tocar.
6. **`IDS` (la lista de fichas con id) se calcula al arrancar.** Las mallas
   nuevas no entran en ella: el panel de fichas las sigue mostrando porque
   llevan `userData.info`, pero no aparecen en el buscador por id.
7. **La `PointLight` de la nevera** suma una luz a la escena y three.js
   recompila los materiales al cambiarla. Son dos (una por versión) y solo se
   encienden al abrir la puerta: aceptable, pero conviene saberlo.
8. **`AD.piezas.items` hay que limpiarlo** antes de volver a registrar, o el
   hub ve duplicados. Las mías se marcan con `__cocina` y se quitan con
   `splice` (sin reasignar el array, por si otro módulo lo tiene guardado).
9. **El módulo puede cargarse antes que `visor.js`.** Si `AD.avisaListo` no
   existe, se espera con un `setTimeout` de 250 ms hasta que `AD.api.escena`
   exista.
10. **Un filtro puede volver código muerto.** El `indexOf('COC') !== 0` de
    `repara()` dejó sin efecto `mejoraMueble()` durante días sin que se notara:
    el módulo "funcionaba" y en realidad no hacía esa parte. Los tests lo
   detectaron al contar las mallas de la silla (1 en vez de 3).

## Cómo se comprobó

Banco de pruebas sin navegador (`/tmp/opencode/prueba-cocina.js`, con el
montador compartido `/tmp/opencode/carga.js`): se simula lo que hace el visor
(escena, `GRUPOS_V`, `pick`, `piezas`, `onFrame`) con el three del repo, se
cargan `demo/casa.js` y `modulo/cocina.js`, y se mide:

- 44 piezas registradas, 44 ids únicos, 26 cajones / 16 puertas / 2 neveras.
- 1065 mallas, **todas con `userData.info`** (el panel del visor sigue vivo).
- 2 luces (la de cada nevera): 0 → 0,75 al abrir y 0 al cerrar.
- Un cajón recorre 0,46 m en z y vuelve; la puerta basculante gira −1,571 rad
  (−90° exactos).
- `repara()` dos veces seguidas: siguen siendo 44 piezas y las mismas mallas
  (**nada duplicado**), tampoco en el mobiliario general.
- `Box3` por mueble: la encimera ocupa u 8,34 … 12,27 y 0,12 … 2,80 de alto; la
  isla vuela 0,32 (versión actual) y 0,42 (mejorada) y la barra queda a 1,05.

Comprobaciones de la casa: `node --check modulo/cocina.js` y `CASA=demo npm run check`.

## Aviso al coordinator

Mientras este agente trabajaba, **otra sesión escribió también
`modulo/cocina.js`** (guardada en `/tmp/opencode/cocina-otro-agente.js`).
Su versión **añadía** piezas encima de los muebles del visor, sin rehacerlos:
duplicaba el colchón, los cojines y las patas que el visor ya dibuja; no
construía alacenas ni bisagras de basculante (las ponía de adorno en la puerta
del fregadero, no en las puertas altas); la isla no tenía barra a 1,05 ni vuelo
de 0,30; la puerta de la nevera giraba sobre su propio centro en vez de sobre
la bisagra; solo atendía una versión; y `repara()` volvía a añadir la geometría
encima de la anterior. **El archivo que queda en disco es la versión de esta
memoria** (la verificada con el banco de pruebas).

## Qué falta

- **Horno y microondas**: no están en los datos (`INT.muebles` no los tiene) y
  no se inventan. La placa y la campana sí, porque el brief las pedía; el
  horno se puede añadir cuando el dato lo traiga. *(Anotado por el coordinator:
  sigue pendiente, sin cambio.)*
- **Alacena sobre el fregadero**: no cabe (la ventana ocupa esa franja). La
  solución real —alacena con cajón dePersiana o campana con balda— necesita
  un dato nuevo.
- **Cerrar el anillo con el hub (agente C)**: las piezas ya están registradas
  con `abre()`, `cierra()` y `estado()`, pero conviene que el hub las agrupe
  por `grupo:'Cocina'` y por etiqueta, y que no intente animar a la vez dos
  piezas de la misma versión.
- **Mobiliario general**: el visor ya traía cama (colchón, almohadas, nórdico),
  sofá de tela (cojines y patas), mesa (tablero y patas) y silla (asiento,
  respaldo y patas). Este módulo solo añade a la silla el cojín y el listón, y
  a la mesa el faldón. Si el coordinator quiere más, lo natural es tocar el
  `MUEBLE` del visor, no este módulo.
- **Prueba en el teléfono**: no se ha abierto el visor en el móvil. La cocina
  se ve de frente desde el salón y desde el pasillo; la puerta basculante de
  la alacena se ve desde abajo.
- **Los muebles con `id` propio que no sean COC ni silla/mesa** (librería,
  cómoda, escritorio…) no se tocan: son del visor.

## Aviso para quien edite este repo

La herramienta de edición de este entorno **a veces se come un carácter** al
escribir (pasó con `'silla_madera'`, que quedó `'sila_madera'`, y con `silla`
→ `sila` en una prueba). **Después de cada edición, revisa el `git diff` línea
por línea** y pasa `node --check`. No te fíes del «editado con éxito».
