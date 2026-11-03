# AGENTS.md

BookNook's Express 5 + MongoDB API. ESM (`"type": "module"`), no TypeScript, no build step. The Next.js client lives in a separate repo; its hand-off guide is `docs/FRONTEND_INTEGRATION.md`.

## Commands

```bash
npm install
npm start          # node index.js, port 5000 unless PORT is set
npm run dev        # nodemon
npm test           # pure validator tests via node:test; no DB required
npm run check      # syntax-check all source files
npm run smoke      # end-to-end test; API must already be running
npm run make-token -- reader@example.com "Reader Name"
```

- `npm run smoke` creates and deletes its own book. It needs `JWT_SECRET` in `.env`; the smoke/make-token helpers are HS256 local tools, not the production auth path.
- Do not run `npm test` expecting API coverage; it only tests `src/validation.js`.

## Environment

- `.env` is gitignored and required. Start from `.env.example`.
- `MONGODB_URI` is preferred; `MONGODB_USER`/`MONGODB_PASS` are a legacy fallback for the original Atlas cluster.
- `BETTER_AUTH_URL` is the **client** origin (e.g. `http://localhost:3000`), not this API. `auth.js` derives `<BETTER_AUTH_URL>/api/auth/jwks`, so issuer/audience match BetterAuth. Set `BETTER_AUTH_JWKS_URL` to override.
- `JWT_SECRET` enables the HS256 fallback. If a JWKS URL is configured, it takes precedence over the secret.
- `CLIENT_ORIGINS` is a comma-separated browser allowlist. Missing the deployed client origin produces a browser CORS failure, not a server 500.
- Startup connects and creates indexes before listening; if Mongo is unreachable the process exits. Do not turn this into a silent degraded mode.

## Layout and invariants

- `index.js` → `src/app.js` → `src/routes/*`. `src/db.js` caches one Mongo connection. Keep DB access behind `getBooksCollection()` / `getBorrowsCollection()`.
- Collections are `friendly_library.book_data` and `friendly_library.borrows`. `book_data` predates this refactor and must keep working; API responses expose string `id` while handles still accept the original ObjectId or slug ids (`src/serializers.js`).
- Express 5 forwards rejected async handlers to the error middleware in `app.js`; throwing `HttpError` helpers is the expected control flow.
- Borrowing inserts the borrow record first, then conditionally `$inc`s `availableCopies`; the unique `{ bookId, userEmail }` index is the real double-borrow guard. A failed decrement rolls the insert back. Do not reorder or remove the index.
- Returning deletes the borrow record and increments `availableCopies`, capped at `totalCopies` via an update pipeline. Deleting a book cascades its active borrows.
- `POST`/`PATCH` book owner fields (`addedBy`) always come from the verified JWT, never the request body.
- `PATCH /books/:id` preserves copies on loan when `totalCopies` changes and rejects a total below the number on loan.

## API contract

- Exactly 8 routes, documented in `docs/API.md`. Success responses are the resource or an array, not `{ data }`. Errors are `{ message }` with optional `errors`.
- `GET /books` supports `limit` (1–100), `sort` (`createdAt`, `title`, `author`, `-` prefix), `category`, `email`, and `search`.
- Client integration details, BetterAuth setup, and a copy-paste prompt are in `docs/FRONTEND_INTEGRATION.md`. Keep docs/API.md in sync if the contract changes.
