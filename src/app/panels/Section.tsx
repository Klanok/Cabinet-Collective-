/**
 * A folding section, and the hook that remembers which ones you left open.
 *
 * `<details>` rather than a div and a click handler, because the browser already does the parts
 * that are easy to do badly: the header is focusable and works from the keyboard, the state is
 * exposed to a screen reader without an `aria-expanded` to keep in step, and Chrome opens a shut
 * section to show a find-in-page hit rather than reporting the page does not contain the word.
 *
 * The summary line is the important half — see `inspectorSections.ts` and `joineryGroups.ts`. A
 * section is only allowed to hide *controls*; anything set inside it stays legible on the header
 * while it is shut.
 *
 * ## Two panels, one stored record
 *
 * The Inspector and the Joinery tab both fold, and both remember. They keep their preferences in
 * **one** local-storage record under distinct ids, which is only safe because writes *merge*:
 * a hook that wrote the slice it knows about would delete the other panel's folds every time you
 * clicked a heading. So each hook reads the whole record, layers its own defaults over its own
 * ids, and writes back the whole thing with one key changed.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadUiPrefs, saveUiPrefs } from '../store/persistence.ts';

/**
 * Fold state for one panel's sections, read once on mount and written back on every change.
 *
 * Read in an effect rather than in `useState`'s initialiser so the first render does not touch
 * local storage — the app has to come up on a browser that refuses it, which is the same reason
 * `persistence.ts` guards every access.
 *
 * `read` carries the whole contract — it is the panel's own reader, and it decides what its
 * defaults are, which stored ids it recognises and which it drops. See `readOpenSections`.
 */
export const useOpenSections = <Id extends string>(
  read: (raw: unknown) => Record<Id, boolean>,
): [Record<Id, boolean>, (id: Id, open: boolean) => void] => {
  const [open, setOpen] = useState(() => read(null));

  useEffect(() => {
    setOpen(read(loadUiPrefs()));
    // `read` is a module-level function in practice and does not change between renders;
    // depending on it would re-read storage on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback((id: Id, next: boolean) => {
    setOpen((current) => {
      const updated = { ...current, [id]: next } as Record<Id, boolean>;
      // Merge into whatever else is stored, so the other panel's folds survive this click.
      const stored = loadUiPrefs();
      saveUiPrefs({
        ...(typeof stored === 'object' && stored !== null ? stored : {}),
        [id]: next,
      });
      return updated;
    });
  }, []);

  return [open, set];
};

export function Section<Id extends string>({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: Id;
  title: string;
  /** What is set inside, shown on the header so a shut section is never silent. */
  summary?: string | null;
  open: boolean;
  onToggle: (id: Id, open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="section"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next !== open) onToggle(id, next);
      }}
    >
      <summary className="section-head">
        <span className="section-title">{title}</span>
        {summary && <span className="section-summary">{summary}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
