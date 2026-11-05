// Sent on `window` when the reader presses Reconnect and the Atomes server
// answers (src/lib/connection.ts): what waits for the network tries again now.
export const reconnectEvent = 'atomes:reconnect';

// fetch() rejects with a TypeError when offline or when a server refuses browser
// (CORS) calls. The OAuth client wraps it (for example in a token refresh), so
// look along the cause chain.
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error instanceof TypeError || isNetworkFailure(error.cause);
}
