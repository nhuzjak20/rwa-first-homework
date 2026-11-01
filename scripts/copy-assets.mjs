// Copies non-TypeScript assets (EJS views and static files) into dist/.
import { cp } from 'node:fs/promises';

await cp('src/views', 'dist/views', { recursive: true, filter: (src) => !src.endsWith('.ts') });
await cp('src/public', 'dist/public', { recursive: true });
console.log('Assets copied to dist/.');
