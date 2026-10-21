/* Service worker del visor. Sirve la maqueta desde la caché para que el paseo abra al instante
   y siga abriendo sin cobertura; cuando hay versión nueva, la descarga en segundo plano y
   refresca sola en la siguiente visita. Solo toca lo de este mismo origen. */
var VERSION = 'build-house-v5-buildhouse';
var CAPA = VERSION + '-estatico';

var BASE = ['./', './index.html', './manifest.webmanifest', './iconos/icono-192.png',
            './iconos/icono-512.png', './iconos/icono-maskable-512.png',
            './modulo/paleta.js', './modulo/cocina.js', './modulo/plano.js',
            './modulo/camaras.js', './modulo/hub.js', './modulo/audio.js',
            './modulo/carga.js', './modulo/luz.js', './modulo/cctv.js', './modulo/fabrick.js'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CAPA).then(function(c){
    // `reload` evita que el HTTP cache del navegador meta una versión vieja en la nuestra
    return Promise.all(BASE.map(function(u){ return c.add(new Request(u, {cache:'reload'})); }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== CAPA; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;                 // nada de otras webs
  // las texturas y el three.js solo se piden una vez: van directo a la caché
  e.respondWith(caches.match(req).then(function(hit){
    if(hit) return hit;
    return fetch(req).then(function(res){
      if(res && res.status === 200 && res.type === 'basic'){
        var copia = res.clone();
        caches.open(CAPA).then(function(c){ c.put(req, copia); });
      }
      return res;
    }).catch(function(){
      // sin red: si era una navegación, al menos la portada guardada
      if(req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    });
  }));
});