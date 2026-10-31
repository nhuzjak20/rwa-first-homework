import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createPool } from './config/database.js';
import { createOidcMiddleware } from './config/auth.js';
import { createJwtAuth } from './middleware/jwtAuth.js';
import { PgPassRepository } from './repositories/pass.repository.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const pool = createPool(config.databaseUrl, config.databaseSsl);

const app = createApp({
  baseUrl: config.baseUrl,
  repository: new PgPassRepository(pool),
  oidc: createOidcMiddleware(config, pool),
  bearerAuth: createJwtAuth({ issuer: config.auth0.issuer, audience: config.auth0.audience }),
});

const server = app.listen(config.port, () => {
  console.log(`Digital passes listening on port ${config.port} (${config.baseUrl})`);
});

function shutdown() {
  server.close(() => void pool.end().finally(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
