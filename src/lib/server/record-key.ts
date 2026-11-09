// The atproto record key syntax (https://atproto.com/specs/record-key), so a
// record keeps its key when it moves to a PDS or a Space (ADR 0012).
export function isValidRecordKey(rkey: string): boolean {
  return /^[A-Za-z0-9._:~-]{1,512}$/.test(rkey) && rkey !== '.' && rkey !== '..';
}
