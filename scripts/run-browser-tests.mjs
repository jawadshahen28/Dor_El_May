import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const argumentsFromUser = process.argv.slice(2);
const specs = readdirSync(new URL('../tests/', import.meta.url), { recursive: true })
  .filter((path) => /\.spec\.[cm]?[jt]sx?$/.test(path)).map((path) => 'tests/' + path.replaceAll('\\', '/')).sort();
const council = specs.filter((path) => path === 'tests/council-water.spec.js');
// Each invocation gets its own disposable database/session/rate-limit store.
// Keep the real production limits intact as the workflow test suite grows.
const groups = argumentsFromUser.length ? [argumentsFromUser] : [specs.filter((path) => !council.includes(path)), council];
for (const group of groups.filter((items) => items.length)) {
  const child = spawn(process.execPath, [cli, 'test', ...group], { cwd: root, stdio: 'inherit' });
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGTERM', terminate); process.once('SIGINT', terminate);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code) => resolve(code ?? 1)); });
  process.removeListener('SIGTERM', terminate); process.removeListener('SIGINT', terminate);
  if (code !== 0) { process.exitCode = code; break; }
}
