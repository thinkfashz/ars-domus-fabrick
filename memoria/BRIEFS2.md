# BRIEFS 2 — segunda vuelta (2026-10-21)

Contexto común a los tres agentes. **El entorno se reinicia mucho: escribe el
archivo pronto y a menudo, y deja la memoria en disco pronto.**

## Reglas de la casa (no se negocian)

1. **Datos primero.** Todo sale de `window.CASA` (o `AD.api.C0`): muros, huecos,
   estancias, muebles, luces, caminos, farolas, piscina, árboles. **Nunca** una
   planta o una posición escritas a mano.
2. **Cero assets nuevos.** Ni texturas, ni sonidos, ni modelos. Lo que falte, se
   genera con canvas o con geometría.
3. **Un archivo por agente.** No toques `visor.js`, `index.html`, `demo/casa.js` ni
   el archivo de otro agente. Si encuentras un fallo en un archivo ajeno, anótalo
   en tu memoria con archivo, línea y arreglo propuesto.
4. **Móvil primero.** 44 px por botón, sin hover, sin overlays que tapen la
   escena. En vertical, la pantalla es de 390 px: nada de letra pequeña.
5. **Memoria antes de cerrar**: `memoria/<letra>-<tema>.md`.
6. **La skill es la fuente de verdad** de constructividad: lee
   `/root/.config/opencode/skills/arquitectura-fabrick/SKILL.md` y
   `references/checklist-geometria.md` y `references/medidas-cocina.md`. Y de las
   lecciones del visor: `/root/.config/opencode/skills/visor-casa-fabrick/SKILL.md`.

## Contrato (lo define el core; no lo cambies)

```js
AD.api = { escena, camara, renderer, capas, pie, TOUR, TOURS, PUERTAS, PUNTOS, pick,
  VISTAS, C, INT, C0, VERSION, VERSIONES, GRUPOS_V, LZ, GIRO, SUELO, aMundo, d2r,
  entraPie, salirPie, salirTour, aplicaVista, eligeVista, mueve, visible,
  estanciaActiva, reloj, poneCapa, MUEBLE, MAT, orbita, restauraOrbita, bloqueaOrbita };
AD.onFrame(fn)          // fn(dt) cada cuadro
AD.alListo(fn)          // avisar cuando el visor está listo (también AD.avisaListo)
AD.piezas.registra(p)   // piezas animables: {id, etiqueta, tipo, grupo, abre, cierra, estado}
AD.boton({id, etiqueta, icono, alPulsar, activo})  // botón en la barra de Fabrick
AD.iconos / AD.svg / AD.pintaBarra / AD.refrescaBarra
```

## Datos (todo en metros)

- `AD.api.C` = la casa: `{rumbo, origen:[u,v], cotaSuelo, contorno, muros, huecos,
  cubiertas, pilares, vigas, chimeneas, interior:{estancias, muebles, luces}}`.
- `AD.api.INT` = `{estancias:[{id,nombre,codigo,caja:[u0,v0,u1,v1],cota,suelo,pared,techo,fuera}],
  muebles:[{id,tipo,uv:[u,v],giro,largo,ancho,alto,color}], luces:[{id,tipo,uv,giro,y,techo,grupo}]}`.
- `AD.api.C0` = **la casa entera**, con `exterior:{piscina, construcciones, zonas,
  caminos:[{id,nombre,mat,ancho,eje:[[u,v],…]}], pasos, lindes, porton,
  farolas:[{id,tipo,mundo:[u,v],grupo}], sueltos, arboles}`.
- `AD.api.aMundo(u,v)` → `[x,z]` en el mundo. `AD.api.GIRO` (rad) es el giro de la
  casa; `AD.api.SUELO` (0,25) la cota de la explanada. **El interior**: el suelo
  de una estancia está a `SUELO + e.cota` (0,25 + 0,12 = 0,37).

## La cámara (esto es lo importante)

El visor tiene tres regímenes. **Para una cámara a altura de persona, el
correcto es el paseo** (`pie`), no la órbita:

| Régimen | Cómo | Altura | Para qué |
|---|---|---|---|
| **Paseo** `AD.api.entraPie(x,z,yaw)` / `salirPie()` | `pie.x/z/y` + `pie.yaw/pitch` | fija en `pie.y + 1,65` | **cámara a altura de persona**, con colisiones contra muros, puertas y escalones |
| **Órbita** `AD.api.aplicaVista({d,t,p,c,fov})` | objetivo + distancia + ángulos | la que quieras | tomas fijas, contrapicados, cenitales |
| **Tour de caminos** | `andaTour` | 1,65 m | el recorrido que ya trae el visor por los caminos de la finca |

- `aplicaVista` pone **`camara.fov`, que es VERTICAL**. El FOV humano se
  define **en horizontal** y se convierte: `2·atan(tan(h/2)/aspect)`, límites
  **50–94** en vertical. En vertical (aspect 0,46) un horizontal de 72° daría
  114,9° → se recorta a 94° y el horizontal real queda en 52,7°.
- `colocar()` **recorta**: distancia ≥ 2 m, `phi` ≤ 104,3°, `y` ≥ 0,4 m,
  `objetivo.y` ≤ 12. Una toma a menos de 2 m se ve desde 2 m: el primer plano se
  consigue con **FOV corto**, no acercando la cámara.
- `AD.api.orbita()` / `restauraOrbita(s)` guardan y devuelven la órbita exacta
  (objetivo, distancia, ángulos y fov). Úsalos para restaurar la cámara al
  cerrar un modo.
- `AD.api.bloqueaOrbita(true/false)`: si un modo se hace cargo de los gestos,
  bloquea los de la órbita (si no, los dos mueven la cámara).

## Puertas y piezas

- `AD.api.PUERTAS` = `[{g, local, nombre, aplica, t, obj, w}]`: `obj` 1 = abierta.
  `AD.api.mueve(p)` alterna. `p.w` es la posición en el mundo (la calcula el
  visor al pasearse; si no, `p.g.localToWorld(...)`).
- `AD.api.piezas.items` = las piezas animables que registran los módulos.

## Verificación (obligatoria antes de entregar)

```bash
node herramientas/banco.js                 # debe dar 0 fallos (y tú añades tu módulo a la lista)
CASA=demo npm run check                    # sintaxis
node herramientas/build.mjs                # dist listo
node --check modulo/<tuarchivo>.js
```

El banco carga la casa real y monta los módulos en Node con un DOM de mentira.
**El navegador headless con WebGL por software tumba el renderizador en este
teléfono**: no sirve para verificar. El banco sí.
