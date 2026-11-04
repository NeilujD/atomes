// fetch() rejects with a TypeError when offline or when a server refuses browser
// (CORS) calls. The OAuth client wraps it (for example in a token refresh), so
// look along the cause chain.
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error instanceof TypeError || isNetworkFailure(error.cause);
}
