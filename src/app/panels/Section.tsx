/**
 * A folding section, and the hook that remembers which ones you left open.
 *
 * `<details>` rather than a div and a click handler, because the browser already does the parts
 * that are easy to do badly: the header is focusable and works from the keyboard, the state is
 * exposed to a screen reader without an `aria-expanded` to keep in step, and Chrome opens a shut
 * section to show a find-in-page hit rather than reporting the page does not contain the word.
 *
 * The summary line is the important half — see `inspectorSections.ts`. A section is only allowed
 * to hide *controls*; anything set inside it stays legible on the header while it is shut.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadUiPrefs, saveUiPrefs } from '../store/persistence.ts';
import {
  type SectionId,
  readOpenSections,
  withSectionOpen,
} from './inspectorSections.ts';

/**
 * The fold state, read once on mount and written back on every change.
 *
 * Read in an effect rather than in `useState`'s initialiser so the first render does not touch
 * local storage — the app has to come up on a browser that refuses it, which is the same reason
 * `persistence.ts` guards every access.
 */
export const useOpenSections = (): [
  Record<SectionId, boolean>,
  (id: SectionId, open: boolean) => void,
] => {
  const [open, setOpen] = useState(() => readOpenSections(null));

  useEffect(() => {
    setOpen(readOpenSections(loadUiPrefs()));
  }, []);

  const set = useCallback((id: SectionId, next: boolean) => {
    setOpen((current) => {
      const updated = withSectionOpen(current, id, next);
      saveUiPrefs(updated);
      return updated;
    });
  }, []);

  return [open, set];
};

export function Section({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  /** What is set inside, shown on the header so a shut section is never silent. */
  summary?: string | null;
  open: boolean;
  onToggle: (id: SectionId, open: boolean) => void;
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
