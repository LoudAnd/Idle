/**
 * The Settings panel (GDD §19), opened by the header's Settings button in the main area. M3 has
 * two sub-tabs: Numbers (notation, precision 0–4, integer threshold) and Display (theme, UI
 * fps). Later milestones add Audio, Accessibility, Save and Credits.
 *
 * Every control is a native, labelled `<select>` at least 44 px tall. A change applies at once
 * and is saved (`App.tsx`). Close (or Escape) returns the focus to the Settings button. The
 * panel is a dismiss layer, so its Escape never also closes a breakdown left open beneath it.
 */
import { useId, useState } from 'preact/hooks';
import { useDismissLayer } from '../dismiss.ts';
import { STRINGS } from '../strings.ts';
import type { StringKey } from '../strings.ts';
import { Tabs, panelId, tabId } from '../shell/Tabs.tsx';
import { fill } from '../tpl.ts';
import {
  INT_THRESHOLDS,
  NOTATION_IDS,
  PRECISIONS,
  SETTINGS_FIELDS,
  THEME_IDS,
  UI_FPS_OPTIONS,
} from './settings.ts';
import type { Settings } from './settings.ts';
import './SettingsPanel.css';

type Section = 'numbers' | 'display';

const NOTATION_KEY: Readonly<Record<Settings['notation'], StringKey>> = Object.freeze({
  scientific: 'notation.scientific',
  engineering: 'notation.engineering',
  logarithm: 'notation.logarithm',
  standard: 'notation.standard',
});

const THEME_KEY: Readonly<Record<Settings['theme'], StringKey>> = Object.freeze({
  dark: 'theme.dark',
  light: 'theme.light',
});

interface Option {
  readonly value: string;
  readonly label: string;
}

interface FieldProps<K extends keyof Settings> {
  /** The settings field the select edits. */
  readonly setting: K;
  readonly label: string;
  readonly options: readonly Option[];
  readonly settings: Settings;
  readonly disabled: boolean;
  readonly onChange: (next: Settings) => void;
  /** Turns the select's string value back into the field's value. */
  readonly parse: (v: string) => unknown;
}

function Field<K extends keyof Settings>({
  setting: name,
  label,
  options,
  settings,
  disabled,
  onChange,
  parse,
}: FieldProps<K>) {
  const id = `${useId()}-${name}`;
  const current = String(settings[name]);
  // A loaded value the panel does not offer (any UI fps 10–60 loads) is still shown.
  const all = options.some((o) => o.value === current)
    ? options
    : [...options, { value: current, label: current }];
  return (
    <div class="settings-field">
      <label for={id}>{label}</label>
      <select
        id={id}
        data-setting={name}
        value={current}
        disabled={disabled}
        onChange={(e) => {
          const v = parse((e.currentTarget as HTMLSelectElement).value);
          if (SETTINGS_FIELDS[name](v)) onChange({ ...settings, [name]: v });
        }}
      >
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface SettingsPanelProps {
  readonly id: string;
  readonly settings: Settings;
  readonly onChange: (next: Settings) => void;
  readonly onClose: () => void;
  readonly paused: boolean;
}

const asNumber = (v: string): unknown => Number(v);
const asString = (v: string): unknown => v;

export function SettingsPanel({ id, settings, onChange, onClose, paused }: SettingsPanelProps) {
  const prefix = `${id}-s`;
  const [section, setSection] = useState<Section>('numbers');
  // A dismiss layer (`dismiss.ts`): Escape closes Settings only, not a breakdown beneath it.
  useDismissLayer({ onEscape: onClose });
  const common = { settings, onChange, disabled: paused };
  return (
    <section id={id} class="settings" data-settings-panel aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{STRINGS['tab.settings']}</h2>
      <Tabs
        items={[
          { id: 'numbers', label: STRINGS['settings.numbers'] },
          { id: 'display', label: STRINGS['settings.display'] },
        ]}
        selected={section}
        onSelect={(s) => setSection(s as Section)}
        label={STRINGS['tab.settings']}
        idPrefix={prefix}
        disabled={paused}
      />
      {section === 'numbers' ? (
        <div
          role="tabpanel"
          id={panelId(prefix, 'numbers')}
          aria-labelledby={tabId(prefix, 'numbers')}
          class="settings-section"
        >
          <Field
            {...common}
            setting="notation"
            label={STRINGS['settings.notation']}
            options={NOTATION_IDS.map((n) => ({ value: n, label: STRINGS[NOTATION_KEY[n]] }))}
            parse={asString}
          />
          <Field
            {...common}
            setting="precision"
            label={STRINGS['settings.precision']}
            options={PRECISIONS.map((p) => ({ value: String(p), label: String(p) }))}
            parse={asNumber}
          />
          <Field
            {...common}
            setting="intThreshold"
            label={STRINGS['settings.intThreshold']}
            options={INT_THRESHOLDS.map((t) => ({
              value: String(t),
              label: fill(STRINGS['settings.intOption'], { e: Math.round(Math.log10(t)) }),
            }))}
            parse={asNumber}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id={panelId(prefix, 'display')}
          aria-labelledby={tabId(prefix, 'display')}
          class="settings-section"
        >
          <Field
            {...common}
            setting="theme"
            label={STRINGS['settings.theme']}
            options={THEME_IDS.map((t) => ({ value: t, label: STRINGS[THEME_KEY[t]] }))}
            parse={asString}
          />
          <Field
            {...common}
            setting="uiFps"
            label={STRINGS['settings.uiFps']}
            options={UI_FPS_OPTIONS.map((f) => ({ value: String(f), label: String(f) }))}
            parse={asNumber}
          />
        </div>
      )}
      <p>
        <button type="button" data-close onClick={onClose} disabled={paused}>
          {STRINGS.close}
        </button>
      </p>
    </section>
  );
}
