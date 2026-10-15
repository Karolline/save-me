export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 세션이 없거나 만료됐다: 다시 로그인해야 한다. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** 같은 회사에 같은 날 낸 지원 건이 이미 있다. */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** 찾는 것이 없다 (또는 남의 것이다). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
