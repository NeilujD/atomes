// The account this device saw last (DID and handle, no token), kept by
// server-client.ts so the session still opens offline (ADR 0002).
export const accountKey = 'atomes-account';

// Inlined in <head> of every app screen by AppShell, so it runs before first
// paint. With no saved account the visitor is most likely signed out: the
// screen stays hidden until the gate (gateScreen in server-client.ts) answers,
// so it never shows before the sign-in screen. With a saved account it shows
// at once. It cannot import a module.
export const gateBootScript = `try{if(!localStorage.getItem(${JSON.stringify(accountKey)}))document.documentElement.dataset.gate="pending"}catch(e){}`;
