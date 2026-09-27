import type { Placeholders } from '../lib/template.ts';
import { fillTemplate } from '../lib/template.ts';
import { en } from './en.ts';

type Catalog = typeof en;
interface Plural {
  readonly one: string;
  readonly other: string;
}

type Keys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural
    ? `${Prefix}${K}`
    : Keys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every message key; `errors.codes.*` is read through errorCodeMessage. */
export type MessageKey = Keys<Catalog>;

type At<T, K extends string> = K extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? At<T[Head], Rest>
    : never
  : K extends keyof T
    ? T[K]
    : never;

type VarNames<M> = M extends Plural
  ? Placeholders<M['one']> | Placeholders<M['other']> | 'count'
  : M extends string
    ? Placeholders<M>
    : never;

type VarsArg<K extends MessageKey> = [VarNames<At<Catalog, K>>] extends [never]
  ? []
  : [vars: Readonly<Record<VarNames<At<Catalog, K>>, string | number>>];

const plurals = new Intl.PluralRules('en');

function isPlural(value: unknown): value is Plural {
  return typeof value === 'object' && value !== null && 'other' in value;
}

function lookup(key: string): unknown {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part))
      return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** The UI text for a key, with its placeholders filled. */
export function t<K extends MessageKey>(key: K, ...args: VarsArg<K>): string {
  const vars: Readonly<Record<string, string | number>> = args[0] ?? {};
  const message = lookup(key);
  if (typeof message === 'string') return fillTemplate(message, vars);
  if (isPlural(message)) {
    const form = plurals.select(Number(vars.count)) === 'one' ? 'one' : 'other';
    return fillTemplate(message[form], vars);
  }
  throw new Error(`Unknown message key ${key}`);
}

/** Catalog text for a problem `code`, when there is one. */
export function errorCodeMessage(code: string): string | undefined {
  const message = lookup(`errors.codes.${code}`);
  return typeof message === 'string' ? message : undefined;
}
