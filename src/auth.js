import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { unauthorized } from './http-error.js';

let remoteJwks = null;

function getRemoteJwks() {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(config.jwksUrl));
  }
  return remoteJwks;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

function extractUser(payload) {
  // BetterAuth's JWT plugin puts user fields at the top level. The nested
  // shape is accepted too so a custom `definePayload` cannot break the API.
  const source = payload.user && typeof payload.user === 'object' ? payload.user : payload;
  const email = source.email || payload.email;
  const name =
    source.name ||
    payload.name ||
    (typeof email === 'string' ? email.split('@')[0] : '');
  const image = source.image || source.picture || payload.image || payload.picture || '';
  const id = source.id || payload.sub || null;

  if (typeof email !== 'string' || !email.includes('@')) return null;

  return {
    id: id ? String(id) : null,
    email: email.trim().toLowerCase(),
    name: String(name).trim() || 'BookNook reader',
    image: String(image),
  };
}

async function verifyToken(token) {
  if (config.jwksUrl) {
    const options = {};
    if (config.jwtIssuer) options.issuer = config.jwtIssuer;
    if (config.jwtAudience) options.audience = config.jwtAudience;
    const { payload } = await jwtVerify(token, getRemoteJwks(), options);
    return payload;
  }

  if (config.jwtSecret) {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(config.jwtSecret),
      { algorithms: ['HS256'] }
    );
    return payload;
  }

  throw new Error(
    'JWT verification is not configured. Set BETTER_AUTH_URL (or BETTER_AUTH_JWKS_URL) or JWT_SECRET.'
  );
}

export async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return next(unauthorized('Missing Bearer token.'));
  }

  try {
    const payload = await verifyToken(token);
    const user = extractUser(payload);
    if (!user) {
      return next(unauthorized('Token does not contain a valid user email.'));
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error.status) return next(error);
    if (error.code === 'ERR_JWT_EXPIRED') {
      return next(unauthorized('Your session has expired. Please log in again.'));
    }
    if (error.name?.startsWith('JWT') || error.code?.startsWith('ERR_JWT')) {
      return next(unauthorized('Invalid or expired token.'));
    }
    // A missing key set, a JWKS network error, or missing config is a server
    // problem, not a bad user token.
    return next(error);
  }
}
