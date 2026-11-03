# Frontend integration guide

This guide is for the separate Next.js client in
`C:\workspace\assignment\friendly-library`. The Express API in this repo is
finished and tested. Do not change the API contract in `docs/API.md` from the
client side; adapt the client to it.

## 1. What already works on the server

- All 8 routes: `GET/POST /books`, `GET/PATCH/DELETE /books/:id`,
  `POST/GET /borrows`, `DELETE /borrows/:id`.
- BetterAuth JWT verification through JWKS (plus an HS256 fallback for local
  testing), owner-only edits/deletes, double-borrow prevention, atomic
  `availableCopies` changes, CORS, consistent JSON errors, and Mongo indexes.
- The existing `friendly_library.book_data` collection (20 books) is preserved.
- `borrows` is created automatically on first boot.

Server env for local development (`.env` in this repo):

```env
PORT=5000
CLIENT_ORIGINS=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
# better-auth/jwks is derived from BETTER_AUTH_URL
LOAN_DAYS=14
```

`CLIENT_ORIGINS` is a comma-separated allowlist. Add the deployed Vercel origin
before testing the deployed client.

## 2. Client environment

Create `.env.local` in the client repo:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000

# BetterAuth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=friendly_library

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Important: `BETTER_AUTH_URL` is the **client** origin, not the Express API.
BetterAuth puts the JWT issuer/audience there, and the Express server must
verify the same values. For deployment, change it to the Vercel URL.

Install the missing auth packages:

```bash
npm install better-auth @better-auth/mongo-adapter mongodb
```

`axios`, `sonner`, `framer-motion`, `swiper`, and `daisyui` are already in the
client `package.json`.

## 3. BetterAuth server config

Create `src/lib/auth.js`:

```js
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.MONGODB_DB || "friendly_library");

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
  ].filter(Boolean),
  plugins: [
    jwt({
      jwt: {
        issuer: process.env.BETTER_AUTH_URL,
        audience: process.env.BETTER_AUTH_URL,
        expirationTime: "1h",
        // Keep this payload stable: the API reads email/name/image from it.
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }),
      },
    }),
  ],
});
```

Create the route handler at `src/app/api/auth/[...all]/route.js`:

```js
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const { GET, POST } = toNextJsHandler(auth);
```

Google Cloud Console redirect URI:

```
http://localhost:3000/api/auth/callback/google
https://YOUR-VERCEL-DOMAIN/api/auth/callback/google
```

## 4. BetterAuth client and API client

Create `src/lib/auth-client.js`:

```js
import { createAuthClient } from "better-auth/react";
import { jwtClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [jwtClient()],
});
```

Create `src/lib/api.js`:

```js
import axios from "axios";
import { authClient } from "@/lib/auth-client";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

api.interceptors.request.use(async (config) => {
  const { data } = await authClient.token();
  if (data?.token) {
    config.headers.Authorization = `Bearer ${data.token}`;
  }
  return config;
});

export function apiErrorMessage(error, fallback = "Something went wrong.") {
  return error?.response?.data?.message || error?.message || fallback;
}
```

`authClient.token()` is provided by `jwtClient()`. Fetch a fresh token per
request; do not put the JWT in localStorage by hand.

## 5. Replace the mock auth context

The current `src/lib/auth-context.js` uses localStorage and synchronous
`login`/`register`. Replace it with BetterAuth while keeping the same
`useAuth()` surface used by pages and `Navbar`:

```js
"use client";

import { createContext, useContext } from "react";
import { authClient } from "@/lib/auth-client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { data: session, isPending } = authClient.useSession();

  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name || session.user.email,
        email: session.user.email,
        photo: session.user.image || "",
      }
    : null;

  const value = {
    user,
    ready: !isPending, // AuthGuard must wait for this before redirecting
    isLoggedIn: Boolean(user),
    login: (email, password) =>
      authClient.signIn.email({ email, password, rememberMe: true }),
    loginWithGoogle: (callbackURL = "/") =>
      authClient.signIn.social({ provider: "google", callbackURL }),
    register: ({ name, email, photo, password }) =>
      authClient.signUp.email({
        name,
        email,
        password,
        image: photo || undefined,
      }),
    logout: () => authClient.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
```

Then update the pages:

- `LoginPage.js`: make submit async, call `await login(email, password)`,
  show `error.message` in a toast on failure, and `router.replace(redirectTo)`
  on success. Use `await loginWithGoogle(redirectTo)` and let BetterAuth
  redirect. Remove the "Enter as Ava" demo shortcut, or replace it with a real
  seeded account.
- `RegisterPage.js`: make submit async, call
  `await register({ name, email, photo, password })`, then `await logout()` and
  `router.push(loginHref)` (the assignment requires register → login). Keep the
  existing uppercase/lowercase/6-character validation. Remove the demo copy at
  the bottom.
- `Navbar.js`: `handleLogout` must `await logout()` before `router.push("/")`.
  `user.photo` still works because the auth context maps BetterAuth `image`.
- `AuthGuard.js`: already waits for `ready`; that is correct. Do not redirect
  while `ready` is false, or reloading a private route will bounce to login.

## 6. Replace the mock library context with the API

Delete the localStorage keys and seed fallbacks. Keep `CATEGORIES` from
`src/lib/seed.js`; `SEED_BOOKS`/`SEED_BORROWS` can stay only as visual
reference and must not be used as data.

Rewrite `src/lib/library-context.js`:

```js
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { user, ready: authReady } = useAuth();
  const [books, setBooks] = useState([]);
  const [borrows, setBorrows] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const refreshBooks = useCallback(async () => {
    const { data } = await api.get("/books");
    setBooks(data);
    setError(null);
    return data;
  }, []);

  const refreshBorrows = useCallback(async () => {
    if (!user) {
      setBorrows([]);
      return [];
    }
    const { data } = await api.get("/borrows");
    setBorrows(data);
    return data;
  }, [user]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/books");
        if (alive) setBooks(data);
      } catch (err) {
        if (alive) {
          setError(err?.response?.data?.message || "Could not load the shelf.");
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setBorrows([]);
      return;
    }
    refreshBorrows().catch(() => {});
  }, [authReady, user, refreshBorrows]);

  async function getBook(id) {
    const { data } = await api.get(`/books/${encodeURIComponent(id)}`);
    return data;
  }

  async function addBook(data) {
    const { data: book } = await api.post("/books", data);
    setBooks((current) => [book, ...current]);
    return book;
  }

  async function updateBook(id, data) {
    const { data: book } = await api.patch(
      `/books/${encodeURIComponent(id)}`,
      data
    );
    setBooks((current) =>
      current.map((item) => (item.id === id ? book : item))
    );
    return book;
  }

  async function deleteBook(id) {
    await api.delete(`/books/${encodeURIComponent(id)}`);
    setBooks((current) => current.filter((item) => item.id !== id));
    setBorrows((current) => current.filter((item) => item.bookId !== id));
  }

  async function borrowBook(bookId) {
    const { data: borrow } = await api.post("/borrows", { bookId });
    setBorrows((current) => [borrow, ...current]);
    setBooks((current) =>
      current.map((item) =>
        item.id === bookId
          ? { ...item, availableCopies: Math.max(0, item.availableCopies - 1) }
          : item
      )
    );
    return borrow;
  }

  async function returnBorrow(borrowId) {
    const borrow = borrows.find((item) => item.id === borrowId);
    await api.delete(`/borrows/${encodeURIComponent(borrowId)}`);
    setBorrows((current) => current.filter((item) => item.id !== borrowId));
    if (borrow) {
      setBooks((current) =>
        current.map((item) =>
          item.id === borrow.bookId
            ? {
                ...item,
                availableCopies: Math.min(
                  item.totalCopies,
                  item.availableCopies + 1
                ),
              }
            : item
        )
      );
    }
  }

  const value = {
    books,
    borrows,
    ready,
    error,
    getBook,
    addBook,
    updateBook,
    deleteBook,
    borrowBook,
    returnBorrow,
    refreshBooks,
    refreshBorrows,
  };

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used inside LibraryProvider");
  return context;
}
```

The methods are now async. Update every caller:

- `AddBookPage.js` → `handleSubmit` async, `const book = await addBook(data)`,
  toast success, `router.push("/my-books")`. Do not pass `user`; the API takes
  the owner from the JWT. Wrap in `try/catch` and toast
  `apiErrorMessage(error)`.
- `MyBooksPage.js` → `saveEdit` and `confirmDelete` async with `await`.
- `BookDetailsPage.js` → `confirm` in the borrow modal is async
  (`await borrowBook(book.id)`), and `handleReturn` is async
  (`await returnBorrow(activeLoan.id)`). Keep the disabled "Not available"
  button when `availableCopies === 0`. The server returns the real `returnDate`;
  use it instead of `Date.now() + 14 days` if you show a due date.
- `MyBorrowsPage.js` → `confirmReturn` async with `await returnBorrow(...)`.
- `NewArrivals.js` → fetch the latest six from the server instead of sorting all
  books client-side. Add a local effect:
  ```js
  const [arrivals, setArrivals] = useState([]);
  useEffect(() => {
    api.get("/books?limit=6&sort=-createdAt").then(({ data }) => setArrivals(data));
  }, []);
  ```
  This is the requirement that MongoDB does the sort/limit.
- `BooksPage.js` can keep client-side search/sort on the fetched array, or pass
  `search`, `category`, and `sort` to the API. Client-side filtering is fine.

## 7. Error and loading behavior

- Every mutation must be `await`ed and wrapped in `try/catch`; show
  `toast.error(apiErrorMessage(error))`.
- Server messages are written for users:
  - `"You already have this book borrowed."` → duplicate borrow
  - `"No copies are available right now."` → zero availability
  - `"Only the reader who added this book can change it."` → ownership
  - `"Your session has expired. Please log in again."` → refresh/login
- Keep toasts; never use `alert`, `confirm`, or `prompt`.
- Keep existing loading spinners. `LibraryProvider.ready` becomes true after the
  first `/books` load.
- On a 401, do not redirect mid-render. Show the toast and let `AuthGuard` /
  `useSession` handle the session state.

## 8. Reload and route behavior

- `AuthGuard` already renders `PageLoader` while `!ready`; with the new auth
  context `ready` is `!isPending`. This is what prevents a logged-in user from
  being bounced to `/login` on reload.
- Login page reads `?redirect=`, validates it starts with `/`, and after success
  calls `router.replace(redirectTo)`. Keep that behavior.
- The Express API is a separate origin; no Next.js rewrite is required. If you
  prefer a rewrite, keep `/books` and `/borrows` paths intact.
- The server's `GET /books/:id` is public. The client page can still be private
  via `AuthGuard`; that is a UI rule, not an API rule.

## 9. Deployment

Server (Render):

```text
Build: npm install
Start: npm start
```

Set:

```env
NODE_ENV=production
MONGODB_URI=...
MONGODB_DB=friendly_library
BETTER_AUTH_URL=https://YOUR-CLIENT.vercel.app
CLIENT_ORIGINS=https://YOUR-CLIENT.vercel.app
LOAN_DAYS=14
```

Render supplies `PORT`.

Client (Vercel):

```env
NEXT_PUBLIC_API_URL=https://YOUR-SERVER.onrender.com
BETTER_AUTH_URL=https://YOUR-CLIENT.vercel.app
BETTER_AUTH_SECRET=...
MONGODB_URI=...
MONGODB_DB=friendly_library
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Checklist:

1. The Express server can reach `https://YOUR-CLIENT.vercel.app/api/auth/jwks`.
   If Vercel Deployment Protection is on, server JWT verification will receive
   401/HTML instead of JSON. Disable protection or use a protection bypass.
2. `BETTER_AUTH_URL`, the JWT issuer, and the JWT audience must match exactly
   (no trailing slash).
3. `CLIENT_ORIGINS` must include the Vercel origin, or the browser sees a CORS
   error.
4. Google redirect URI must be the deployed auth callback.
5. Register a real account after deployment; the old demo users
   (`ava@booknook.demo`) do not exist in BetterAuth.
6. `npm run build` in the client, then test:
   - reload `/my-books`, `/my-borrows`, `/books/:id` while logged in
   - double-borrow the same book → error toast
   - borrow the last copy → button shows "Not available"
   - return → `availableCopies` goes back up

## 10. Copy-paste prompt for the frontend OpenCode session

Use the text below in the client repo after reading its `AGENTS.md` and
`agent.md`:

> Connect the existing BookNook Next.js client to the finished Express API.
> Read `C:\workspace\assignment\friendly-library-server\docs\API.md` and
> `C:\workspace\assignment\friendly-library-server\docs\FRONTEND_INTEGRATION.md`
> first. Implement BetterAuth with the MongoDB adapter, the JWT plugin, email +
> password, and Google. Add the auth route handler and auth client, replace the
> localStorage mock in `src/lib/auth-context.js`, and rewrite
> `src/lib/library-context.js` so books and borrows come from the API with a
> Bearer token. Keep the existing UI, toasts, custom modals, and route titles.
> Make all mutation handlers async and show server error messages in toasts.
> Fetch new arrivals with `GET /books?limit=6&sort=-createdAt`. Ensure private
> routes wait for `useSession` before redirecting. Do not use `alert`/`confirm`,
> do not use seed books for real data, and do not change the API contract.
> Then run `npm run lint` and `npm run build`, fix all errors, and verify the
> reload and borrow/return flows against the local server.
