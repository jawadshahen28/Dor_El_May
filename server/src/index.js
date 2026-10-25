import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { existsSync } from 'node:fs';
import { loadConfig } from './config/env.js';
import { connectDatabase, databaseAvailable, databaseHealthy } from './config/database.js';
import { createApp } from './app.js';
import { User } from './models/User.js';
import { Zone } from './models/Zone.js';
import { WaterRound } from './models/WaterRound.js';
import { Announcement } from './models/Announcement.js';
import { CitizenReport } from './models/CitizenReport.js';
import { PushSubscription } from './models/PushSubscription.js';
import { CitizenNotification } from './models/CitizenNotification.js';
import { createRateLimits } from './middleware/rateLimits.js';
import { getDummyHash } from './utils/password.js';
import { formatDatabaseError } from './utils/databaseDiagnostics.js';

const config = loadConfig();
if (config.production && !existsSync(new URL('../../client/dist/index.html', import.meta.url))) {
  throw new Error('Production frontend build is missing. Run npm run build before npm start.');
}
let store;
let limits;
if (config.mongoUri) {
  let stage = 'connection';
  try {
    const connection = await connectDatabase(config.mongoUri);
    // The existing MongoDB driver reconnects after transient disconnections.
    // Log fixed messages only; driver error objects can contain credentials.
    connection.on('error', () => console.error('MongoDB connection temporarily unavailable.'));
    connection.on('disconnected', () => console.warn('MongoDB disconnected; protected APIs are unavailable until recovery.'));
    connection.on('reconnected', () => console.log('MongoDB reconnected.'));
    stage = 'indexes';
    await Promise.all([User.init(), Zone.init(), WaterRound.init(), Announcement.init(), CitizenReport.init(), PushSubscription.init(), CitizenNotification.init()]);
    store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions', ttl: config.sessionDays * 86400 });
    store.on('error', () => console.error('Session store unavailable.'));
    limits = await createRateLimits(connection);
    await getDummyHash();
    console.log('MongoDB connected; authentication and persistent sessions are ready.');
  } catch (error) {
    console.error(formatDatabaseError(error, stage));
    if (config.production) process.exit(1);
  }
} else console.warn('MONGODB_URI is not set. UI and guest browsing are available; authentication requires MongoDB.');

const app = createApp({ config, store, limits, isDatabaseAvailable: databaseAvailable, checkDatabaseHealth: databaseHealthy });
const server = app.listen(config.port, config.host, () => console.log(`API: http://${config.host}:${config.port}`));
server.on('error', (error) => { console.error('API could not start.', { code: error.code }); process.exitCode = 1; });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
