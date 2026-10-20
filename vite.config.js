// Servidor de desarrollo de Ars Domus. El motor (index.html y visor.js) está aquí; la casa, en su
// carpeta: CASA=ruta (por defecto, demo/). De ella se sirven casa.js y texturas/, y en ella se
// guarda cambios.json, lo que se mueve en el modo «Mover objetos», para que Claude lo lea y lo
// pase a los datos de la casa.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const CASA = resolve(process.cwd(), process.env.CASA || join(RAIZ, 'demo'));
const CAMBIOS = join(CASA, 'cambios.json');
const TIPOS = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };

export default {
  root: RAIZ,
  plugins: [{
    name: 'casa',
    configureServer(server) {
      // casa.js y texturas/ salen de la carpeta de la casa
      server.middlewares.use((req, res, next) => {
        const ruta = decodeURIComponent((req.url || '').split('?')[0]);
        if (ruta !== '/casa.js' && !ruta.startsWith('/texturas/')) return next();
        const f = join(CASA, ruta);
        if (!f.startsWith(CASA) || !existsSync(f) || !statSync(f).isFile()) return next();
        res.setHeader('Content-Type', TIPOS[extname(f)] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(f));
      });
      server.middlewares.use('/__cambios', (req, res) => {
        if (req.method === 'POST') {
          let cuerpo = '';
          req.on('data', (c) => { cuerpo += c; if (cuerpo.length > 2e6) req.destroy(); });
          req.on('end', () => {
            try { JSON.parse(cuerpo); } catch { res.statusCode = 400; return res.end('JSON no válido'); }
            writeFileSync(CAMBIOS, cuerpo + '\n');
            res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}');
          });
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(existsSync(CAMBIOS) ? readFileSync(CAMBIOS) : '{"cambios":[]}');
      });
      // al regenerar casa.js, el visor se recarga solo
      server.watcher.add(join(CASA, 'casa.js'));
      server.watcher.on('change', (f) => { if (f === join(CASA, 'casa.js')) server.ws.send({ type: 'full-reload' }); });
    },
  }],
  server: { watch: { ignored: ['**/cambios.json'] } },
};
