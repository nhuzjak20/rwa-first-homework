import type { RequestHandler } from 'express';
import { sendBearerError, type AccessTokenClaims } from './jwtAuth.js';

export function grantedScopes(claims: AccessTokenClaims): Set<string> {
  const scopes = new Set(typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : []);
  // Auth0 RBAC may also expose permissions as an array claim.
  if (Array.isArray(claims.permissions)) {
    for (const permission of claims.permissions) scopes.add(permission);
  }
  return scopes;
}

/** Must run after createJwtAuth(). Responds 403 when the token lacks the scope. */
export function requireScope(scope: string): RequestHandler {
  return (_req, res, next) => {
    const claims = res.locals.accessToken;
    if (!claims) {
      sendBearerError(res, 401, 'invalid_token', 'Access token is required');
      return;
    }
    if (!grantedScopes(claims).has(scope)) {
      sendBearerError(res, 403, 'insufficient_scope', `Token is missing required scope ${scope}`);
      return;
    }
    next();
  };
}
