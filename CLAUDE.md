# Ars Domus: instrucciones para Claude

Este repo es un visor 3D de casas (`visor.js`, three.js r128) y una casa de ejemplo (`demo/`). Lo que la
gente te pedirá casi siempre es **montar su propia casa**: de un plano y unas fotos a una maqueta que se
pasea en el navegador, con la casa como es hoy y una propuesta de reforma. Esta página dice cómo.

La referencia de los datos está en [`doc/datos.md`](doc/datos.md). Léela antes de escribir la primera
casa. La demo (`demo/herramientas/casa.py` y `mejora.py`) es el ejemplo completo de todo.

## Dónde va cada cosa

La casa de alguien es privada: fotos, plano, dirección, datos catastrales. **Nunca va en este repo.**
Va en `casas/<nombre>/`, que está en `.gitignore`, o en una carpeta fuera del repo:

```
casas/mi-casa/
  fuentes/            plano, catastro, ortofoto (lo que se descarga o te pasan)
  fotos/              las fotos, tal cual
  herramientas/
    casa.py           el generador: los datos de la casa → casa.js
    mejora.py         la propuesta de reforma: aplica(casa) → CASA_MEJORA
  casa.js             GENERADO; no se edita a mano
  texturas/           recortes de las fotos (o copia las de demo/texturas)
  cambios.json        lo que se mueve en el visor (lo escribe el servidor)
```

Se arranca con `CASA=casas/mi-casa npm run dev` (http://127.0.0.1:5173, se recarga solo al regenerar
`casa.js`). Copia `demo/herramientas/` como punto de partida.

Si la casa vive en su propio repo (lo recomendable si se quiere versionar), este repo va dentro como
submódulo y se arranca con `CASA=$PWD npm --prefix ars-domus run dev`.

## Cómo se trabaja

1. **Nombres primero.** Pregunta cómo llaman a cada sitio («el despacho», «la habitación de la abuela»).
   Usa esos nombres en los `id` y `nombre` de las estancias: luego te pedirán cambios con ellos.
2. **Esqueleto desde el plano.** Muros y huecos con su escala, en el marco del plano (`u`, `v`). Si el plano
   es una imagen, la geometría se puede sacar con NumPy (máscara de los píxeles oscuros y sus sumas por
   filas y columnas: cada pico es un muro), pero revisa a mano dónde caen las ventanas.
3. **Inventario de fotos.** Antes de medir nada, una tabla: qué sale en cada foto y desde dónde. La
   orientación buena la da el sol (fecha y hora del EXIF, más la latitud), no la brújula del móvil.
4. **Medir en las fotos.** Con objetos de tamaño conocido (puertas de ~2 m, encimeras de 90 cm, mesas de
   75 cm) y anclando a las paredes que ya vienen del plano. Dentro de casa, el error es de 10 a 30 cm;
   lo lejano, mejor de la ortofoto. Pon en cada dato de qué foto sale (`foto: '12, 14'`).
5. **Pocos muebles bien puestos.** Grosso modo, sin objetos pequeños. Si dudas, no lo pongas y pregunta. Si
   una foto contradice el plano, manda la foto y avisa.
6. **IDs fijos desde el principio.** Muebles `<código de estancia>-NN`, luces `-Lnn`, huecos `H-NN`, muros
   `W-NN`, árboles `A-NNN`. No se reutilizan. Con ellos cada corrección es una línea («SAL-07 medio metro
   al norte»).
7. **La mejorada se deriva de la actual.** `mejora.aplica(casa)` parte de la casa y le aplica los cambios; nunca
   la copies. Lo nuevo lleva `idea` y sus propios IDs. Avisa de lo que haya que comprobar (un muro de carga).
8. **Mira tus capturas.** Antes de dar algo por hecho, sácala con Chrome headless y mírala:
   `google-chrome --headless=new --screenshot=salida.png --window-size=1400,900 --virtual-time-budget=15000
   "http://127.0.0.1:5173/?vista=salon&limpio"`. Usa `--screenshot`, que termina solo: un Chrome
   headless que se queda abierto con el visor renderiza sin parar y se come la CPU. Si una captura sale con
   el suelo negro, las texturas aún no habían cargado: repítela.
9. **Lo que se mueve en el visor.** El modo «Mover objetos» escribe `cambios.json` en la carpeta de la casa
   (ID, versión, de dónde a dónde, giro). Pásalo a `casa.py` o `mejora.py` y vacía el fichero.
10. **Ve por fases** (esqueleto, exterior, interior por tandas de fotos, correcciones, mejorada) y enseña
    cada una.

## Cambiar el motor

`visor.js` sirve para todas las casas: lo que es de una casa concreta va en sus datos, nunca en el
motor. Si una casa necesita algo nuevo (un mueble, un tipo de hueco, un detalle del exterior):

- añádelo genérico, con sus parámetros en `m.<algo>` y un valor por defecto;
- si es opcional en los datos, que el visor funcione sin él (`X.algo || []`, `if(!C.algo) return`);
- su nombre en `NOMBRE_MUEBLE`, y en `doc/datos.md` si es un campo nuevo;
- comprueba que la demo sigue saliendo igual (`npm run dev` y unas capturas) y `npm run check`.

Los comentarios del motor describen cómo se dibuja, nunca la casa de nadie: nada de «el despacho de
Fulano», nombres de personas, marcas o modelos de lo que hay en una casa real, ni referencias a fotos.

## Publicar

- `npm run build` deja en `dist/` la versión estática (la de la demo, o `CASA=… npm run build` para otra).
  GitHub Pages publica la demo en cada push a `main` (`.github/workflows/pages.yml`).
- Una casa real solo se publica si su dueño lo pide, y entonces sin dirección, referencia catastral,
  coordenadas reales (para el sol basta una latitud aproximada), nombres de personas ni fotos.
- Antes de un commit en este repo, asegúrate de que no entra nada de `casas/`, ni fotos, ni planos.

## Comandos

```bash
npm install
npm run dev                         # la demo en http://127.0.0.1:5173
CASA=casas/mi-casa npm run dev      # otra casa
python3 demo/herramientas/casa.py   # regenera demo/casa.js (y la mejorada)
python3 demo/herramientas/texturas.py
npm run check                       # sintaxis de visor.js y de casa.js
npm run build && npm run preview    # la versión estática en http://127.0.0.1:5183
```
