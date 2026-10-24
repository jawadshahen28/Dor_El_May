import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

export const envFilePath = fileURLToPath(new URL('../../.env', import.meta.url));
const envResult = dotenv.config({ path: envFilePath, quiet: true });

// Database maintenance commands do not need web-server session secrets.
export function loadDatabaseConfig(source = process.env) {
  return { mongoUri: typeof source.MONGODB_URI === 'string' ? source.MONGODB_URI.trim() : '' };
}

// Only flags and fixed labels may be logged; never parsed environment values.
export function databaseEnvironmentStatus() {
  const effective = loadDatabaseConfig().mongoUri;
  const fileValue = envResult.parsed?.MONGODB_URI?.trim();
  return {
    envFileLoaded: !envResult.error,
    mongoUriPresent: Boolean(effective),
    mongoUriSource: !effective ? 'missing' : effective === fileValue ? 'server/.env' : 'process environment',
    envFileValueOverridden: Boolean(fileValue && effective !== fileValue),
  };
}

export function loadConfig(source = process.env) {
  const production = source.NODE_ENV === 'production';
  const port = Number(source.PORT || 3001);
  const sessionDays = Number(source.SESSION_DAYS || 30);
  const trustProxyHops = Number(source.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  if (!Number.isFinite(sessionDays) || sessionDays < 1 || sessionDays > 90) throw new Error('SESSION_DAYS must be between 1 and 90.');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) throw new Error('Invalid TRUST_PROXY_HOPS.');
  const secret = source.SESSION_SECRET || '';
  if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) {
    throw new Error('Configure a random SESSION_SECRET in server/.env (npm run setup:env creates one).');
  }
  const origins = (source.APP_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((v) => v.trim()).filter(Boolean);
  if (!origins.length) throw new Error('APP_ORIGINS must contain at least one exact origin.');
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); }
    catch { throw new Error('APP_ORIGINS must contain exact origins; production requires HTTPS.'); }
    if (origin.includes('*') || url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) {
      throw new Error('APP_ORIGINS must contain exact origins; production requires HTTPS.');
    }
  }
  const { mongoUri } = loadDatabaseConfig(source);
  if (production && !mongoUri) throw new Error('MONGODB_URI is required in production.');
  return {
    production, port, host: source.HOST || (production ? '0.0.0.0' : '127.0.0.1'), mongoUri,
    sessionSecret: secret, sessionDays, trustProxyHops, origins,
    cookieName: production ? '__Host-door.sid' : 'door.sid',
  };
}
