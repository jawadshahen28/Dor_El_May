import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDatabaseConfig, databaseEnvironmentStatus } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { DatabaseConfigError, formatDatabaseError } from './utils/databaseDiagnostics.js';
import { Zone } from './models/Zone.js';

export const sampleNeighborhoods = Object.freeze([
  'الحارة الوسطى', 'الحارة الغربية', 'الحارة القبلية', 'الحارة التحتا', 'حارة الرويس',
]);

export async function seedNeighborhoods({ onStage = () => {} } = {}) {
  onStage('indexes');
  await Zone.init();
  onStage('upserts');
  let inserted = 0;
  for (const name of sampleNeighborhoods) {
    const result = await Zone.updateOne({ name }, { $setOnInsert: { name, isActive: true } }, { upsert: true });
    inserted += result.upsertedCount;
  }
  onStage('verification');
  const verified = await Zone.countDocuments({ name: { $in: sampleNeighborhoods } });
  if (verified !== sampleNeighborhoods.length) throw new DatabaseConfigError('SEED_VERIFICATION_FAILED');
  return { inserted, existing: sampleNeighborhoods.length - inserted, verified };
}

export async function runSeed() {
  let stage = 'configuration';
  try {
    const { mongoUri } = loadDatabaseConfig();
    const environment = databaseEnvironmentStatus();
    console.log(`Database configuration source: ${environment.mongoUriSource}.`);
    if (environment.envFileValueOverridden) console.warn('The process MONGODB_URI overrides server/.env. Check the terminal environment if this is unintended.');
    stage = 'connection';
    await connectDatabase(mongoUri);
    console.log('MongoDB connected.');
    const result = await seedNeighborhoods({ onStage: (value) => { stage = value; } });
    console.log(`Seed complete. Inserted: ${result.inserted}; already present: ${result.existing}; verified: ${result.verified}/${sampleNeighborhoods.length}.`);
    console.log('These neighborhoods are examples, not an official distribution map.');
  } catch (error) {
    console.error(formatDatabaseError(error, stage));
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); }
    catch (error) { console.error(formatDatabaseError(error, 'disconnect')); process.exitCode = 1; }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSeed();
