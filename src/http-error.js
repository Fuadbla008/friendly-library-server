export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new HttpError(400, message, details);
}

export function unauthorized(message = 'Please log in to continue.') {
  return new HttpError(401, message);
}

export function forbidden(message = 'You do not have permission to do that.') {
  return new HttpError(403, message);
}

export function notFound(message = 'Not found.') {
  return new HttpError(404, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}
