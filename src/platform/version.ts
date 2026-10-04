/**
 * The build's version (GDD §20.1: the save envelope's `gameVersion`), from `package.json`
 * through Vite's `define` (`vite.config.ts`). Plain Node (the fixture script, the sim) has no
 * define, and gets `0.0.0`.
 */
export const GAME_VERSION: string =
  typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : '0.0.0';
