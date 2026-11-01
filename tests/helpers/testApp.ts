import type { RequestHandler } from 'express';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { createApp } from '../../src/app.js';
import { createJwtAuth } from '../../src/middleware/jwtAuth.js';
import type { Pass } from '../../src/repositories/pass.repository.js';
import { MemoryPassRepository } from './memoryRepository.js';

export const BASE_URL = 'https://passes.example.test';
export const ISSUER = 'https://tenant.example.auth0.com/';
export const AUDIENCE = 'https://digital-passes-api';

/**
 * Stand-in for express-openid-connect: requests with `X-Test-User` are authenticated
 * and share one in-memory session (like a browser holding a session cookie).
 */
function stubOidc(): RequestHandler {
  const session: Record<string, unknown> = {};
  return (req, res, next) => {
    const authenticated = req.get('x-test-user') !== undefined;
    Object.assign(req, {
      oidc: {
        isAuthenticated: () => authenticated,
        user: authenticated ? { name: req.get('x-test-user'), email: 'admin@example.test' } : undefined,
      },
      appSession: authenticated ? session : undefined,
    });
    Object.assign(res, {
      oidc: {
        login: ({ returnTo }: { returnTo: string }) =>
          res.redirect(`${ISSUER}authorize?returnTo=${encodeURIComponent(returnTo)}`),
        logout: ({ returnTo }: { returnTo: string }) => res.redirect(returnTo),
      },
    });
    next();
  };
}

export interface TokenOverrides {
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  key?: CryptoKey;
  permissions?: string[];
}

export async function createTestContext() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const repository = new MemoryPassRepository();

  const app = createApp({
    baseUrl: BASE_URL,
    repository,
    oidc: stubOidc(),
    bearerAuth: createJwtAuth({ issuer: ISSUER, audience: AUDIENCE, keys: createLocalJWKSet({ keys: [jwk] }) }),
  });

  function token(scope: string, overrides: TokenOverrides = {}): Promise<string> {
    return new SignJWT({ scope, ...(overrides.permissions ? { permissions: overrides.permissions } : {}) })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? AUDIENCE)
      .setSubject('m2m-client@clients')
      .setIssuedAt()
      .setExpirationTime(overrides.expiresIn ?? '5m')
      .sign(overrides.key ?? privateKey);
  }

  async function seed(partial: Partial<Pass> = {}): Promise<Pass> {
    const pass: Pass = {
      id: crypto.randomUUID(),
      name: 'Pero Perić',
      document: 'HR-123456789',
      issuedAt: new Date('2026-11-10T10:15:00Z'),
      status: 'ACTIVE',
      ...partial,
    };
    await repository.insert(pass);
    return pass;
  }

  return { app, repository, token, seed, foreignKey: foreign.privateKey };
}

/** Extracts the CSRF token rendered into the admin page. */
export function extractCsrf(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match?.[1]) throw new Error('CSRF token not found in page');
  return match[1];
}
