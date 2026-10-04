/**
 * Chrome banners (GDD §20.1), between the header and the main panel, in priority order:
 *
 * 1. Storage unavailable (the game runs in memory) — with Export.
 * 2. Storage full (the previous slot stays active; the next autosave retries) — with Export.
 * 3. Newer save version (refused; nothing is written) — with Export of the refused blob,
 *    verbatim, so the player can keep it.
 * 4. "Loaded from {source}" when a load fell back past the active slot (other slot, backup or
 *    new game) — with Restore backup (after an inline confirmation) and Download quarantine.
 * 5. "Open in another tab" when another tab owns the save — with Use here.
 *
 * Each banner is a `role="status"` region, so its text is announced when it appears.
 */
import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { downloadText } from '../../platform/download.ts';
import type { Session, SessionView } from '../../platform/session.ts';
import { ExportBox } from '../settings/ExportBox.tsx';
import { STRINGS } from '../strings.ts';
import type { StringKey } from '../strings.ts';
import { fill } from '../tpl.ts';

export type BannerApi = Pick<
  Session,
  'exportText' | 'backup' | 'adopt' | 'quarantineBlob' | 'useHere'
>;

export interface BannersProps {
  readonly view: SessionView;
  readonly session: BannerApi;
  /** After a fault every control is disabled (GDD §21.8). */
  readonly paused: boolean;
}

const SOURCE_KEY: Readonly<Record<NonNullable<SessionView['fellBack']>['source'], StringKey>> =
  Object.freeze({
    other: 'banner.source.other',
    backup: 'banner.source.backup',
    new: 'banner.source.new',
  });

/** Export of the current game, built on demand. */
function ExportCurrent({ session, disabled }: { session: BannerApi; disabled: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        data-action="export"
        disabled={disabled}
        onClick={() => void session.exportText().then(setText)}
      >
        {STRINGS['save.export']}
      </button>
      {text !== null && (
        <ExportBox
          label={STRINGS['save.exportText']}
          text={text}
          filename={fill(STRINGS['file.save'], { t: Date.now() })}
        />
      )}
    </>
  );
}

function Fallback({ view, session, paused }: BannersProps) {
  const [confirming, setConfirming] = useState(false);
  const source = view.fellBack?.source ?? 'new';
  return (
    <div class="banner" role="status" data-banner="fallback">
      <span>{fill(STRINGS['banner.fallback'], { source: STRINGS[SOURCE_KEY[source]] })}</span>
      <span class="save-actions">
        {view.backupAt !== null && !view.readOnly && (
          <button
            type="button"
            data-action="restore"
            disabled={paused || !view.active}
            onClick={() => setConfirming(true)}
          >
            {STRINGS['save.restore']}
          </button>
        )}
        {confirming && (
          <>
            <button
              type="button"
              data-action="confirm"
              onClick={() => {
                setConfirming(false);
                const b = session.backup();
                if (b !== null) session.adopt(b.save, b.meta);
              }}
            >
              {STRINGS.confirm}
            </button>
            <button type="button" data-action="cancel" onClick={() => setConfirming(false)}>
              {STRINGS.cancel}
            </button>
          </>
        )}
        {view.quarantine && (
          <button
            type="button"
            data-action="quarantine"
            onClick={() => {
              const blob = session.quarantineBlob();
              if (blob !== null) downloadText(window, STRINGS['file.quarantine'], blob);
            }}
          >
            {STRINGS['save.quarantine']}
          </button>
        )}
      </span>
    </div>
  );
}

export function Banners({ view, session, paused }: BannersProps) {
  const [showNewer, setShowNewer] = useState(false);
  const items: VNode[] = [];
  if (view.storage === 'memory' || view.storage === 'quota') {
    const key: StringKey = view.storage === 'memory' ? 'banner.storage' : 'banner.quota';
    items.push(
      <div class="banner" role="status" data-banner={view.storage} key={view.storage}>
        <span>{STRINGS[key]}</span>
        <span class="save-actions">
          <ExportCurrent session={session} disabled={paused} />
        </span>
      </div>,
    );
  }
  if (view.newer !== null) {
    items.push(
      <div class="banner" role="status" data-banner="newer" key="newer">
        <span>{STRINGS['banner.newer']}</span>
        <span class="save-actions">
          <button type="button" data-action="export" onClick={() => setShowNewer(true)}>
            {STRINGS['save.export']}
          </button>
          {showNewer && (
            <ExportBox
              label={STRINGS['save.exportText']}
              text={view.newer.blob}
              filename={fill(STRINGS['file.save'], { t: Date.now() })}
            />
          )}
        </span>
      </div>,
    );
  }
  if (view.fellBack !== null) {
    items.push(<Fallback key="fallback" view={view} session={session} paused={paused} />);
  }
  if (view.yielded) {
    items.push(
      <div class="banner" role="status" data-banner="tab" key="tab">
        <span>{STRINGS['banner.tab']}</span>
        <span class="save-actions">
          <button
            type="button"
            data-action="use-here"
            disabled={paused}
            onClick={() => void session.useHere()}
          >
            {STRINGS['banner.useHere']}
          </button>
        </span>
      </div>,
    );
  }
  if (items.length === 0) return null;
  return (
    <div class="banners" data-banners>
      {items}
    </div>
  );
}
