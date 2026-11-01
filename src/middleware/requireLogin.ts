import type { RequestHandler } from 'express';

export function isHtmxRequest(headers: { [key: string]: unknown }): boolean {
  return headers['hx-request'] === 'true';
}

/**
 * Server-side protection for every administration route, including HTMX endpoints.
 * Browsers are redirected to the login page; HTMX gets 401 with HX-Redirect for a full-page redirect.
 */
export const requireLogin: RequestHandler = (req, res, next) => {
  if (req.oidc?.isAuthenticated()) {
    next();
    return;
  }
  const returnTo = req.method === 'GET' ? req.originalUrl : '/admin/passes';
  const loginUrl = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  if (isHtmxRequest(req.headers)) {
    res.status(401).set('HX-Redirect', loginUrl).send('');
  } else if (req.method === 'GET') {
    res.redirect(loginUrl);
  } else {
    res.status(401).render('pages/error', {
      title: 'Prijava je potrebna',
      message: 'Za ovu radnju morate biti prijavljeni.',
    });
  }
};
