export class AppError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, 'forbidden');
  }
}
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'not_found');
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'conflict');
  }
}
export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, 'bad_request');
  }
}
