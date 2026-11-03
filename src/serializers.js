import { ObjectId } from 'mongodb';

export function idString(value) {
  return value === undefined || value === null ? '' : String(value);
}

// The original book_data collection uses ObjectId _ids, but slug ids are
// supported too so mock/seed data can be migrated without rewriting ids.
export function idFilter(id) {
  const value = idString(id);
  if (/^[a-f\d]{24}$/i.test(value)) {
    return { _id: { $in: [value, new ObjectId(value)] } };
  }
  return { _id: value };
}

export function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toBook(doc) {
  const totalCopies = Number(doc.totalCopies);
  const safeTotal =
    Number.isInteger(totalCopies) && totalCopies > 0 ? totalCopies : 1;
  const available = Number(doc.availableCopies);
  const safeAvailable = Number.isFinite(available)
    ? Math.max(0, Math.min(safeTotal, available))
    : safeTotal;

  return {
    id: idString(doc._id),
    title: doc.title || '',
    author: doc.author || '',
    category: doc.category || 'Others',
    image: doc.image || '',
    description: doc.description || '',
    totalCopies: safeTotal,
    availableCopies: safeAvailable,
    addedBy: {
      name: doc.addedBy?.name || '',
      email: (doc.addedBy?.email || '').toLowerCase(),
    },
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

export function toBorrow(doc) {
  return {
    id: idString(doc._id),
    bookId: idString(doc.bookId),
    bookTitle: doc.bookTitle || '',
    bookImage: doc.bookImage || '',
    userEmail: (doc.userEmail || '').toLowerCase(),
    userName: doc.userName || '',
    borrowDate: toIso(doc.borrowDate),
    returnDate: toIso(doc.returnDate),
  };
}
