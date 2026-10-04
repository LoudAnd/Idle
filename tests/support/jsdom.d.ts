// The part of jsdom's API the tests use (jsdom ships no types and @types/jsdom is not a
// dependency): a second, independent window for the two-tab tests (GDD §20.1).
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string; pretendToBeVisual?: boolean });
    readonly window: Window & typeof globalThis;
  }
}
