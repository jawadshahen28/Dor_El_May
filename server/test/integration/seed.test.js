import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
// Match the real seed import order: configuration first, model before connection.
import { connectDatabase } from '../../src/config/database.js';
import { Zone } from '../../src/models/Zone.js';
import { seedNeighborhoods, sampleNeighborhoods } from '../../src/seed.js';

test('models imported before a delayed connection initialize correctly and seeding is repeatable', async () => {
  // Starting a real mongod gives model initialization time to run before connect.
  // The previous global bufferCommands=false setting fails this import sequence.
  const mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  try {
    await connectDatabase(mongo.getUri('isolated_seed_regression'));
    const first = await seedNeighborhoods();
    assert.deepEqual(first, { inserted: 5, existing: 0, verified: 5 });
    const indexes = await Zone.collection.indexes();
    assert.ok(indexes.some((index) => index.key.name === 1 && index.unique === true));
    await Zone.updateOne({ name: sampleNeighborhoods[0] }, { $set: { isActive: false } });
    const second = await seedNeighborhoods();
    assert.deepEqual(second, { inserted: 0, existing: 5, verified: 5 });
    assert.equal(await Zone.countDocuments(), 5);
    assert.equal((await Zone.findOne({ name: sampleNeighborhoods[0] })).isActive, false);
    assert.deepEqual((await Zone.find().lean()).map((zone) => zone.name).sort(), [...sampleNeighborhoods].sort());
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
