import {
  bundleSchema,
  importResultSchema,
  type ImportResult,
} from '@allotr/shared';
import {
  createSession,
  problemOf,
  type ApiResponse,
  type Session,
} from './http.ts';
import { messageOf, type CliIo } from './io.ts';

// `allotr import`: fill an empty ledger from a JSON bundle through
// `POST /v1/import` (docs/architecture.md §5.1). The file is checked before
// any prompt so a broken bundle never costs a sign-in.

export interface ImportOptions {
  readonly file: string;
  readonly server: string;
  readonly email?: string | undefined;
}

const MAX_LISTED = 20;

const hints: Readonly<Record<string, string>> = {
  ledger_not_empty:
    'this user already has accounts, entries, bills or rates. Import fills an empty ledger only; sign in as a user without them.',
  two_factor_enrollment_required:
    'this instance requires two-factor authentication. Set it up in the web app, then run the import again.',
};

export async function runImport(
  options: ImportOptions,
  io: CliIo,
): Promise<number> {
  const bundle = await readBundle(options.file, io);
  if (bundle === null) return 2;

  const session = createSession(options.server, io.fetch);
  const email =
    options.email ?? (await io.prompt('Email: ', { hidden: false }));
  const password = await io.prompt('Password: ', { hidden: true });
  if (!(await signIn(session, email, password, io))) return 1;
  try {
    return await postBundle(session, bundle.data, io);
  } finally {
    // The session is only for this import; a failed sign-out changes nothing.
    await session.post('/v1/auth/sign-out').catch(() => undefined);
  }
}

async function readBundle(
  file: string,
  io: CliIo,
): Promise<{ data: unknown } | null> {
  let text: string;
  try {
    text = await io.readFile(file);
  } catch (error) {
    io.stderr(`Cannot read ${file}: ${messageOf(error)}`);
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    io.stderr(`${file} is not valid JSON: ${messageOf(error)}`);
    return null;
  }
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    io.stderr(`${file} is not a valid Allotr bundle:`);
    printErrors(
      parsed.error.issues.map((issue) => ({
        path: pointer(issue.path),
        message: issue.message,
      })),
      io,
    );
    return null;
  }
  // Send the file as written; the server applies the defaults itself.
  return { data };
}

async function signIn(
  session: Session,
  email: string,
  password: string,
  io: CliIo,
): Promise<boolean> {
  const response = await session.post('/v1/auth/sign-in/email', {
    email,
    password,
  });
  if (response.status !== 200) {
    io.stderr(`Sign-in failed: ${describe(response)}`);
    return false;
  }
  if (!needsCode(response.body)) return true;
  const code = await io.prompt('Authenticator code: ', { hidden: true });
  const verified = await session.post('/v1/auth/two-factor/verify-totp', {
    code,
  });
  if (verified.status !== 200) {
    io.stderr(`Sign-in failed: ${describe(verified)}`);
    return false;
  }
  return true;
}

async function postBundle(
  session: Session,
  bundle: unknown,
  io: CliIo,
): Promise<number> {
  const response = await session.post('/v1/import', bundle);
  if (response.status === 201) {
    const result = importResultSchema.safeParse(response.body);
    io.stdout(result.success ? summary(result.data) : 'Imported.');
    return 0;
  }
  const details = problemOf(response);
  const hint = details?.code === undefined ? undefined : hints[details.code];
  io.stderr(`Import failed: ${hint ?? describe(response)}`);
  if (details?.errors !== undefined) printErrors(details.errors, io);
  return 1;
}

function needsCode(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'twoFactorRedirect' in body &&
    body.twoFactorRedirect === true
  );
}

function describe(response: ApiResponse): string {
  const details = problemOf(response);
  if (details !== null) return details.detail ?? details.title;
  return `the server answered ${String(response.status)} without details.`;
}

function printErrors(
  errors: readonly { path: string; message: string }[],
  io: CliIo,
): void {
  for (const { path, message } of errors.slice(0, MAX_LISTED)) {
    io.stderr(`  ${path === '' ? '(bundle)' : path}: ${message}`);
  }
  if (errors.length > MAX_LISTED) {
    io.stderr(`  … and ${String(errors.length - MAX_LISTED)} more`);
  }
}

/** A JSON Pointer (RFC 6901) to the item a problem is about. */
function pointer(path: readonly PropertyKey[]): string {
  return path
    .map((key) => `/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function summary(r: ImportResult): string {
  return (
    `Imported ${count(r.accounts, 'account')}, ` +
    `${count(r.transactions, 'transaction')}, ` +
    `${count(r.bills, 'bill')} with ${count(r.billPayments, 'payment')}, ` +
    `${count(r.rates, 'rate')} and ${count(r.tags, 'tag')}. ` +
    `Categories: ${String(r.categoriesCreated)} created, ` +
    `${String(r.categoriesMatched)} matched.`
  );
}
