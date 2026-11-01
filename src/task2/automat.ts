import { writeFile } from 'node:fs/promises';
import path from 'node:path';

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    return text ? `: ${text.slice(0, 500)}` : '';
  } catch {
    return '';
  }
}

/**
 * Obtains an OAuth2 access token from Auth0 using the client credentials grant.
 */
export async function getToken(
  authority: string,
  audience: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<string> {
  const tokenUrl = `${authority.trim().replace(/\/+$/, '')}/oauth/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      audience,
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Token request failed with HTTP ${response.status} ${response.statusText}${await readErrorBody(response)}`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Token response (HTTP ${response.status}) is not valid JSON`);
  }

  const accessToken = (payload as { access_token?: unknown } | null)?.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('Token response does not contain an access_token string');
  }
  return accessToken;
}

/**
 * Issues a new pass through the protected API and saves the returned QR code PNG
 * as `<pass-id>.png` in the current working directory.
 */
export async function issuePass(
  url: string,
  token: string,
  name: string,
  document: string
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'image/png',
    },
    body: JSON.stringify({ name, document }),
  });

  if (!response.ok) {
    throw new Error(
      `Pass request failed with HTTP ${response.status} ${response.statusText}${await readErrorBody(response)}`
    );
  }

  const location = response.headers.get('location');
  if (!location) {
    throw new Error(`Response (HTTP ${response.status}) has no Location header`);
  }

  let passId: string;
  try {
    // Resolve relative Location values against the request URL.
    const segments = new URL(location, url).pathname.split('/').filter(Boolean);
    passId = decodeURIComponent(segments.at(-1) ?? '');
  } catch {
    throw new Error(`Location header is malformed: ${location}`);
  }
  // The id becomes a file name, so refuse anything that could escape the working directory.
  if (!/^[A-Za-z0-9-]+$/.test(passId)) {
    throw new Error(`Location header does not end with a valid pass id: ${location}`);
  }

  const png = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(process.cwd(), `${passId}.png`), png);
}
