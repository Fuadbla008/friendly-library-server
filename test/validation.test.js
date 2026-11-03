import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  bookFilter,
  bookInput,
  limitOption,
  sortOption,
} from '../src/validation.js';

const valid = {
  title: '  The Left Hand of Darkness  ',
  author: ' Ursula K. Le Guin ',
  category: 'Fiction',
  description: 'A envoy visits a planet where people have no fixed gender.',
  image: 'https://example.com/cover.jpg',
  totalCopies: '3',
  addedBy: { name: 'Spoofed', email: 'spoofed@example.com' },
};

test('bookInput trims text, coerces copies, and ignores owner fields', () => {
  const data = bookInput(valid);
  assert.equal(data.title, 'The Left Hand of Darkness');
  assert.equal(data.author, 'Ursula K. Le Guin');
  assert.equal(data.totalCopies, 3);
  assert.equal(data.addedBy, undefined);
});

test('bookInput defaults are applied by the route, not the validator', () => {
  const data = bookInput({ ...valid, totalCopies: undefined });
  assert.equal(data.totalCopies, undefined);
});

test('bookInput requires title, author, category, and description', () => {
  assert.throws(() => bookInput({}), /title is required/);
  assert.throws(() => bookInput({ ...valid, author: '   ' }), /author is required/);
  assert.throws(() => bookInput({ ...valid, description: '' }), /description is required/);
});

test('bookInput rejects an unknown category', () => {
  assert.throws(() => bookInput({ ...valid, category: 'Poetry' }), /category must be one of/);
  for (const category of CATEGORIES) {
    assert.equal(bookInput({ ...valid, category }).category, category);
  }
});

test('bookInput enforces the totalCopies range', () => {
  assert.throws(() => bookInput({ ...valid, totalCopies: 0 }), /between 1 and 999/);
  assert.throws(() => bookInput({ ...valid, totalCopies: 2.5 }), /between 1 and 999/);
  assert.throws(() => bookInput({ ...valid, totalCopies: 'many' }), /between 1 and 999/);
});

test('partial bookInput rejects an empty patch', () => {
  assert.throws(() => bookInput({}, { partial: true }), /at least one field/);
  assert.deepEqual(bookInput({ title: 'New' }, { partial: true }), { title: 'New' });
});

test('sortOption allows only known fields and respects the direction prefix', () => {
  assert.deepEqual(sortOption(''), { createdAt: -1 });
  assert.deepEqual(sortOption('-createdAt'), { createdAt: -1 });
  assert.deepEqual(sortOption('title'), { title: 1 });
  assert.throws(() => sortOption('password'), /sort must be one of/);
});

test('limitOption validates the 1..100 window', () => {
  assert.equal(limitOption(undefined), 0);
  assert.equal(limitOption('6'), 6);
  assert.throws(() => limitOption('0'), /between 1 and 100/);
  assert.throws(() => limitOption('101'), /between 1 and 100/);
});

test('bookFilter builds safe search and owner filters', () => {
  assert.deepEqual(bookFilter({ category: 'Kids' }), { category: 'Kids' });
  assert.deepEqual(bookFilter({ email: 'Reader@Example.com' }), {
    'addedBy.email': 'reader@example.com',
  });
  const filter = bookFilter({ search: 'a+b' });
  assert.equal(filter.$or[0].title.test('a+b'), true);
  assert.equal(filter.$or[0].title.test('aab'), false);
});
