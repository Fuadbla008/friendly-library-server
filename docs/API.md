# BookNook API reference

Base URL: `http://localhost:5000` in development. All responses are JSON.

Protected routes require a BetterAuth JWT:

```http
Authorization: Bearer <jwt>
```

BetterAuth signs tokens with its JWT plugin; this server verifies them against
`<BETTER_AUTH_URL>/api/auth/jwks` by default. For local API testing without
BetterAuth, set `JWT_SECRET` and generate a token with `npm run make-token`.

Errors always use this shape:

```json
{ "message": "Human-readable error.", "errors": { "title": "required" } }
```

`errors` only appears for field-level validation problems. Success responses are
the resource itself (or an array), not wrapped in a `data` envelope.

## Data shapes

Book:

```json
{
  "id": "6ae7eea5cc183e835bef4861",
  "title": "The Alchemist",
  "author": "Paulo Coelho",
  "category": "Fiction",
  "image": "https://...",
  "description": "A shepherd boy ...",
  "totalCopies": 3,
  "availableCopies": 2,
  "addedBy": { "name": "Rahim Ahmed", "email": "rahim@booknook.com" },
  "createdAt": "2025-01-10T10:30:00.000Z",
  "updatedAt": "2026-11-03T10:00:00.000Z"
}
```

`id` is a string. The server still accepts the original slug-style ids used by
mock data on `GET /books/:id`, but always returns a string `id`.

Borrow:

```json
{
  "id": "6728f0a1b5c6d7e8f9012345",
  "bookId": "6ae7eea5cc183e835bef4861",
  "bookTitle": "The Alchemist",
  "bookImage": "https://...",
  "userEmail": "reader@example.com",
  "userName": "Reader Name",
  "borrowDate": "2026-11-03T10:00:00.000Z",
  "returnDate": "2026-11-17T10:00:00.000Z"
}
```

## Books

### `GET /books` — public

Query parameters:

| Param | Example | Notes |
|---|---|---|
| `limit` | `6` | 1–100. Omit for all books. |
| `sort` | `-createdAt` | `createdAt`, `title`, `author`; prefix `-` for descending. Default `-createdAt`. |
| `category` | `Fiction` | One of `Fiction`, `Science`, `History`, `Kids`, `Others`. |
| `email` | `ava@example.com` | Filters by the reader who added the book (`addedBy.email`). |
| `search` | `dune` | Case-insensitive match on title or author. |

New arrivals on the home page:

```http
GET /books?limit=6&sort=-createdAt
```

My Books:

```http
GET /books?email=reader@example.com
```

The email filter is a convenience, not authorization. Editing/deleting is still
owner-protected.

Response: `200` with an array of books.

### `GET /books/:id` — public

Response: `200` with one book, or `404`.

### `POST /books` — protected

```json
{
  "title": "The Left Hand of Darkness",
  "author": "Ursula K. Le Guin",
  "category": "Fiction",
  "image": "https://i.ibb.co/...",
  "description": "An envoy visits a planet ...",
  "totalCopies": 3
}
```

- `title`, `author`, `category`, and `description` are required.
- `category` must be one of the five categories.
- `totalCopies` defaults to `1`; must be a whole number from 1 to 999.
- `addedBy` is ignored in the body. The owner is taken from the JWT
  (`name`, `email`).
- `createdAt`/`updatedAt` are set by the server.
- `availableCopies` starts equal to `totalCopies`.

Response: `201` with the created book.

### `PATCH /books/:id` — protected, owner only

Send only the fields to change. Same validation as create for supplied fields.
If `totalCopies` changes, copies already on loan are preserved:

```
onLoan = oldTotalCopies - oldAvailableCopies
newAvailableCopies = newTotalCopies - onLoan
```

Reducing `totalCopies` below the number currently on loan returns `400`.

Response: `200` with the updated book. `403` if the JWT email is not the owner.

### `DELETE /books/:id` — protected, owner only

Deletes the book and any active borrow records for it. Copies do not need to be
restored because the listing is gone.

Response: `200`

```json
{
  "message": "\"The Alchemist\" was deleted.",
  "id": "6ae7eea5cc183e835bef4861",
  "removedBorrows": 1
}
```

## Borrows

### `POST /borrows` — protected

```json
{ "bookId": "6ae7eea5cc183e835bef4861" }
```

The server takes `userEmail`/`userName` from the JWT; do not send them.

Rules enforced server-side:

1. The book must exist (`404`).
2. `availableCopies` must be greater than zero (`409` "No copies are available right now.").
3. The same user cannot have two active borrows of the same book (`409` "You already have this book borrowed.").
4. `availableCopies` is decremented atomically with `$inc`, and a conditional
   update prevents overselling when two users borrow the last copy at once.
5. The loan length is `LOAN_DAYS` (default `14`); `returnDate` is calculated
   server-side.

Response: `201` with the borrow record. `409` for duplicate/zero availability.

### `GET /borrows` — protected

Returns the logged-in user's active borrows, newest first. The email comes from
the JWT; query parameters cannot read another user's loans.

Response: `200` with an array of borrows.

### `DELETE /borrows/:id` — protected, borrower only

Returns a book:

1. Deletes the borrow record.
2. Increments the book's `availableCopies` by 1, capped at `totalCopies`.

Response: `200`

```json
{
  "message": "\"The Alchemist\" was returned.",
  "id": "6728f0a1b5c6d7e8f9012345"
}
```

`403` if the borrow belongs to another user; `404` if it does not exist.

## Collections and indexes

| Collection | Purpose |
|---|---|
| `friendly_library.book_data` | Books (kept for compatibility with the original data). |
| `friendly_library.borrows` | Active borrow records. |

Indexes are created on startup:

- `book_data`: `{ createdAt: -1 }`, `{ category: 1, createdAt: -1 }`, `{ "addedBy.email": 1 }`
- `borrows`: `{ userEmail: 1, borrowDate: -1 }`, unique `{ bookId: 1, userEmail: 1 }`

The unique borrow index is the final defense against double borrowing. Do not
drop it.

## Quick curl checks

```bash
# Public list (PowerShell: curl.exe)
curl.exe http://localhost:5000/books?limit=6&sort=-createdAt

# Protected request
curl.exe -H "Authorization: Bearer $TOKEN" http://localhost:5000/borrows
```
