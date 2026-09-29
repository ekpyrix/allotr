import { describe, expect, it } from 'vitest';
import { CliExit, type CliIo } from './io.ts';
import { suggestedName } from './export-command.ts';
import { run } from './run.ts';
import {
  fakeFetch,
  json,
  problem,
  type Handler,
} from './testing/fake-fetch.ts';

// All addresses, names and amounts are made up.

const server = 'https://allotr.example.test';
const bundle = {
  format: 'allotr.bundle',
  version: 1,
  accounts: [{ name: 'Wallet', currency: 'EUR' }],
};
const result = {
  accounts: 1,
  categoriesCreated: 2,
  categoriesMatched: 1,
  rates: 0,
  tags: 1,
  transactions: 12,
  bills: 1,
  billPayments: 1,
  reconciliations: 0,
};

const withTwoFactor: Record<string, Handler> = {
  'POST /v1/auth/sign-in/email': () =>
    json(200, { twoFactorRedirect: true }, ['tf=t1; Path=/; HttpOnly']),
  'POST /v1/auth/two-factor/verify-totp': () =>
    json(200, { token: 'x' }, ['sid=s1; Path=/; HttpOnly']),
  'POST /v1/import': () => json(201, result),
  'POST /v1/auth/sign-out': () =>
    json(200, { success: true }, ['sid=; Max-Age=0; Path=/']),
};

function harness(
  routes: Readonly<Record<string, Handler>>,
  options: {
    files?: Readonly<Record<string, string>>;
    answers?: readonly string[];
  } = {},
) {
  const fake = fakeFetch(routes);
  const out: string[] = [];
  const err: string[] = [];
  const questions: { question: string; hidden: boolean }[] = [];
  const answers = [
    ...(options.answers ?? ['alice@example.test', 'correct horse', '123456']),
  ];
  const files: Record<string, string> = {
    ...(options.files ?? { 'month.json': JSON.stringify(bundle) }),
  };
  const io: CliIo = {
    fetch: fake.fetch,
    readFile: (path) => {
      const text = files[path];
      return text === undefined
        ? Promise.reject(new Error(`ENOENT: no such file, open '${path}'`))
        : Promise.resolve(text);
    },
    writeNewFile: (path, text) => {
      if (path in files) {
        return Promise.reject(
          Object.assign(new Error(`EEXIST: file already exists '${path}'`), {
            code: 'EEXIST',
          }),
        );
      }
      files[path] = text;
      return Promise.resolve();
    },
    prompt: (question, { hidden }) => {
      questions.push({ question, hidden });
      const answer = answers.shift();
      return answer === undefined
        ? Promise.reject(new CliExit('Cancelled.', 1))
        : Promise.resolve(answer);
    },
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  };
  const calls = () => fake.requests.map((r) => `${r.method} ${r.path}`);
  return { io, requests: fake.requests, out, err, questions, calls, files };
}

const importArgs = ['import', 'month.json', '--server', server];

describe('allotr import', () => {
  it('signs in with a TOTP code, imports and signs out', async () => {
    const h = harness(withTwoFactor);
    expect(await run(importArgs, h.io)).toBe(0);
    expect(h.calls()).toEqual([
      'POST /v1/auth/sign-in/email',
      'POST /v1/auth/two-factor/verify-totp',
      'POST /v1/import',
      'POST /v1/auth/sign-out',
    ]);
    expect(h.requests[0]?.body).toEqual({
      email: 'alice@example.test',
      password: 'correct horse',
    });
    expect(h.requests[1]?.body).toEqual({ code: '123456' });
    expect(h.requests[2]?.body).toEqual(bundle);
    expect(h.requests[2]?.headers.get('cookie')).toContain('sid=s1');
    expect(h.requests[2]?.headers.get('origin')).toBe(server);
    expect(h.questions.map((q) => q.hidden)).toEqual([false, true, true]);
    expect(h.out).toEqual([
      'Imported 1 account, 12 transactions, 1 bill with 1 payment, 0 rates and 1 tag. Categories: 2 created, 1 matched.',
    ]);
    expect(h.err).toEqual([]);
  });

  it('takes the email from --email', async () => {
    const h = harness(withTwoFactor, { answers: ['correct horse', '123456'] });
    expect(
      await run([...importArgs, '--email', 'alice@example.test'], h.io),
    ).toBe(0);
    expect(h.questions.map((q) => q.question)).toEqual([
      'Password: ',
      'Authenticator code: ',
    ]);
  });

  it('skips the code when two-factor is off', async () => {
    const h = harness(
      {
        ...withTwoFactor,
        'POST /v1/auth/sign-in/email': () =>
          json(200, { token: 'x' }, ['sid=s1; Path=/']),
      },
      { answers: ['alice@example.test', 'correct horse'] },
    );
    expect(await run(importArgs, h.io)).toBe(0);
    expect(h.calls()).toEqual([
      'POST /v1/auth/sign-in/email',
      'POST /v1/import',
      'POST /v1/auth/sign-out',
    ]);
  });

  it('stops after a wrong password', async () => {
    const h = harness({
      ...withTwoFactor,
      'POST /v1/auth/sign-in/email': () =>
        problem(401, 'Unauthorized', {
          code: 'invalid_email_or_password',
          detail: 'Invalid email or password',
        }),
    });
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.calls()).toEqual(['POST /v1/auth/sign-in/email']);
    expect(h.err).toEqual(['Sign-in failed: Invalid email or password']);
  });

  it('stops after a wrong code', async () => {
    const h = harness({
      ...withTwoFactor,
      'POST /v1/auth/two-factor/verify-totp': () =>
        problem(401, 'Unauthorized', { detail: 'Invalid code' }),
    });
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.calls()).not.toContain('POST /v1/import');
    expect(h.calls()).not.toContain('POST /v1/auth/sign-out');
    expect(h.err).toEqual(['Sign-in failed: Invalid code']);
  });

  it('explains a ledger that is not empty and still signs out', async () => {
    const h = harness({
      ...withTwoFactor,
      'POST /v1/import': () =>
        problem(409, 'Conflict', {
          code: 'ledger_not_empty',
          detail: 'The ledger already has data.',
        }),
    });
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.calls().at(-1)).toBe('POST /v1/auth/sign-out');
    expect(h.err[0]).toContain('Import fills an empty ledger only');
  });

  it('explains required two-factor enrolment', async () => {
    const h = harness(
      {
        ...withTwoFactor,
        'POST /v1/auth/sign-in/email': () =>
          json(200, { token: 'x' }, ['sid=s1; Path=/']),
        'POST /v1/import': () =>
          problem(403, 'Forbidden', {
            code: 'two_factor_enrollment_required',
            detail: 'Set up two-factor authentication to continue.',
          }),
      },
      { answers: ['alice@example.test', 'correct horse'] },
    );
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.err[0]).toContain('Set it up in the web app');
    expect(h.calls().at(-1)).toBe('POST /v1/auth/sign-out');
  });

  it('lists the paths of refused items', async () => {
    const h = harness({
      ...withTwoFactor,
      'POST /v1/import': () =>
        problem(400, 'Bad Request', {
          code: 'invalid_reference',
          detail: 'The bundle refers to items it does not have.',
          errors: [
            {
              path: '/transactions/0/account',
              message: 'No account named "Walet"',
            },
          ],
        }),
    });
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.err).toEqual([
      'Import failed: The bundle refers to items it does not have.',
      '  /transactions/0/account: No account named "Walet"',
    ]);
  });

  it('reports a non-JSON error', async () => {
    const h = harness({
      ...withTwoFactor,
      'POST /v1/import': () =>
        new Response('<html>Bad Gateway</html>', { status: 502 }),
    });
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.err).toEqual([
      'Import failed: the server answered 502 without details.',
    ]);
  });

  it('keeps success when sign-out fails', async () => {
    const h = harness({
      ...withTwoFactor,
      'POST /v1/auth/sign-out': () =>
        Promise.reject(new TypeError('fetch failed')),
    });
    expect(await run(importArgs, h.io)).toBe(0);
  });

  it('refuses invalid JSON before asking anything', async () => {
    const h = harness(withTwoFactor, { files: { 'month.json': '{ nope' } });
    expect(await run(importArgs, h.io)).toBe(2);
    expect(h.questions).toEqual([]);
    expect(h.requests).toEqual([]);
    expect(h.err[0]).toMatch(/^month\.json is not valid JSON: /);
  });

  it('refuses an invalid bundle with pointers', async () => {
    const invalid = { ...bundle, accounts: [{ name: 'Wallet' }] };
    const h = harness(withTwoFactor, {
      files: { 'month.json': JSON.stringify(invalid) },
    });
    expect(await run(importArgs, h.io)).toBe(2);
    expect(h.requests).toEqual([]);
    expect(h.err[0]).toBe('month.json is not a valid Allotr bundle:');
    expect(h.err[1]).toMatch(/^ {2}\/accounts\/0\/currency: /);
  });

  it('shows at most 20 bundle problems', async () => {
    const accounts = Array.from({ length: 25 }, (_, i) => ({
      name: `Account ${String(i)}`,
    }));
    const h = harness(withTwoFactor, {
      files: { 'month.json': JSON.stringify({ ...bundle, accounts }) },
    });
    expect(await run(importArgs, h.io)).toBe(2);
    expect(h.err).toHaveLength(22);
    expect(h.err.at(-1)).toBe('  … and 5 more');
  });

  it('reports a missing file', async () => {
    const h = harness(withTwoFactor, { files: {} });
    expect(await run(importArgs, h.io)).toBe(2);
    expect(h.err[0]).toMatch(/^Cannot read month\.json: /);
  });

  it('reports an unreachable server', async () => {
    const h = harness({
      'POST /v1/auth/sign-in/email': () =>
        Promise.reject(new TypeError('fetch failed')),
    });
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.err).toEqual([
      'Could not reach https://allotr.example.test: fetch failed',
    ]);
  });

  it('stops when a prompt is cancelled', async () => {
    const h = harness(withTwoFactor, { answers: [] });
    expect(await run(importArgs, h.io)).toBe(1);
    expect(h.requests).toEqual([]);
    expect(h.err).toEqual(['Cancelled.']);
  });

  it('warns about plain HTTP to another host', async () => {
    const h = harness(withTwoFactor);
    await run(
      ['import', 'month.json', '--server', 'http://allotr.example.test'],
      h.io,
    );
    expect(h.err[0]).toContain('is not HTTPS');
  });

  it('does not warn about plain HTTP on this machine', async () => {
    const h = harness(withTwoFactor);
    await run(
      ['import', 'month.json', '--server', 'http://127.0.0.1:8080'],
      h.io,
    );
    expect(h.err).toEqual([]);
  });
});

describe('arguments', () => {
  it.each([
    [[]],
    [['import', 'month.json']],
    [['import', '--server', server]],
    [['import', 'a.json', 'b.json', '--server', server]],
    [['export', 'month.json', '--server', server]],
    [['--bogus']],
  ])('refuses %j', async (argv) => {
    const h = harness(withTwoFactor);
    expect(await run(argv, h.io)).toBe(2);
    expect(h.err.join('\n')).toContain('Usage:');
    expect(h.requests).toEqual([]);
  });

  it('refuses a server that is not an http or https URL', async () => {
    const h = harness(withTwoFactor);
    expect(
      await run(['import', 'month.json', '--server', 'ftp://x.test'], h.io),
    ).toBe(2);
    expect(h.err).toEqual([
      '--server must be an http or https URL, not "ftp://x.test".',
    ]);
  });

  it('prints help', async () => {
    const h = harness(withTwoFactor);
    expect(await run(['--help'], h.io)).toBe(0);
    expect(h.out.join('\n')).toContain('allotr import <file.json>');
  });
});

describe('allotr export', () => {
  const csv = 'date,entry_id\r\n2026-03-02,e1\r\n';
  const exporting: Record<string, Handler> = {
    ...withTwoFactor,
    'GET /v1/export': () =>
      new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition':
            'attachment; filename="allotr-export-2026-03-02.csv"',
        },
      }),
  };
  const exportArgs = ['export', '--server', server, '--format', 'csv'];

  it('signs in, saves under the suggested name and signs out', async () => {
    const h = harness(exporting, { files: {} });
    expect(await run(exportArgs, h.io)).toBe(0);
    expect(h.calls()).toEqual([
      'POST /v1/auth/sign-in/email',
      'POST /v1/auth/two-factor/verify-totp',
      'GET /v1/export',
      'POST /v1/auth/sign-out',
    ]);
    expect(h.requests[2]?.url).toBe(`${server}/v1/export?format=csv`);
    expect(h.files['allotr-export-2026-03-02.csv']).toBe(csv);
    expect(h.out).toEqual([
      'Saved the csv export to allotr-export-2026-03-02.csv.',
    ]);
  });

  it('writes to --out and asks for JSON by default', async () => {
    const h = harness(exporting, { files: {} });
    expect(
      await run(['export', '--server', server, '--out', 'backup.json'], h.io),
    ).toBe(0);
    expect(h.requests[2]?.url).toBe(`${server}/v1/export?format=json`);
    expect(h.files['backup.json']).toBe(csv);
  });

  it('never overwrites a file and still signs out', async () => {
    const h = harness(exporting, { files: { 'backup.csv': 'old' } });
    expect(await run([...exportArgs, '--out', 'backup.csv'], h.io)).toBe(1);
    expect(h.files['backup.csv']).toBe('old');
    expect(h.err).toEqual([
      'backup.csv already exists. Choose another name with --out.',
    ]);
    expect(h.calls().at(-1)).toBe('POST /v1/auth/sign-out');
  });

  it('reports a refused export', async () => {
    const h = harness(
      {
        ...exporting,
        'GET /v1/export': () =>
          problem(403, 'Forbidden', {
            code: 'two_factor_enrollment_required',
          }),
      },
      { files: {} },
    );
    expect(await run(exportArgs, h.io)).toBe(1);
    expect(h.err[0]).toMatch(
      /^Export failed: this instance requires two-factor/,
    );
  });

  it.each([
    [['export', '--server', server, '--format', 'xlsx']],
    [['export', 'extra.json', '--server', server]],
    [['import', 'month.json', '--server', server, '--format', 'csv']],
  ])('refuses %j before asking anything', async (args) => {
    const h = harness(exporting, { files: {} });
    expect(await run(args, h.io)).toBe(2);
    expect(h.questions).toEqual([]);
  });

  it('ignores a suggested name with a directory in it', () => {
    expect(suggestedName('attachment; filename="../x.csv"')).toBeNull();
    expect(suggestedName('attachment; filename=".hidden"')).toBeNull();
    expect(suggestedName(null)).toBeNull();
  });
});
