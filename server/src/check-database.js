import mongoose from 'mongoose';
import { loadDatabaseConfig, databaseEnvironmentStatus } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { formatDatabaseError } from './utils/databaseDiagnostics.js';

let stage = 'configuration';
try {
  const status = databaseEnvironmentStatus();
  console.log(`Database configuration source: ${status.mongoUriSource}.`);
  if (status.envFileValueOverridden) console.warn('The process MONGODB_URI overrides server/.env.');
  stage = 'connection';
  await connectDatabase(loadDatabaseConfig().mongoUri);
  stage = 'ping';
  await mongoose.connection.db.command({ ping: 1 });
  console.log('MongoDB connection and ping succeeded. No seed data was written.');
} catch (error) {
  console.error(formatDatabaseError(error, stage));
  process.exitCode = 1;
} finally {
  try { await mongoose.disconnect(); }
  catch (error) { console.error(formatDatabaseError(error, 'disconnect')); process.exitCode = 1; }
}
