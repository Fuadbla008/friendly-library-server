import 'dotenv/config';

const ATLAS_HOSTS =
  'ac-nkhxgqo-shard-00-00.z4m5int.mongodb.net:27017,' +
  'ac-nkhxgqo-shard-00-01.z4m5int.mongodb.net:27017,' +
  'ac-nkhxgqo-shard-00-02.z4m5int.mongodb.net:27017';

function buildMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  const user = process.env.MONGODB_USER;
  const pass = process.env.MONGODB_PASS;
  if (!user || !pass) {
    throw new Error(
      'Set MONGODB_URI, or set both MONGODB_USER and MONGODB_PASS in .env'
    );
  }

  const hosts = process.env.MONGODB_HOSTS || ATLAS_HOSTS;
  const options =
    process.env.MONGODB_OPTIONS ||
    'ssl=true&replicaSet=atlas-inuk23-shard-0&authSource=admin';

  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts}/?${options}`;
}

function trimSlash(value) {
  return value ? value.replace(/\/+$/, '') : '';
}

function listOrigins(value) {
  return (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const betterAuthUrl = trimSlash(process.env.BETTER_AUTH_URL);
const jwksUrl =
  process.env.BETTER_AUTH_JWKS_URL ||
  (betterAuthUrl ? `${betterAuthUrl}/api/auth/jwks` : '');

const clientOrigins = listOrigins(
  process.env.CLIENT_ORIGINS || 'http://localhost:3000'
);

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,

  mongoUri: buildMongoUri(),
  dbName: process.env.MONGODB_DB || 'friendly_library',
  booksCollection: process.env.BOOKS_COLLECTION || 'book_data',
  borrowsCollection: process.env.BORROWS_COLLECTION || 'borrows',

  // BetterAuth's JWT plugin signs tokens with an EdDSA key exposed at /api/auth/jwks.
  jwksUrl,
  jwtIssuer: process.env.JWT_ISSUER || betterAuthUrl,
  jwtAudience: process.env.JWT_AUDIENCE || betterAuthUrl,
  // HS256 fallback for local testing / a custom frontend signer.
  jwtSecret: process.env.JWT_SECRET || '',

  loanDays: Number(process.env.LOAN_DAYS) || 14,
  clientOrigins,
};
