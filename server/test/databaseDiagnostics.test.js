import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { envFilePath, loadDatabaseConfig } from '../src/config/env.js';
import { validateMongoUri, diagnoseDatabaseError, formatDatabaseError } from '../src/utils/databaseDiagnostics.js';

// All credentials in this file are synthetic fixtures, never developer secrets.
const fixturePassword = 'SYNTHETIC%40password%3Aonly';
const fixtureUri = `mongodb+srv://fixture:${fixturePassword}@example.mongodb.net/fixture_db`;

test('database configuration resolves server/.env independently of cwd and needs no session secret', () => {
  assert.equal(envFilePath, fileURLToPath(new URL('../.env', import.meta.url)));
  assert.deepEqual(loadDatabaseConfig({ MONGODB_URI: '  mongodb://127.0.0.1:27017/fixture_db  ' }), { mongoUri: 'mongodb://127.0.0.1:27017/fixture_db' });
  assert.deepEqual(loadDatabaseConfig({}), { mongoUri: '' });
});

test('URI validation accepts encoded credentials and rejects malformed formats safely', () => {
  assert.doesNotThrow(() => validateMongoUri(fixtureUri));
  assert.doesNotThrow(() => validateMongoUri('mongodb://127.0.0.1:27017/fixture_db'));
  for (const uri of ['', 'https://example.com', 'mongodb+srv://<username>:<password>@example.mongodb.net/db', 'mongodb://fixture:bad%escape@127.0.0.1/db']) {
    assert.throws(() => validateMongoUri(uri), (error) => {
      assert.ok(['MONGODB_URI_MISSING', 'URI_FORMAT_ERROR', 'URI_PERCENT_ENCODING'].includes(error.diagnosticCode));
      assert.ok(!error.message.includes('bad%escape'));
      return true;
    });
  }
});

test('diagnostics recognize the pre-connection Mongoose collection initialization failure', () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'createCollection')");
  assert.equal(diagnoseDatabaseError(error).category, 'MODEL_INIT_BEFORE_CONNECTION');
  assert.match(formatDatabaseError(error, 'indexes'), /initializing neighborhood collection\/indexes/);
});

test('nested network errors are classified without logging credential-bearing messages or objects', () => {
  const cause = Object.assign(new Error(`querySrv ENOTFOUND ${fixtureUri}`), { code: 'ENOTFOUND' });
  const error = Object.assign(new Error(`Connection failed: ${fixtureUri}`), {
    name: 'MongooseServerSelectionError', reason: { servers: new Map([['fixture', { error: cause }]]) },
    uri: fixtureUri, password: fixturePassword,
  });
  cause.cause = error; // Real driver error graphs may contain cycles.
  const diagnostic = diagnoseDatabaseError(error);
  assert.equal(diagnostic.category, 'DNS_LOOKUP_FAILED');
  assert.ok(diagnostic.errorCodes.includes('ENOTFOUND'));
  const output = formatDatabaseError(error);
  for (const secret of [fixtureUri, fixturePassword, 'example.mongodb.net']) assert.ok(!output.includes(secret));
});

test('authentication, permission, and index failures receive distinct actionable diagnostics', () => {
  for (const [code, category] of [[18, 'AUTHENTICATION_FAILED'], [13, 'PERMISSION_DENIED'], [85, 'INDEX_CONFLICT'], [11000, 'DUPLICATE_KEY']]) {
    const error = Object.assign(new Error(fixtureUri), { name: 'MongoServerError', code });
    assert.equal(diagnoseDatabaseError(error).category, category);
    assert.ok(!formatDatabaseError(error).includes(fixtureUri));
  }
});

test('unknown errors cannot leak secrets through custom names, codes, stages, or messages', () => {
  const error = { name: fixturePassword, code: fixtureUri, message: fixtureUri };
  const output = formatDatabaseError(error, fixtureUri);
  assert.equal(diagnoseDatabaseError(error).category, 'DATABASE_ERROR');
  assert.ok(!output.includes(fixtureUri));
  assert.ok(!output.includes(fixturePassword));
});
