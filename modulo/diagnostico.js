/* ============================================================================
   diagnostico.js — el parte de guerra del visor
   ----------------------------------------------------------------------------
   Este modulo se carga ANTES que nada (antes de three.js, de la casa y del
   visor) por una razon: si algo revienta al cargar, tiene que quedar escrito.

   No depende de nadie. Si el visor no arranca, el parte sigue en pie y dice
   por que: version que se esta sirviendo, si hay WebGL, que modulos llegaron
   y el ultimo error con su archivo y su linea.

   Piezas:
     AD.fallos   los errores, en orden (los 12 ultimos)
     AD.avisa()  un aviso visible en pantalla (no en la consola del escritorio)
     AD.parte()  el objeto con el estado, para que lo lea cualquier modulo
     AD.parteVer() abre el panel a mano

   El chip vive arriba a la derecha. Con todo bien se aparta solo; con un
   error se queda con el numero en rojo. Doble toque en el chip = panel.
   Tambien se abre con ?diag=1 en la URL.
   ========================================================================== */
(function(){
  'use strict';

  var AD = window.AD || (window.AD = {});
  AD.fallos = AD.fallos || [];
  AD.avisos = AD.avisos || [];

  /* La version sale de la propia URL del script (el build la inyecta). Asi el
     parte dice lo que de verdad se esta sirviendo, no lo que deberia. */
  AD.versión = AD.versión || (function(){
    try{
      var s = (document.currentScript && document.currentScript.src) || '';
      var m = /[?&]v=([^&]+)/.exec(s);
      if(m) return m[1];
      var t = document.querySelector('script[src*="visor.js"]');
      if(t){ var n = /[?&]v=([^&]+)/.exec(t.src); if(n) return n[1]; }
    }catch(e){}
    return '?';
  })();

  var MODULOS = ['plano','camaras','hub','audio','carga','paleta','luz','cctv',
                 'recorrido','exterior','cocina','fabrick'];

  function recorta(s, n){
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function anota(msg, url, linea, tipo){
    var f = {msg: recorta(msg, 240), url: String(url || '').split('/').pop(),
             linea: linea || 0, tipo: tipo || 'error', hora: Date.now()};
    /* El mismo error repetido en bucle no puede llenar la lista. */
    var ult = AD.fallos[AD.fallos.length - 1];
    if(ult && ult.msg === f.msg && ult.url === f.url && ult.linea === f.linea) return;
    AD.fallos.push(f);
    if(AD.fallos.length > 12) AD.fallos.shift();
    pinta(true);
  }
  AD.anota = anota;

  /* ── Captura temprana ─────────────────────────────────────────────────── */
  window.addEventListener('error', function(e){
    if(e && e.message){
      anota(e.message, e.filename, e.lineno, 'error');
    }else if(e && e.target && e.target.tagName){
      var el = e.target;
      anota('No cargó ' + el.tagName.toLowerCase() + ': ' + (el.src || el.href || el.id || ''),
            '', 0, 'recurso');
    }
  }, true);

  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    anota('Promesa rechazada: ' + ((r && (r.message || r)) || 'sin motivo'), '', 0, 'promesa');
  });

  /* ── El parte ─────────────────────────────────────────────────────────── */
  function hayWebGL(){
    try{
      var c = document.createElement('canvas');
      var g = c.getContext('webgl2') || c.getContext('webgl') ||
              c.getContext('experimental-webgl');
      return !!(g && typeof g.getParameter === 'function');
    }catch(e){ return false; }
  }

  AD.parte = function(){
    var mods = {}, faltan = [];
    for(var i = 0; i < MODULOS.length; i++){
      var k = MODULOS[i], hay = !!AD[k];
      mods[k] = hay;
      if(!hay) faltan.push(k);
    }
    var m = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
    return {
      version: AD.versión,
      ver: (typeof AD.VERSION === 'string' ? AD.VERSION : null),
      webgl: hayWebGL(),
      api: !!AD.api,
      listo: !!AD.listo,
      modulos: mods,
      faltan: faltan,
      fallos: AD.fallos.slice(),
      movil: m,
      pantalla: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
      dpr: window.devicePixelRatio || 1,
      navegador: recorta(navigator.userAgent, 90)
    };
  };

  /* ── El aviso en pantalla ─────────────────────────────────────────────── */
  var cajaAviso = null, relojAviso = 0;
  AD.avisa = function(texto, tipo){
    if(!document.body) return;
    if(!cajaAviso){
      cajaAviso = document.createElement('div');
      cajaAviso.id = 'diag-aviso';
      cajaAviso.setAttribute('role', 'status');
      cajaAviso.setAttribute('aria-live', 'polite');
      document.body.appendChild(cajaAviso);
    }
    cajaAviso.textContent = recorta(texto, 180);
    cajaAviso.setAttribute('data-tipo', tipo || 'info');
    cajaAviso.classList.add('on');
    clearTimeout(relojAviso);
    relojAviso = setTimeout(function(){ cajaAviso.classList.remove('on'); }, 5200);
  };

  /* ── Estilo ───────────────────────────────────────────────────────────── */
  function css(){
    if(document.getElementById('diag-css')) return;
    var cab = document.head || document.documentElement;
    if(!cab) return;
    var s = document.createElement('style');
    s.id = 'diag-css';
    s.textContent =
      '#diag-chip{position:fixed; z-index:90; top:calc(10px + env(safe-area-inset-top));' +
        'right:10px; min-width:30px; height:30px; padding:0 8px; display:flex;' +
        'align-items:center; justify-content:center; gap:5px; border:1px solid var(--line);' +
        'border-radius:15px; background:color-mix(in srgb, var(--surface) 88%, transparent);' +
        'color:var(--muted); font:500 11px/1 "IBM Plex Mono",monospace; cursor:pointer;' +
        'backdrop-filter:blur(8px); opacity:.55; transition:opacity .3s,color .3s}' +
      '#diag-chip:hover,#diag-chip:focus-visible{opacity:1}' +
      '#diag-chip .p{width:7px; height:7px; border-radius:50%; background:#4a9; flex:0 0 7px}' +
      '#diag-chip[data-estado="mal"]{color:#e0635a; border-color:#e0635a88; opacity:1}' +
      '#diag-chip[data-estado="mal"] .p{background:#e0635a}' +
      '#diag-chip[data-estado="duda"]{color:#d8a13a; opacity:1}' +
      '#diag-chip[data-estado="duda"] .p{background:#d8a13a}' +
      '#diag-chip.aparte{opacity:0; pointer-events:none}' +
      '#diag-panel{position:fixed; z-index:91; inset:0; background:rgba(8,10,7,.62);' +
        'backdrop-filter:blur(3px); display:none; padding:16px; overflow:auto;' +
        'font:400 12px/1.5 "IBM Plex Mono",monospace; color:var(--ink)}' +
      '#diag-panel.on{display:block}' +
      '#diag-panel .caja{max-width:620px; margin:6vh auto; background:var(--surface);' +
        'border:1px solid var(--line); border-radius:14px; box-shadow:var(--shadow);' +
        'padding:16px 16px 12px}' +
      '#diag-panel h2{margin:0 0 2px; font:600 15px/1.2 "IBM Plex Sans Condensed",sans-serif;' +
        'letter-spacing:.02em}' +
      '#diag-panel .sub{color:var(--muted); margin-bottom:12px; font-size:11px}' +
      '#diag-panel table{border-collapse:collapse; width:100%; margin:0 0 10px}' +
      '#diag-panel td{padding:3px 0; vertical-align:top; border-bottom:1px solid var(--line-soft)}' +
      '#diag-panel td:first-child{color:var(--muted); width:110px; white-space:nowrap}' +
      '#diag-panel .ok{color:#3f9a6a} #diag-panel .no{color:#e0635a; font-weight:600}' +
      '#diag-panel .mal{color:#e0635a; word-break:break-word; padding:4px 0;' +
        'border-bottom:1px solid var(--line-soft)}' +
      '#diag-panel .mal b{font-weight:600} #diag-panel .mal i{color:var(--muted); font-style:normal}' +
      '#diag-panel .pie{display:flex; gap:8px; flex-wrap:wrap; margin-top:10px}' +
      '#diag-panel button{font:500 12px/1 "IBM Plex Sans",sans-serif; padding:10px 14px;' +
        'min-height:40px; border-radius:9px; border:1px solid var(--line);' +
        'background:var(--surface-2); color:var(--ink); cursor:pointer}' +
      '#diag-panel button.pri{background:var(--accent); color:var(--accent-ink); border-color:transparent}' +
      '@media(max-width:520px){#diag-panel{padding:8px}#diag-panel .caja{margin:2vh auto; padding:12px}' +
        '#diag-panel td:first-child{width:86px}}' +
      '#diag-aviso{position:fixed; z-index:92; left:50%; bottom:calc(96px + env(safe-area-inset-bottom));' +
        'transform:translate(-50%,14px); max-width:min(92vw,460px); padding:11px 15px;' +
        'border-radius:11px; background:#1c211a; color:#eef1e9; border:1px solid #39412f;' +
        'font:500 12.5px/1.4 "IBM Plex Sans",sans-serif; box-shadow:0 10px 30px rgba(0,0,0,.45);' +
        'opacity:0; pointer-events:none; transition:opacity .22s,transform .22s}' +
      '#diag-aviso.on{opacity:1; transform:translate(-50%,0)}' +
      '#diag-aviso[data-tipo="mal"]{border-color:#e0635a; background:#2a1614}' +
      '#diag-aviso[data-tipo="bien"]{border-color:#3f9a6a}';
    cab.appendChild(s);
  }

  /* ── El chip y el panel ───────────────────────────────────────────────── */
  var chip = null, panel = null;

  function pinta(conFallo){
    try{
    if(!document.body) return;
    css();
    if(!chip){
      chip = document.createElement('button');
      chip.id = 'diag-chip';
      chip.type = 'button';
      chip.title = 'Estado del visor';
      chip.setAttribute('aria-label', 'Estado del visor');
      chip.innerHTML = '<i class="p"></i><span>v' + recorta(AD.versión, 6) + '</span>';
      chip.addEventListener('click', function(){ panelAbierto() ? panelCierra() : panelAbre(); });
      (document.body).appendChild(chip);
      /* Con todo bien, el chip se aparta a los 7 s: no estorba. Con cualquier
         fallo, se queda. */
      setTimeout(function(){
        if(!AD.fallos.length && chip && !panelAbierto()) chip.classList.add('aparte');
      }, 7000);
    }
    var estado = 'bien';
    if(AD.fallos.length) estado = 'mal';
    else if(!AD.api || !hayWebGL()) estado = 'duda';
    chip.setAttribute('data-estado', estado);
    var n = AD.fallos.length;
    chip.querySelector('span').textContent = n ? (n + ' fallo' + (n > 1 ? 's' : '')) : ('v' + recorta(AD.versión, 6));
    if(estado !== 'bien') chip.classList.remove('aparte');
    if(conFallo) anuncia();
    if(panelAbierto()) pintaPanel();
    }catch(e){ /* el parte no puede tumbar la app que esta diagnosticando */ }
  }

  function anuncia(){
    if(!AD.fallos.length) return;
    var f = AD.fallos[AD.fallos.length - 1];
    AD.avisa('Fallo: ' + f.msg + (f.url ? ' — ' + f.url + ':' + f.linea : '') +
             ' · toca el chip de arriba para ver el parte', 'mal');
  }

  function fila(k, v, malo){
    return '<tr><td>' + k + '</td><td class="' + (malo ? 'no' : '') + '">' + v + '</td></tr>';
  }

  function pintaPanel(){
    if(!panel) return;
    var p = AD.parte(), i, m = '', mods = '';
    for(i = 0; i < MODULOS.length; i++){
      var k = MODULOS[i];
      mods += '<span class="' + (p.modulos[k] ? 'ok' : 'no') + '">' + k + '</span>' +
              (i < MODULOS.length - 1 ? ' · ' : '');
    }
    if(p.fallos.length){
      for(i = p.fallos.length - 1; i >= 0; i--){
        var f = p.fallos[i];
        m += '<div class="mal"><b>' + esc(f.msg) + '</b>' +
             (f.url ? ' <i>— ' + esc(f.url) + ':' + f.linea + '</i>' : '') + '</div>';
      }
    }else{
      m = '<div class="ok">Sin errores registrados.</div>';
    }
    panel.querySelector('.caja').innerHTML =
      '<h2>Parte del visor</h2>' +
      '<div class="sub">Build House · lo que de verdad se está sirviendo en este teléfono</div>' +
      '<table>' +
        fila('Versión', esc(String(p.version))) +
        fila('WebGL', p.webgl ? 'sí' : 'NO — el visor 3D no puede dibujar', !p.webgl) +
        fila('Visor (API)', p.api ? 'listo' : 'no llegó a publicarse', !p.api) +
        fila('Estado', p.listo ? 'en marcha' : 'cargando o detenido', !p.listo) +
        fila('Módulos', mods) +
        fila('Pantalla', esc(p.pantalla + ' · dpr ' + p.dpr + (p.movil ? ' · móvil' : ''))) +
        fila('Navegador', esc(p.navegador)) +
      '</table>' +
      '<div style="margin:2px 0 4px;color:var(--muted)">Errores</div>' + m +
      '<div class="pie">' +
        '<button class="pri" data-accion="copiar">Copiar el parte</button>' +
        '<button data-accion="recargar">Recargar sin caché</button>' +
        '<button data-accion="cerrar">Cerrar</button>' +
      '</div>';
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];
    });
  }

  function panelAbre(){
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'diag-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Parte del visor');
      panel.innerHTML = '<div class="caja"></div>';
      panel.addEventListener('click', function(e){
        if(e.target === panel){ panelCierra(); return; }
        var b = e.target.closest && e.target.closest('button[data-accion]');
        if(!b) return;
        var a = b.getAttribute('data-accion');
        if(a === 'cerrar') panelCierra();
        if(a === 'recargar') recargaDura();
        if(a === 'copiar') copia();
      });
      document.body.appendChild(panel);
    }
    panel.classList.add('on');
    if(chip) chip.classList.remove('aparte');
    pintaPanel();
  }
  function panelCierra(){ if(panel) panel.classList.remove('on'); }
  function panelAbierto(){ return !!(panel && panel.classList.contains('on')); }

  function textoParte(){
    var p = AD.parte(), l = [];
    l.push('Build House — parte del visor');
    l.push('version: ' + p.version);
    l.push('webgl: ' + (p.webgl ? 'si' : 'NO'));
    l.push('api: ' + (p.api ? 'si' : 'no') + ' · listo: ' + (p.listo ? 'si' : 'no'));
    l.push('pantalla: ' + p.pantalla + ' · dpr ' + p.dpr + (p.movil ? ' · movil' : ''));
    l.push('navegador: ' + p.navegador);
    l.push('modulos: ' + MODULOS.map(function(k){ return k + (p.modulos[k] ? ' ok' : ' FALTA'); }).join(', '));
    if(p.fallos.length){
      l.push('errores:');
      p.fallos.forEach(function(f){ l.push('  - ' + f.msg + (f.url ? ' — ' + f.url + ':' + f.linea : '')); });
    }else l.push('errores: ninguno');
    return l.join('\n');
  }

  function copia(){
    var t = textoParte();
    function hecho(ok){ AD.avisa(ok ? 'Parte copiado. Pégalo en el chat.' : 'No se pudo copiar: selecciona el texto.', ok ? 'bien' : 'mal'); }
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(t).then(function(){ hecho(true); }, function(){ hecho(false); });
      }else{
        var ta = document.createElement('textarea');
        ta.value = t; document.body.appendChild(ta); ta.select();
        hecho(document.execCommand('copy')); ta.remove();
      }
    }catch(e){ hecho(false); }
  }

  /* Recargar saltando la cache: una URL nueva cada vez. Si habia un service
     worker viejo, se le pide que se aparte y se recarga. */
  function recargaDura(){
    try{
      if(navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
        navigator.serviceWorker.getRegistrations().then(function(rs){
          rs.forEach(function(r){ try{ r.unregister(); }catch(e){} });
          if(window.caches && caches.keys){
            caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
              .then(function(){ location.replace(location.pathname + '?v=' + Date.now()); });
          }else location.replace(location.pathname + '?v=' + Date.now());
        });
      }else location.replace(location.pathname + '?v=' + Date.now());
    }catch(e){ location.reload(); }
  }
  AD.recargaDura = recargaDura;

  /* Atajos y arranque */
  AD.parteVer = panelAbre;
  try{
    if(/[?&]diag=1/.test(location.search)) panelAbre();
  }catch(e){}

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ pinta(false); });
  }else pinta(false);

  /* Cuando el visor avisa, se re-evalua: si todo bien, el chip se aparta. */
  if(typeof AD.alListo === 'function'){
    AD.alListo(function(){ pinta(false); });
  }else{
    var espera = setInterval(function(){
      if(typeof AD.alListo === 'function'){
        clearInterval(espera);
        AD.alListo(function(){ pinta(false); });
      }
    }, 400);
    setTimeout(function(){ clearInterval(espera); }, 20000);
  }
})();
