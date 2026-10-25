import webpush from 'web-push';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Explicit local preparation only; never run by a build, deployment or startup.
const directory = resolve('.local');
mkdirSync(directory, { recursive: true });
const file = resolve(directory, 'push-staging.env');
const keys = webpush.generateVAPIDKeys();
try {
  writeFileSync(file, `PUSH_OUTBOUND_ENABLED=false\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nPUSH_SUBSCRIPTION_KEY=${randomBytes(32).toString('base64url')}\nVAPID_SUBJECT=\nPUSH_STAGING_CONFIRMED=false\nPUSH_STAGING_DATABASE=\nPUSH_TEST_USER_IDS=\nPUSH_DELIVERY_NOT_BEFORE=\n`, { flag: 'wx', mode: 0o600 });
  console.log('Staging push keys saved in ignored .local/push-staging.env. Keep this file private; existing server/.env is unchanged.');
} catch { console.error('Key file already exists or could not be created. No existing file was overwritten.'); process.exitCode = 1; }
