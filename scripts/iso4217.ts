// Parses the ISO 4217 "list one" XML from the maintenance agency into the
// table vendored in packages/shared (ADR 0010). Codes without a minor unit
// (precious metals, SDR, test codes) are dropped: money needs one.
export interface Iso4217Currency {
  code: string;
  numeric: string;
  minorUnit: number;
}

export interface Iso4217Table {
  published: string;
  currencies: Iso4217Currency[];
}

export const ISO4217_URL =
  'https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml';

function field(entry: string, name: string): string | undefined {
  return new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`)
    .exec(entry)?.[1]
    ?.trim();
}

export function parseIso4217Xml(xml: string): Iso4217Table {
  const published = /<ISO_4217\s+Pblshd="([^"]+)"/.exec(xml)?.[1];
  if (published === undefined) {
    throw new Error('ISO 4217 list has no publication date');
  }
  const byCode = new Map<string, Iso4217Currency>();
  for (const [, entry = ''] of xml.matchAll(
    /<CcyNtry>([\s\S]*?)<\/CcyNtry>/g,
  )) {
    const code = field(entry, 'Ccy');
    const numeric = field(entry, 'CcyNbr');
    const minor = field(entry, 'CcyMnrUnts');
    if (
      code === undefined ||
      numeric === undefined ||
      minor === undefined ||
      minor === 'N.A.'
    ) {
      continue;
    }
    if (
      !/^[A-Z]{3}$/.test(code) ||
      !/^\d{3}$/.test(numeric) ||
      !/^\d$/.test(minor)
    ) {
      throw new Error(`Malformed ISO 4217 entry: ${code}`);
    }
    const currency = { code, numeric, minorUnit: Number(minor) };
    const seen = byCode.get(code);
    if (
      seen !== undefined &&
      (seen.numeric !== numeric || seen.minorUnit !== currency.minorUnit)
    ) {
      throw new Error(`Conflicting ISO 4217 entries for ${code}`);
    }
    byCode.set(code, currency);
  }
  if (byCode.size === 0) {
    throw new Error('ISO 4217 list has no currencies');
  }
  const currencies = [...byCode.values()].sort((a, b) =>
    a.code < b.code ? -1 : 1,
  );
  return { published, currencies };
}
