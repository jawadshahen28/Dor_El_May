import mongoose from 'mongoose';

const diagnostics = {
  MONGODB_URI_MISSING: {
    summary: 'MONGODB_URI is missing.',
    action: 'Add your connection string to server/.env. Do not share it or commit it.',
  },
  URI_FORMAT_ERROR: {
    summary: 'The MongoDB connection string has invalid syntax.',
    action: 'Use the Atlas Connect > Drivers string. Percent-encode the username/password components once; do not encode the entire URI. Check quotes and unreplaced placeholders.',
  },
  URI_PERCENT_ENCODING: {
    summary: 'The MongoDB connection string contains an invalid percent escape.',
    action: 'Encode special characters in the password once. A literal percent sign must be %25; existing valid percent escapes must not be encoded again.',
  },
  MODEL_INIT_BEFORE_CONNECTION: {
    summary: 'A Mongoose model initialized its collection before MongoDB connected.',
    action: 'Keep startup buffering enabled or compile models only after awaiting the database connection.',
  },
  AUTHENTICATION_FAILED: {
    summary: 'MongoDB rejected the database credentials.',
    action: 'Check the Atlas Database Access user and its password, the selected cluster, password encoding, and authSource (normally admin for Atlas).',
  },
  PERMISSION_DENIED: {
    summary: 'The database user is not authorized for this operation.',
    action: 'In Atlas Database Access, grant this user readWrite on the exact database named in the URI, then retry. Creating collections/indexes and inserting neighborhoods must be permitted.',
  },
  DNS_LOOKUP_FAILED: {
    summary: 'The MongoDB hostname or SRV record could not be resolved.',
    action: 'Check the hostname against Atlas Connect > Drivers and check DNS/network access. If SRV resolution is blocked, use the official non-SRV string from Atlas or a DNS resolver that supports SRV records.',
  },
  NETWORK_CONNECTION_FAILED: {
    summary: 'MongoDB could not be reached, or server selection timed out.',
    action: 'Check Atlas Network Access for your current public IP, outbound TCP access to the cluster, and VPN/firewall rules. A timeout alone does not prove which network setting is responsible.',
  },
  TLS_CONNECTION_FAILED: {
    summary: 'The secure TLS connection to MongoDB failed.',
    action: 'Check the system clock, trusted certificates, and TLS interception by a VPN/proxy. Keep certificate validation enabled.',
  },
  INDEX_CONFLICT: {
    summary: 'An existing MongoDB index conflicts with the model definition.',
    action: 'Inspect the indexes on the zones collection in Atlas. No indexes or data were deleted automatically.',
  },
  DUPLICATE_KEY: {
    summary: 'MongoDB found duplicate values for a unique index.',
    action: 'Inspect existing neighborhood names and indexes in Atlas. Resolve the conflicting records before retrying; existing records were not deleted.',
  },
  DATABASE_NAME_CONFLICT: {
    summary: 'The database name conflicts with an existing name that differs only in letter case.',
    action: 'Use the exact existing database name and matching readWrite permission in Atlas.',
  },
  SEED_VERIFICATION_FAILED: {
    summary: 'The seed completed its writes but could not verify all five sample neighborhoods.',
    action: 'Check database availability and read permissions, then rerun the seed. The command is safe to rerun.',
  },
  DATABASE_ERROR: {
    summary: 'An unexpected database operation failed.',
    action: 'Review the operation stage and safe error codes below. Raw errors are intentionally withheld because they can contain credentials.',
  },
};

export class DatabaseConfigError extends Error {
  constructor(code) {
    super(diagnostics[code].summary);
    this.name = 'DatabaseConfigError';
    this.diagnosticCode = code;
  }
}

export function validateMongoUri(uri) {
  if (typeof uri !== 'string' || !uri.trim()) throw new DatabaseConfigError('MONGODB_URI_MISSING');
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri) || /\s|<[^>]*>|YOUR_(?:DB_USER|URL_ENCODED_PASSWORD|CLUSTER)/i.test(uri)) {
    throw new DatabaseConfigError('URI_FORMAT_ERROR');
  }
  if (/%(?![\da-f]{2})/i.test(uri)) throw new DatabaseConfigError('URI_PERCENT_ENCODING');
  try {
    // Parsing only: no connection, logging, or alteration of credentials.
    new mongoose.mongo.MongoClient(uri);
  } catch {
    throw new DatabaseConfigError('URI_FORMAT_ERROR');
  }
}

const safeNetworkCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEOUT', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNABORTED']);
const safeTypes = new Set(['MongooseError', 'MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoServerError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoParseError', 'MongoAPIError', 'MongoInvalidArgumentError', 'TypeError', 'DatabaseConfigError']);

export function diagnoseDatabaseError(error) {
  const queue = [error];
  const seen = new Set();
  const codes = new Set();
  const types = new Set();
  const messages = [];
  let explicitCode;
  while (queue.length && seen.size < 40) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (typeof current.code === 'number' && Number.isFinite(current.code)) codes.add(current.code);
    else if (safeNetworkCodes.has(current.code)) codes.add(current.code);
    if (safeTypes.has(current.name)) types.add(current.name);
    if (typeof current.message === 'string') messages.push(current.message);
    if (Object.hasOwn(diagnostics, current.diagnosticCode)) explicitCode ||= current.diagnosticCode;
    queue.push(current.cause, current.reason, current.error, current.originalError, current.errorResponse);
    if (current.servers instanceof Map) queue.push(...current.servers.values());
    if (Array.isArray(current.errors)) queue.push(...current.errors);
  }
  // Classify messages internally. Never return or log the raw messages.
  const text = messages.join(' ');
  const checks = [
    ['MODEL_INIT_BEFORE_CONNECTION', /Cannot read properties of undefined \(reading 'createCollection'\)|before initial connection is complete.*bufferCommands/is],
    ['AUTHENTICATION_FAILED', /authentication failed|bad auth|auth failed/i, codes.has(18)],
    ['PERMISSION_DENIED', /not authorized|unauthorized/i, codes.has(13)],
    ['DATABASE_NAME_CONFLICT', /already exists with different case|differ only in case/i, codes.has(13297)],
    ['INDEX_CONFLICT', /IndexOptionsConflict|IndexKeySpecsConflict/i, codes.has(85) || codes.has(86)],
    ['DUPLICATE_KEY', /duplicate key|E11000/i, codes.has(11000)],
    ['URI_FORMAT_ERROR', /unescaped|invalid (?:connection string|scheme|uri)|URI malformed/i, types.has('MongoParseError')],
    ['TLS_CONNECTION_FAILED', /certificate|SSL|TLS/i],
    ['DNS_LOOKUP_FAILED', /querySrv|queryTxt|ENOTFOUND|EAI_AGAIN/i, codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')],
    ['NETWORK_CONNECTION_FAILED', /ECONNREFUSED|ECONNRESET|ETIMEOUT|ETIMEDOUT|timed out|timeout|could(?:n.t| not) connect to any servers/i, [...codes].some((code) => safeNetworkCodes.has(code)) || types.has('MongooseServerSelectionError') || types.has('MongoServerSelectionError')],
  ];
  const category = explicitCode || checks.find(([, pattern, codeMatch]) => codeMatch || pattern.test(text))?.[0] || 'DATABASE_ERROR';
  return { category, ...diagnostics[category], errorTypes: [...types], errorCodes: [...codes] };
}

const stages = {
  configuration: 'loading database configuration', connection: 'connecting to MongoDB',
  ping: 'checking the MongoDB connection', indexes: 'initializing neighborhood collection/indexes',
  upserts: 'inserting sample neighborhoods', verification: 'verifying sample neighborhoods',
  disconnect: 'closing the MongoDB connection',
};
export function formatDatabaseError(error, stage = 'connection') {
  const diagnostic = diagnoseDatabaseError(error);
  return [
    `Database operation failed while ${stages[stage] || 'accessing MongoDB'}.`,
    `[${diagnostic.category}] ${diagnostic.summary}`,
    diagnostic.action,
    ...(diagnostic.errorTypes.length ? [`Error type: ${diagnostic.errorTypes.join(', ')}`] : []),
    ...(diagnostic.errorCodes.length ? [`Error code: ${diagnostic.errorCodes.join(', ')}`] : []),
  ].join('\n');
}
