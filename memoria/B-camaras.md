# B · Cámaras cinematográficas y recorrido automático interior

> Archivo propio: `modulo/camaras.js` · rama `fabrick` · sin commits.
> Segunda versión: la primera validaba las tomas contra los muros, pero no
> se había visto en un teléfono. Ahora está validado con
> `node /tmp/opencode/test-plano-cam.js` (0 fallos) y `node /tmp/opencode/banco.js`
> (0 fallos).

## Los tres regímenes de cámara del visor (`visor.js`)

| Régimen | Cómo coloca la cámara | Límites |
|---|---|---|
| Órbita (`aplicaVista` + `colocar()`) | `objetivo` + `dist` + `theta` + `phi` | `dist ≥ 2 m`, `phi ∈ [0,08 ; π/2+0,25]`, `y ≥ 0,4`, `objetivo.y ∈ [0,12]` |
| A pie (`entraPie` + `andar()`) | `pie.x/z/y` + `pie.yaw/pitch` | altura fija `suelo + 1,65 m` (OJOS) |
| Tour de caminos (`andaTour`) | `pie.*` | altura fija 1,65 m |

El régimen "a pie" **no sirve para cine**: `andar()` repone la altura en cada
cuadro, así que no hay contrapicado ni cenital. El cine va **en órbita** y la
altura la calcula el módulo desde `INT.estancias[].cota`.

**Consecuencia que estaba en el aire**: si el usuario estaba paseando y se
abría el cine, los dos escribían la cámara en cada cuadro y la vista salía
imposible. Ahora `libreDePaseo()` sale del paseo (y para el tour, `AD.api.TOUR.activo`)
antes de entrar al cine; si no se puede salir, el cine no se abre.

## Claves que usa el visor (y que no están en el contrato)

- `aplicaVista({desde, hacia, fov, sinTejado})` → pone `dist/theta/phi/objetivo`
  **y** `camara.fov` (¡vertical!) **y** cambia `capas.cubierta` y `capas.arboles`
  cuando le pasas `sinTejado`. `desde`/`hacia` van en **mundo** (x, y, z).
- `colocar()` **recorta**: distancia ≥ 2 m, `phi` ≤ 104,3°, `y` ≥ 0,4 m.
  → una toma a menos de 2 m se ve desde 2 m; el "primer plano" se consigue con
  FOV corto, no acercando la cámara.
- `capas.interior` y `capas.cubierta` son grupos; el techo de las estancias
  vive en **cubierta**: para un cenital interior hay que ocultar la cubierta
  (`sinTejado: true`).
- `PUERTAS` = `[{g, local, nombre, aplica, t, obj, w}]`; `t` es la animación y
  `obj` el objetivo (0 cerrada, 1 abierta).
- `INT.estancias[]`: `{id, nombre, codigo, caja:[u0,v0,u1,v1], cota, suelo, …}`.
  `cota` es la altura del suelo **en el marco local** (0,12): el suelo en el
  mundo queda en `SUELO + cota` (0,25 + 0,12 = 0,37).
- `INT.muebles[]`: la pieza está en el centro de su planta y **mira a +z local**.

## La altura de la cámara: el fallo de la `cota`

Las tomas guardan `y` como **altura sobre el mundo**, y `mundo(u,v,y)` suma
`SUELO`. La altura sobre el **suelo terminado** es `cota + h`. Antes las tomas
usaban `y = OJO` (= 1,62) sin la cota: la cámara quedaba a 1,50 m del suelo, no
a 1,62. Ahora todas las alturas salen de `alto(est, h) = cota + h`, y el
travelling también (llevaba `OJO` a pelo: 12 cm más bajo que el resto).

## Reglas de las tomas (las que no se negocian)

1. **Cámara a 1,62 m** del suelo terminado, salvo toma deliberada:
   contrapicado 0,62 m, cenital hasta 2,35 m, detalle a la altura de la pieza.
   (El lateral estaba a 1,45 m: ahora también va a 1,62.)
2. **≥ 0,25 m a la cara del muro**, y también a la cara de las ventanas.
3. **≥ 0,60 m a la pieza que se enseña** (el detalle, a 0,80–0,95 m).
4. **Nunca dentro de un mueble** (a la altura de la cámara) ni dentro de un muro.
5. La línea de visión a la pieza no está cortada por nada más alto.
6. El recorrido **no atraviesa ningún tabique** (ni entra por una ventana).

### La distancia al muro: el fallo de la recta

`distMuro` medía la distancia a la **recta** del muro y sólo si el punto caía
dentro del tramo; fuera del tramo devolvía 1e9. Con eso:

- una cámara justo al final de un muro pasaba el filtro de los 0,25 m y se
  metía dentro del tabique;
- el recorrido **podía pasar por una ventana**: la ventana es un hueco entre
  dos trozos de muro, y la lista `muro` (material solo) no la incluía, así que
  el paso era «aire».

Ahora `distMuro` mide la distancia verdadera al **tramo** (la banda del muro,
con su grosor) y usa siempre la lista `solido` (muros + ventanas). Por una
puerta se sigue pasando porque no hay nada; por una ventana no.

## Las 18 tomas

Seis tipos: `general`, `lateral`, `detalle`, `contrapicado`, `cenital`,
`travelling`, más dos exteriores (la casa desde el jardín y desde el aire).

El **reparto es justo** (esto se cambió):

1. un **general por estancia** (que todas tengan plano),
2. el **travelling** (la toma estrella),
3. el resto, primero uno por estancia y luego los que sobren.

Antes se llenaba por orden de estancia y se cortaba a 18: las últimas
estancias (estudio, lavadero, porche) se quedaban **sin ninguna toma**. Ahora
la casa de ejemplo reparte: 2 exteriores + 11 generales + 1 travelling + 5
detalles. Una estancia **sin muebles** (el pasillo) recibe un general mirando
al centro: es un espacio aunque no tenga pieza que enseñar.

## El recorrido automático interior

1. Dos estancias están conectadas si comparten borde y en ese borde hay un
   hueco pasable (o no hay muro: un paso abierto).
2. Se camina el grafo en el orden en que la casa da las estancias; si se llega
   a un callejón sin salida **se vuelve por donde se vino**.
3. Cada estancia tiene una parada informativa en el punto libre desde el que se
   ve mejor su pieza, con **1,7 s de parada** y el rótulo en pantalla.
4. Avance a **1,15 m/s** con rampa (0,25–1) al arrancar y al parar, y el rumbo
   se saca mirando 1 m atrás y 2,2 m adelante, para que las curvas no den un
   latigazo.
5. Las puertas se **abren solas a menos de 2,9 m**.

En la casa de ejemplo: **100,1 m, 46 puntos, 12 paradas** (antes 74,9 m y 31
puntos: la ruta nueva va de verdad por los vanos, sin recortar esquinas).

## FOV

Siempre **horizontal** (52–80°) y convertido con `2·atan(tan(h/2)/aspect)`,
con los límites 50–94° en vertical. En vertical (0,46) el horizontal de 72°
daría 114,9° → se recorta a 94° (el horizontal efectivo queda en 52,7°). En
horizontal (1,78) da 44,4° → se sube a 50°.

El `dpr` tiene tope (2) y el **mapa de sombras no se agranda**: 4096 son 64 MB
de VRAM y en un móvil matan la pestaña. El botón «4K» pasó a llamarse «Alta»:
sube el `pixelRatio` a 2 y, como mucho, recorta el mapa de sombras a 2048 si el
dispositivo traía más.

## El HUD y el letterbox

Se inyecta un `<style>` con prefijo `adc-` y cinco capas: la banda del
letterbox (z 24), el fundido (25), el rótulo (26), el botón «Cine» (27) y la
tarjeta (28).

Cambios de esta versión:

- **El letterbox no tapa el HUD.** La banda es como máximo el 11 % de la
  pantalla por arriba (2,35:1 si cabe), y **todo el HUD del cine se coloca
  respecto a la banda** con la variable `--adc-barra`: el botón arriba a la
  derecha dentro del encuadre, el rótulo encima de la hoja de controles y los
  controles como una hoja desde abajo (un panel de 320 px tapaba media
  pantalla en un móvil).
- **Mientras hay cine, el HUD del visor se aparta** (`body.adc-cine`): la
  brújula, la escala, la ficha, las etiquetas, los botones de «a pie», el panel
  lateral y la barra de Fabrick. Con la banda encima quedaban tapados.
- El rótulo ya no cae en la barra negra de abajo (`bottom:12%` → dentro del
  encuadre).

## API pública

```js
AD.camaras = {
  abrir(), cerrar(), alternar(),
  reproduce(), pausa(),
  tomas: [],            // la lista viva de las tomas
  irA(i), modoCine(bool), calidad4K(bool),
  paseo(bool), rutas(), estado(), refresca()
};
```

Se registra además la pieza `CINE-camara` en `AD.piezas` (estado 1/0) para que
el hub (agente C) pueda mostrar el modo cine.

## Trampas (las que casi me cuestan el módulo)

1. **El hook puede ir antes o después del movimiento.** Por eso la cámara se
   coloca con `aplicaVista` (que fija el estado de la órbita) y no solo
   escribiendo `camara.position`.
2. **El visor gira la órbita con el dedo sobre el lienzo** y sus manejadores
   están en el mismo elemento que el canvas → no se pueden quitar. Se
   bloquean con un listener en **fase de captura sobre `#escena`**.
3. **`aplicaVista` pone el FOV vertical** y no el horizontal. Hay que pasarle
   el vertical ya convertido.
4. **`sinTejado` ata la cubierta y los árboles**: no se pueden poner por
   separado con esa llamada. Los árboles se gobiernan a mano.
5. **Las ventanas son huecos entre trozos de muro**: si se calcula «el muro»
   como la lista de tramos, una ventana parece un paso.
6. **`colocar()` recorta**: distancia ≥ 2 m, elevación ≤ 13°, cámara ≥ 0,4 m.
7. El «a pie» no sirve para el cine y el cine no debe tocar el «a pie».
8. `AD.api` puede no existir al cargar el módulo: todo pasa por `datos()`.
9. `AD.api.C` puede ser la casa entera: `datos()` normaliza (`base.casa`).
10. `PRIO[tipo] || 9` **no funciona para el 0**: con `||`, la prioridad 0
    (detalle) se convertía en 9 y los detalles nunca salían en la lista.

## Qué falta

- **No se ha visto en el teléfono.** La validación es de datos: 18 tomas
  comprobadas contra los muros, los muebles y las reglas; 4 600 muestras del
  recorrido con **0 cruces de tabique** y **0 pasos por ventana**.
- No hay **exportación de vídeo** (a propósito): el modo queda listo para
  grabar la pantalla.
- El recorrido interior es **uno solo** (toda la casa). Con más tiempo se
  podrían hacer rutas cortas por zona.
- El botón «Alta» apenas hace nada en un móvil que ya va a dpr 2: no se ha
  encontrado un salto de calidad que no cueste VRAM.
- Las puertas se abren al acercarse pero **no se cierran** al alejarse.
