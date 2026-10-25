import mongoose from 'mongoose';
import { loadConfig } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { processPushBatch } from './services/pushProcessor.js';

// Explicit bounded cron/worker entry point. Never invoked by npm start or a web request.
try {
  const config = loadConfig();
  if (!config.push.enabled) console.log('Push delivery disabled; nothing processed.');
  else { await connectDatabase(config.mongoUri); console.log(JSON.stringify(await processPushBatch({ config: config.push, sessionSecret: config.sessionSecret }))); }
} catch { console.error('Push processing stopped safely. Check configuration, database and sanitized delivery status.'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
