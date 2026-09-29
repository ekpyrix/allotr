import type { ExportFormat } from '@allotr/shared';
import { problemOf } from './http.ts';
import { messageOf, type CliIo } from './io.ts';
import { describe, twoFactorHint, withSignedIn } from './sign-in.ts';

// `allotr export`: download all ledger data through `GET /v1/export`
// (docs/architecture.md §5.2) into a new file. An existing file is never
// overwritten.

export interface ExportOptions {
  readonly server: string;
  readonly format: ExportFormat;
  /** The file to write; the server's suggested name when omitted. */
  readonly out?: string | undefined;
  readonly email?: string | undefined;
}

const hints: Readonly<Record<string, string>> = {
  two_factor_enrollment_required: twoFactorHint,
};

/** The file name from `attachment; filename="…"`, without any directory. */
export function suggestedName(disposition: string | null): string | null {
  const match = /filename="([^"/\\]+)"/.exec(disposition ?? '');
  const name = match?.[1];
  return name === undefined || name.startsWith('.') ? null : name;
}

export async function runExport(
  options: ExportOptions,
  io: CliIo,
): Promise<number> {
  return withSignedIn(options, io, async (session) => {
    const response = await session.get(`/v1/export?format=${options.format}`);
    if (response.status !== 200) {
      const code = problemOf(response)?.code;
      const hint = code === undefined ? undefined : hints[code];
      io.stderr(`Export failed: ${hint ?? describe(response)}`);
      return 1;
    }
    const file =
      options.out ??
      suggestedName(response.headers.get('content-disposition')) ??
      `allotr-export.${options.format}`;
    try {
      await io.writeNewFile(file, response.text);
    } catch (error) {
      io.stderr(
        isExisting(error)
          ? `${file} already exists. Choose another name with --out.`
          : `Cannot write ${file}: ${messageOf(error)}`,
      );
      return 1;
    }
    io.stdout(`Saved the ${options.format} export to ${file}.`);
    return 0;
  });
}

function isExisting(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  );
}
