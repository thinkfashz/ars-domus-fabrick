# Memoria · E — Música y ambiente (`modulo/audio.js`)

> El agente E fue interrupted por reinicios repetidos del entorno. El coordinator
> implementó el módulo siguiendo el brief (`memoria/BRIEFS.md`, sección E) y después
> quitó el botón flotante «Activar sonido» (se le encima a la barra de Fabrick en el
> móvil). Esta es la **tercera vuelta**: verificación con un banco de pruebas en Node
> y arreglos.

## Revisión del 2026-10-20 (verificación + arreglos)

Banco de pruebas en Node, con un **WebAudio de mentira** que apunta todo lo que se
programa en los `GainNode`: `/tmp/opencode/prueba-audio.js` (con el montador
compartido `memoria/pruebas/carga.js`). **27 comprobaciones, 0 fallos.**

| Lo que se pidió | Resultado |
|---|---|
| el botón de la barra de Fabrick (`AD.audio.alterna()`) es **suficiente** | ✅ `alterna()` enciende y apaga, devuelve el estado real (`true`/`false`), **no recrea el grafo** y refresca la barra (`AD.refrescaBarra()`) para que el botón se pinte |
| el audio **arranca en el primer toque** | ✅ con `localStorage['ad-audio'] = '1'` (el usuario lo había dejado activado), el **primer `pointerdown` en la página** arranca el audio. El listener va en **fase de captura** (`capture: true`), así que cuenta como gesto de verdad y el navegador lo deja sonar. Se retira después del primer toque |
| el grafo **no se recrea al cambiar el volumen** | ✅ `volumen(v)` solo mueve el `GainNode` maestro; el `AudioContext` y los nodos son los mismos. Se comprobó con el contador de nodos creados |
| el `GainNode` maestro **sube y baja sin chasquido** | ✅ **ningún assignment directo** del gain después de empezar: todo son `cancelScheduledValues` → `setValueAtTime(valor actual)` → `linearRampToValueAtTime`. Al encender: rampa a 0,5 en 1,6 s; al apagar: rampa a 0 en 0,8 s; al cambiar el volumen: rampa en 0,3 s. El grafo **nace con el gain a 0** (nada de ruido al crearlo) |
| **no suena nada hasta que haya un gesto** | ✅ al cargar el módulo no se crea el `AudioContext` (`estado().creado === false`), no hay `GainNode` ninguno y `suena()` es `false`. El grafo se crea en el primer gesto |

### Arreglos que salieron de la revisión

1. **El gancho de cuadro se registraba DOS veces.** `arranca()` se llamaba desde
   `AD.alListo(...)` **y** desde `document.readyState === 'complete'` (o del evento
   `load`): en el navegador los scripts cargan con `readyState === 'interactive'`,
   así que salían los dos caminos → dos `AD.onFrame` → el ambiente se reprogramaba
   dos veces por cuadro. Ahora hay un cerrojo `ARRANCADO`.
2. **El viento se reprogramaba en cada cuadro.** `ambiente()` hacía
   `cancelScheduledValues` + `setValueAtTime` + `linearRampToValueAtTime` **60
   veces por segundo** sobre el mismo `AudioParam` (el `AudioParam` grows sin
   límite: es una fuga de memoria y un zumbido). Ahora solo se reprograma **cuando
   cambia el valor** (se guarda en `EST.vientoV`).
3. **`alterna()` mentía.** Devolvía `true` aunque no hubiera WebAudio (o el
   `AudioContext` no se pudiera crear). Ahora devuelve lo que devuelve `activa()`.
4. **`volumen(v)` con un valor raro** (NaN, `undefined`, un string) rompía el gain
   (`Math.min(1, undefined)` → NaN). Ahora solo se acepta un número finito.
5. **`silencia()` no fijaba el valor actual del pad** antes de la rampa: la rampa
   arrancaba desde un valor viejo y sonaba un escalón. Ahora fija el valor actual
   (`setValueAtTime`) como hace el maestro.
6. **El comentario de cabecera mentía**: decía «hasta que se toca "Activar sonido"»,
   un botón que ya no existe. Está actualizado con el comportamiento real.

### Lo que NO se ha tocado

- La síntesis: pad de Re menor add9 con LFO, arpegio cada 2,6 s, viento de ruido
  rosa, reverb de convolver con impulso de ruido. Todo igual.
- La reverb, el filtro y los niveles (0,055 del arpegio, 0,26 de envío a la
  reverb, 0,16 dentro / 0,50 fuera del viento).
- La clave de `localStorage` (`ad-audio`) y su valor (`'1'` = activado).

---

## Qué entregó

`modulo/audio.js`. API: `AD.audio = {activa(), silencia(), alterna(), volumen(v), suena(), quiereSonido(), ambiente(exterior), estado()}`.

| Método | Qué hace |
|---|---|
| `activa()` | crea el grafo (si no existe), reanuda el contexto, sube el gain con rampa y arranca el arpegio. Devuelve `true`/`false` |
| `silencia()` | baja el gain con rampa, para el arpegio y deja el grafo en pie (no se destruye: recrearlo chasquearía). Devuelve `true`/`false` |
| `alterna()` | enciende si está apagado, apaga si está encendido. Devuelve el estado nuevo |
| `volumen(v)` | 0…1. Mueve el gain maestro con rampa de 0,3 s. **No recrea el grafo** |
| `suena()` | ¿está sonando ahora? |
| `quiereSonido()` | ¿el usuario lo había dejado activado la última vez? (lee `localStorage`) |
| `ambiente(exterior)` | el viento sube (0,50) o baja (0,16). Solo reprograma si cambia el valor |
| `estado()` | `{on, vol, creado, ctx, viento}`: para el hub y para las pruebas |

## Decisiones

| Decisión | Por qué |
|---|---|
| **Todo sintetizado** (osciladores, ruido rosa, convolver con impulso generado) | Ni un mp3: no hay red, no hay sitio donde alojarlo y el service worker tendría que cachear un binario de más. |
| Reverb con `ConvolverNode` e impulso de **ruido con caída exponencial** | Un impulso de 1,9 s generado al vuelo suena a sala pequeña, que es lo que es una casa. |
| **Acorde fijo** (Re menor add9) con LFO que abre el filtro a 380 Hz cada 22 s | Suene vivo sin melodía: una melodía fija cansa en un recorrido largo. |
| **Arpegio cada 2,6 s** y muy bajo (0,055) | Da el pulso sin robar atención a la arquitectura. |
| **Viento** de ruido rosa filtrado en banda | Fuera se oye; dentro baja a 0,16. El ambiente sigue a la cámara. |
| **Ningún sonido sin gesto**: el grafo no se crea hasta que hay un toque | El navegador bloquea el audio sin gesto del usuario. La puerta es el botón «Sonido» de la barra de Fabrick; y si el usuario ya lo había activado, el **primer toque en la casa** lo arranca. |
| Un solo **GainNode maestro** | Cambiar el volumen no recrea el grafo (recrearlo produce un chasquido y pierde la posición de la reverb). |
| Las rampas de gain usan `linearRampToValueAtTime` y arrancan en el **valor actual** | Un salto de 0 a 0,5 en 1 ms se oye como clic. `setValueAtTime(valor actual)` antes de la rampa es lo que garantiza que no haya salto. |
| El ambiente **solo reprograma cuando cambia** | Reprogramar un `AudioParam` 60 veces por segundo llena su lista de eventos (fuga) y suena a zumbido. |

## Contrato

- `AD.alListo(fn)` para arrancar cuando el visor esté listo.
- `AD.onFrame(fn)` solo para el ambiente (dentro/fuera), no para el audio: el
  grafo de WebAudio es independiente del frame rate.
- `AD.refrescaBarra()` (opcional) para que el botón de la barra se pinte.

## Trampas

1. **`document.readyState` + `AD.alListo` = arranque doble.** Los dos caminos
   llaman a `arranca()`; con un cerrojo se arregla (y el cerrojo hay que ponerlo
   **antes** del `AD.onFrame`, no dentro).
2. **Un `AudioParam` no se limpia solo.** `cancelScheduledValues` + `setValueAtTime`
   + `linearRampToValueAtTime` en cada cuadro deja la lista de eventos creciendo.
3. **`gain.value` devuelve el valor intrínseco**, no el que suma el LFO. Para
   rampar bien hay que fijar `gain.value` (el valor actual) antes de la rampa.
4. **El primer toque debe ser un gesto de verdad**: si el listener está en la fase
   de burbuja y el canvas tiene `preventDefault`, el navegador puede no contarlo
   como gesto. Con `{capture: true}` y en `window` sí cuenta.
5. **El botón de la barra y el primer toque pueden coincidir** (el usuario toca
   «Sonido» con el sonido ya activado): por eso `primerGesto()` solo llama a
   `activa()` si el sonido **no** está sonando ya.

## Qué falta

1. **No se ha oído.** Falta probar en el móvil: si el gain es correcto, si la
   reverb no satura en un altavoz pequeño y si el botón no tapa la barra.
2. Falta un control de **volumen visible** (el hub lo puede enlazar con
   `volumen(v)`, y `estado()` le da el valor actual).
3. El "golpeo" al cambiar de estancia quedó fuera: se puede hacer con un golpe de
   ruido filtrado sobre el pad.
4. **La reverb no está lista para aislar el exterior**: hoy el viento también
   entra en la reverb, así que dentro de la casa se oye un poco de la calle. Se
   podría mandar el viento solo al maestro cuando se está dentro.
5. No hay modo «silencio» por falta de contexto: si la visita es de noche y el
   usuario no quiere ruido, el botón de la barra es la única puerta.
