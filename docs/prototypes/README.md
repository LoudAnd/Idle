# Design prototypes

These scripts produced the reference numbers in `docs/GAME_DESIGN.md` (GDD). They are kept so
that later sessions can re-run and check them. They are prototypes, not game code: the engine
in `src/` is the source of truth once it exists, and `src/sim` replaces them for pacing.

Run every script from this directory. Scripts that read OEIS data use `ASSET_SRC_OEIS`
(default `/home/user/oeis/oeisdata`) at the pinned commit `25716378`. The icon script uses
`ASSET_SRC_ICONS` (default `/home/user/game-icons/icons`).

| Script                | Produces                                                                                   | GDD           |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| `sim2.py`             | The Sum-layer greedy bot (`run`); its own output explores cost ratios and rates            | §5.5          |
| `sim3.py`, `sim4.py`  | `sim4.py` runs `sim2.py`'s bot with β = 2 and the frozen constants: G2 0.9, G5 5.2, G8 10.9 min, 1e40 at 12.2 min; `sim3.py` compares cost ratios | §5.5 |
| `idle_sim.py`         | Idle profile (10 s every 15 min): 2^128 at 90.4 min; 5-min and 10-min check-ins; second-run times | §15, §22.6 |
| `product_sim.py`      | Sum + Product prototype: resets, upgrades and best x at 60 min; time to 2^1024; idle resets | §15, M5, M13 |
| `norm.py`, `norm3.py` | Slot weights w_S and the best single sequence per step for the 15 reference sequences       | §8.5          |
| `tr.py`, `closure3.py`, `cands.txt`, `final.txt` | Lab transform matches and the cross-reference graph counts      | §8.6          |
| `windows.mjs`         | Valid-window counts W_S at a given term bound                                               | §6.2          |
| `window_heights.py`   | Height needed to buy a given count under the governor                                       | §6.2, §6.4    |
| `record_costs.mjs`    | Exact Record costs with BigInt (A000215 520, total 5,247)                                   | §11           |
| `icon_complexity.mjs` | Command-letter counts of the CC0 abstract icons and the role table                         | §16.2         |
| `macro_steps.py`      | Offline macro-step schedule and its maximum step lengths                                    | §20.2         |

`cands.txt` and `final.txt` hold A-numbers only. The scripts print numbers derived from OEIS
data and do not contain OEIS text.
