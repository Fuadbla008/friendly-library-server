// End-to-end smoke test. Start the API first (`npm run dev`), then run:
//   npm run smoke
// It creates a throwaway book and cleans it up; no existing data is touched.
import 'dotenv/config';
import { SignJWT } from 'jose';

const base = (
  process.env.SMOKE_BASE_URL ||
  `http://localhost:${process.env.PORT || 5000}`
).replace(/\/+$/, '');
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET is not set. Add it to .env first.');
  process.exit(1);
}

const stamp = Date.now();
const user = {
  email: `smoke+${stamp}@booknook.test`,
  name: 'Smoke Tester',
};
const token = await new SignJWT({ email: user.email, name: user.name })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(user.email)
  .setIssuedAt()
  .setExpirationTime('10m')
  .sign(new TextEncoder().encode(secret));

const checks = [];

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function expect(label, condition, detail) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    if (detail !== undefined) console.error(detail);
    process.exitCode = 1;
    throw new Error(label);
  }
  checks.push(label);
  console.log(`ok - ${label}`);
}

let bookId = null;
let borrowId = null;

try {
  const health = await request('/books', { auth: false });
  expect('GET /books is public', health.status === 200 && Array.isArray(health.data));

  const created = await request('/books', {
    method: 'POST',
    body: {
      title: `Smoke Test ${stamp}`,
      author: 'API Tester',
      category: 'Others',
      description: 'A temporary book created by scripts/smoke.mjs.',
      image: '',
      totalCopies: 1,
      addedBy: { name: 'Spoofed Owner', email: 'spoofed@example.com' },
    },
  });
  expect('POST /books creates a book', created.status === 201, created);
  expect('owner comes from the JWT, not the body', created.data.addedBy.email === user.email, created.data);
  bookId = created.data.id;

  const fetched = await request(`/books/${bookId}`, { auth: false });
  expect('GET /books/:id returns the book', fetched.status === 200 && fetched.data.id === bookId);

  const patched = await request(`/books/${bookId}`, {
    method: 'PATCH',
    body: { title: `Smoke Test ${stamp} (edited)` },
  });
  expect('PATCH /books/:id updates the book', patched.status === 200, patched);

  const borrowed = await request('/borrows', {
    method: 'POST',
    body: { bookId },
  });
  expect('POST /borrows borrows the book', borrowed.status === 201, borrowed);
  borrowId = borrowed.data.id;

  const duplicate = await request('/borrows', {
    method: 'POST',
    body: { bookId },
  });
  expect('double borrow is rejected', duplicate.status === 409, duplicate);

  const unavailable = await request(`/books/${bookId}`, { auth: false });
  expect('borrowing decrements availableCopies', unavailable.data.availableCopies === 0, unavailable.data);

  const myBorrows = await request('/borrows');
  expect(
    'GET /borrows only returns the current user',
    myBorrows.status === 200 &&
      myBorrows.data.some((borrow) => borrow.id === borrowId) &&
      myBorrows.data.every((borrow) => borrow.userEmail === user.email),
    myBorrows.data
  );

  const returned = await request(`/borrows/${borrowId}`, { method: 'DELETE' });
  expect('DELETE /borrows/:id returns the book', returned.status === 200, returned);
  borrowId = null;

  const restored = await request(`/books/${bookId}`, { auth: false });
  expect('returning increments availableCopies', restored.data.availableCopies === 1, restored.data);

  const removed = await request(`/books/${bookId}`, { method: 'DELETE' });
  expect('DELETE /books/:id removes the book', removed.status === 200, removed);
  bookId = null;

  const gone = await request(`/books/${created.data.id}`, { auth: false });
  expect('deleted book is gone', gone.status === 404, gone);

  console.log(`\n${checks.length} checks passed.`);
} catch {
  // Clean up if an assertion failed midway.
  if (borrowId) await request(`/borrows/${borrowId}`, { method: 'DELETE' }).catch(() => {});
  if (bookId) await request(`/books/${bookId}`, { method: 'DELETE' }).catch(() => {});
  process.exitCode = 1;
}
