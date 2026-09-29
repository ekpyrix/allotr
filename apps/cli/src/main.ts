#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { stderr, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { CliExit, type CliIo } from './io.ts';
import { run } from './run.ts';
import { applyKeys } from './secret-keys.ts';

// The real terminal, files and network behind `run`. Secrets are read in
// raw mode so they are never echoed, and never from a pipe (issue #41:
// prompts only; scripting waits for API tokens).

async function prompt(
  question: string,
  options: { readonly hidden: boolean },
): Promise<string> {
  if (!stdin.isTTY) {
    throw new CliExit(
      'allotr asks for a password, so run it in an interactive terminal.',
      2,
    );
  }
  return options.hidden ? readHidden(question) : readLine(question);
}

async function readLine(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const abort = new AbortController();
  rl.on('SIGINT', () => {
    abort.abort();
  });
  try {
    return (await rl.question(question, { signal: abort.signal })).trim();
  } catch {
    stdout.write('\n');
    throw new CliExit('Cancelled.', 1);
  } finally {
    rl.close();
  }
}

function readHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    function onData(chunk: string): void {
      const typed = applyKeys(value, chunk);
      value = typed.value;
      if (typed.outcome === 'enter') {
        finish();
        resolve(value);
      } else if (typed.outcome === 'cancel') {
        finish();
        reject(new CliExit('Cancelled.', 1));
      }
    }
    stdin.on('data', onData);
  });
}

const io: CliIo = {
  fetch,
  readFile: (path) => readFile(path, 'utf8'),
  writeNewFile: (path, text) => writeFile(path, text, { flag: 'wx' }),
  prompt,
  stdout: (line) => {
    stdout.write(`${line}\n`);
  },
  stderr: (line) => {
    stderr.write(`${line}\n`);
  },
};

process.exitCode = await run(process.argv.slice(2), io);
