import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { HttpError } from './http-error.js';
import booksRouter from './routes/books.js';
import borrowsRouter from './routes/borrows.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin, curl, and server-to-server requests have no Origin header.
      if (!origin) return callback(null, true);
      if (
        config.clientOrigins.includes('*') ||
        config.clientOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      return callback(new HttpError(403, `Origin ${origin} is not allowed.`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: '1mb' }));

app.use('/books', booksRouter);
app.use('/borrows', borrowsRouter);

app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// Express 5 forwards rejected async handlers here automatically.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  let status = Number(error.status) || 500;
  let message = error.message || 'Internal server error.';

  if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'The request body is not valid JSON.';
  } else if (error.code === 11000) {
    status = 409;
    message = 'That record already exists.';
  } else if (error.name === 'BSONError' || error.name === 'BSONTypeError') {
    status = 400;
    message = 'That id is not valid.';
  }

  if (status >= 500) {
    console.error(error);
    if (config.isProduction) message = 'Internal server error.';
  }

  res.status(status).json({
    message,
    ...(error.details ? { errors: error.details } : {}),
  });
});

export default app;
