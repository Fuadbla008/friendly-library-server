# BookNook API

The server side of **BookNook**, a small shared online library. Readers browse
books, add their own copies, borrow a book for 14 days, and return it.

- Express 5 + MongoDB (native driver, ESM)
- BetterAuth JWT verification (JWKS, with an HS256 fallback for local testing)
- 8 API routes for books and borrows
- Owner-protected writes, double-borrow prevention, atomic copy counts
- CORS, consistent JSON errors, graceful shutdown, Mongo indexes on startup

## API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/books` | Public | List books (`limit`, `sort`, `category`, `email`, `search`) |
| GET | `/books/:id` | Public | One book |
| POST | `/books` | JWT | Add a book |
| PATCH | `/books/:id` | JWT + owner | Update a book |
| DELETE | `/books/:id` | JWT + owner | Delete a book and its active loans |
| POST | `/borrows` | JWT | Borrow a book |
| GET | `/borrows` | JWT | The current user's active borrows |
| DELETE | `/borrows/:id` | JWT + borrower | Return a book |

Full request/response details and the business rules are in
[`docs/API.md`](docs/API.md). The client hand-off guide is
[`docs/FRONTEND_INTEGRATION.md`](docs/FRONTEND_INTEGRATION.md).

## Local setup

```bash
npm install
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
```

Fill in the environment values, then:

```bash
npm start        # node index.js
npm run dev      # nodemon
```

The API listens on `http://localhost:5000` by default.

### Environment

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | Preferred | Atlas/local connection string. |
| `MONGODB_USER` / `MONGODB_PASS` | Fallback | Kept for the original Atlas cluster. |
| `MONGODB_DB` | No | Defaults to `friendly_library`. |
| `BOOKS_COLLECTION` | No | Defaults to `book_data` (preserves existing data). |
| `BORROWS_COLLECTION` | No | Defaults to `borrows`. |
| `BETTER_AUTH_URL` | For real auth | **Client** origin; JWKS defaults to `<url>/api/auth/jwks`. |
| `BETTER_AUTH_JWKS_URL` | No | Override the derived JWKS URL. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | No | Default to `BETTER_AUTH_URL`. |
| `JWT_SECRET` | Local only | HS256 fallback for scripts and manual testing. |
| `CLIENT_ORIGINS` | Yes | Comma-separated browser origins, e.g. `http://localhost:3000`. |
| `LOAN_DAYS` | No | Defaults to `14`. |
| `PORT` | No | Defaults to `5000`; Render injects it. |

`BETTER_AUTH_URL` is not the API URL. BetterAuth runs in the Next.js client and
issues tokens with that origin as issuer/audience; this server verifies them
against the client's JWKS endpoint.

## Scripts

```bash
npm start        # start the API
npm run dev      # start with nodemon
npm test         # pure validator unit tests (node:test, no DB needed)
npm run check    # syntax-check every source file
npm run smoke    # end-to-end API test; server must already be running
npm run make-token -- reader@example.com "Reader Name"
```

`npm run smoke` and `npm run make-token` use `JWT_SECRET`. They are local
testing helpers, not the production auth path. The smoke test creates and
deletes its own throwaway book.

## Data model

Books live in `friendly_library.book_data`; active loans live in
`friendly_library.borrows`. The original `_id` values are preserved. API
responses expose a string `id` and ISO timestamps.

Borrowing inserts the borrow record first (guarded by the unique
`{ bookId, userEmail }` index, which prevents a double borrow), then
conditionally decrements `availableCopies` with `$inc`. Returning deletes the
borrow record and increments the count, capped at `totalCopies`. Deleting a book
also deletes its active loans.

## Deploy to Render

- Build command: `npm install`
- Start command: `npm start`
- Set `MONGODB_URI`, `BETTER_AUTH_URL`, `CLIENT_ORIGINS`, and `NODE_ENV=production`.
- The server exits on startup if MongoDB is unreachable, which makes Render
  surface connection problems instead of serving a half-broken API.

## Project structure

```
index.js                 startup, DB connect, graceful shutdown
src/app.js               Express app, CORS, 404, error handler
src/config.js            env parsing and Mongo URI fallback
src/db.js                cached Mongo connection and indexes
src/auth.js              BetterAuth JWKS / HS256 verification
src/validation.js        input and query validation
src/serializers.js       Mongo document -> stable JSON shape
src/routes/books.js      book CRUD
src/routes/borrows.js    borrow, list, return
scripts/                 make-token and smoke test
test/                    node:test unit tests
docs/                    API contract and frontend guide
```
