import concurrently from 'concurrently';

const args = process.argv.slice(2);
const hostIndex = args.indexOf('--host');
const host = hostIndex < 0 ? '127.0.0.1' : args[hostIndex + 1] || '0.0.0.0';
if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error('Invalid host');
const { result } = concurrently([
  { command: 'npm run dev --workspace server', name: 'api', prefixColor: 'cyan' },
  { command: `npm run dev --workspace client -- --host ${host}`, name: 'web', prefixColor: 'blue' },
], { killOthersOn: ['failure', 'success'] });
result.catch(() => { process.exitCode = 1; });
