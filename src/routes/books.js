import { Router } from 'express';
import { getBooksCollection, getBorrowsCollection } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, forbidden, notFound } from '../http-error.js';
import {
  bookFilter,
  bookInput,
  limitOption,
  sortOption,
} from '../validation.js';
import { idFilter, idString, toBook } from '../serializers.js';

const router = Router();

function ownerEmail(book) {
  return String(book?.addedBy?.email || '').toLowerCase();
}

function assertOwner(book, user) {
  if (ownerEmail(book) !== user.email) {
    throw forbidden('Only the reader who added this book can change it.');
  }
}

router.get('/', async (req, res) => {
  const books = await getBooksCollection();
  const filter = bookFilter(req.query);
  const sort = sortOption(req.query.sort);
  const limit = limitOption(req.query.limit);

  let cursor = books.find(filter).sort(sort);
  if (limit) cursor = cursor.limit(limit);

  const docs = await cursor.toArray();
  res.json(docs.map(toBook));
});

router.get('/:id', async (req, res) => {
  const books = await getBooksCollection();
  const book = await books.findOne(idFilter(req.params.id));
  if (!book) throw notFound('Book not found.');
  res.json(toBook(book));
});

router.post('/', requireAuth, async (req, res) => {
  const data = bookInput(req.body);
  const totalCopies = data.totalCopies ?? 1;
  const now = new Date();

  const book = {
    ...data,
    totalCopies,
    availableCopies: totalCopies,
    // Owner identity always comes from the verified JWT, never the request body.
    addedBy: { name: req.user.name, email: req.user.email },
    createdAt: now,
    updatedAt: now,
  };

  const books = await getBooksCollection();
  const result = await books.insertOne(book);
  res.status(201).json(toBook({ ...book, _id: result.insertedId }));
});

router.patch('/:id', requireAuth, async (req, res) => {
  const books = await getBooksCollection();
  const book = await books.findOne(idFilter(req.params.id));
  if (!book) throw notFound('Book not found.');
  assertOwner(book, req.user);

  const data = bookInput(req.body, { partial: true });
  const update = { ...data, updatedAt: new Date() };

  if (data.totalCopies !== undefined) {
    const oldTotal = Number(book.totalCopies) || 1;
    const oldAvailable = Number.isFinite(Number(book.availableCopies))
      ? Number(book.availableCopies)
      : oldTotal;
    const onLoan = Math.max(0, oldTotal - oldAvailable);

    if (data.totalCopies < onLoan) {
      throw badRequest(
        `totalCopies cannot be lower than ${onLoan} while ${onLoan} ${
          onLoan === 1 ? 'copy is' : 'copies are'
        } on loan.`
      );
    }
    update.availableCopies = data.totalCopies - onLoan;
  }

  const result = await books.findOneAndUpdate(
    { _id: book._id, 'addedBy.email': book.addedBy?.email ?? '' },
    { $set: update },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw notFound('Book not found.');
  res.json(toBook(updated));
});

router.delete('/:id', requireAuth, async (req, res) => {
  const books = await getBooksCollection();
  const book = await books.findOne(idFilter(req.params.id));
  if (!book) throw notFound('Book not found.');
  assertOwner(book, req.user);

  const deleted = await books.deleteOne({ _id: book._id });
  if (deleted.deletedCount !== 1) throw notFound('Book not found.');

  // The My Books confirmation says active loans for the copy are removed too.
  const borrows = await getBorrowsCollection();
  const removed = await borrows.deleteMany({
    $or: [{ bookId: idString(book._id) }, { bookId: book._id }],
  });

  res.json({
    message: `"${book.title}" was deleted.`,
    id: idString(book._id),
    removedBorrows: removed.deletedCount,
  });
});

export default router;
