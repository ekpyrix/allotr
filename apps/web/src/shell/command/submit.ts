// What happens when a line is submitted from the command line.
//
// The grammar parser lives behind the API (docs/architecture.md: the web app
// sends the typed line to the parser endpoint and gets a draft back, which
// the user confirms; rule 6, AI output never commits by itself). That
// endpoint does not exist yet, so a line gets an honest answer instead of a
// guess made in the browser. When it lands, `submitLine` calls it and returns
// a draft outcome; the command line already shows each outcome.

export type SubmitOutcome =
  | { readonly status: 'empty' }
  | { readonly status: 'unavailable'; readonly line: string };

export function submitLine(raw: string): SubmitOutcome {
  const line = raw.trim();
  if (line === '') return { status: 'empty' };
  return { status: 'unavailable', line };
}
