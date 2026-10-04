/**
 * Files and the clipboard (GDD §19 Save panel): download a text as a `.txt` file, read a chosen
 * file, and copy text. Each may be blocked (an Artifact iframe can deny downloads and the
 * Clipboard API), so each reports failure instead of throwing; the panel then falls back to
 * selecting the text for a manual copy.
 */

/** Downloads `text` as `filename` (an object URL and an anchor click). False when blocked. */
export function downloadText(win: Window, filename: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = win.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.hidden = true;
    win.document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked later: some browsers start the download after the click returns.
    win.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

/** The text of a chosen file (`file.text()`, or `FileReader` where that is missing). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsText(file);
  });
}

/** Copies `text` with the Clipboard API. False when it is missing or the call is rejected. */
export async function copyText(win: Window, text: string): Promise<boolean> {
  try {
    const clip = win.navigator.clipboard;
    if (clip === undefined || typeof clip.writeText !== 'function') return false;
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}
