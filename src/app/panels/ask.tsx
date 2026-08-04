/**
 * Asking the user something, in the app rather than in the browser.
 *
 * `window.confirm` and `window.prompt` look like the cheap option and mostly are — until the
 * app is embedded. A browser **silently ignores** both inside a sandboxed frame that hasn't
 * been granted `allow-modals`: no dialog, no error, the call just returns as if the user had
 * cancelled. Every button built on them becomes a button that does nothing, which is the worst
 * possible failure for a control that deletes a room somebody measured.
 *
 * So the app asks its own questions. Same shape as the native calls — await an answer, get
 * `null` or `false` on cancel — so call sites read the way they did, but the dialog is ours and
 * works wherever the app runs.
 *
 * **`alert` is in the same family and was still in use.** It sat on the one control that opens a
 * job file: pick the wrong file in a sandboxed frame and the app said nothing whatsoever, because
 * the only thing it had to say with was the call the browser was throwing away. `tell` is the
 * replacement — one button, no question, and it appears wherever the app runs.
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface ConfirmOptions {
  /** Text on the button that goes ahead. Say what happens — "Delete", not "OK". */
  readonly confirmLabel?: string;
  /** Marks the action as destructive, so it reads as one. */
  readonly danger?: boolean;
}

export interface PromptOptions {
  readonly confirmLabel?: string;
  readonly placeholder?: string;
}

export interface Ask {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>;
  /**
   * Say something and wait for it to be read. The replacement for `alert`.
   *
   * One button, because there is nothing to decide — offering Cancel on a sentence that has already
   * happened invites somebody to look for the undo that isn't there.
   */
  tell: (message: string) => Promise<void>;
}

type Request =
  | {
      readonly kind: 'confirm';
      readonly message: string;
      readonly confirmLabel: string;
      readonly danger: boolean;
      readonly resolve: (answer: boolean) => void;
    }
  | {
      readonly kind: 'tell';
      readonly message: string;
      readonly confirmLabel: string;
      readonly resolve: () => void;
    }
  | {
      readonly kind: 'prompt';
      readonly message: string;
      readonly confirmLabel: string;
      readonly placeholder: string;
      readonly initial: string;
      readonly resolve: (answer: string | null) => void;
    };

const AskContext = createContext<Ask | null>(null);

export const useAsk = (): Ask => {
  const ask = useContext(AskContext);
  if (!ask) throw new Error('useAsk must be used inside an <AskProvider>');
  return ask;
};

/**
 * The dialog itself.
 *
 * A message can carry blank lines — the second paragraph is usually the consequence, and it
 * wants to be readable rather than run on from the question.
 */
function AskDialog({ request, onClose }: { request: Request; onClose: (answer: unknown) => void }) {
  const [value, setValue] = useState(request.kind === 'prompt' ? request.initial : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Once, on open — not on every render, or it would fight the user for the caret.
    if (inputRef.current) {
      // Select rather than just focus: the default is usually right but rarely what you keep.
      inputRef.current.focus();
      inputRef.current.select();
    } else {
      confirmRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose(request.kind === 'prompt' ? null : request.kind === 'tell' ? undefined : false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, request.kind]);

  /*
   * What dismissing means, per kind.
   *
   * A `tell` has nothing to cancel — it has already happened — so clicking away resolves it the
   * same as OK does. Anything else would leave a caller awaiting a promise that never settles.
   */
  const cancel = () =>
    onClose(request.kind === 'prompt' ? null : request.kind === 'tell' ? undefined : false);
  const submit = () => {
    if (request.kind === 'prompt') onClose(value.trim() ? value : null);
    else if (request.kind === 'tell') onClose(undefined);
    else onClose(true);
  };

  /*
   * Deliberately not a <form>.
   *
   * A sandboxed frame without `allow-forms` blocks submission outright — the browser logs it
   * and the submit handler never runs, which is the same silent dead button that `confirm()`
   * gave us and the reason this component exists at all. A plain click handler works
   * everywhere, so Enter is wired up by hand instead.
   */
  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div
        className="modal is-compact"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-body">
          {request.message.split('\n\n').map((paragraph) => (
            <p key={paragraph} className="ask-message">
              {paragraph}
            </p>
          ))}

          {request.kind === 'prompt' && (
            <input
              ref={inputRef}
              type="text"
              className="ask-input"
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                // What Enter would have done, had this been a form.
                if (e.key === 'Enter' && value.trim()) submit();
              }}
            />
          )}
        </div>

        <footer className="modal-foot">
          <div className="modal-actions">
            {request.kind !== 'tell' && (
              <button type="button" className="btn" onClick={cancel}>
                Cancel
              </button>
            )}
            <button
              type="button"
              ref={confirmRef}
              className={`btn ${request.kind === 'confirm' && request.danger ? 'danger' : 'primary'}`}
              disabled={request.kind === 'prompt' && !value.trim()}
              onClick={submit}
            >
              {request.confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function AskProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);

  const ask = useMemo<Ask>(
    () => ({
      confirm: (message, options) =>
        new Promise<boolean>((resolve) =>
          setRequest({
            kind: 'confirm',
            message,
            confirmLabel: options?.confirmLabel ?? 'OK',
            danger: options?.danger ?? false,
            resolve,
          }),
        ),
      prompt: (message, defaultValue, options) =>
        new Promise<string | null>((resolve) =>
          setRequest({
            kind: 'prompt',
            message,
            confirmLabel: options?.confirmLabel ?? 'Save',
            placeholder: options?.placeholder ?? '',
            initial: defaultValue ?? '',
            resolve,
          }),
        ),
      tell: (message) =>
        new Promise<void>((resolve) =>
          setRequest({ kind: 'tell', message, confirmLabel: 'OK', resolve }),
        ),
    }),
    [],
  );

  const close = useCallback(
    (answer: unknown) => {
      if (!request) return;
      // Resolve before clearing, so a caller that reopens a dialog isn't cut off by this state
      // update landing after theirs.
      (request.resolve as (a: unknown) => void)(answer);
      setRequest(null);
    },
    [request],
  );

  return (
    <AskContext.Provider value={ask}>
      {children}
      {request && <AskDialog key={request.message} request={request} onClose={close} />}
    </AskContext.Provider>
  );
}
