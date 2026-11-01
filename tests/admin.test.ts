import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, extractCsrf } from './helpers/testApp.js';

describe('admin pages', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  beforeEach(async () => {
    ctx = await createTestContext();
  });

  /** Loads the admin page as a logged-in user and returns the session's CSRF token. */
  async function csrf(): Promise<string> {
    const holder = await ctx.seed({ name: 'CSRF holder' });
    const res = await request(ctx.app).get('/admin/passes').set('X-Test-User', 'Ana').expect(200);
    await ctx.repository.delete(holder.id);
    return extractCsrf(res.text);
  }

  describe('authorization', () => {
    it('redirects anonymous users to login', async () => {
      const res = await request(ctx.app).get('/admin/passes').expect(302);
      expect(res.headers.location).toBe('/login?returnTo=%2Fadmin%2Fpasses');
    });

    it('rejects anonymous HTMX requests with 401 and HX-Redirect', async () => {
      const pass = await ctx.seed();
      const res = await request(ctx.app).post(`/admin/passes/${pass.id}/cancel`).set('HX-Request', 'true').expect(401);
      expect(res.headers['hx-redirect']).toContain('/login');
      expect((await ctx.repository.findById(pass.id))?.status).toBe('ACTIVE');
    });

    it('rejects anonymous form posts without changing data', async () => {
      const pass = await ctx.seed();
      await request(ctx.app).post(`/admin/passes/${pass.id}/delete`).type('form').send({ _csrf: 'x' }).expect(401);
      expect(ctx.repository.passes.has(pass.id)).toBe(true);
    });

    it('rejects state changes without a valid CSRF token', async () => {
      await csrf();
      const pass = await ctx.seed();
      await request(ctx.app).post(`/admin/passes/${pass.id}/cancel`).set('X-Test-User', 'Ana').expect(403);
      await request(ctx.app)
        .post(`/admin/passes/${pass.id}/cancel`)
        .set('X-Test-User', 'Ana')
        .set('X-CSRF-Token', 'wrong')
        .expect(403);
      expect((await ctx.repository.findById(pass.id))?.status).toBe('ACTIVE');
    });
  });

  it('lists passes for authenticated users', async () => {
    await ctx.seed({ name: 'Iva Ivić', document: 'DOC-1' });
    const res = await request(ctx.app).get('/admin/passes').set('X-Test-User', 'Ana').expect(200);
    expect(res.text).toContain('Upravljanje propusnicama');
    expect(res.text).toContain('Iva Ivić');
    expect(res.text).toContain('hx-post=');
    expect(res.text).toContain('X-CSRF-Token');
  });

  it('cancels a pass via HTMX and returns the row partial with out-of-band counts', async () => {
    const token = await csrf();
    const pass = await ctx.seed();
    const res = await request(ctx.app)
      .post(`/admin/passes/${pass.id}/cancel`)
      .set('X-Test-User', 'Ana')
      .set('HX-Request', 'true')
      .set('X-CSRF-Token', token)
      .expect(200);
    expect(res.text).not.toContain('<html');
    expect(res.text).toContain(`id="pass-${pass.id}"`);
    expect(res.text).toContain('Poništena');
    expect(res.text).toContain('hx-swap-oob="true"');
    expect((await ctx.repository.findById(pass.id))?.status).toBe('CANCELLED');
  });

  it('deletes a pass via HTMX, returning no row and updated counts', async () => {
    const token = await csrf();
    const pass = await ctx.seed();
    await ctx.seed();
    const res = await request(ctx.app)
      .post(`/admin/passes/${pass.id}/delete`)
      .set('X-Test-User', 'Ana')
      .set('HX-Request', 'true')
      .set('X-CSRF-Token', token)
      .expect(200);
    expect(res.text).not.toContain(`id="pass-${pass.id}"`);
    expect(res.text).toMatch(/Ukupno: <strong>1<\/strong>/);
    expect(ctx.repository.passes.has(pass.id)).toBe(false);
  });

  it('supports plain form POST fallback with redirect', async () => {
    const token = await csrf();
    const pass = await ctx.seed();
    const res = await request(ctx.app)
      .post(`/admin/passes/${pass.id}/cancel`)
      .set('X-Test-User', 'Ana')
      .type('form')
      .send({ _csrf: token })
      .expect(303);
    expect(res.headers.location).toBe('/admin/passes');
    expect((await ctx.repository.findById(pass.id))?.status).toBe('CANCELLED');
  });

  it('returns 404 for unknown or malformed pass ids', async () => {
    const token = await csrf();
    for (const id of [crypto.randomUUID(), 'not-a-uuid']) {
      await request(ctx.app)
        .post(`/admin/passes/${id}/delete`)
        .set('X-Test-User', 'Ana')
        .set('X-CSRF-Token', token)
        .expect(404);
    }
  });
});
