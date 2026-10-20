# Memoria · E — Música y ambiente

> El agente E fue interrupted por reinicios repetidos del entorno. El coordinator
> implementó el módulo siguiendo el brief (`memoria/BRIEFS.md`, sección E).

## Qué entregó

`modulo/audio.js` (8,8 KB). API: `AD.audio = {activa(), silencia(), alterna(), volumen(v), suena(), ambiente(exterior)}`.

## Decisiones

| Decisión | Por qué |
|---|---|
| **Todo sintetizado** (osciladores, ruido rosa, convolver con impulso generado) | Ni un mp3: no hay red, no hay sitio donde alojarlo y el service worker tendría que cachear un binario de más. |
| Reverb con `ConvolverNode` e impulso de **ruido con caída exponencial** | Un impulso de 1,9 s generado al vuelo suena a sala pequeña, que es lo que es una casa. |
| **Acorde fijo** (Re menor add9) con LFO que abre el filtro a 380 Hz cada 22 s | Suena vivo sin melodía: una melodía fija cansa en un recorrido largo. |
| **Arpegio cada 2,6 s** y muy bajo (0,055) | Da el pulso sin robar atención a la arquitectura. |
| **Viento** de ruido rosa filtrado en banda | Fuera se oye; dentro baja a 0,16. El ambiente sigue a la cámara. |
| **Botón "Activar sonido"** propio, no autoplay | El navegador bloquea el audio sin gesto del usuario. El botón aparece si el usuario ya lo había activado antes (`localStorage`), porque entonces ya knows lo que es. |
| Un solo **GainNode maestro** | Cambiar el volumen no recrea el grafo (recrearlo produce un chasquido y pierde la posición de la reverb). |
| Las rampas de gain usan `linearRampToValueAtTime` | Un salto de 0 a 0,5 en 1 ms se oye como clic. |

## Contrato

- `AD.alListo(fn)` para arrancar cuando el visor esté listo.
- `AD.onFrame(fn)` solo para el ambiente (dentro/fuera), no para el audio: el
  grafo de WebAudio es independiente del frame rate.

## Qué falta

1. **No se ha oído.** Falta probar en el móvil: si el gain es correcto, si la
   reverb no satura en un altavoz pequeño y si el botón no tapa la barra.
2. Falta un control de **volumen visible** (el hub lo puede enlazar con `volumen(v)`).
3. El "golpeo" al cambiar de estancia quedó fuera: se puede hacer con un golpe de
   ruido filtrado sobre el pad.
