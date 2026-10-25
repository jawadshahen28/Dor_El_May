import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { createApp } from '../server/src/app.js';
import { connectDatabase, databaseAvailable } from '../server/src/config/database.js';
import { loadConfig } from '../server/src/config/env.js';
import { createRateLimits } from '../server/src/middleware/rateLimits.js';
import { User } from '../server/src/models/User.js';
import { Zone } from '../server/src/models/Zone.js';
import { WaterRound } from '../server/src/models/WaterRound.js';
import { Announcement } from '../server/src/models/Announcement.js';
import { CitizenReport } from '../server/src/models/CitizenReport.js';
import { hashPassword } from '../server/src/utils/password.js';

// Dedicated disposable database. Never use developer credentials or Atlas in UI tests.
const mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../.cache/mongodb', import.meta.url)) } });
const connection = await connectDatabase(mongo.getUri('door_el_may_browser_test'));
await Promise.all([User.init(), Zone.init(), WaterRound.init(), Announcement.init(), CitizenReport.init()]);
const zones = await Zone.insertMany(['الحارة الوسطى', 'الحارة الغربية', 'الحارة القبلية', 'الحارة التحتا', 'حارة الرويس'].map((name) => ({ name })));
// Existing tests already exercise the 10/hour registration allowance. Prepare
// disposable announcement-test citizens here, without weakening any limiter.
const announcementPasswordHash = await hashPassword('AnnouncementBrowser9!');
await User.insertMany(['0594611111', '0594622222', '0594633333', '0594644444', '0594655555', '0594666666'].map((phone) => ({
  fullName: 'مواطن اختبار الإعلانات', phone, passwordHash: announcementPasswordHash, zoneId: zones[0]._id,
})));
const reportPasswordHash = await hashPassword('ReportBrowser9!');
await User.insertMany(['0594811111', '0594822222', '0594833333', '0594844444'].map((phone) => ({
  fullName: 'مواطن اختبار البلاغات', phone, passwordHash: reportPasswordHash, zoneId: zones[0]._id,
})));
// Admin fixture exists only in this explicitly invoked, disposable test server.
await User.create({ fullName: 'مسؤول اختبار المجلس', phone: '0594911111', passwordHash: await hashPassword('AdminBrowserPass9!'), role: 'admin', status: 'active' });
const councilPasswordHash = await hashPassword('CouncilBrowser9!');
await User.insertMany([
  { fullName: 'مسؤول اختبار إدارة المياه', phone: '0594933333', passwordHash: councilPasswordHash, role: 'admin' },
  { fullName: 'مواطن اختبار إدارة المياه', phone: '0594944444', passwordHash: councilPasswordHash, zoneId: zones[0]._id },
]);
// PWA privacy fixtures are confined to this explicitly invoked temporary database.
const pwaPasswordHash = await hashPassword('PwaBrowserPass9!');
await User.insertMany([
  { fullName: 'مواطن تثبيت أول', phone: '0596911111', passwordHash: pwaPasswordHash, zoneId: zones[0]._id },
  { fullName: 'مواطن تثبيت ثان', phone: '0596922222', passwordHash: pwaPasswordHash, zoneId: zones[1]._id },
]);
const config = loadConfig({ SESSION_SECRET: 'temporary-browser-test-session-secret-32-characters', APP_ORIGINS: 'http://127.0.0.1:4173' });
const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
store.on('error', () => console.error('Browser test session store error.'));
const app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
const server = app.listen(4173, '127.0.0.1', () => console.log('Isolated browser test server ready.'));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close(async () => { await mongoose.disconnect(); await mongo.stop(); process.exit(0); });
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
