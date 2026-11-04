// For typescript-eslint: plain TypeScript cannot resolve .astro imports or Astro JSX types, only the Astro language server can.
/// <reference types="astro/astro-jsx" />

declare namespace JSX {
  type Element = HTMLElement;
}

declare module '*.astro' {
  const Component: import('astro/runtime/server/index.js').AstroComponentFactory;
  export default Component;
}
