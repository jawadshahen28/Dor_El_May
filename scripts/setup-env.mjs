import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function setupLocalEnvironment({ target = new URL('../server/.env', import.meta.url), example = new URL('../server/.env.example', import.meta.url) } = {}) {
  if (existsSync(target)) return false;
  // Examples contain names only. Hosting uses explicit environment settings.
  const defaults = {
    NODE_ENV: 'development', PORT: '3001', HOST: '127.0.0.1', MONGODB_URI: '',
    SESSION_SECRET: randomBytes(48).toString('hex'), SESSION_DAYS: '30',
    APP_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173', TRUST_PROXY_HOPS: '0',
  };
  const content = readFileSync(example, 'utf8').replace(/^([A-Z_][A-Z_\d]*)=$/gm, (_line, name) => `${name}=${defaults[name] ?? ''}`);
  writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(setupLocalEnvironment()
    ? 'Created server/.env with a random session secret. Add your MONGODB_URI locally.'
    : 'server/.env already exists; it was left unchanged.');
}
