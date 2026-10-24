import mongoose from 'mongoose';
import { validateMongoUri } from '../utils/databaseDiagnostics.js';

// Models are imported before connectDatabase() in seed.js and index.js.
// Keep default buffering so their collection/index initialization waits for
// the connection. API routes already reject requests when MongoDB is unavailable.

export async function connectDatabase(uri) {
  validateMongoUri(uri);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, maxPoolSize: 10, autoIndex: true });
  return mongoose.connection;
}

export const databaseAvailable = () => mongoose.connection.readyState === 1;

// Bound the entire health probe below Render's HTTP health-check timeout.
export async function databaseHealthy() {
  if (!databaseAvailable()) return false;
  try {
    await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
    return true;
  } catch { return false; }
}
