/* Ars Domus FABRICK · modulo/carga.js
   -------------------------------------------------------------------------------
   Pantalla de carga estilo videojuego.

   Tres cosas que tienen que ser verdad:
   · El progreso es REAL: se cuentan las texturas que van entrando. Un 100 % de
     mentira enseña a no mirar la barra.
   · Hay una PUERTA DE ENTRADA: un toque. Sirve para el audio (el navegador lo
     exige), para pedir pantalla completa en el móvil y para que el primer toque
     no se pierda en un scroll.
   · NUNCA bloquea: a los 12 s entra igual, aunque el progreso no haya llegado.

   El módulo no puede tocar visor.js (que es del core), así que tapa el #cargando
   viejo con su propio overlay y lo esconde cuando entra.
*/
var AD = window.AD || (window.AD = {});
(function(){
'use strict';

var TIPS = [
  'La casa se midió en metros: un tabique son 12 cm y un muro exterior 45.',
  'El verde va al muro, nunca al piso: el contraste es lo que hace leer la casa.',
  'En un plano, los muros se cortan a 1,15 m. Sin corte, cada tabique tapa la Pieceza de al lado.',
  'Una puerta interior mide 85 × 205 cm. La manilla va a 1,00 m del suelo.',
  'El ICollectionero se ordena con el hueco de la puerta, no con el mueble.',
  'Con luz rasante se ven las texturas; con luz cenital, solo las formas.',
  'Una cocina bien hecha se recorre en un orden: lavaplatos, placa, horno y nevera.',
  'El zócalo es el que une dos ambientes: por eso se recorta contra los vanos.'
];

var EST = {cargado:0, total:0, pct:0, el:null, barra:null, pctTxt:null, tip:null,
           btn:null, listo:false, abierto:false, t0:0, relojTip:null};

function el(id){ return document.getElementById(id); }

/* ── Cuenta de texturas ───────────────────────────────────────────────────── */
/* Las texturas que pidió el visor ANTES de que existiera este módulo ya
   están en vuelo: se cuentan recorriendo la escena (una textura está lista
   cuando su imagen tiene complete !== false; los lienzos de canvas y las
   texturas de datos no tienen complete: cuentan como listas). */
var TEXTURAS = [];
function escanea(){
  var a = AD.api;
  if(!a || !a.escena || !a.escena.traverse) return;
  a.escena.traverse(function(o){
    var m = o.material; if(!m) return;
    var mats = Array.isArray(m) ? m : [m];
    for(var i=0;i<mats.length;i++){
      var mat = mats[i]; if(!mat) continue;
      for(var k in mat){
        var v = mat[k];
        if(v && v.isTexture && !v.__fabContada){ v.__fabContada = true; TEXTURAS.push(v); }
      }
    }
  });
}
function listas(){
  var n = 0;
  for(var i=0;i<TEXTURAS.length;i++){
    var img = TEXTURAS[i].image;
    if(!img || img.complete !== false) n++;
  }
  return n;
}
function cuentaTexturas(){
  if(!window.THREE || !THREE.TextureLoader || !THREE.TextureLoader.prototype) return;
  var proto = THREE.TextureLoader.prototype;
  if(proto._fabContado) return;
  proto._fabContado = true;
  var orig = proto.load;
  proto.load = function(url, onLoad, onProgress, onError){
    EST.total++;
    if(EST.el) actualiza();
    var t = orig.call(this, url, function(tex){
      EST.cargado++;
      actualiza();
      if(onLoad) onLoad(tex);
    }, onProgress, onError);
    if(t) t.__fabContada = true;              /* ya lo cuenta el parche */
    return t;
  };
}

/* ── Maqueta de la pantalla ───────────────────────────────────────────────── */
function css(){
  if(document.getElementById('fab-carga-css')) return;
  var s = document.createElement('style');
  s.id = 'fab-carga-css';
  s.textContent =
   '#fab-carga{position:fixed;inset:0;z-index:120;display:grid;place-items:center;'+
   'background:radial-gradient(120% 90% at 50% 12%,#16211c 0%,#0a0f0c 58%,#050706 100%);'+
   'color:#e9ede2;font-family:"IBM Plex Sans Condensed",sans-serif;transition:opacity .55s ease}'+
   '#fab-carga.fuera{opacity:0;pointer-events:none}'+
   '#fab-carga .caja{width:min(420px,86vw);text-align:center;padding:0 18px}'+
   '#fab-carga .marca{font-size:13px;letter-spacing:.42em;text-transform:uppercase;color:#c9ef63}'+
   '#fab-carga .sub{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#7f8c7a;margin-top:6px}'+
   '#fab-carga .pista{margin-top:26px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#5f6c5c;min-height:2.4em}'+
   '#fab-carga .riel{margin-top:20px;height:3px;background:rgba(233,237,226,.13);overflow:hidden}'+
   '#fab-carga .riel i{display:block;height:100%;width:0%;background:#c9ef63;transition:width .35s ease}'+
   '#fab-carga .cif{margin-top:9px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.18em;color:#7f8c7a}'+
   '#fab-carga .entrar{margin-top:26px;min-height:44px;padding:0 26px;background:transparent;'+
   'color:#0a0f0c;background:#c9ef63;border:0;border-radius:3px;cursor:pointer;'+
   'display:inline-flex;align-items:center;justify-content:center;gap:10px;'+
   'font:700 11px/1 "IBM Plex Sans Condensed",sans-serif;letter-spacing:.2em;text-transform:uppercase;'+
   'opacity:0;pointer-events:none;transition:opacity .3s ease,transform .15s ease}'+
   '#fab-carga .entrar svg{width:22px;height:22px;flex:0 0 22px}'+
   '#fab-carga .entrar.listo{opacity:1;pointer-events:auto}'+
   '#fab-carga .entrar:active{transform:scale(.96)}'+
   '#fab-carga .cuenta{margin-top:10px;min-height:1.2em;font:500 10px/1.2 "IBM Plex Mono",monospace;'+
   'letter-spacing:.16em;text-transform:uppercase;color:#5f6c5c}'+
   '@media (prefers-reduced-motion:reduce){#fab-carga .riel i{transition:none}#fab-carga{transition:none}}';
  document.head.appendChild(s);
}

/* El #cargando del visor tambien avisa de los errores de carga (window.onerror
   escribe ahi). Como nosotros lo tapamos, hay que replicar el aviso en nuestro
   overlay: si no, un error se veria en negro. */
function error(e){
  if(!EST.el) crea();
  var t = e && e.target && e.target !== window && (e.target.src || e.target.href);
  var msg = t ? 'No se pudo cargar ' + t
              : String((e && e.message) || 'Error desconocido') + ' — ' +
                String((e && e.filename) || '').split('/').pop() + ':' + ((e && e.lineno) || '');
  var d = document.createElement('div');
  d.style.cssText = 'margin-top:18px;padding:10px 12px;border:1px solid rgba(255,120,90,.5);'+
    'border-radius:4px;background:rgba(80,20,12,.45);color:#ffd9cd;font:500 11px/1.45 "IBM Plex Mono",monospace;'+
    'text-align:left;word-break:break-word';
  d.textContent = msg;
  EST.el.querySelector('.caja').appendChild(d);
  EST.listo = true;
  if(EST.btn) EST.btn.classList.add('listo');
  EST.pctTxt.textContent = '100 %';
  EST.barra.style.width = '100%';
}

function crea(){
  if(EST.el) return EST.el;
  css();
  addEventListener('error', error, true);
  var d = document.createElement('div');
  d.id = 'fab-carga';
  d.innerHTML =
   '<div class="caja">'+
     '<div class="marca">Ars Domus</div>'+
     '<div class="sub">Fabrick · maqueta navegable</div>'+
     '<div class="pista"></div>'+
     '<div class="riel"><i></i></div>'+
     '<div class="cif">0 %</div>'+
     '<button class="entrar" type="button">'+
       '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">'+
         '<path d="M4 20V5.5L12 3l8 2.5V20" stroke-linejoin="round"/>'+
         '<path d="M12 3v17" stroke-linecap="round"/>'+
         '<circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none"/>'+
         '<circle cx="14" cy="12" r=".9" fill="currentColor" stroke="none"/></svg>'+
       '<span>Tocá para entrar</span></button>'+
     '<div class="cuenta"></div>'+
   '</div>';
  document.body.appendChild(d);
  EST.el = d;
  EST.barra = d.querySelector('.riel i');
  EST.pctTxt = d.querySelector('.cif');
  EST.tip = d.querySelector('.pista');
  EST.btn = d.querySelector('.entrar');
  EST.cuentaEl = d.querySelector('.cuenta');
  EST.btn.addEventListener('click', function(e){
    e.stopPropagation();
    /* Este toque es el gesto: desbloquea el audio y pide pantalla completa. */
    EST.visto = true;
    if(EST.cuentaTimer){ clearInterval(EST.cuentaTimer); EST.cuentaTimer = null; }
    if(EST.cuentaEl) EST.cuentaEl.textContent = '';
    try{ if(AD.audio && AD.audio.activa) AD.audio.activa(); }catch(err){}
    pidePantalla();
    entra();
  });
  d.addEventListener('pointerdown', function(e){
    if(e.target === EST.btn || (EST.btn && EST.btn.contains && EST.btn.contains(e.target))) return;
    if(EST.listo) entra();
  });
  cuentaTexturas();
  rotates();
  return d;
}

function rotates(){
  if(EST.relojTip) return;
  var reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var i = 0;
  if(reducir){
    if(EST.tip) EST.tip.textContent = TIPS[0];
    return;                                  /* sin rotación si no hay movimiento */
  }
  EST.relojTip = setInterval(function(){
    if(!EST.tip) return;
    EST.tip.textContent = TIPS[i % TIPS.length];
    i++;
  }, 3400);
}

/* Pantalla completa en el móvil: solo con puntero grueso y pantalla pequeña. */
function pidePantalla(){
  try{
    var fino = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1000;
    if(!fino) return;
    var d = document.documentElement;
    if(d.requestFullscreen){
      var p;
      try{ p = d.requestFullscreen({navigationUI:'hide'}); }
      catch(e){ p = d.requestFullscreen(); }
      if(p && p.catch) p.catch(function(){});
    }else if(d.webkitRequestFullscreen){
      d.webkitRequestFullscreen();
    }
    if(screen && screen.orientation && screen.orientation.lock){
      var q = screen.orientation.lock('landscape');
      if(q && q.catch) q.catch(function(){});
    }
  }catch(e){}
}

/* ── Progreso ─────────────────────────────────────────────────────────────── */
function actualiza(){
  if(!EST.el) return;
  escanea();
  var total = EST.total + TEXTURAS.length;
  var cargado = EST.cargado + listas();
  var p = total > 0 ? cargado/total : (AD.listo ? 1 : 0);
  /* Sin texturas pendientes, el progreso es el real: no se inventa. */
  if(p < EST.pct) p = EST.pct;
  EST.pct = p;
  EST.barra.style.width = Math.round(p*100) + '%';
  EST.pctTxt.textContent = Math.round(p*100) + ' %';
  if(p > 0.985) listo();
}

function progreso(p){
  if(!EST.el) crea();
  if(p > EST.pct){
    EST.pct = Math.max(0, Math.min(1, p));
    EST.barra.style.width = Math.round(EST.pct*100) + '%';
    EST.pctTxt.textContent = Math.round(EST.pct*100) + ' %';
  }
  if(EST.pct >= 0.999) listo();
}

/* ── Listo ────────────────────────────────────────────────────────────────── */
function listo(){
  if(EST.listo) return;
  EST.listo = true;
  if(!EST.el) return;
  EST.barra.style.width = '100%';
  EST.pctTxt.textContent = '100 %';
  EST.btn.classList.add('listo');
  if(EST.el) EST.el.classList.add('puede-entrar');
  /* La puerta se ofrece sola a los 7 s: nadie debe esperar por un botón,
     pero el que quiera tocar la puerta, toca. */
  var reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reducir){ setTimeout(function(){ if(!EST.abierto) entra(); }, 1200); return; }
  EST.n = 7;
  if(EST.cuentaEl) EST.cuentaEl.textContent = 'Entra solo en 7 s';
  EST.cuentaTimer = setInterval(function(){
    EST.n--;
    if(EST.n <= 0){
      clearInterval(EST.cuentaTimer); EST.cuentaTimer = null;
      if(!EST.abierto) entra();
      return;
    }
    if(EST.cuentaEl) EST.cuentaEl.textContent = 'Entra solo en ' + EST.n + ' s';
  }, 1000);
}

/* ── Entrar ───────────────────────────────────────────────────────────────── */
function entra(){
  if(EST.abierto) return;
  EST.abierto = true;
  var d = EST.el;
  if(d) d.classList.add('fuera');
  /* El #cargando viejo (lo oculta visor.js) se apaga también. */
  var viejo = el('cargando');
  if(viejo) viejo.hidden = true;
  if(EST.el) EST.el.classList.add('entrando');
  setTimeout(function(){
    if(d && d.parentNode) d.parentNode.removeChild(d);
    if(EST.relojTip){ clearInterval(EST.relojTip); EST.relojTip = null; }
  }, 700);
  /* Pantalla completa y sin scroll: en el móvil es lo que hace que se sienta
     una app y no una web. */
  try{
    if(document.documentElement.requestFullscreen && !document.fullscreenElement){
      var p = document.documentElement.requestFullscreen();
      if(p && p.catch) p.catch(function(){});
    }
  }catch(e){}
  try{ if(screen && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){}); }catch(e){}
  /* El audio necesita un gesto: este toque es el gesto. */
  if(AD.audio && !AD.audio.suena()){
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Activar sonido';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:60;min-height:44px;padding:0 16px;'+
      'background:rgba(11,15,12,.85);color:#c9ef63;border:1px solid rgba(201,239,99,.45);border-radius:4px;'+
      'font:600 11px/1 "IBM Plex Sans Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer';
    b.addEventListener('click', function(){ if(AD.audio.activa()) b.remove(); });
    document.body.appendChild(b);
  }
  if(AD.refrescaBarra) AD.refrescaBarra();
}

/* ── API ───────────────────────────────────────────────────────────────────── */
AD.carga = {progreso: progreso, listo: listo, entra: entra};

/* ── Arranque ──────────────────────────────────────────────────────────────── */
function arranca(){
  EST.t0 = Date.now();
  crea();
  /* El reloj de la carga: cada 300 ms se mira qué falta por llegar. */
  if(!EST.reloj) EST.reloj = setInterval(function(){
    if(EST.abierto){ clearInterval(EST.reloj); EST.reloj = null; return; }
    actualiza();
  }, 300);
  /* El watchdog: a los 12 s entra igual. El visor nunca se queda en negro. */
  setTimeout(function(){ if(!EST.abierto){ progreso(1); listo(); entra(); } }, 12000);
  /* Cuando el core termina, se vuelve a mirar: si no queda nada por
     cargar, la barra se completa sola (el progreso no se inventa). */
  if(AD.alListo) AD.alListo(function(){ setTimeout(function(){ actualiza(); }, 350); });
}
if(document.readyState === 'loading') addEventListener('DOMContentLoaded', arranca);
else arranca();

})();
