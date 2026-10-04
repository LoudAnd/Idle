/**
 * The Save panel (GDD §19, §20.1), the Settings panel's Save section. All labels come from
 * `strings.ts`; every control is at least 44 px and disabled while the game is paused or this
 * tab is not active (another tab owns the save, or a catch-up is running).
 *
 * 1. **Save now** writes at once and says "Saved" or "Not saved" in a status line (the
 *    manual-save sound comes with M10).
 * 2. **Export** builds the export text (`ISI1:`, or `ISI1u:` without CompressionStream) into an
 *    `ExportBox`: Copy, with the select-all fallback, and Download as `.txt`.
 * 3. **Import** by paste or from a `.txt` file. Garbage changes nothing and says "Not a save",
 *    "Invalid save" or "Newer save version"; a valid save asks Confirm or Cancel first (inline:
 *    `window.confirm` is blocked in sandboxed iframes), then replaces the game and saves.
 * 4. **Restore backup** shows the backup's time ("Backup {t}", `—` and disabled when there is
 *    none) and restores it after an inline confirmation.
 * 5. **Download quarantine** (only when a quarantined blob exists) downloads it as-is, and
 *    **Hard reset** is enabled only once the field holds exactly "RESET".
 *
 * A read-only session (a newer save, §20.1) never writes: Save now, Import and Restore are
 * disabled there; Export and Hard reset stay.
 */
import { useId, useState } from 'preact/hooks';
import type { DecodeResult, EnvelopeMeta, SaveData } from '../../engine/save/envelope.ts';
import { downloadText, readFileText } from '../../platform/download.ts';
import type { Session, SessionView } from '../../platform/session.ts';
import { formatTimestamp } from '../duration.ts';
import { STRINGS } from '../strings.ts';
import type { StringKey } from '../strings.ts';
import { fill } from '../tpl.ts';
import { ExportBox } from './ExportBox.tsx';
import './SavePanel.css';

/** What the panel uses of the session. */
export type SaveApi = Pick<
  Session,
  'saveNow' | 'exportText' | 'importText' | 'adopt' | 'backup' | 'quarantineBlob' | 'hardReset'
>;

export interface SavePanelProps {
  readonly session: SaveApi;
  readonly view: SessionView;
  /** Paused or not active: every control is disabled. */
  readonly disabled: boolean;
}

type ImportState =
  | { readonly kind: 'confirm'; readonly save: SaveData; readonly meta: EnvelopeMeta }
  | { readonly kind: 'message'; readonly key: StringKey };

/** The message for an import that did not decode. */
export function importMessage(r: DecodeResult): StringKey {
  if (r.kind === 'newer') return 'save.newer';
  if (r.kind === 'invalid' && r.stage === 'frame') return 'save.notASave';
  return 'save.invalid';
}

function Confirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <span class="save-actions" data-confirm>
      <button type="button" data-action="confirm" onClick={onConfirm}>
        {STRINGS.confirm}
      </button>
      <button type="button" data-action="cancel" onClick={onCancel}>
        {STRINGS.cancel}
      </button>
    </span>
  );
}

export function SavePanel({ session, view, disabled }: SavePanelProps) {
  const pasteId = useId();
  const fileId = useId();
  const resetId = useId();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [importing, setImporting] = useState<ImportState | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [resetText, setResetText] = useState('');
  const writable = !disabled && !view.readOnly;

  const decoded = (r: DecodeResult): void => {
    setImporting(
      r.kind === 'ok'
        ? { kind: 'confirm', save: r.save, meta: r.meta }
        : { kind: 'message', key: importMessage(r) },
    );
  };
  const importPaste = async (): Promise<void> => decoded(await session.importText(paste));
  const importFile = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    try {
      decoded(await session.importText(await readFileText(file)));
    } catch {
      setImporting({ kind: 'message', key: 'save.notASave' });
    }
  };
  const confirmImport = (): void => {
    if (importing?.kind !== 'confirm') return;
    const ok = session.adopt(importing.save, importing.meta);
    setImporting({ kind: 'message', key: ok ? 'save.imported' : 'save.failed' });
    if (ok) setPaste('');
  };
  const restore = (): void => {
    setRestoring(false);
    const b = session.backup();
    if (b !== null) session.adopt(b.save, b.meta);
  };
  const resetWord = STRINGS['save.resetWord'];
  const backupText = fill(STRINGS['save.backupAt'], {
    t: view.backupAt === null ? STRINGS.none : formatTimestamp(view.backupAt),
  });

  return (
    <div class="save-panel" data-save-panel>
      <section class="save-part" data-part="now">
        <div class="save-actions">
          <button
            type="button"
            data-action="save"
            disabled={!writable}
            onClick={() => setSaved(session.saveNow().ok)}
          >
            {STRINGS['save.now']}
          </button>
          <span role="status" class="save-status" data-save-status>
            {saved === null ? '' : saved ? STRINGS['save.saved'] : STRINGS['save.failed']}
          </span>
        </div>
      </section>

      <section class="save-part" data-part="export">
        <div class="save-actions">
          <button
            type="button"
            data-action="export"
            disabled={disabled}
            onClick={() => void session.exportText().then(setExported)}
          >
            {STRINGS['save.export']}
          </button>
        </div>
        {exported !== null && (
          <ExportBox
            label={STRINGS['save.exportText']}
            text={exported}
            filename={fill(STRINGS['file.save'], { t: view.lastSavedAt ?? 0 })}
          />
        )}
      </section>

      <section class="save-part" data-part="import">
        <label for={pasteId}>{STRINGS['save.importText']}</label>
        <textarea
          id={pasteId}
          rows={3}
          spellcheck={false}
          value={paste}
          disabled={!writable}
          data-import-text
          onInput={(e) => setPaste(e.currentTarget.value)}
        />
        <div class="save-actions">
          <button
            type="button"
            data-action="import"
            disabled={!writable || paste.trim() === ''}
            onClick={() => void importPaste()}
          >
            {STRINGS['save.import']}
          </button>
          {importing?.kind === 'confirm' && (
            <Confirm onConfirm={confirmImport} onCancel={() => setImporting(null)} />
          )}
          <span role="status" class="save-status" data-import-status>
            {importing?.kind === 'message' ? STRINGS[importing.key] : ''}
          </span>
        </div>
        <div class="save-file">
          <label for={fileId}>{STRINGS['save.importFile']}</label>
          <input
            id={fileId}
            type="file"
            accept=".txt,text/plain"
            disabled={!writable}
            data-import-file
            onChange={(e) => void importFile(e.currentTarget)}
          />
        </div>
      </section>

      <section class="save-part" data-part="backup">
        <span data-backup-at>{backupText}</span>
        <div class="save-actions">
          <button
            type="button"
            data-action="restore"
            disabled={!writable || view.backupAt === null}
            onClick={() => setRestoring(true)}
          >
            {STRINGS['save.restore']}
          </button>
          {restoring && <Confirm onConfirm={restore} onCancel={() => setRestoring(false)} />}
        </div>
      </section>

      <section class="save-part" data-part="danger">
        {view.quarantine && (
          <div class="save-actions">
            <button
              type="button"
              data-action="quarantine"
              disabled={disabled}
              onClick={() => {
                const blob = session.quarantineBlob();
                if (blob !== null) downloadText(window, STRINGS['file.quarantine'], blob);
              }}
            >
              {STRINGS['save.quarantine']}
            </button>
          </div>
        )}
        <label for={resetId}>{fill(STRINGS['save.resetType'], { w: resetWord })}</label>
        <div class="save-actions">
          <input
            id={resetId}
            type="text"
            autoComplete="off"
            spellcheck={false}
            value={resetText}
            disabled={disabled}
            data-reset-text
            onInput={(e) => setResetText(e.currentTarget.value)}
          />
          <button
            type="button"
            data-action="reset"
            disabled={disabled || resetText !== resetWord}
            onClick={() => {
              setResetText('');
              setImporting(null);
              setExported(null);
              setSaved(null);
              session.hardReset();
            }}
          >
            {STRINGS['save.reset']}
          </button>
        </div>
      </section>
    </div>
  );
}
