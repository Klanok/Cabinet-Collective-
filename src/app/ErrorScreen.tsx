/**
 * The screen you get instead of a blank one.
 *
 * ## Why this exists
 *
 * React unmounts the whole tree when a render throws, so **any** exception out of the rule
 * engine turns the app into a white page. That on its own would be survivable. What made it
 * genuinely nasty was the second half: the job is saved to local storage as you edit it, so a
 * value that crashes the build is *already saved* by the time the screen goes white — and every
 * reload loads it back and crashes again. The only way out was the browser's developer console,
 * which is not a reasonable thing to ask of anybody.
 *
 * Found the hard way: a corner radius smaller than the ply that wraps it threw out of
 * `cylindricalForming`, and a number field fires on every keystroke, so typing "200" resolved a
 * 2mm radius first and took the app down on the first digit.
 *
 * That specific bug is fixed at its source — the rule engine reports an impossible cabinet and
 * carries on drawing, which is the standard it is supposed to hold to. This is here for the
 * next one. **It is a backstop, not a licence to throw**: a builder that throws is still a bug,
 * and this screen names the error rather than swallowing it.
 *
 * The recovery button is deliberately the destructive one, and deliberately says so, because
 * the thing that has gone wrong is almost certainly *in the saved job* — offering a plain
 * "reload" would put you straight back in the loop you are trying to get out of.
 */

import React from 'react';
import { clearSaved, exportProjectFile, loadProject } from './store/persistence.ts';

interface Props {
  readonly children: React.ReactNode;
}

interface State {
  readonly error: Error | null;
}

export class ErrorScreen extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Still logged, so the console has the stack for whoever is fixing it.
    console.error('Cabinet Collective crashed:', error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <h1>Something in this job broke the app.</h1>
        <p>
          This is a bug, not something you did wrong. The job is saved as you edit it, so
          reloading will land you back here — you have to either save it out or clear it.
        </p>

        <p className="crash-error">{error.message}</p>

        <div className="crash-actions">
          <button
            className="btn"
            onClick={() => {
              // Straight from storage rather than from the store, which may be the thing that
              // is broken. Worth having: this file is what lets the bug be reproduced and fixed.
              const { project } = loadProject();
              if (project) exportProjectFile(project);
            }}
          >
            Save this job to a file first
          </button>
          <button
            className="btn danger"
            onClick={() => {
              clearSaved();
              location.reload();
            }}
          >
            Clear the saved job and start again
          </button>
        </div>

        <p className="note subtle">
          Saving it out is worth doing even though the job is broken — that file is what lets the
          bug be found. Clearing throws away the job and your shop standards, and cannot be
          undone.
        </p>
      </div>
    );
  }
}
