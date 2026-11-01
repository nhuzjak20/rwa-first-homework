export interface AppConfig {
  port: number;
  /** Public absolute URL of the app without a trailing slash, e.g. https://app.onrender.com */
  baseUrl: string;
  databaseUrl: string;
  databaseSsl: boolean;
  sessionSecret: string;
  auth0: {
    /** Issuer with a trailing slash, exactly as it appears in the `iss` claim. */
    issuer: string;
    audience: string;
    webClientId: string;
    webClientSecret: string;
  };
}

export function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const sessionSecret = required(env, 'SESSION_SECRET');
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long');
  }
  const issuerBase = stripTrailingSlashes(required(env, 'AUTH0_ISSUER_BASE_URL'));

  return {
    port: Number(env.PORT ?? 3000),
    baseUrl: stripTrailingSlashes(required(env, 'BASE_URL')),
    databaseUrl: required(env, 'DATABASE_URL'),
    databaseSsl: env.DATABASE_SSL === 'true',
    sessionSecret,
    auth0: {
      issuer: `${issuerBase}/`,
      audience: required(env, 'AUTH0_AUDIENCE'),
      webClientId: required(env, 'AUTH0_WEB_CLIENT_ID'),
      webClientSecret: required(env, 'AUTH0_WEB_CLIENT_SECRET'),
    },
  };
}
