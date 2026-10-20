/* =====================================================================
   modulo/hub.js — hub de control de la casa.

   Se carga como <script> después de visor.js y se registra en AD.hub.
   No toca visor.js, index.html ni demo/casa.js: hace su propio DOM.

   Qué controla:
     · Puertas      — por estancia, con el nombre real del hueco
                      (info.nombre + id), abrir/cerrar una, una estancia
                      o todas;
     · Cajones y nevera — una fila por pieza de AD.piezas.items, con su
                      etiqueta y su estado (0 cerrado, 1 abierto);
     · Luces        — los grupos de LZ.grupos y el interruptor de todo
                      (se delegan en los botones del propio visor para
                      que las dos interfaces queden de acuerdo);
     · Escenas      — día / atardecer / noche: mueven el deslizador de
                      hora que YA existe y disparan su evento «input»
                      (que es lo que llama a actualizarSol());
     · Ambiente     — NO duplica los deslizadores: lee sus valores y
                      enlaza con el panel del visor.

   API: AD.hub = {abrir(), cerrar(), alterna(), refresca(), abierto()}.
   ===================================================================== */
var AD = window.AD || (window.AD = {});

(function(){
  'use strict';

  /* ------------------------------------------------------------------
     1. Estado
     ------------------------------------------------------------------ */
  var H = {
    abierto:false,
    raiz:null, cuerpo:null, cabecera:null,
    secPuertas:null, secPiezas:null, secLuces:null, secEscenas:null, secAmbiente:null,
    listaPuertas:null, listaPiezas:null, listaLuces:null, resumenLuces:null,
    filasPuerta:[], filasPieza:[], filasLuz:[],
    nPuertas:-1, nPiezas:-1, nLuces:-1,
    mapa:null,          // puerta -> info (nombre real del hueco)
    reloj:null
  };

  function api(){ return AD.api || null; }

  /* ------------------------------------------------------------------
     2. Utilidades
     ------------------------------------------------------------------ */
  function el(tag, cls, txt){
    var e = document.createElement(tag);
    if(cls) e.className = cls;
    if(txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }
  function boton(txt, fn, presionado){
    var b = el('button', 'hub-btn', txt);
    b.type = 'button';
    if(presionado !== undefined) b.setAttribute('aria-pressed', presionado ? 'true' : 'false');
    b.addEventListener('click', function(e){ e.stopPropagation(); try{ fn(); }catch(err){ console.warn('hub', err); } });
    return b;
  }
  function limpia(el){ while(el.firstChild) el.removeChild(el.firstChild); }

  /* ------------------------------------------------------------------
     3. Puertas: nombre real, estancia y estado
     ------------------------------------------------------------------ */
  /* El visor pone en la malla de la hoja un userData.info con el nombre
     del hueco y un puntero a la puerta móvil (info.puerta). Con eso se
     consigue el nombre real («Puerta vidriera», «Puerta del garaje»…). */
  function mapaPuertas(){
    if(H.mapa) return H.mapa;
    var m = {};
    var a = api();
    if(a && a.escena && a.escena.traverse){
      a.escena.traverse(function(o){
        var info = o.userData && o.userData.info;
        if(info && info.puerta) m[info.puerta] = info;
      });
    }
    H.mapa = m;
    return m;
  }
  function nombrePuerta(p, m){
    var info = m[p];
    var n = info && info.nombre ? info.nombre : 'Puerta';
    if(info && info.id) n += ' · ' + info.id;
    return n;
  }
  /* Posición de la puerta en el mundo (la calcula el visor con localToWorld) */
  function posMundo(p){
    if(p.w) return p.w;
    if(!window.THREE || !p.g || !p.local) return null;
    try{
      if(p.g.updateWorldMatrix) p.g.updateWorldMatrix(true, false);
      var v = new THREE.Vector3(p.local[0], p.local[1], p.local[2]);
      p.g.localToWorld(v);
      p.w = v;
      return v;
    }catch(e){ return null; }
  }
  /* Del mundo al plano de la casa (la inversa de aMundo) */
  function uvDe(x, z){
    var a = api(); if(!a) return null;
    var c = a.C0 || a.C; if(!c || !c.origen) return null;
    var g = a.GIRO || 0;
    var dx = x - c.origen[0], dz = z - c.origen[1];
    return [dx*Math.cos(g) - dz*Math.sin(g), dx*Math.sin(g) + dz*Math.cos(g)];
  }
  /* La estancia donde cae la puerta (la más pequeña que la contiene) */
  function estanciaDe(p){
    var a = api(); if(!a) return '';
    var w = posMundo(p); if(!w) return '';
    var uv = uvDe(w.x, w.z); if(!uv) return '';
    var INT = a.INT; if(!INT || !INT.estancias) return '';
    var mejor = null, area = Infinity;
    INT.estancias.forEach(function(e){
      var k = e.caja; if(!k) return;
      if(uv[0] >= k[0]-0.03 && uv[0] <= k[2]+0.03 && uv[1] >= k[1]-0.03 && uv[1] <= k[3]+0.03){
        var ar = (k[2]-k[0])*(k[3]-k[1]);
        if(ar < area){ area = ar; mejor = e; }
      }
    });
    if(!mejor) return '';
    return mejor.nombre || mejor.id || '';
  }
  function puertas(){
    var a = api(); if(!a || !a.PUERTAS) return [];
    var m = mapaPuertas();
    var out = [];
    a.PUERTAS.forEach(function(p){
      out.push({p:p, nombre:nombrePuerta(p, m), estancia:estanciaDe(p), abierta:p.obj > 0.5});
    });
    return out;
  }
  function mueve(p, abrir){
    var a = api(); if(!a || !p) return;
    var obj = p.obj > 0.5 ? 1 : 0;
    if(obj === (abrir ? 1 : 0)) return;                 // ya está como se quiere
    if(a.mueve) a.mueve(p); else p.obj = abrir ? 1 : 0;
  }
  function todas(abrir){
    var a = api(); if(!a || !a.PUERTAS) return;
    a.PUERTAS.forEach(function(p){ mueve(p, abrir); });
    refresca();
  }

  /* ------------------------------------------------------------------
     4. Piezas (cajones y nevera)
     ------------------------------------------------------------------ */
  function piezas(){
    return (AD.piezas && AD.piezas.items) ? AD.piezas.items : [];
  }
  function estadoPieza(it){
    try{ return it.estado ? (it.estado() > 0.5 ? 1 : 0) : 0; }catch(e){ return 0; }
  }
  function alternaPieza(it){
    var abierto = estadoPieza(it) === 1;
    try{
      if(abierto){ if(it.cierra) it.cierra(); }
      else { if(it.abre) it.abre(); }
    }catch(e){ console.warn('hub pieza', e); }
    refresca();
  }

  /* ------------------------------------------------------------------
     5. Luces: los grupos de LZ.grupos y el interruptor de todo
     ------------------------------------------------------------------ */
  function lz(){ var a = api(); return (a && a.LZ) ? a.LZ : null; }
  function gruposLuz(){
    var z = lz(); if(!z) return [];
    var nombres = [];
    var a = api();
    if(a && a.PUNTOS) a.PUNTOS.forEach(function(p){ if(p.grupo && nombres.indexOf(p.grupo) < 0) nombres.push(p.grupo); });
    Object.keys(z.grupos || {}).forEach(function(g){ if(nombres.indexOf(g) < 0) nombres.push(g); });
    return nombres;
  }
  /* El interruptor de grupo del visor (dentro de #luces-fuera) es el que
     sabe mantener de acuerdo los dos paneles: si existe, se le delega. */
  function alternaGrupo(g){
    var z = lz(); if(!z) return;
    var btn = null;
    var cont = document.getElementById('luces-fuera');
    if(cont){
      var todos = cont.querySelectorAll('.chip');
      for(var i = 0; i < todos.length; i++){
        if(todos[i].dataset && todos[i].dataset.grupo === g){ btn = todos[i]; break; }
      }
    }
    if(btn) btn.click();
    else { z.grupos[g] = !z.grupos[g]; z.sucio = true; }
    refresca();
  }
  function alternaTodo(){
    var btn = document.getElementById('luces-todo');
    if(btn) btn.click();
    else { var z = lz(); if(z){ z.todo = !z.todo; z.sucio = true; } refresca(); }
    refresca();
  }

  /* ------------------------------------------------------------------
     6. Escenas (el deslizador de hora que ya existe)
     ------------------------------------------------------------------ */
  var ESCENAS = [
    {txt:'Día', hora:780, nota:'13:00'},
    {txt:'Atardecer', hora:1200, nota:'20:00'},
    {txt:'Noche', hora:1320, nota:'22:00'}
  ];
  function ponHora(min){
    var s = document.getElementById('slider-hora');
    if(!s) return false;
    s.value = String(min);
    try{ s.dispatchEvent(new Event('input', {bubbles:true})); }catch(e){}
    return true;
  }

  /* ------------------------------------------------------------------
     7. Ambiente: los deslizadores que ya existen (no se duplican)
     ------------------------------------------------------------------ */
  function valorSlider(id){
    var s = document.getElementById(id);
    if(!s) return null;
    var v = parseFloat(s.value);
    return isNaN(v) ? null : v;
  }
  function abreAjustes(){
    var panel = document.getElementById('panel');
    if(panel){
      panel.classList.add('abierto');
      var s = document.getElementById('luz-exp');
      if(s && s.scrollIntoView){
        try{ s.scrollIntoView({block:'center'}); }catch(e){ try{ s.scrollIntoView(); }catch(e2){} }
      }
    }
  }

  /* ------------------------------------------------------------------
     8. DOM
     ------------------------------------------------------------------ */
  var CSS = [
    '#fab-hub{position:fixed; z-index:32; right:16px; top:16px; width:318px;',
    'max-height:calc(100dvh - 32px); display:flex; flex-direction:column;',
    'background:#14180f; border:1px solid #2b3324; border-radius:6px; color:#e9ede2;',
    'font-family:"IBM Plex Sans Condensed",sans-serif; overflow:hidden;',
    'box-shadow:0 12px 44px rgba(0,0,0,.55); -webkit-tap-highlight-color:transparent;}',
    '#fab-hub[hidden]{display:none!important}',
    '#fab-hub .hub-cabecera{display:flex; align-items:center; gap:8px; padding:8px 8px 8px 14px;',
    'border-bottom:1px solid #2b3324; background:#171c11; flex:0 0 auto}',
    '#fab-hub .hub-titulo{flex:1; font-weight:600; font-size:11px; letter-spacing:.16em;',
    'text-transform:uppercase; color:#c9ef63}',
    '#fab-hub .hub-cabecera button{min-width:44px; min-height:44px; padding:0 10px;',
    'background:transparent; border:1px solid #2b3324; border-radius:4px; color:#c2c9b9;',
    'font:inherit; font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;',
    'cursor:pointer;}',
    '#fab-hub .hub-cabecera button:active{transform:scale(.96)}',
    '#fab-hub .hub-cuerpo{overflow-y:auto; -webkit-overflow-scrolling:touch; padding:6px 10px 12px}',
    '#fab-hub details.hub-seccion{border-bottom:1px solid #222a1b; padding:2px 0}',
    '#fab-hub details.hub-seccion:last-child{border-bottom:0}',
    '#fab-hub summary.hub-sum{list-style:none; cursor:pointer; min-height:44px; display:flex;',
    'align-items:center; gap:8px; font-weight:600; font-size:12px; letter-spacing:.1em;',
    'text-transform:uppercase; color:#e9ede2;}',
    '#fab-hub summary.hub-sum::-webkit-details-marker{display:none}',
    '#fab-hub summary.hub-sum .flecha{width:8px; height:8px; border-right:1.6px solid #c9ef63;',
    'border-bottom:1.6px solid #c9ef63; transform:rotate(-45deg); transition:transform .18s ease; flex:0 0 8px}',
    '#fab-hub details[open] summary.hub-sum .flecha{transform:rotate(45deg)}',
    '#fab-hub summary.hub-sum .cuenta{margin-left:auto; font-family:"IBM Plex Mono",monospace;',
    'font-size:10.5px; color:#8d9683; letter-spacing:.04em}',
    '#fab-hub .hub-lista{display:flex; flex-direction:column; gap:6px; padding:2px 0 12px}',
    '#fab-hub .hub-btn{min-height:44px; padding:0 12px; display:flex; align-items:center; gap:10px;',
    'background:#1b2015; border:1px solid #2b3324; border-radius:4px; color:#e9ede2;',
    'font-family:"IBM Plex Sans Condensed",sans-serif; font-size:12.5px; font-weight:500;',
    'text-align:left; cursor:pointer; width:100%;}',
    '#fab-hub .hub-btn:active{transform:scale(.99); background:#20261a}',
    '#fab-hub .hub-btn .txt{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}',
    '#fab-hub .hub-btn .estado{font-family:"IBM Plex Mono",monospace; font-size:10.5px;',
    'color:#8d9683; letter-spacing:.06em; text-transform:uppercase; flex:0 0 auto}',
    '#fab-hub .hub-btn[aria-pressed="true"]{border-color:#c9ef63; color:#c9ef63}',
    '#fab-hub .hub-btn[aria-pressed="true"] .estado{color:#c9ef63}',
    '#fab-hub .hub-btn.pequeno{min-height:40px; font-size:11.5px; color:#b6bea9}',
    '#fab-hub .hub-fila{display:flex; gap:6px; align-items:center}',
    '#fab-hub .hub-fila .hub-btn{flex:1}',
    '#fab-hub .hub-grupo{margin:10px 0 2px; font-family:"IBM Plex Mono",monospace; font-size:10px;',
    'letter-spacing:.14em; text-transform:uppercase; color:#6d7565}',
    '#fab-hub .hub-vacio{margin:4px 0 8px; padding:12px; border:1px dashed #2b3324; border-radius:4px;',
    'font-size:12.5px; line-height:1.5; color:#8d9683}',
    '#fab-hub .hub-vacio b{display:block; color:#c9ef63; font-weight:600; margin-bottom:4px;',
    'letter-spacing:.08em; text-transform:uppercase; font-size:10.5px}',
    '#fab-hub .hub-dato{display:flex; justify-content:space-between; gap:10px; font-size:12px;',
    'color:#b6bea9; padding:2px 2px 6px}',
    '#fab-hub .hub-dato b{font-family:"IBM Plex Mono",monospace; font-weight:500; color:#e9ede2}',
    '#fab-hub .hub-ayuda{margin:6px 0 0; font-size:11.5px; line-height:1.5; color:#6d7565}',
    '@media (max-width:860px){#fab-hub{left:0; right:0; top:auto; bottom:0; width:auto;',
    'max-height:60dvh; border-radius:8px 8px 0 0; border-left:0; border-right:0; border-bottom:0}}',
    '@media (min-width:861px){body.fab-hub #fabrick{right:346px} body.fab-hub #fab-audio{right:346px}}',
    '@media (max-width:860px){body.fab-hub #fabrick{opacity:0; pointer-events:none}',
    'body.fab-hub #fab-audio{opacity:0; pointer-events:none}}'
  ].join('');

  function seccion(titulo, abierta){
    var d = el('details', 'hub-seccion');
    if(abierta) d.setAttribute('open', '');
    var s = el('summary', 'hub-sum');
    s.appendChild(el('span', 'flecha'));
    s.appendChild(el('span', null, titulo));
    var c = el('span', 'cuenta', '');
    s.appendChild(c);
    d.appendChild(s);
    var l = el('div', 'hub-lista');
    d.appendChild(l);
    d.cuenta = c;
    return d;
  }

  function crea(){
    if(H.raiz) return H.raiz;
    var est = document.createElement('style'); est.id = 'fab-hub-css'; est.textContent = CSS;
    document.head.appendChild(est);

    var raiz = el('div'); raiz.id = 'fab-hub'; raiz.hidden = true;
    raiz.setAttribute('aria-label', 'Control de la casa');

    var cab = el('div', 'hub-cabecera');
    cab.appendChild(el('span', 'hub-titulo', 'Control de la casa'));
    var btnCerrar = el('button', null, 'Cerrar');
    btnCerrar.type = 'button';
    btnCerrar.setAttribute('aria-label', 'Cerrar el control');
    btnCerrar.addEventListener('click', function(e){ e.stopPropagation(); cerrar(); });
    cab.appendChild(btnCerrar);
    raiz.appendChild(cab);

    var cuerpo = el('div', 'hub-cuerpo');
    raiz.appendChild(cuerpo);

    /* Puertas */
    var sP = seccion('Puertas', true);
    cuerpo.appendChild(sP);
    H.secPuertas = sP; H.listaPuertas = sP.querySelector('.hub-lista');

    /* Cajones y nevera */
    var sC = seccion('Cajones y nevera', true);
    cuerpo.appendChild(sC);
    H.secPiezas = sC; H.listaPiezas = sC.querySelector('.hub-lista');

    /* Luces */
    var sL = seccion('Luces', false);
    cuerpo.appendChild(sL);
    H.secLuces = sL; H.listaLuces = sL.querySelector('.hub-lista');

    /* Escenas */
    var sE = seccion('Escenas', false);
    cuerpo.appendChild(sE);
    H.secEscenas = sE; H.listaEscenas = sE.querySelector('.hub-lista');

    /* Ambiente */
    var sA = seccion('Ambiente', false);
    cuerpo.appendChild(sA);
    H.secAmbiente = sA; H.listaAmbiente = sA.querySelector('.hub-lista');

    document.body.appendChild(raiz);
    raiz.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    raiz.addEventListener('touchstart', function(e){ e.stopPropagation(); }, {passive:true});

    H.raiz = raiz; H.cuerpo = cuerpo;
    return raiz;
  }

  /* ------------------------------------------------------------------
     9. Pintado de las listas
     ------------------------------------------------------------------ */
  function pintaPuertas(){
    var lista = H.listaPuertas; if(!lista) return;
    var ps = puertas();
    H.secPuertas.cuenta.textContent = ps.length ? String(ps.length) : '';
    if(ps.length !== H.nPuertas){
      H.nPuertas = ps.length;
      limpia(lista);
      H.filasPuerta = [];
      var fila = el('div', 'hub-fila');
      fila.appendChild(boton('Abrir todas', function(){ todas(true); }, false));
      fila.appendChild(boton('Cerrar todas', function(){ todas(false); }, false));
      lista.appendChild(fila);
      /* por estancia */
      var grupos = [], orden = {};
      ps.forEach(function(d){
        var g = d.estancia || 'Exterior';
        if(orden[g] === undefined){ orden[g] = grupos.length; grupos.push({nombre:g, puertas:[]}); }
        grupos[orden[g]].puertas.push(d);
      });
      grupos.forEach(function(gr){
        lista.appendChild(el('p', 'hub-grupo', gr.nombre));
        var f = el('div', 'hub-fila');
        f.appendChild(boton('Abrir', function(){
          gr.puertas.forEach(function(d){ mueve(d.p, true); }); refresca();
        }, false));
        f.appendChild(boton('Cerrar', function(){
          gr.puertas.forEach(function(d){ mueve(d.p, false); }); refresca();
        }, false));
        lista.appendChild(f);
        gr.puertas.forEach(function(d){
          var b = el('button', 'hub-btn');
          b.type = 'button';
          var t = el('span', 'txt', d.nombre);
          var es = el('span', 'estado', '');
          b.appendChild(t); b.appendChild(es);
          b.addEventListener('click', function(e){ e.stopPropagation(); mueve(d.p, !(d.p.obj > 0.5)); refresca(); });
          lista.appendChild(b);
          H.filasPuerta.push({p:d.p, el:b, estado:es});
        });
      });
    }
    /* los estados cambian solos: se actualizan en sitio, sin rehacer la lista */
    H.filasPuerta.forEach(function(f){
      var abierta = f.p.obj > 0.5;
      f.estado.textContent = abierta ? 'Abierta' : 'Cerrada';
      f.el.setAttribute('aria-pressed', abierta ? 'true' : 'false');
    });
  }

  function pintaPiezas(){
    var lista = H.listaPiezas; if(!lista) return;
    var ps = piezas();
    H.secPiezas.cuenta.textContent = ps.length ? String(ps.length) : '';
    if(ps.length !== H.nPiezas){
      H.nPiezas = ps.length;
      limpia(lista);
      H.filasPieza = [];
      if(!ps.length){
        var v = el('div', 'hub-vacio');
        v.innerHTML = '<b>Sin piezas animables</b>Todavía no hay cajones ni nevera que controlar. ' +
                      'En cuanto la cocina registre sus herrajes, sus cajones y la nevera aparecerán aquí, ' +
                      'uno por uno, con su estado.';
        lista.appendChild(v);
        return;
      }
      var grupoAnt = null;
      ps.forEach(function(it){
        var g = it.grupo || '';
        if(g !== grupoAnt){
          grupoAnt = g;
          if(g) lista.appendChild(el('p', 'hub-grupo', g));
        }
        var b = el('button', 'hub-btn');
        b.type = 'button';
        b.appendChild(el('span', 'txt', it.etiqueta || it.id || 'Pieza'));
        var es = el('span', 'estado', '');
        b.appendChild(es);
        b.addEventListener('click', function(e){ e.stopPropagation(); alternaPieza(it); });
        lista.appendChild(b);
        H.filasPieza.push({it:it, el:b, estado:es});
      });
    }
    H.filasPieza.forEach(function(f){
      var abierto = estadoPieza(f.it) === 1;
      f.estado.textContent = abierto ? 'Abierto' : 'Cerrado';
      f.el.setAttribute('aria-pressed', abierto ? 'true' : 'false');
    });
  }

  function pintaLuces(){
    var lista = H.listaLuces; if(!lista) return;
    var z = lz();
    var gs = gruposLuz();
    H.secLuces.cuenta.textContent = z && z.todo ? 'Todo' : (gs.length ? String(gs.length) : '');
    if(gs.length !== H.nLuces){
      H.nLuces = gs.length;
      limpia(lista);
      H.filasLuz = [];
      var fila = el('div', 'hub-fila');
      var bTodo = boton('Encender todo', function(){ alternaTodo(); }, !!(z && z.todo));
      fila.appendChild(bTodo);
      lista.appendChild(fila);
      H.botonTodo = bTodo;
      gs.forEach(function(g){
        var b = el('button', 'hub-btn');
        b.type = 'button';
        b.appendChild(el('span', 'txt', g));
        var es = el('span', 'estado', '');
        b.appendChild(es);
        b.addEventListener('click', function(e){ e.stopPropagation(); alternaGrupo(g); });
        lista.appendChild(b);
        H.filasLuz.push({g:g, el:b, estado:es});
      });
      var p = el('p', 'hub-ayuda', 'Las luces de dentro se encienden solas de noche, en la estancia donde estás.');
      lista.appendChild(p);
    }
    if(H.botonTodo){
      H.botonTodo.textContent = (z && z.todo) ? 'Apagar todo' : 'Encender todo';
      H.botonTodo.setAttribute('aria-pressed', (z && z.todo) ? 'true' : 'false');
    }
    H.filasLuz.forEach(function(f){
      var on = !!(z && z.grupos && z.grupos[f.g]);
      f.estado.textContent = on ? 'Encendida' : 'Apagada';
      f.el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function pintaEscenas(){
    var lista = H.listaEscenas; if(!lista) return;
    if(lista.childElementCount) return;                 // solo se crea una vez
    var f = el('div', 'hub-fila');
    ESCENAS.forEach(function(e){
      var b = boton(e.txt, function(){ ponHora(e.hora); refresca(); }, false);
      b.classList.add('pequeno');
      f.appendChild(b);
    });
    lista.appendChild(f);
    lista.appendChild(el('p', 'hub-ayuda', 'Mueve la hora del visor (13:00 · 20:00 · 22:00) y recalcula el sol.'));
  }

  function pintaAmbiente(){
    var lista = H.listaAmbiente; if(!lista) return;
    if(!lista.childElementCount){
      var d1 = el('div', 'hub-dato');
      d1.appendChild(el('span', null, 'Exposición'));
      var v1 = el('b', null, '—'); d1.appendChild(v1);
      var d2 = el('div', 'hub-dato');
      d2.appendChild(el('span', null, 'Rebote'));
      var v2 = el('b', null, '—'); d2.appendChild(v2);
      var d3 = el('div', 'hub-dato');
      d3.appendChild(el('span', null, 'Bruma'));
      var v3 = el('b', null, '—'); d3.appendChild(v3);
      lista.appendChild(d1); lista.appendChild(d2); lista.appendChild(d3);
      H.valores = {exp:v1, reb:v2, nie:v3};
      var f = el('div', 'hub-fila');
      f.appendChild(boton('Ajustar en el panel', function(){ abreAjustes(); }, false));
      lista.appendChild(f);
      lista.appendChild(el('p', 'hub-ayuda', 'Los tres deslizadores son los del visor: aquí solo se ven sus valores.'));
      /* sonido: el mismo módulo de audio, con su botón */
      var fs = el('div', 'hub-fila');
      var bSon = boton('Sonido: —', function(){
        if(AD.audio) AD.audio.alterna();
        refresca();
      }, false);
      fs.appendChild(bSon);
      lista.appendChild(fs);
      H.botonSonido = bSon;
    }
    /* los valores se leen de los deslizadores del visor: no se duplican */
    if(H.valores){
      var exp = valorSlider('luz-exp'), reb = valorSlider('luz-rebote'), nie = valorSlider('luz-niebla');
      H.valores.exp.textContent = exp === null ? '—' : exp.toFixed(2);
      H.valores.reb.textContent = reb === null ? '—' : reb.toFixed(2);
      H.valores.nie.textContent = nie === null ? '—' : nie.toFixed(2);
    }
  }

  /* ------------------------------------------------------------------
     10. API pública
     ------------------------------------------------------------------ */
  function refresca(){
    if(!H.raiz) return;
    try{
      pintaPuertas();
      pintaPiezas();
      pintaLuces();
      pintaEscenas();
      pintaAmbiente();
      if(H.botonSonido && AD.audio){
        H.botonSonido.textContent = 'Sonido: ' + (AD.audio.suena() ? 'encendido' : 'apagado');
        H.botonSonido.setAttribute('aria-pressed', AD.audio.suena() ? 'true' : 'false');
      }
    }catch(e){ console.warn('hub refresca', e); }
  }

  function abrir(){
    crea();
    H.raiz.hidden = false;
    H.abierto = true;
    document.body.classList.add('fab-hub');
    H.mapa = null;                       // los nombres se releen por si cambió la versión
    H.nPuertas = -1;                      // y la lista de puertas se rehace con ellos
    refresca();
    if(H.reloj) clearInterval(H.reloj);
    H.reloj = setInterval(function(){ if(H.abierto) refresca(); }, 1500);
    if(AD.refrescaBarra) AD.refrescaBarra();
    return true;
  }
  function cerrar(){
    if(H.raiz) H.raiz.hidden = true;
    H.abierto = false;
    document.body.classList.remove('fab-hub');
    if(H.reloj){ clearInterval(H.reloj); H.reloj = null; }
    if(AD.refrescaBarra) AD.refrescaBarra();
    return false;
  }
  function alterna(){ return H.abierto ? cerrar() : abrir(); }
  function abierto(){ return !!H.abierto; }

  AD.hub = {abrir:abrir, cerrar:cerrar, alterna:alterna, refresca:refresca, abierto:abierto};

  /* ------------------------------------------------------------------
     11. Arranque
     ------------------------------------------------------------------ */
  function arranca(){
    crea();
    /* Las piezas y las puertas pueden aparecer más tarde (la cocina
       registra sus cajones cuando está lista): se refresca solo. */
    setInterval(function(){
      if(!H.abierto){ if(piezas().length !== H.nPiezas) refresca(); return; }
    }, 2000);
  }
  if(document.body) arranca();
  else document.addEventListener('DOMContentLoaded', arranca);
})();
