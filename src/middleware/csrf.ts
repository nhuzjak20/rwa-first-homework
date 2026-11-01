import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

interface CsrfSession {
  csrfToken?: string;
}

function sessionOf(req: Request): CsrfSession | undefined {
  return (req as Request & { appSession?: CsrfSession }).appSession;
}

/**
 * Synchronizer-token CSRF protection. The token lives in the server-side session and must be
 * sent back either as the `_csrf` form field or the `X-CSRF-Token` header (used by HTMX).
 * Exposes `res.locals.csrfToken` for templates.
 */
export const csrfToken: RequestHandler = (req, res, next) => {
  const session = sessionOf(req);
  if (session) {
    session.csrfToken ??= randomBytes(32).toString('base64url');
    res.locals.csrfToken = session.csrfToken;
  }
  next();
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const verifyCsrf: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const expected = sessionOf(req)?.csrfToken;
  const body = req.body as { _csrf?: unknown } | undefined;
  const provided = req.get('x-csrf-token') ?? (typeof body?._csrf === 'string' ? body._csrf : undefined);

  if (!expected || !provided || !safeEqual(expected, provided)) {
    res.status(403).render('pages/error', {
      title: 'Zahtjev odbijen',
      message: 'Sigurnosni token (CSRF) nije valjan. Osvježite stranicu i pokušajte ponovno.',
    });
    return;
  }
  next();
};
