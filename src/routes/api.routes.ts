import express, { Router, type RequestHandler } from 'express';
import { requireScope } from '../middleware/requireScope.js';
import { PassService, ValidationError, toApiPass } from '../services/pass.service.js';
import { apiPassUrl, generateQrPng, publicInfoUrl } from '../services/qr.service.js';

export function apiRoutes(passes: PassService, baseUrl: string, authenticate: RequestHandler): Router {
  const router = Router();
  const json = express.json({ limit: '10kb' });

  router.get('/passes/:id', authenticate, requireScope('read:passes'), async (req, res) => {
    const pass = await passes.get(String(req.params.id));
    if (!pass) {
      res.status(404).json({ error: 'not_found', message: 'Pass not found' });
      return;
    }
    res.status(200).json(toApiPass(pass));
  });

  router.post('/passes', authenticate, requireScope('create:passes'), json, async (req, res) => {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      res.status(400).json({ error: 'invalid_request', message: 'Body must be a JSON object with name and document' });
      return;
    }
    try {
      const pass = await passes.create(body as { name: unknown; document: unknown });
      const png = await generateQrPng(publicInfoUrl(baseUrl, pass.id));
      res.status(201).location(apiPassUrl(baseUrl, pass.id)).type('image/png').send(png);
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: 'invalid_request', message: error.message, fields: error.fields });
        return;
      }
      throw error;
    }
  });

  return router;
}
