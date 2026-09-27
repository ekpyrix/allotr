import { parseArgs } from 'node:util';
import { UnreachableError } from './http.ts';
import { runImport } from './import-command.ts';
import { CliExit, messageOf, type CliIo } from './io.ts';

// Argument parsing and dispatch. Returns the exit code: 0 done, 1 refused or
// cancelled, 2 a usage or input error.

export const usage = `Usage:
  allotr import <file.json> --server <url> [--email <address>]
  allotr --help

Commands:
  import   Fill an empty ledger from an Allotr JSON bundle. Asks for the
           password and, when two-factor is on, the authenticator code.`;

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      server: { type: 'string' },
      email: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
}

function serverUrl(value: string): URL | null {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.stderr(messageOf(error));
    io.stderr(usage);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help === true) {
    io.stdout(usage);
    return 0;
  }
  const [command, file, ...rest] = positionals;
  if (
    command !== 'import' ||
    file === undefined ||
    rest.length > 0 ||
    values.server === undefined
  ) {
    io.stderr(usage);
    return 2;
  }
  const server = serverUrl(values.server);
  if (server === null) {
    io.stderr(`--server must be an http or https URL, not "${values.server}".`);
    return 2;
  }
  if (server.protocol === 'http:' && !isLoopback(server.hostname)) {
    io.stderr(
      `Warning: ${server.origin} is not HTTPS, so the password crosses the network unencrypted.`,
    );
  }
  try {
    return await runImport(
      { file, server: server.href, email: values.email },
      io,
    );
  } catch (error) {
    if (error instanceof CliExit) {
      io.stderr(error.message);
      return error.exitCode;
    }
    if (error instanceof UnreachableError) {
      io.stderr(`Could not reach ${server.origin}: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
