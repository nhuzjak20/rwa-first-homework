import { Router } from 'express';
import type { PassService } from '../services/pass.service.js';

export function publicRoutes(passes: PassService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const counts = await passes.counts();
    res.render('pages/home', {
      title: 'Digitalne propusnice',
      counts,
      isAuthenticated: req.oidc?.isAuthenticated() ?? false,
      user: req.oidc?.user,
    });
  });

  router.get('/info/:id', async (req, res, next) => {
    const pass = await passes.get(req.params.id);
    if (!pass) {
      next();
      return;
    }
    res.render('pages/pass-info', { title: 'Podaci o propusnici', pass });
  });

  return router;
}
