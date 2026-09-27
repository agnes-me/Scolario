import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSession, requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import enfantsRoutes from './routes/enfants.js';
import referentielRoutes from './routes/referentiel.js';
import suiviRoutes from './routes/suivi.js';
import pointsRoutes from './routes/points.js';
import modulesRoutes from './routes/modules.js';
import exportRoutes from './routes/export.js';
import { cloturerTout } from './services/recompenses.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  app.use(express.json({ limit: '2mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const api = express.Router();
  // Protection CSRF : toute requête modifiante doit être en JSON (non envoyable par un simple formulaire tiers).
  api.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json') && req.headers['content-length'] !== '0') {
      return res.status(415).json({ error: 'Content-Type application/json requis' });
    }
    next();
  });
  api.use(loadSession(db));
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use(authRoutes(db));
  api.use(requireAuth);
  // Clôture paresseuse des périodes de récompense échues (en plus de la tâche horaire).
  api.use((req, _res, next) => {
    if (req.method === 'GET') cloturerTout(db);
    next();
  });
  api.use(enfantsRoutes(db));
  api.use(referentielRoutes(db));
  api.use(suiviRoutes(db));
  api.use(pointsRoutes(db));
  api.use(modulesRoutes(db));
  api.use(exportRoutes(db));
  api.use((_req, res) => res.status(404).json({ error: 'Route inconnue' }));
  api.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erreur interne' : err.message });
  });
  app.use('/api', api);

  // Front-end compilé (npm run build)
  const dist = join(here, '../../client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  return app;
}
