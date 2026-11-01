import { Router } from 'express';

/** Accepts only local paths to avoid open redirects. */
export function safeReturnTo(value: unknown): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return value;
  }
  return '/admin/passes';
}

export function authRoutes(baseUrl: string): Router {
  const router = Router();

  router.get('/login', (req, res) => {
    res.oidc.login({ returnTo: safeReturnTo(req.query.returnTo) });
  });

  router.get('/logout', (_req, res) => {
    res.oidc.logout({ returnTo: `${baseUrl}/` });
  });

  return router;
}
