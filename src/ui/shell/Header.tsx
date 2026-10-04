/**
 * The header (GDD §17.1), always visible: x (large), the rate `+X/s`, the growth `×10^Y /min`
 * (`—` until there are 2 positive samples), the Next goal chip with its log-scale bar, and the
 * Settings button. Sticky, and compact up to 640 px (`shell.css`).
 *
 * `[data-x]` wraps only the `<Num>` of x, so the playtests read x from it. The goal chip is a
 * progressbar whose children are presentational: it is read as its label ("Next goal") and
 * value text ("Buy G2 · 0%"). The growth readout has a spoken form ("times ten to the 5.02 per
 * minute", §18). The page's one `h1`, the game's title, is visually hidden here.
 */
import type { Ref } from 'preact';
import { useFormat } from '../fmt.ts';
import { Num } from '../Num.tsx';
import { STRINGS } from '../strings.ts';
import { fill, fillParts } from '../tpl.ts';
import type { ShellView } from './view.ts';

export interface HeaderProps {
  readonly view: ShellView | null;
  readonly settingsOpen: boolean;
  /** The id of the Settings panel the button controls. */
  readonly settingsPanelId: string;
  readonly onSettings: () => void;
  readonly settingsRef?: Ref<HTMLButtonElement>;
  /** After a fault every control is disabled (GDD §21.8). */
  readonly paused: boolean;
}

export function Header({
  view,
  settingsOpen,
  settingsPanelId,
  onSettings,
  settingsRef,
  paused,
}: HeaderProps) {
  const { spoken } = useFormat();
  const h = view?.header;
  const goal = view?.goal ?? null;
  const goalText =
    goal === null
      ? null
      : fill(STRINGS['goal.chip'], { goal: fill(STRINGS[goal.key], goal.params), pct: goal.pct });
  return (
    <header class="shell-header">
      <h1 class="sr-only">{STRINGS['game.title']}</h1>
      <div class="shell-x">
        <span class="shell-x-label">{STRINGS['sum.x']}</span>
        <span class="shell-x-value" data-x>
          {h !== undefined && <Num value={h.x} />}
        </span>
      </div>
      {h !== undefined && (
        <div class="shell-rates">
          <span data-rate>
            {fillParts(STRINGS['rate.perSecond'], { r: <Num value={h.rate} /> })}
          </span>
          <span data-growth>
            {h.growth === null ? (
              STRINGS.none
            ) : (
              <>
                <span aria-hidden="true">
                  {fillParts(STRINGS['header.growth'], { y: <Num value={h.growth} /> })}
                </span>
                <span class="sr-only">
                  {fill(STRINGS['header.growthSr'], { y: spoken(h.growth) })}
                </span>
              </>
            )}
          </span>
        </div>
      )}
      {goal !== null && goalText !== null && (
        <div
          class="shell-goal"
          data-goal={goal.id}
          role="progressbar"
          aria-label={STRINGS['header.goal']}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={goal.pct}
          aria-valuetext={goalText}
        >
          <span>{goalText}</span>
          <span class="shell-goal-bar" aria-hidden="true">
            <span style={{ width: `${goal.pct}%` }} />
          </span>
        </div>
      )}
      <button
        type="button"
        class="shell-settings"
        data-settings
        aria-expanded={settingsOpen}
        aria-controls={settingsPanelId}
        ref={settingsRef}
        disabled={paused}
        onClick={onSettings}
      >
        {STRINGS['header.settings']}
      </button>
    </header>
  );
}
