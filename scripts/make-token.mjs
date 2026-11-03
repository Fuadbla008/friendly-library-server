// Local-only helper for trying protected routes before BetterAuth is wired up.
// It signs an HS256 token with JWT_SECRET; BetterAuth in production uses JWKS.
import 'dotenv/config';
import { SignJWT } from 'jose';

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET is not set. Add it to .env first.');
  process.exit(1);
}

const email = (process.argv[2] || 'demo@booknook.test').toLowerCase();
const name = process.argv[3] || 'Demo Reader';
const expires = process.argv[4] || '7d';

const token = await new SignJWT({ email, name, image: '' })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(email)
  .setIssuedAt()
  .setExpirationTime(expires)
  .sign(new TextEncoder().encode(secret));

console.log(token);
