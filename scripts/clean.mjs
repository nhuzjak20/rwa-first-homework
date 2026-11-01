// Removes the previous build so stale files never end up in dist/.
import { rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
