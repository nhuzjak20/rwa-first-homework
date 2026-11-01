import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIENCE, BASE_URL, createTestContext } from './helpers/testApp.js';

// jsqr is CommonJS with a default-export typing; load it through require for NodeNext.
const jsQR = createRequire(import.meta.url)('jsqr') as typeof import('jsqr').default;

function decodeQr(png: Buffer): string | undefined {
  const image = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data;
}

function binaryParser(res: NodeJS.ReadableStream, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('machine-to-machine API', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  beforeEach(async () => {
    ctx = await createTestContext();
  });

  describe('GET /passes/:id', () => {
    it('returns exactly the pass fields as JSON', async () => {
      const pass = await ctx.seed({ id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6' });
      const res = await request(ctx.app)
        .get(`/passes/${pass.id}`)
        .auth(await ctx.token('read:passes'), { type: 'bearer' })
        .expect(200)
        .expect('Content-Type', /application\/json/);
      expect(res.body).toStrictEqual({
        id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
        name: 'Pero Perić',
        document: 'HR-123456789',
        issuedAt: '2026-11-10T10:15:00Z',
        status: 'ACTIVE',
      });
    });

    it('returns 401 without a token', async () => {
      const pass = await ctx.seed();
      const res = await request(ctx.app).get(`/passes/${pass.id}`).expect(401);
      expect(res.headers['www-authenticate']).toMatch(/^Bearer/);
    });

    it.each([
      ['a garbage token', () => Promise.resolve('not.a.jwt')],
      ['a wrong signing key', () => ctx.token('read:passes', { key: ctx.foreignKey })],
      ['a wrong issuer', () => ctx.token('read:passes', { issuer: 'https://evil.example/' })],
      ['a wrong audience', () => ctx.token('read:passes', { audience: 'https://other-api' })],
      ['an expired token', () => ctx.token('read:passes', { expiresIn: '-1h' })],
    ])('returns 401 for %s', async (_label, makeToken) => {
      const pass = await ctx.seed();
      await request(ctx.app)
        .get(`/passes/${pass.id}`)
        .auth(await makeToken(), { type: 'bearer' })
        .expect(401);
    });

    it('returns 403 when read:passes scope is missing', async () => {
      const pass = await ctx.seed();
      const res = await request(ctx.app)
        .get(`/passes/${pass.id}`)
        .auth(await ctx.token('create:passes'), { type: 'bearer' })
        .expect(403);
      expect(res.body.error).toBe('insufficient_scope');
    });

    it('accepts the scope from the RBAC permissions claim', async () => {
      const pass = await ctx.seed();
      await request(ctx.app)
        .get(`/passes/${pass.id}`)
        .auth(await ctx.token('', { permissions: ['read:passes'] }), { type: 'bearer' })
        .expect(200);
    });

    it('returns 404 for unknown and malformed ids', async () => {
      const token = await ctx.token('read:passes');
      await request(ctx.app).get(`/passes/${crypto.randomUUID()}`).auth(token, { type: 'bearer' }).expect(404);
      await request(ctx.app).get('/passes/123').auth(token, { type: 'bearer' }).expect(404);
    });

    it('checks authentication before revealing whether a pass exists', async () => {
      await request(ctx.app).get(`/passes/${crypto.randomUUID()}`).expect(401);
    });
  });

  describe('POST /passes', () => {
    it('creates an ACTIVE pass; QR encodes /info/:id while Location is /passes/:id', async () => {
      const res = await request(ctx.app)
        .post('/passes')
        .auth(await ctx.token('create:passes'), { type: 'bearer' })
        .send({ name: 'Pero Perić', document: 'HR-123456789' })
        .buffer(true)
        .parse(binaryParser as never)
        .expect(201)
        .expect('Content-Type', 'image/png');

      const location = res.headers.location as string;
      const id = new URL(location).pathname.split('/').pop()!;
      expect(location).toBe(`${BASE_URL}/passes/${id}`);

      const stored = await ctx.repository.findById(id);
      expect(stored).toMatchObject({ name: 'Pero Perić', document: 'HR-123456789', status: 'ACTIVE' });

      const body = res.body as Buffer;
      expect(body.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(decodeQr(body)).toBe(`${BASE_URL}/info/${id}`);
    });

    it('allows multiple passes for the same person', async () => {
      const token = await ctx.token('create:passes');
      for (let i = 0; i < 2; i++) {
        await request(ctx.app).post('/passes').auth(token, { type: 'bearer' }).send({ name: 'A', document: 'D' }).expect(201);
      }
      expect((await ctx.repository.counts()).total).toBe(2);
    });

    it.each([
      [{}],
      [{ name: 'Pero' }],
      [{ document: 'HR-1' }],
      [{ name: '', document: 'HR-1' }],
      [{ name: 'Pero', document: '   ' }],
      [{ name: 42, document: 'HR-1' }],
      [[]],
    ])('returns 400 for invalid body %j', async (body) => {
      await request(ctx.app)
        .post('/passes')
        .auth(await ctx.token('create:passes'), { type: 'bearer' })
        .send(body as object)
        .expect(400);
      expect((await ctx.repository.counts()).total).toBe(0);
    });

    it('returns 400 for malformed JSON', async () => {
      await request(ctx.app)
        .post('/passes')
        .auth(await ctx.token('create:passes'), { type: 'bearer' })
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400)
        .expect('Content-Type', /json/);
    });

    it('returns 401 without a valid token', async () => {
      await request(ctx.app).post('/passes').send({ name: 'A', document: 'B' }).expect(401);
      await request(ctx.app)
        .post('/passes')
        .auth(await ctx.token('create:passes', { audience: `${AUDIENCE}/other` }), { type: 'bearer' })
        .send({ name: 'A', document: 'B' })
        .expect(401);
    });

    it('returns 403 when create:passes scope is missing', async () => {
      await request(ctx.app)
        .post('/passes')
        .auth(await ctx.token('read:passes'), { type: 'bearer' })
        .send({ name: 'A', document: 'B' })
        .expect(403);
      expect((await ctx.repository.counts()).total).toBe(0);
    });
  });
});
