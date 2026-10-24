import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDatabaseConfig, databaseEnvironmentStatus } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { formatDatabaseError } from './utils/databaseDiagnostics.js';
import { createAdminAccount, validateAdminAccount } from './services/adminAccounts.js';

export async function question(prompt, hidden = false, { input = process.stdin, output: target = process.stdout } = {}) {
  const output = hidden ? new Writable({ write(_chunk, _encoding, done) { done(); } }) : target;
  const terminal = createInterface({ input, output, terminal: true });
  const controller = new AbortController();
  terminal.on('SIGINT', () => controller.abort());
  try {
    if (hidden) target.write(prompt);
    return await terminal.question(hidden ? '' : prompt, { signal: controller.signal });
  } finally {
    terminal.close();
    if (hidden) { output.end(); target.write('\n'); }
  }
}

export async function runCreateAdmin() {
  let stage = 'configuration';
  try {
    if (process.argv.length > 2 || !process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('Run npm run admin:create in an interactive local terminal, without arguments or piped input.');
      process.exitCode = 1;
      return;
    }
    console.log('Create a Council administrator. Existing accounts will never be changed. Ctrl+C cancels.');
    const values = {
      fullName: await question('Full name: '), phone: await question('Local mobile phone (05XXXXXXXX): '),
      password: await question('Password (hidden, 12–128 characters; English letter + number): ', true),
      confirmPassword: await question('Confirm password (hidden): ', true),
    };
    const fields = validateAdminAccount(values);
    if (Object.keys(fields).length) { console.error('Validation failed:', ...Object.values(fields)); process.exitCode = 1; return; }
    const environment = databaseEnvironmentStatus();
    console.log(`Database configuration source: ${environment.mongoUriSource}.`);
    if (environment.envFileValueOverridden) console.warn('The process MONGODB_URI overrides server/.env. Verify your intended database before continuing.');
    if ((await question('Type CREATE to create this administrator in the configured application database: ')) !== 'CREATE') {
      console.log('Cancelled. No account was created.'); return;
    }
    stage = 'connection';
    await connectDatabase(loadDatabaseConfig().mongoUri);
    stage = 'account creation';
    await createAdminAccount(values);
    console.log('Administrator created successfully. Open /admin/login.');
  } catch (error) {
    if (error.name === 'AbortError') console.log('Cancelled.');
    else {
      console.error(error.code === 'ACCOUNT_EXISTS' ? error.message : formatDatabaseError(error, stage));
      process.exitCode = 1;
    }
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCreateAdmin();
