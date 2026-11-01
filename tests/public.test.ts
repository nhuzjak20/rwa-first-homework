import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/testApp.js';

describe('public pages', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('home page shows total and active counts and a login link for anonymous visitors', async () => {
    await ctx.seed();
    await ctx.seed({ status: 'CANCELLED' });
    await ctx.seed();

    const res = await request(ctx.app).get('/').expect(200).expect('Content-Type', /html/);
    expect(res.text).toContain('<html lang="hr">');
    expect(res.text).toMatch(/id="total-count">3</);
    expect(res.text).toMatch(/id="active-count">2</);
    expect(res.text).toContain('href="/login');
    expect(res.text).toContain('Prijava');
    expect(res.text).not.toContain('href="/logout"');
  });

  it('home page shows logout and admin links for authenticated users', async () => {
    const res = await request(ctx.app).get('/').set('X-Test-User', 'Ana').expect(200);
    expect(res.text).toContain('href="/logout"');
    expect(res.text).toContain('href="/admin/passes"');
    expect(res.text).toContain('Odjava');
  });

  it('pass info page renders pass details', async () => {
    const pass = await ctx.seed({ status: 'CANCELLED' });
    const res = await request(ctx.app).get(`/info/${pass.id}`).expect(200);
    expect(res.text).toContain('Pero Perić');
    expect(res.text).toContain('HR-123456789');
    expect(res.text).toContain('CANCELLED');
    expect(res.text).toContain('Poništena');
    expect(res.text).toContain('2026-11-10T10:15:00.000Z');
  });

  it('returns 404 for unknown and malformed ids', async () => {
    await request(ctx.app).get(`/info/${crypto.randomUUID()}`).expect(404);
    const res = await request(ctx.app).get('/info/not-a-uuid').expect(404);
    expect(res.text).toContain('nije pronađena');
  });

  it('escapes user-provided values (XSS)', async () => {
    const pass = await ctx.seed({ name: '<script>alert(1)</script>' });
    const res = await request(ctx.app).get(`/info/${pass.id}`).expect(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('login route rejects external returnTo values', async () => {
    const res = await request(ctx.app).get('/login?returnTo=https://evil.example').expect(302);
    expect(res.headers.location).toContain(encodeURIComponent('/admin/passes'));
  });
});
