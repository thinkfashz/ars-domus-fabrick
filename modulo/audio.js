/* Ars Domus FABRICK · modulo/audio.js
   -------------------------------------------------------------------------------
   Música y ambiente sonoros, TODO sintetizado con WebAudio.

   Reglas:
   · Ni un archivo de audio: no hay red y no hay sitio donde alojarlo. El pad, el
     arpegio, el viento y la reverberación se generan con osciladores y ruido.
   · El navegador no deja sonar nada sin un gesto del usuario: hasta que se toca
     "Activar sonido", el grafo ni se crea.
   · Cambiar el volumen no recrea el grafo (un solo GainNode maestro).
   · Es una visita, no una discoteca: todo va bajo.

   El ambiente (viento) sube un poco cuando la cámara está fuera y baja dentro.
*/
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

var CLAVE = 'ad-audio';
var EST = {ctx:null, maestro:null, pad:null, arp:null, viento:null, ruido:null,
           on:false, vol:0.5, timer:null, paso:0, creado:false};

/* ── El grafo ──────────────────────────────────────────────────────────────── */
function crea(){
  if(EST.creado) return true;
  var AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return false;
  var ctx = new AC();
  EST.ctx = ctx;

  var maestro = ctx.createGain();
  maestro.gain.value = 0;
  maestro.connect(ctx.destination);
  EST.maestro = maestro;

  /* Reverberación corta: un impulso de ruido con caída exponencial. */
  var rev = ctx.createConvolver();
  var dur = 1.9, imp = ctx.createBuffer(2, Math.floor(ctx.sampleRate*dur), ctx.sampleRate);
  for(var c = 0; c < 2; c++){
    var d = imp.getChannelData(c);
    for(var i = 0; i < d.length; i++){
      d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/d.length, 2.6);
    }
  }
  rev.buffer = imp;
  var envioRev = ctx.createGain(); envioRev.gain.value = 0.26;
  rev.connect(maestro); envioRev.connect(rev);

  /* Pad: tres osciladores con detune y un LFO lento que los abre y los cierra. */
  var pad = ctx.createGain(); pad.gain.value = 0.0;
  var filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass';
  filtro.frequency.value = 900; filtro.Q.value = 0.7;
  pad.connect(filtro); filtro.connect(maestro); filtro.connect(envioRev);
  var lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 0.045; lfoG.gain.value = 380;
  lfo.connect(lfoG); lfoG.connect(filtro.frequency); lfo.start();
  /* Acorde de la casa: Re menor add9, spreadido. */
  [[146.83, 0.9], [220.0, 0.8], [261.63, 0.55], [329.63, 0.45], [493.88, 0.22]].forEach(function(n){
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = n[0]; o.detune.value = (Math.random()-0.5)*9;
    g.gain.value = 0.16*n[1];
    o.connect(g); g.connect(pad); o.start();
  });
  EST.pad = pad;

  /* Viento: ruido rosa filtrado, con su propio LFO de amplitud. */
  var seg = Math.floor(ctx.sampleRate*3);
  var buf = ctx.createBuffer(1, seg, ctx.sampleRate);
  var dd = buf.getChannelData(0), b0=0,b1=0,b2=0;
  for(var j=0;j<seg;j++){
    var w = Math.random()*2 - 1;
    b0 = 0.99765*b0 + w*0.0990460;
    b1 = 0.96300*b1 + w*0.2965164;
    b2 = 0.57000*b2 + w*1.0526913;
    dd[j] = (b0+b1+b2+w*0.1848)*0.09;
  }
  var fuente = ctx.createBufferSource(); fuente.buffer = buf; fuente.loop = true;
  var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
  var viento = ctx.createGain(); viento.gain.value = 0.0;
  fuente.connect(bp); bp.connect(viento); viento.connect(maestro); viento.connect(envioRev);
  var wlfo = ctx.createOscillator(), wlfoG = ctx.createGain();
  wlfo.frequency.value = 0.07; wlfoG.gain.value = 0.35;
  wlfo.connect(wlfoG); wlfoG.connect(viento.gain); wlfo.start();
  fuente.start();
  EST.viento = viento;

  EST.creado = true;
  return true;
}

/* ── Arpegio: una nota cada dos pulsos, con reverberación ─────────────────── */
var ESCALA = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0];
function toca(){
  var ctx = EST.ctx;
  if(!ctx || !EST.on) return;
  var o = ctx.createOscillator(), g = ctx.createGain(), rev = ctx.createGain();
  var n = ESCALA[EST.paso % ESCALA.length];
  EST.paso += 2;
  o.type = 'triangle'; o.frequency.value = n;
  var t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.055, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 2.4);
  rev.gain.value = 0.5;
  o.connect(g); g.connect(EST.maestro); g.connect(rev);
  o.start(t); o.stop(t + 2.6);
}

/* ── Encender y apagar ────────────────────────────────────────────────────── */
function activa(){
  if(!crea()) return false;
  var ctx = EST.ctx;
  if(ctx.state === 'suspended') ctx.resume();
  EST.on = true;
  var t = ctx.currentTime;
  EST.maestro.gain.cancelScheduledValues(t);
  EST.maestro.gain.setValueAtTime(EST.maestro.gain.value, t);
  EST.maestro.gain.linearRampToValueAtTime(EST.vol, t + 1.6);
  EST.pad.gain.cancelScheduledValues(t);
  EST.pad.gain.setValueAtTime(EST.pad.gain.value, t);
  EST.pad.gain.linearRampToValueAtTime(0.5, t + 3.2);
  if(!EST.timer) EST.timer = setInterval(toca, 2600);
  try{ localStorage.setItem(CLAVE, '1'); }catch(e){}
  if(AD.boton) AD.refrescaBarra && AD.refrescaBarra();
  return true;
}
function silencia(){
  if(!EST.creado) return;
  EST.on = false;
  var t = EST.ctx.currentTime;
  EST.maestro.gain.cancelScheduledValues(t);
  EST.maestro.gain.setValueAtTime(EST.maestro.gain.value, t);
  EST.maestro.gain.linearRampToValueAtTime(0, t + 0.8);
  EST.pad.gain.cancelScheduledValues(t);
  EST.pad.gain.linearRampToValueAtTime(0, t + 0.8);
  if(EST.timer){ clearInterval(EST.timer); EST.timer = null; }
  try{ localStorage.setItem(CLAVE, '0'); }catch(e){}
  if(AD.refrescaBarra) AD.refrescaBarra();
}

/* ── El ambiente sube fuera y baja dentro ─────────────────────────────────── */
function ambiente(exterior){
  if(!EST.creado || !EST.on) return;
  var v = exterior ? 0.5 : 0.16;
  var t = EST.ctx.currentTime;
  EST.viento.gain.cancelScheduledValues(t);
  EST.viento.gain.setValueAtTime(EST.viento.gain.value, t);
  EST.viento.gain.linearRampToValueAtTime(v, t + 1.5);
}

/* ── API ───────────────────────────────────────────────────────────────────── */
AD.audio = {
  activa: activa,
  silencia: silencia,
  alterna: function(){ if(EST.on){ silencia(); return false; } activa(); return true; },
  volumen: function(v){
    EST.vol = Math.max(0, Math.min(1, v));
    if(EST.creado && EST.on){
      var t = EST.ctx.currentTime;
      EST.maestro.gain.cancelScheduledValues(t);
      EST.maestro.gain.setValueAtTime(EST.maestro.gain.value, t);
      EST.maestro.gain.linearRampToValueAtTime(EST.vol, t + 0.3);
    }
    return EST.vol;
  },
  suena: function(){ return EST.on; },
  ambiente: ambiente
};

/* ── Arranque ──────────────────────────────────────────────────────────────── */
function arranca(){
  var a = AD.api;
  if(!a || !a.pie) return;
  var fuera = function(){
    if(a.pie && a.pie.activo){
      /* en el paseo, dentro de la casa el viento baja */
      var e = a.estanciaActiva ? a.estanciaActiva() : null;
      return !e || !!e.fuera;
    }
    return true;
  };
  if(AD.onFrame) AD.onFrame(function(){ ambiente(fuera()); });
  /* Si el usuario ya había dado permiso, se respeta… pero el navegador puede
     haber bloqueado el audio en esta carga: se deja el botón como puerta. */
  try{
    if(localStorage.getItem(CLAVE) === '1'){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Activar sonido';
      b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:60;min-height:44px;padding:0 16px;'+
        'background:#0b0f0c;color:#c9ef63;border:1px solid rgba(201,239,99,.45);border-radius:4px;'+
        'font:600 11px/1 "IBM Plex Sans Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer';
      b.addEventListener('click', function(){ if(activa()) b.remove(); });
      document.body.appendChild(b);
    }
  }catch(e){}
}
if(AD.alListo) AD.alListo(function(){ setTimeout(arranca, 200); });
if(document.readyState === 'complete') setTimeout(arranca, 200);
else addEventListener('load', function(){ setTimeout(arranca, 200); });

})();
