/* Prueba del audio (modulo/audio.js) — WebAudio de mentira, sin navegador. */
const C = require(__dirname + '/carga.js');
const {AD, comprueba, fin, cargaModulo, avisaListo, cuadro, store} = C;

/* =====================================================================
   AudioContext de mentira: se apunta todo lo que se programa en los
   GainNode, para ver si hay saltos (chasquidos) o ramps (suave).
   ===================================================================== */
function Param(v){
  this._v = v || 0;
  this.eventos = [];
}
Object.defineProperty(Param.prototype, 'value', {
  get(){ return this._v; },
  set(x){ this._v = x; this.eventos.push({tipo:'SETO-DIRECTO', v:x}); }   /* un clic */
});
Param.prototype.setValueAtTime = function(v,t){ this._v = v; this.eventos.push({tipo:'set', v:v, t:t}); return this; };
Param.prototype.linearRampToValueAtTime = function(v,t){ this._v = v; this.eventos.push({tipo:'rampa', v:v, t:t}); return this; };
Param.prototype.exponentialRampToValueAtTime = function(v,t){ this._v = v; this.eventos.push({tipo:'exp', v:v, t:t}); return this; };
Param.prototype.cancelScheduledValues = function(t){ this.eventos.push({tipo:'cancel', t:t}); return this; };

let CTX = null;
function Nodo(tipo){
  this.type = tipo;
  this.conectadoA = null;
  this.connect = function(dest){ this.conectadoA = dest; return dest; };
  this.disconnect = function(){ return this; };
  this.start = function(){ this.tocando = true; };
  this.stop = function(){ this.tocando = false; };
}
function AC(){
  this.state = 'running';
  this.sampleRate = 48000;
  this.destination = new Nodo('destino');
  this.currentTime = 0;
  this.resume = function(){ this.state = 'running'; CTX.resumidas++; return Promise.resolve(); };
  this.resumidas = 0;
  this.creados = 0;
  this.nodos = [];
}
AC.prototype.createGain = function(){ this.creados++; var n = new Nodo('gain'); n.gain = new Param(0); this.nodos.push(n); return n; };
AC.prototype.createOscillator = function(){ this.creados++; var n = new Nodo('osc'); n.frequency = new Param(440); n.detune = new Param(0); n.type='sine'; this.nodos.push(n); return n; };
AC.prototype.createBufferSource = function(){ this.creados++; var n = new Nodo('fuente'); n.buffer = null; n.loop = false; this.nodos.push(n); return n; };
AC.prototype.createBiquadFilter = function(){ this.creados++; var n = new Nodo('filtro'); n.frequency = new Param(1000); n.Q = new Param(1); n.type='lowpass'; this.nodos.push(n); return n; };
AC.prototype.createConvolver = function(){ this.creados++; var n = new Nodo('reverb'); n.buffer = null; this.nodos.push(n); return n; };
AC.prototype.createBuffer = function(ch, len, sr){
  var b = {n:ch, len:len, sampleRate:sr, _d:[], getChannelData:function(i){ return this._d[i] || (this._d[i] = new Float32Array(len)); }};
  return b;
};
window.AudioContext = function(){ CTX = new AC(); return CTX; };

/* El gesto: el mock de la ventana no tiene addEventListener real, se lo ponemos */
const oyentes = {};
window.addEventListener = function(ev, fn, cap){
  (oyentes[ev] = oyentes[ev] || []).push({fn:fn, cap:!!cap});
};
window.removeEventListener = function(ev, fn){
  if(!oyentes[ev]) return;
  oyentes[ev] = oyentes[ev].filter(o=>o.fn !== fn);
};
global.addEventListener = window.addEventListener;

console.log('== AUDIO ==');
cargaModulo('audio');
avisaListo();

/* ── 1 · Antes de un gesto no hay grafo ni sonido ────────────────────────── */
comprueba('sin gesto no se crea el grafo', AD.audio.estado().creado === false, AD.audio.estado().creado);
comprueba('sin gesto no suena', AD.audio.suena() === false);
comprueba('no hay contexto de audio', CTX === null);

/* el gancho de cuadro se registra UNA vez */
const hooks0 = AD.hooks.length;
setTimeout(function(){
  /* ── 2 · El primer toque en la casa: si el usuario lo había dejado activo ── */
  store['ad-audio'] = '1';                       /* el usuario lo dejó activado antes */
  comprueba('quiereSonido() lo dice', AD.audio.quiereSonido() === true);
  comprueba('hay un listener de gesto', (oyentes['pointerdown']||[]).length === 1,
    JSON.stringify(Object.keys(oyentes)));
  const gest = oyentes['pointerdown'][0];
  comprueba('el listener va en fase de captura', gest.cap === true);
  gest.fn({});                                    /* el toque */
  comprueba('el primer toque arranca el audio', AD.audio.suena() === true);
  comprueba('el grafo se creó con el gesto', AD.audio.estado().creado === true);
  comprueba('el contexto está sonando', CTX && CTX.state === 'running');
  /* el listener se quita: solo el primer toque */
  comprueba('el listener de gesto se retira', (oyentes['pointerdown']||[]).length === 0);

  /* ── 3 · El botón de la barra de Fabrick: alterna() ────────────────────── */
  const estado0 = AD.audio.estado();
  const r1 = AD.audio.alterna();
  comprueba('alterna() apaga', r1 === false && AD.audio.suena() === false);
  const r2 = AD.audio.alterna();
  comprueba('alterna() vuelve a encender', r2 === true && AD.audio.suena() === true);
  comprueba('alterna() NO recrea el grafo', AD.audio.estado().creado === estado0.creado);

  /* ── 4 · El volumen no recrea el grafo y sube y baja sin chasquido ─────── */
  /* el módulo no expone el maestro: se comprueba por los efectos sobre el estado */
  const volAntes = AD.audio.volumen(0.8);
  comprueba('volumen() devuelve el valor', Math.abs(volAntes - 0.8) < 1e-9, volAntes);
  comprueba('el grafo sigue siendo el mismo', AD.audio.estado().creado === true);
  AD.audio.volumen(0.2);
  comprueba('el volumen baja', Math.abs(AD.audio.estado().vol - 0.2) < 1e-9);
  AD.audio.volumen(0.5);

  /* ── 5 · El ambiente sigue a la cámara, sin reprogramar cada cuadro ────── */
  AD.audio.ambiente(true);
  const v1 = AD.audio.estado().viento;
  comprueba('fuera el viento sube a 0,50', Math.abs(v1 - 0.5) < 1e-9, v1);
  for(let i=0;i<30;i++) AD.audio.ambiente(true);       /* 30 cuadros: no debe reprogramar */
  comprueba('el viento no se reprograma cada cuadro', AD.audio.estado().viento === 0.5);
  AD.audio.ambiente(false);
  comprueba('dentro el viento baja a 0,16', Math.abs(AD.audio.estado().viento - 0.16) < 1e-9,
    AD.audio.estado().viento);

  /* ── 6 · Ni un clic: en el maestro solo hay ramps ─────────────────────── */
  /* el maestro es el GainNode que está conectado al destino */
  const maestro = CTX.nodos.filter(n=>n.type==='gain' && n.conectadoA === CTX.destination)[0];
  comprueba('hay un GainNode maestro', !!maestro);
  if(maestro){
    const ev = maestro.gain.eventos;
    console.log('   eventos del gain maestro:', JSON.stringify(ev.map(e=>e.tipo+'='+Number(e.v).toFixed(3))));
    /* el único assignment directo admisible es el inicial (gain a 0 al crear el grafo) */
    const primeraRampa = ev.findIndex(e=>e.tipo==='rampa');
    const directos = ev.filter((e,i)=>e.tipo==='SETO-DIRECTO' && i > primeraRampa);
    comprueba('el gain maestro nunca se asigna de golpe (después de empezar)',
      directos.length === 0, JSON.stringify(directos));
    comprueba('el grafo nace con el gain a 0 (nada de ruido al crear)',
      ev[0].tipo === 'SETO-DIRECTO' && ev[0].v === 0, JSON.stringify(ev[0]));
    comprueba('cada encendido es una rampa',
      ev.filter(e=>e.tipo==='rampa').length >= 2, JSON.stringify(ev));
    /* el último evento al apagar es una rampa a 0 (no un salto) */
    AD.audio.alterna();                              /* apaga */
    const ev2 = maestro.gain.eventos;
    const ultima = ev2[ev2.length-1];
    console.log('   último evento tras apagar:', JSON.stringify(ultima));
    comprueba('al apagar, el gain baja con rampa a 0',
      ultima.tipo === 'rampa' && Math.abs(ultima.v) < 1e-9, JSON.stringify(ultima));
    /* y al volver a encender, rampa al volumen, sin salto */
    AD.audio.alterna();
    const ev3 = maestro.gain.eventos;
    const ult3 = ev3[ev3.length-1];
    comprueba('al encender, el gain sube con rampa',
      ult3.tipo === 'rampa' && Math.abs(ult3.v - AD.audio.estado().vol) < 1e-9, JSON.stringify(ult3));
    comprueba('el gain maestro nunca se asigna de golpe (todo el recorrido)',
      ev3.filter((e,i)=>e.tipo==='SETO-DIRECTO' && i > ev3.findIndex(x=>x.tipo==='rampa')).length === 0);
  }

  /* ── 7 · El gancho de cuadro se registró UNA vez ──────────────────────── */
  const hooksAudio = AD.hooks.length - hooks0;
  comprueba('un solo gancho de cuadro', hooksAudio === 1, hooksAudio);

  fin();
}, 350);
