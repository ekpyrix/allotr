/** The `{name}` placeholders in a template string, as a union. */
export type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;

/** Replaces each `{name}` with its value; a missing value is a bug. */
export function fillTemplate(
  template: string,
  vars: Readonly<Record<string, string | number>>,
  encode: (value: string) => string = (value) => value,
): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`Missing value for {${name}}`);
    return encode(String(value));
  });
}
