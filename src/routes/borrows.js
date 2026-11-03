import { Router } from 'express';
import { config } from '../config.js';
import { getBooksCollection, getBorrowsCollection } from '../db.js';
import { requireAuth } from '../auth.js';
import { conflict, forbidden, notFound } from '../http-error.js';
import { borrowInput } from '../validation.js';
import { idFilter, idString, toBorrow } from '../serializers.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const borrows = await getBorrowsCollection();
  const docs = await borrows
    .find({ userEmail: req.user.email })
    .sort({ borrowDate: -1 })
    .toArray();
  res.json(docs.map(toBorrow));
});

router.post('/', requireAuth, async (req, res) => {
  const { bookId } = borrowInput(req.body);
  const books = await getBooksCollection();
  const borrows = await getBorrowsCollection();

  const book = await books.findOne(idFilter(bookId));
  if (!book) throw notFound('Book not found.');

  const total = Number(book.totalCopies) || 1;
  const available = Number.isFinite(Number(book.availableCopies))
    ? Number(book.availableCopies)
    : total;
  if (available <= 0) {
    throw conflict('No copies are available right now.');
  }

  const now = new Date();
  const due = new Date(now.getTime() + config.loanDays * 86400000);
  const borrow = {
    bookId: idString(book._id),
    bookTitle: book.title || 'Untitled',
    bookImage: book.image || '',
    userEmail: req.user.email,
    userName: req.user.name,
    borrowDate: now,
    returnDate: due,
  };

  // Insert first: the unique { bookId, userEmail } index is what actually
  // prevents two simultaneous requests from both borrowing the same copy.
  let inserted;
  try {
    inserted = await borrows.insertOne(borrow);
  } catch (error) {
    if (error?.code === 11000) {
      throw conflict('You already have this book borrowed.');
    }
    throw error;
  }

  // The conditional update is the oversell guard: it only succeeds while a
  // copy is still available, even if another borrower got there first.
  const updated = await books.findOneAndUpdate(
    { ...idFilter(String(book._id)), availableCopies: { $gt: 0 } },
    { $inc: { availableCopies: -1 }, $set: { updatedAt: now } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    await borrows.deleteOne({ _id: inserted.insertedId });
    throw conflict('No copies are available right now.');
  }

  res.status(201).json(toBorrow({ ...borrow, _id: inserted.insertedId }));
});

router.delete('/:id', requireAuth, async (req, res) => {
  const borrows = await getBorrowsCollection();
  const borrow = await borrows.findOne(idFilter(req.params.id));
  if (!borrow) throw notFound('Borrow record not found.');
  if (String(borrow.userEmail || '').toLowerCase() !== req.user.email) {
    throw forbidden('You can only return books that you borrowed.');
  }

  const deleted = await borrows.deleteOne({ _id: borrow._id });
  if (deleted.deletedCount !== 1) throw notFound('Borrow record not found.');

  // Atomic increment, capped at totalCopies so a concurrent edit cannot make
  // availableCopies exceed the number of copies that exist.
  const books = await getBooksCollection();
  const now = new Date();
  await books.updateOne(idFilter(borrow.bookId), [
    {
      $set: {
        availableCopies: {
          $min: [
            {
              $add: [
                {
                  $ifNull: [
                    '$availableCopies',
                    { $ifNull: ['$totalCopies', 1] },
                  ],
                },
                1,
              ],
            },
            { $ifNull: ['$totalCopies', 1] },
          ],
        },
        updatedAt: now,
      },
    },
  ]);

  res.json({
    message: `"${borrow.bookTitle || 'Book'}" was returned.`,
    id: idString(borrow._id),
  });
});

export default router;
