import { expect, it } from 'vitest';
import { parseIso4217Xml } from './iso4217.ts';

const entry = (code: string, numeric: string, minorUnit: string) =>
  `<CcyNtry><CtryNm>TESTLAND</CtryNm><CcyNm>Test</CcyNm><Ccy>${code}</Ccy>` +
  `<CcyNbr>${numeric}</CcyNbr><CcyMnrUnts>${minorUnit}</CcyMnrUnts></CcyNtry>`;
const xml = (...entries: string[]) =>
  `<?xml version="1.0"?><ISO_4217 Pblshd="2026-01-01"><CcyTbl>${entries.join('')}</CcyTbl></ISO_4217>`;

it('reads code, numeric and minor unit sorted by code', () => {
  expect(
    parseIso4217Xml(xml(entry('USD', '840', '2'), entry('JPY', '392', '0'))),
  ).toEqual({
    published: '2026-01-01',
    currencies: [
      { code: 'JPY', numeric: '392', minorUnit: 0 },
      { code: 'USD', numeric: '840', minorUnit: 2 },
    ],
  });
});

it('drops codes without a minor unit and entries without a currency', () => {
  const none =
    '<CcyNtry><CtryNm>NOWHERE</CtryNm><CcyNm>No universal currency</CcyNm></CcyNtry>';
  const table = parseIso4217Xml(
    xml(entry('XAU', '959', 'N.A.'), none, entry('KWD', '414', '3')),
  );
  expect(table.currencies).toEqual([
    { code: 'KWD', numeric: '414', minorUnit: 3 },
  ]);
});

it('reads fund entries, whose name element has attributes', () => {
  const fund =
    '<CcyNtry><CtryNm>TESTLAND</CtryNm><CcyNm IsFund="true">Test fund</CcyNm>' +
    '<Ccy>CLF</Ccy><CcyNbr>990</CcyNbr><CcyMnrUnts>4</CcyMnrUnts></CcyNtry>';
  expect(parseIso4217Xml(xml(fund)).currencies).toEqual([
    { code: 'CLF', numeric: '990', minorUnit: 4 },
  ]);
});

it('merges duplicate entries for the same currency', () => {
  const table = parseIso4217Xml(
    xml(entry('EUR', '978', '2'), entry('EUR', '978', '2')),
  );
  expect(table.currencies).toHaveLength(1);
});

it('rejects conflicting duplicates', () => {
  expect(() =>
    parseIso4217Xml(xml(entry('EUR', '978', '2'), entry('EUR', '978', '3'))),
  ).toThrow(/Conflicting/);
});

it('rejects malformed entries, missing dates and empty lists', () => {
  expect(() => parseIso4217Xml(xml(entry('usd', '840', '2')))).toThrow(
    /Malformed/,
  );
  expect(() =>
    parseIso4217Xml('<ISO_4217><CcyTbl></CcyTbl></ISO_4217>'),
  ).toThrow(/publication date/);
  expect(() => parseIso4217Xml(xml())).toThrow(/no currencies/);
});
