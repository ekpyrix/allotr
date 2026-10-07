import { fillTemplate, type Placeholders } from '@allotr/shared';
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

/** Every message key. */
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

// A catalogue per language, keyed by the primary language subtag of the
// user's locale ("en-GB" reads "en"). A language without one reads English.
const catalogs: Readonly<Record<string, unknown>> = { en };

function isPlural(value: unknown): value is Plural {
  return typeof value === 'object' && value !== null && 'other' in value;
}

function lookup(catalog: unknown, key: string): unknown {
  let node = catalog;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part))
      return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function language(locale: string): string {
  return locale.split('-')[0]?.toLowerCase() ?? 'en';
}

/** The text for a key in the user's locale, with its placeholders filled. */
export function t<K extends MessageKey>(
  locale: string,
  key: K,
  ...args: VarsArg<K>
): string {
  const vars: Readonly<Record<string, string | number>> = args[0] ?? {};
  const lang = language(locale);
  const message =
    lookup(Object.hasOwn(catalogs, lang) ? catalogs[lang] : en, key) ??
    lookup(en, key);
  if (typeof message === 'string') return fillTemplate(message, vars);
  if (isPlural(message)) {
    const form =
      new Intl.PluralRules(locale).select(Number(vars.count)) === 'one'
        ? 'one'
        : 'other';
    return fillTemplate(message[form], vars);
  }
  throw new Error(`Unknown message key ${key}`);
}
