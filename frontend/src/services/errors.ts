export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The session is missing or expired: the user has to log in again. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Another application to the same company on the same day exists. */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
