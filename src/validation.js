import { badRequest } from './http-error.js';

export const CATEGORIES = ['Fiction', 'Science', 'History', 'Kids', 'Others'];

export function isHexObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function text(value, field, { required = false, max = 5000 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be text.`);
  }
  const clean = value.trim();
  if (required && !clean) throw badRequest(`${field} is required.`);
  if (clean.length > max) {
    throw badRequest(`${field} must be ${max} characters or fewer.`);
  }
  return clean;
}

function copies(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
    throw badRequest('totalCopies must be a whole number between 1 and 999.');
  }
  return parsed;
}

export function bookInput(body = {}, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Send a JSON object in the request body.');
  }

  const data = {};
  const title = text(body.title, 'title', { required: !partial, max: 200 });
  const author = text(body.author, 'author', { required: !partial, max: 160 });
  const category = text(body.category, 'category', { required: !partial, max: 40 });
  const description = text(body.description, 'description', {
    required: !partial,
    max: 5000,
  });
  const image = text(body.image, 'image', { required: false, max: 2048 });
  const totalCopies = copies(body.totalCopies);

  if (!partial || title !== undefined) data.title = title;
  if (!partial || author !== undefined) data.author = author;
  if (!partial || category !== undefined) data.category = category;
  if (!partial || description !== undefined) data.description = description;
  if (image !== undefined) data.image = image;
  if (totalCopies !== undefined) data.totalCopies = totalCopies;

  if (category !== undefined && !CATEGORIES.includes(category)) {
    throw badRequest(`category must be one of: ${CATEGORIES.join(', ')}.`);
  }

  if (partial && Object.keys(data).length === 0) {
    throw badRequest('Provide at least one field to update.');
  }

  return data;
}

export function borrowInput(body = {}) {
  const bookId = body.bookId ?? body.book_id ?? body.id;
  if (typeof bookId !== 'string' || !bookId.trim()) {
    throw badRequest('bookId is required.');
  }
  return { bookId: bookId.trim() };
}

export function bookFilter(query = {}) {
  const filter = {};

  if (query.category) {
    const category = String(query.category).trim();
    if (!CATEGORIES.includes(category)) {
      throw badRequest(`category must be one of: ${CATEGORIES.join(', ')}.`);
    }
    filter.category = category;
  }

  if (query.email) {
    const email = String(query.email).trim().toLowerCase();
    if (!email.includes('@')) throw badRequest('email must be a valid email.');
    filter['addedBy.email'] = email;
  }

  if (query.search) {
    const term = String(query.search).trim();
    if (term.length > 100) throw badRequest('search must be 100 characters or fewer.');
    if (term) {
      const pattern = new RegExp(escapeRegex(term), 'i');
      filter.$or = [{ title: pattern }, { author: pattern }];
    }
  }

  return filter;
}

export function sortOption(value) {
  if (!value) return { createdAt: -1 };
  const raw = String(value);
  const descending = raw.startsWith('-');
  const field = descending ? raw.slice(1) : raw;
  const allowed = ['createdAt', 'title', 'author'];
  if (!allowed.includes(field)) {
    throw badRequest(`sort must be one of: ${allowed.join(', ')} (prefix with - for descending).`);
  }
  return { [field]: descending ? -1 : 1 };
}

export function limitOption(value) {
  if (value === undefined || value === '' || value === null) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw badRequest('limit must be a whole number between 1 and 100.');
  }
  return parsed;
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
