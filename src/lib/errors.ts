export class AppError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export type ErrorCode = 
  | 'VALIDATION_ERROR'
  | 'PROVIDER_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';
