# C · Hub de control de la casa

Agente C · archivo propio: `modulo/hub.js` · rama `fabrick` · sin commits.

## Qué encontré (contrato real del visor)

- `AD.api.PUERTAS` = `[{g, local, nombre, aplica, t, obj, w}]`.
  `t` es la animación, `obj` el objetivo (0 cerrada, 1 abierta).
  `AD.api.mueve(p)` alterna `obj` y actualiza el rótulo de la puerta cercana.
- **El nombre real de una puerta no está en `PUERTAS`**: `p.nombre` es
  siempre «la puerta». El nombre de verdad está en la malla de la hoja:
  `malla.userData.info = {tipo:'Hueco', id:'H-07', nombre:'Puerta vidriera',
  puerta:<la puerta>}`. Recorriendo la escena una vez se arma el mapa
  `puerta → info` y sale el nombre + el id del hueco.
- `p.w` (posición en el mundo) lo calcula el visor **solo** cuando pasa el
  paseo (`buscaPuerta`). Para agrupar por estancia hay que calcularlo:
  `p.g.localToWorld(new THREE.Vector3(p.local[0], p.local[1], p.local[2]))`.
- Del mundo al plano: `aMundo` es la directa, pero no está en `AD.api`;
  la inversa sí se puede calcular con `C0.origen` y `GIRO` (los expone
  `AD.api`): `u = dx·cosG − dz·sinG`, `v = dx·sinG + dz·cosG`.
  Con eso, la estancia es la de `INT.estancias[].caja` que contiene (u,v)
  (la **más pequeña** que lo contiene: una puerta está en la pared, en el
  borde de dos estancias).
- `LZ = {noche, todo, grupos:{}, sucio, clave, cuadro}`. Los grupos son de
  **luces de fuera**; las de dentro se encienden solas de noche según la
  estancia donde estás (`repartirLuces` recalcula `p.on` **cada cuadro**:
 任何 override manual se pierde).
- El visor ya tiene botones de grupo (`#luces-fuera .chip[data-grupo]`) y
  el interruptor de todo (`#luces-todo`): delegar en ellos mantiene las dos
  interfaces de acuerdo (`pintaGruposLuz` no está en `AD.api`).
- `actualizarSol()` tampoco está en `AD.api`, pero el deslizador
  `#slider-hora` tiene su listener de `input`: poner `slider.value` y
  lanzar un `Event('input')` es lo mismo que llamarla.
- `AD.piezas.items` = `[{id, etiqueta, tipo, grupo, abre(), cierra(), estado()}]`.
  Lo announce la cocina (agente D) **más tarde**: la lista hay que releerla.

## Qué decidí

| Decisión | Por qué |
|---|---|
| Panel propio `#fab-hub` (nada de `#panel`) | el panel del visor es del coordinator |
| Escritorio: columna a la derecha (`right:16px`, 318 px) y, mientras está abierto, `body.fab-hub` mueve la barra `#fabrick` y el botón de audio a `right:346px` | no se tapan entre sí; el cuerpo de la barra se queda accesible |
| Móvil: hoja inferior con `max-height:60dvh` y borde redondeado arriba | el panel no tapa más del 60 % del alto (regla de la casa) |
| Secciones con `<details>/<summary>` nativas | accesibles y plegables sin código extra |
| Botones de 44 px, sin `:hover` (solo `:active`) | mínimo táctil y «nada de hover» |
| El estado se actualiza **en sitio**, la lista solo se rehace si cambia el número | el refresco de 1,5 s no puede quitarle un botón al dedo del usuario |
| Luces: se delega en los botones del visor (`#luces-fuera`, `#luces-todo`) | las dos interfaces no se desincronizan |
| Ambiente: **no** se duplican los deslizadores; se leen sus valores y se enlaza con el panel del visor | pedido explícito del brief |
| Escenas: 13:00 / 20:00 / 22:00 sobre `#slider-hora` con evento `input` | reutiliza el `actualizarSol()` del visor |
| Si `AD.piezas.items` está vacío, se dice con claridad (no una lista en blanco) | pedido explícito del brief |
| La sección de Ambiente incluye el botón de sonido (módulo E) | en móvil la hoja tapa el botón de audio |

## API pública

```js
AD.hub = { abrir(), cerrar(), alterna(), refresca(), abierto() };
```

- `abierto()` devuelve el booleano que usa la barra (`fabrick.js` lo llama).
- `refresca()` relee puertas, piezas y luces; se llama al abrir, después de
  cada acción y cada 1,5 s mientras el panel está abierto.

## Trampas

1. `p.obj` es el objetivo, `p.t` la animación: el estado que se muestra es
   `obj` (lo que el usuario ha pedido), no `t` (lo que se ve ahora).
2. `AD.api.C` e `INT` son **getters**: cambian al cambiar de versión. Hay
   que leerlos en el momento, nunca guardarlos.
3. `mueve(p)` **alterna**: para «abrir todas» hay que comprobar el estado
   antes de llamar, o se abre lo que ya estaba abierto.
4. `repartirLuces()` reescribe `p.on` cada cuadro: las luces de interior no
   se pueden forzar desde fuera (el hub lo explica en vez de prometer).
5. `ESTANCIAS` cambia con la versión de casa: al abrir el hub se relee el
   mapa de nombres y se rehace la lista de puertas.
6. `document.body.classList` es la única forma de mover la barra de
   acciones: se usa `fab-hub` y el CSS lo traduce a `right:346px`.

## Qué falta / pendientes

- Las luces de interior por estancia siguen sin poder forzarse: pediría un
  gancho en `repartirLuces` (cambio del coordinator).
- El hub no controla las capas (cubierta, árboles): `AD.api.capas` y
  `poneCapa` lo permitirían.
- La sección de Escenas debería leer la fecha activa (`?fecha=`) para que
  «atardecer» caiga de verdad en el ocaso de esa fecha.
