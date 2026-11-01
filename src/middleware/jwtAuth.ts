import type { RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface JwtAuthOptions {
  /** Expected `iss` claim, e.g. https://tenant.eu.auth0.com/ */
  issuer: string;
  /** Expected `aud` claim (Auth0 API identifier). */
  audience: string;
  /** Key resolver; defaults to the issuer's JWKS endpoint. Injected in tests. */
  keys?: JWTVerifyGetKey;
}

export interface AccessTokenClaims extends JWTPayload {
  scope?: string;
  permissions?: string[];
}

declare global {
  namespace Express {
    interface Locals {
      accessToken?: AccessTokenClaims;
    }
  }
}

export function sendBearerError(res: Response, status: 401 | 403, error: string, description: string): void {
  const challenge = [`Bearer realm="passes-api"`];
  if (status === 403 || error !== 'invalid_request') {
    challenge.push(`error="${error}"`, `error_description="${description}"`);
  }
  res.status(status).set('WWW-Authenticate', challenge.join(', ')).json({ error, message: description });
}

/**
 * Validates an OAuth2 Bearer JWT issued by Auth0: RS256 signature against the issuer's JWKS,
 * issuer, audience and expiry (with small clock tolerance).
 */
export function createJwtAuth(options: JwtAuthOptions): RequestHandler {
  const keys = options.keys ?? createRemoteJWKSet(new URL('.well-known/jwks.json', options.issuer));

  return async (req, res, next) => {
    const header = req.get('authorization');
    const match = header?.match(/^Bearer\s+([A-Za-z0-9\-_.~+/]+=*)\s*$/i);
    if (!match?.[1]) {
      sendBearerError(res, 401, header ? 'invalid_token' : 'invalid_request', 'Missing or malformed Bearer token');
      return;
    }

    try {
      const { payload } = await jwtVerify<AccessTokenClaims>(match[1], keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp'],
        clockTolerance: 5,
      });
      res.locals.accessToken = payload;
      next();
    } catch {
      sendBearerError(res, 401, 'invalid_token', 'Access token is invalid or expired');
    }
  };
}
