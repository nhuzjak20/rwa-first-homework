import type { RequestHandler } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { auth } from 'express-openid-connect';
import type pg from 'pg';
import type { AppConfig } from './env.js';

/**
 * Auth0 OIDC login for people (Regular Web Application, authorization code flow).
 * Sessions are kept server-side in PostgreSQL; the browser only holds a signed session id cookie.
 */
export function createOidcMiddleware(config: AppConfig, pool: pg.Pool): RequestHandler {
  const PgStore = connectPgSimple(session);
  const store = new PgStore({ pool, tableName: 'session', pruneSessionInterval: 60 * 15 });

  return auth({
    authRequired: false,
    idpLogout: true,
    issuerBaseURL: config.auth0.issuer,
    baseURL: config.baseUrl,
    clientID: config.auth0.webClientId,
    clientSecret: config.auth0.webClientSecret,
    secret: config.sessionSecret,
    authorizationParams: {
      response_type: 'code',
      scope: 'openid profile email',
    },
    // Login and logout are custom routes (see auth.routes.ts); the callback is handled by the SDK.
    routes: { login: false, logout: false, callback: '/callback' },
    session: {
      // express-openid-connect accepts any express-session compatible store.
      store: store as never,
      signSessionStoreCookie: true,
      rolling: true,
      rollingDuration: 60 * 60 * 8,
      absoluteDuration: 60 * 60 * 24,
      cookie: {
        httpOnly: true,
        sameSite: 'Lax',
        secure: config.baseUrl.startsWith('https://'),
      },
    },
  });
}
