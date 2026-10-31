import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { publicRoutes } from './routes/public.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { apiRoutes } from './routes/api.routes.js';
import { PassService } from './services/pass.service.js';
import type { PassRepository } from './repositories/pass.repository.js';
import { formatDateTime, statusLabel } from './views/helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const htmxDir = path.dirname(require.resolve('htmx.org/dist/htmx.min.js'));

export interface AppDependencies {
  baseUrl: string;
  repository: PassRepository;
  /** OIDC session middleware (express-openid-connect in production, a stub in tests). */
  oidc: RequestHandler;
  /** Bearer JWT validation middleware for the machine-to-machine API. */
  bearerAuth: RequestHandler;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();
  const passes = new PassService(deps.repository);

  // Render terminates TLS at its proxy; trust it so req.secure and secure cookies work.
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(here, 'views'));
  app.disable('x-powered-by');

  app.locals.formatDateTime = formatDateTime;
  app.locals.statusLabel = statusLabel;

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'",
    });
    next();
  });

  app.use('/static', express.static(path.join(here, 'public'), { maxAge: '1h' }));
  app.use('/vendor/htmx', express.static(htmxDir, { maxAge: '1d' }));

  // The machine API is stateless and authenticated by Bearer tokens only (no cookies, no CSRF).
  app.use(apiRoutes(passes, deps.baseUrl, deps.bearerAuth));

  // Everything below is browser-facing and uses the OIDC session.
  app.use(deps.oidc);
  app.use((req, res, next) => {
    res.locals.isAuthenticated = req.oidc?.isAuthenticated() ?? false;
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(publicRoutes(passes));
  app.use(authRoutes(deps.baseUrl));
  app.use(adminRoutes(passes, deps.baseUrl));

  app.use(((req, res) => {
    if (req.path.startsWith('/passes')) {
      res.status(404).json({ error: 'not_found', message: 'Not found' });
      return;
    }
    res.status(404).render('pages/error', {
      title: 'Stranica nije pronađena',
      message: 'Tražena stranica ili propusnica ne postoji.',
    });
  }) as RequestHandler);

  app.use(((err, req, res, _next) => {
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    if (res.headersSent) return;

    if (req.path.startsWith('/passes')) {
      res.status(status).json({
        error: status === 400 ? 'invalid_request' : 'server_error',
        message: status === 400 ? 'Malformed request body' : 'Internal server error',
      });
      return;
    }
    res.status(status).render('pages/error', {
      title: status >= 500 ? 'Greška poslužitelja' : 'Neispravan zahtjev',
      message: status >= 500 ? 'Došlo je do neočekivane pogreške. Pokušajte ponovno kasnije.' : 'Zahtjev nije moguće obraditi.',
    });
  }) as ErrorRequestHandler);

  return app;
}
