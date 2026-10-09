// The seam between the `/` shortcut and the command line: the command line
// registers a function that focuses its input; the shortcut calls it.

let focus: (() => void) | null = null;

/** Registers how to focus the command line input; returns an unregister. */
export function registerCommandLineFocus(fn: () => void): () => void {
  focus = fn;
  return () => {
    if (focus === fn) focus = null;
  };
}

/** Focuses the command line, if one is mounted. */
export function focusCommandLine(): void {
  focus?.();
}
