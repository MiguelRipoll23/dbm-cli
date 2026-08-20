// Standardized error shape for the whole API: { error: { code, message } }.
// Route handlers throw ApiError for known failure cases (404, 409, ...);
// anything else is caught by the central onError hook in server.ts and
// mapped to a 500 with a generic message (never leaking stack traces).
export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 408 | 409,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
