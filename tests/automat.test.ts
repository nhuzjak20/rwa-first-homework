import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken, issuePass } from '../src/task2/automat.js';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getToken', () => {
  it('requests a client_credentials token and returns access_token', async () => {
    fetchMock.mockResolvedValue(Response.json({ access_token: 'abc.def.ghi', token_type: 'Bearer' }));

    const token = await getToken('https://tenant.eu.auth0.com//', 'https://api', 'cid', 'secret', 'create:passes');

    expect(token).toBe('abc.def.ghi');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://tenant.eu.auth0.com/oauth/token');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      grant_type: 'client_credentials',
      audience: 'https://api',
      client_id: 'cid',
      client_secret: 'secret',
      scope: 'create:passes',
    });
  });

  it('throws with the HTTP status on failure', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"access_denied"}', { status: 401 }));
    await expect(getToken('https://t', 'a', 'c', 's', 'x')).rejects.toThrow(/401/);
  });

  it('throws clearly on malformed successful responses', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(getToken('https://t', 'a', 'c', 's', 'x')).rejects.toThrow(/not valid JSON/);
    fetchMock.mockResolvedValue(Response.json({ token_type: 'Bearer' }));
    await expect(getToken('https://t', 'a', 'c', 's', 'x')).rejects.toThrow(/access_token/);
  });
});

describe('issuePass', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'automat-'));
    process.chdir(dir);
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it('posts JSON with the bearer token and saves <id>.png from the Location header', async () => {
    const id = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';
    fetchMock.mockResolvedValue(
      new Response(png, {
        status: 201,
        headers: { 'Content-Type': 'image/png', Location: `https://app.example/passes/${id}?x=1` },
      }),
    );

    await expect(issuePass('https://app.example/passes', 'tok', 'Pero Perić', 'HR-1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://app.example/passes');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer tok');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Pero Perić', document: 'HR-1' });
    expect(await readFile(path.join(dir, `${id}.png`))).toEqual(png);
  });

  it('throws with the HTTP status on failure', async () => {
    fetchMock.mockResolvedValue(new Response('forbidden', { status: 403 }));
    await expect(issuePass('https://app.example/passes', 'tok', 'A', 'B')).rejects.toThrow(/403/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('fails clearly when Location is missing or malformed', async () => {
    fetchMock.mockResolvedValue(new Response(png, { status: 201 }));
    await expect(issuePass('https://app.example/passes', 't', 'A', 'B')).rejects.toThrow(/Location/);

    fetchMock.mockResolvedValue(new Response(png, { status: 201, headers: { Location: 'https://app.example/' } }));
    await expect(issuePass('https://app.example/passes', 't', 'A', 'B')).rejects.toThrow(/pass id/);

    fetchMock.mockResolvedValue(
      new Response(png, { status: 201, headers: { Location: 'https://app.example/passes/..%2F..%2Fx' } }),
    );
    await expect(issuePass('https://app.example/passes', 't', 'A', 'B')).rejects.toThrow(/pass id/);
    expect(await readdir(dir)).toEqual([]);
  });
});
