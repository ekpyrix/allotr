// What the CLI needs from the outside world, injected so tests run without
// a terminal, files or network.

export interface CliIo {
  readonly fetch: typeof fetch;
  readFile(path: string): Promise<string>;
  /** Writes a file that must not exist yet; rejects with code EEXIST. */
  writeNewFile(path: string, text: string): Promise<void>;
  /** Reads one line; `hidden` input is not echoed. */
  prompt(
    question: string,
    options: { readonly hidden: boolean },
  ): Promise<string>;
  stdout(line: string): void;
  stderr(line: string): void;
}

/** Ends the run with a message and an exit code. */
export class CliExit extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
