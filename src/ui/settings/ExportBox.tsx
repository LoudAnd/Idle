/**
 * An export text box (GDD §19 Save panel, §20.1 banners, §21.8 recovery): the text in a labelled
 * read-only `<textarea>`, with Copy and Download (`.txt`).
 *
 * Copy uses the Clipboard API; where that is missing or rejects (as it can in an Artifact
 * iframe), the text box takes the focus with all of its text selected, so the player can copy it
 * by hand. A copy that worked says "Copied" in a status line.
 */
import { useId, useRef, useState } from 'preact/hooks';
import { copyText, downloadText } from '../../platform/download.ts';
import { STRINGS } from '../strings.ts';

export interface ExportBoxProps {
  /** The text box's label. */
  readonly label: string;
  readonly text: string;
  /** The download's file name. */
  readonly filename: string;
}

export function ExportBox({ label, text, filename }: ExportBoxProps) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const selectAll = (): void => {
    const el = area.current;
    if (el === null) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
  };
  const copy = async (): Promise<void> => {
    const ok = await copyText(window, text);
    setCopied(ok);
    if (!ok) selectAll();
  };
  return (
    <div class="export-box" data-export>
      <label for={id}>{label}</label>
      <textarea
        id={id}
        ref={area}
        readOnly
        rows={4}
        spellcheck={false}
        value={text}
        data-export-text
        onFocus={(e) => e.currentTarget.select()}
      />
      <div class="save-actions">
        <button type="button" data-action="copy" onClick={() => void copy()}>
          {STRINGS['save.copy']}
        </button>
        <button
          type="button"
          data-action="download"
          onClick={() => downloadText(window, filename, text)}
        >
          {STRINGS['save.download']}
        </button>
        <span role="status" class="save-status">
          {copied ? STRINGS['save.copied'] : ''}
        </span>
      </div>
    </div>
  );
}
