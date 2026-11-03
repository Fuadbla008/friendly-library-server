import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client = null;
let dbPromise = null;

async function connect() {
  client = new MongoClient(config.mongoUri, {
    appName: 'booknook-server',
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  const db = client.db(config.dbName);

  // Index creation is idempotent and cheap; it also creates the borrows collection
  // on first boot. The unique index is the database-level guarantee against a
  // double borrow, not just the pre-check in the route.
  await Promise.all([
    db.collection(config.booksCollection).createIndex({ createdAt: -1 }),
    db
      .collection(config.booksCollection)
      .createIndex({ category: 1, createdAt: -1 }),
    db.collection(config.booksCollection).createIndex({ 'addedBy.email': 1 }),
    db
      .collection(config.borrowsCollection)
      .createIndex({ userEmail: 1, borrowDate: -1 }),
    db
      .collection(config.borrowsCollection)
      .createIndex({ bookId: 1, userEmail: 1 }, { unique: true }),
  ]);

  console.log(
    `MongoDB connected: ${config.dbName}.${config.booksCollection} / ${config.dbName}.${config.borrowsCollection}`
  );
  return db;
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = connect().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function getBooksCollection() {
  const db = await getDb();
  return db.collection(config.booksCollection);
}

export async function getBorrowsCollection() {
  const db = await getDb();
  return db.collection(config.borrowsCollection);
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    dbPromise = null;
  }
}
