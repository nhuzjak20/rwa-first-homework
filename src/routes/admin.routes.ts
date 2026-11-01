import { Router, type Request, type Response } from 'express';
import { requireLogin, isHtmxRequest } from '../middleware/requireLogin.js';
import { csrfToken, verifyCsrf } from '../middleware/csrf.js';
import type { PassService } from '../services/pass.service.js';
import { generateQrPng, publicInfoUrl } from '../services/qr.service.js';

export function adminRoutes(passes: PassService, baseUrl: string): Router {
  const router = Router();
  // Order matters: authentication first, then CSRF token handling for every admin route.
  router.use('/admin', requireLogin, csrfToken, verifyCsrf);

  router.get('/admin/passes', async (req, res) => {
    const [list, counts] = await Promise.all([passes.list(), passes.counts()]);
    res.render('pages/admin-passes', {
      title: 'Upravljanje propusnicama',
      passes: list,
      counts,
      user: req.oidc?.user,
    });
  });

  async function renderAfterChange(req: Request, res: Response, partial: string, locals: object) {
    if (!isHtmxRequest(req.headers)) {
      res.redirect(303, '/admin/passes');
      return;
    }
    const counts = await passes.counts();
    res.render(partial, { ...locals, counts, oob: true });
  }

  router.post('/admin/passes/:id/cancel', async (req, res, next) => {
    const pass = await passes.cancel(req.params.id);
    if (!pass) {
      next();
      return;
    }
    await renderAfterChange(req, res, 'partials/pass-row-response', { pass });
  });

  router.post('/admin/passes/:id/delete', async (req, res, next) => {
    const deleted = await passes.delete(req.params.id);
    if (!deleted) {
      next();
      return;
    }
    // HTMX swaps the row with an empty response (removing it) and updates the counters out-of-band.
    await renderAfterChange(req, res, 'partials/pass-row-response', { pass: null });
  });

  router.get('/admin/passes/:id/qr.png', async (req, res, next) => {
    const pass = await passes.get(req.params.id);
    if (!pass) {
      next();
      return;
    }
    const png = await generateQrPng(publicInfoUrl(baseUrl, pass.id));
    res.type('png').set('Cache-Control', 'private, no-store').send(png);
  });

  return router;
}
