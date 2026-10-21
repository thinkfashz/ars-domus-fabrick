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
           btn:null, listo:false, abierto:false, t0:0, relojTip:null,
           errores:[], gesto:false, ultimoScan:0, sinEscaneo:false};

function el(id){ return document.getElementById(id); }

/* ── Cuenta de texturas ───────────────────────────────────────────────────── */
/* Las texturas que pidió el visor ANTES de que existiera este módulo ya
   están en vuelo: se cuentan recorriendo la escena (una textura está lista
   cuando su imagen tiene complete !== false; los lienzos de canvas y las
   texturas de datos no tienen complete: cuentan como listas).
   El recorrido de la escena no es gratis (miles de mallas): se hace como
   mucho una vez por segundo, y se deja de hacer cuando ya no queda nada. */
var TEXTURAS = [];
function escanea(forzar){
  var a = AD.api;
  if(!a || !a.escena || !a.escena.traverse) return;
  if(EST.sinEscaneo && !forzar) return;      /* ya no queda nada por contar */
  var ahora = (new Date()).getTime();
  if(!forzar && (ahora - EST.ultimoScan) < 1000) return;
  EST.ultimoScan = ahora;
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
    }, onProgress, function(e){
      /* Una textura que falla tambien termina de cargar: si no, la barra se
         queda en 99 % hasta que salta el watchdog de los 12 s. */
      EST.cargado++;
      actualiza();
      if(onError) onError(e);
    });
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
   '#fab-carga.oculto{display:none!important}'+
   '#fab-carga{position:fixed;inset:0;z-index:120;display:grid;place-items:center;'+
   'background:radial-gradient(120% 90% at 50% 12%,#16211c 0%,#0a0f0c 58%,#050706 100%);'+
   'color:#e9ede2;font-family:"IBM Plex Sans Condensed",sans-serif;transition:opacity .55s ease}'+
   '#fab-carga.fuera{opacity:0;pointer-events:none}'+
   '#fab-carga .caja{width:min(440px,88vw);text-align:center;padding:0 18px}'+
   /* La marca: un plano de la casa (corte + hueco) con la linea de altura. */
   '#fab-carga .logo{width:92px;height:92px;margin:0 auto 18px;display:block}'+
   '#fab-carga .logo .casa{fill:none;stroke:#c9ef63;stroke-width:1.6;stroke-linejoin:round}'+
   '#fab-carga .logo .corte{fill:none;stroke:#7f8c7a;stroke-width:1;stroke-dasharray:3 3}'+
   '#fab-carga .logo .hito{fill:#c9ef63}'+
   '#fab-carga .marca{font:700 26px/1 "IBM Plex Sans Condensed",sans-serif;letter-spacing:.3em;'+
   'text-transform:uppercase;color:#f2f6ec;text-shadow:0 0 26px rgba(201,239,99,.28)}'+
   '#fab-carga .marca b{color:#c9ef63;font-weight:700}'+
   '#fab-carga .sub{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.34em;text-transform:uppercase;'+
   'color:#7f8c7a;margin-top:9px}'+
   '#fab-carga .linea{margin:16px auto 0;width:52px;height:1px;background:linear-gradient(90deg,transparent,#c9ef63,transparent)}'+
   '#fab-carga .pista{margin-top:26px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#5f6c5c;min-height:2.4em}'+
   '#fab-carga .riel{margin-top:22px;height:6px;background:rgba(233,237,226,.08);overflow:hidden;'+
   'border:1px solid rgba(233,237,226,.12);position:relative}'+
   '#fab-carga .riel i{display:block;height:100%;width:0%;'+
   'background:repeating-linear-gradient(90deg,#c9ef63 0 10px,rgba(201,239,99,.55) 10px 20px);'+
   'transition:width .35s ease;box-shadow:0 0 14px rgba(201,239,99,.45)}'+
   '#fab-carga .riel:after{content:"";position:absolute;inset:0;pointer-events:none;'+
   'background:repeating-linear-gradient(90deg,transparent 0 19px,rgba(7,11,10,.85) 19px 20px)}'+
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
   overlay: si no, un error se veria en negro.
   Y al revés: si el overlay ya se ha ido (la casa ya esta), el aviso se
   devuelve al #cargando del visor, que es el avisador de errores de verdad. */
function error(e){
  if(!EST.el) crea();
  var t = e && e.target && e.target !== window && (e.target.src || e.target.href);
  var msg = t ? 'No se pudo cargar ' + t
              : String((e && e.message) || 'Error desconocido') + ' — ' +
                String((e && e.filename) || '').split('/').pop() + ':' + ((e && e.lineno) || '');
  /* Un modulo que falla cada cuadro repite el mismo error: se guarda una vez
     y se listan pocos. Un aviso infinito llena la pantalla y no informa de mas. */
  if(EST.errores.indexOf(msg) < 0) EST.errores.push(msg);
  if(EST.errores.length > 5) EST.errores = EST.errores.slice(0, 5);
  /* Sin overlay delante (o ya retirado del DOM, o desvaneciéndose): el aviso
     va al #cargando, que es el avisador de errores de la casa. Un error que
     se escribe en una capa que ya no se ve, no se ha avisado de nada. */
  var caja = EST.el && EST.el.querySelector ? EST.el.querySelector('.caja') : null;
  var seVe = EST.el && EST.el.parentNode && !EST.el.classList.contains('fuera');
  if(!caja || !seVe){
    var viejo = el('cargando');
    if(viejo){
      viejo.hidden = false;
      viejo.innerHTML = '<span class="rotulo" style="max-width:60ch;text-align:center">' +
        EST.errores.map(function(m){ return String(m).replace(/</g, '&lt;'); }).join('<br>') + '</span>';
    }
    return;
  }
  /* En el overlay solo se apilan tres avisos: los siguientes se cuentan. */
  var ya = 0;
  try{ ya = caja.querySelectorAll('.fab-error').length; }catch(e2){ ya = 0; }
  if(ya < 3){
    var d = document.createElement('div');
    d.className = 'fab-error';
    d.style.cssText = 'margin-top:18px;padding:10px 12px;border:1px solid rgba(255,120,90,.5);'+
      'border-radius:4px;background:rgba(80,20,12,.45);color:#ffd9cd;font:500 11px/1.45 "IBM Plex Mono",monospace;'+
      'text-align:left;word-break:break-word';
    d.textContent = msg;
    caja.appendChild(d);
  }
  if(EST.pctTxt) EST.pctTxt.textContent = '100 %';
  if(EST.barra) EST.barra.style.width = '100%';
  /* Un error no es una espera: la puerta se ofrece ya, pero el aviso se queda
     en pantalla hasta que se entra. */
  listo();
}

function crea(){
  if(EST.el) return EST.el;
  css();
  addEventListener('error', error, true);
  var d = document.createElement('div');
  d.id = 'fab-carga';
  d.innerHTML =
   '<div class="caja">'+
     '<svg class="logo" viewBox="0 0 92 92" aria-label="Build House">'+
       '<path class="casa" d="M12 78V30L46 14l34 16v48z"/>'+
       '<path class="casa" d="M46 14v64M12 46h68"/>'+
       '<path class="corte" d="M6 52h80"/>'+
       '<rect class="casa" x="39" y="39" width="14" height="13"/>'+
       '<circle class="hito" cx="26" cy="52" r="2.6"/>'+
       '<circle class="hito" cx="66" cy="52" r="2.6"/>'+
     '</svg>'+
     '<div class="marca">Build<b> House</b></div>'+
     '<div class="sub">Recorrido 3D · maqueta navegable</div>'+
     '<div class="linea"></div>'+
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
  d.classList.add('oculto');
  if(!document.body || !document.body.appendChild) return d;   /* sin body: no hay nada que tapar */
  document.body.appendChild(d);
  EST.el = d;
  EST.barra = d.querySelector('.riel i');
  EST.pctTxt = d.querySelector('.cif');
  EST.tip = d.querySelector('.pista');
  EST.btn = d.querySelector('.entrar');
  EST.cuentaEl = d.querySelector('.cuenta');
  if(EST.btn) EST.btn.addEventListener('click', function(e){
    if(e && e.stopPropagation) e.stopPropagation();
    /* Este toque es el gesto: desbloquea el audio y pide pantalla completa. */
    EST.gesto = true;
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
  escanea(EST.ultimoScan === 0);            /* la primera vez, sin esperar */
  var total = EST.total + TEXTURAS.length;
  var cargado = EST.cargado + listas();
  var p = total > 0 ? cargado/total : (AD.listo ? 1 : 0);
  /* Sin texturas pendientes, el progreso es el real: no se inventa. */
  if(p < EST.pct) p = EST.pct;
  EST.pct = p;
  if(EST.barra) EST.barra.style.width = Math.round(p*100) + '%';
  if(EST.pctTxt) EST.pctTxt.textContent = Math.round(p*100) + ' %';
  /* Ya no hay nada que contar: no se recorre mas la escena (son miles de
     mallas y esto se nota en el movil). Las texturas que se pidan a partir de
     ahora las cuenta el parche del TextureLoader. */
  if(p >= 0.999) EST.sinEscaneo = true;
  if(p > 0.985) listo();
}

function progreso(p){
  if(!EST.el) crea();
  if(p > EST.pct){
    EST.pct = Math.max(0, Math.min(1, p));
    if(EST.barra) EST.barra.style.width = Math.round(EST.pct*100) + '%';
    if(EST.pctTxt) EST.pctTxt.textContent = Math.round(EST.pct*100) + ' %';
  }
  if(EST.pct >= 0.999) listo();
}

/* ── Listo ────────────────────────────────────────────────────────────────── */
function listo(){
  if(EST.listo) return;
  EST.listo = true;
  if(!EST.el) return;
  if(EST.barra) EST.barra.style.width = '100%';
  if(EST.pctTxt) EST.pctTxt.textContent = '100 %';
  if(EST.btn) EST.btn.classList.add('listo');
  EST.el.classList.add('puede-entrar');
  /* Si la carga fue rapida, la pantalla nunca se llego a ver: se entra ya.
     Una pantalla de carga que tapa una escena lista es una espera tonta. */
  if(EST.el && EST.el.classList.contains('oculto')){ setTimeout(function(){ entra(); }, 120); return; }
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
  /* El #cargando viejo (lo oculta visor.js) se apaga también... salvo que haya
     errores: entonces es el avisador de errores de la casa y se queda con el
     aviso a la vista. Un error que no se ve es un error que no se arregla. */
  var viejo = el('cargando');
  if(viejo){
    if(EST.errores.length){
      viejo.hidden = false;
      viejo.innerHTML = '<span class="rotulo" style="max-width:60ch;text-align:center">' +
        EST.errores.map(function(m){ return String(m).replace(/</g, '&lt;'); }).join('<br>') + '</span>';
    } else {
      viejo.hidden = true;
    }
  }
  if(EST.el) EST.el.classList.add('entrando');
  setTimeout(function(){
    if(d && d.parentNode) d.parentNode.removeChild(d);
    if(EST.relojTip){ clearInterval(EST.relojTip); EST.relojTip = null; }
  }, 700);
  /* Pantalla completa y sin scroll: en el móvil es lo que hace que se sienta
     una app y no una web. SOLO con gesto: pedirla sin que el usuario toque
     nada es una promesa rechazada y el navegador avisa por consola. */
  if(EST.gesto){
    try{
      if(document.documentElement.requestFullscreen && !document.fullscreenElement){
        var p = document.documentElement.requestFullscreen();
        if(p && p.catch) p.catch(function(){});
      }
    }catch(e){}
    try{ if(screen && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){}); }catch(e){}
  }
  /* El audio necesita un gesto, y este toque es el gesto: si el usuario lo habia
     dejado activado, se arranca aqui. El boton lo pone la barra de Fabrick,
     no un boton suelto que se le encima en el movil. */
  try{
    if(AD.audio && typeof AD.audio.suena === 'function' && !AD.audio.suena() &&
       typeof AD.audio.quiereSonido === 'function' && AD.audio.quiereSonido()){
      if(typeof AD.audio.activa === 'function') AD.audio.activa();
    }
  }catch(e){}
  if(AD.refrescaBarra) AD.refrescaBarra();
}

/* ── API ───────────────────────────────────────────────────────────────────── */
AD.carga = {progreso: progreso, listo: listo, entra: entra};

/* ── Arranque ──────────────────────────────────────────────────────────────── */
function arranca(){
  EST.t0 = Date.now();
  crea();
  /* Si a los 800 ms la casa ya esta, no se muestra la pantalla de carga:
     solo aparece cuando de verdad hay que esperar. */
  setTimeout(function(){
    if(!EST.abierto && !EST.listo && EST.el) EST.el.classList.remove('oculto');
  }, 800);
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
