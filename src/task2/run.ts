// Manual runner for task 2: `npm run task2 -- "Pero Perić" "HR-123456789"`
// Reads Auth0 M2M settings from the environment (or .env).
import { existsSync } from 'node:fs';
import { getToken, issuePass } from './automat.js';

if (existsSync('.env')) process.loadEnvFile('.env');

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const [name = 'Pero Perić', document = 'HR-123456789'] = process.argv.slice(2);

const token = await getToken(
  env('AUTH0_ISSUER_BASE_URL'),
  env('AUTH0_AUDIENCE'),
  env('AUTH0_M2M_CLIENT_ID'),
  env('AUTH0_M2M_CLIENT_SECRET'),
  'create:passes read:passes'
);
await issuePass(env('PASSES_API_URL'), token, name, document);
console.log('Pass issued; QR code saved in the current directory.');
