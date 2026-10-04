/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `1` in `npm run build:playtest` (`.env.playtest`): the dev hooks ship (GDD §21.9). */
  readonly VITE_DEV_HOOKS?: string;
}

/** `package.json`'s version, defined by `vite.config.ts` (absent in plain Node). */
declare const __GAME_VERSION__: string | undefined;
