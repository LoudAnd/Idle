# Asset & Content Sources

This project follows one hard rule: **no generated assets.** Any game content (text such as
names and descriptions, icons and images, sound and music) is pulled from openly licensed
sources and credited. Code, UI labels, numbers, formulas, and game logic are written by hand.

The asset pipeline (`npm run assets`) fetches each source at a **pinned commit** into
`vendor/` (git-ignored), extracts the subset the game uses into `public/assets/` and
`src/data/generated/`, and regenerates `CREDITS.md`.

| Source | What we use | License | Pinned commit |
| --- | --- | --- | --- |
| [game-icons/icons](https://github.com/game-icons/icons) | SVG icons; mainly the 121 `viscious-speed/abstract-*` geometric icons | CC0 for viscious-speed; [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) for most other artists, credited per artist | `82d948812bfe3f269ef8f731dcdb07b08160edc4` |
| [Mcamento8/open-game-sfx-index](https://github.com/Mcamento8/open-game-sfx-index) | Sound effects and jingles mirrored from Kenney.nl and CC0-verified OpenGameArt packs | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) audio; index metadata MIT | `34bbe8b525b5ceff3804915ea745532af11f6055` |
| [oeis/oeisdata](https://github.com/oeis/oeisdata) | Integer-sequence names, terms, and comments from the On-Line Encyclopedia of Integer Sequences | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), © OEIS Foundation Inc. | `2571637880e813b773a668e6faabc1569e026bb2` |
| [SoundSafari/CC0-1.0-Music](https://github.com/SoundSafari/CC0-1.0-Music) | Background music (e.g. FreePD tracks by Kevin MacLeod) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) / public domain | `655388f987eacf6d08d73080fcc3e727f267bfde` |
| [@fontsource](https://fontsource.org) packages on npm | Web fonts | [SIL OFL 1.1](https://openfontlicense.org) | npm versions in `package-lock.json` |
| [Preact](https://github.com/preactjs/preact) on npm | UI rendering (runtime code, not a content asset) | MIT | npm version in `package-lock.json` |
| [break_eternity.js](https://github.com/Patashu/break_eternity.js) on npm | Big-number arithmetic (runtime code, not a content asset; ADR 001) | MIT | npm `2.1.3` (exact pin) |

## Required attribution

**OEIS:** "Data from The On-Line Encyclopedia of Integer Sequences (https://oeis.org),
© OEIS Foundation Inc., licensed under CC BY-SA 4.0." Each entry the game shows names its
A-number. The extracted data file is distributed under CC BY-SA 4.0 (share-alike). Game code
stays MIT.

**game-icons.net:** each icon is credited to its artist (the folder it came from) in
`CREDITS.md` and on the in-game Credits screen, with a link to https://game-icons.net and
the icon's license.

**Libraries:** Preact and break_eternity.js are MIT. Their licence files ship verbatim in
`public/LICENSES/` (`MIT-preact.txt`, `MIT-break_eternity.txt`), which the build copies into
`dist/`, since M1 (GDD §16.5). `tests/arch/licenses.test.ts` checks that every runtime
dependency is MIT and that its notice there matches the installed package's `LICENSE` byte for
byte. M8 adds the remaining licence files (`CC-BY-3.0.txt`, `OFL-1.1.txt`, and the rest of
`public/LICENSES/`) before the first deploy in M9.

**Kenney / OpenGameArt / FreePD:** CC0 needs no attribution, but every pack and track is
still listed in `CREDITS.md`.

## Network note

The build sandbox can reach GitHub (git and raw files), npm, and PyPI. It cannot reach
kenney.nl, opengameart.org, freesound.org, oeis.org, or Wikimedia directly, so assets from
those sites come through license-verified GitHub mirrors.
