// Scenario 19: every result file of the verification holds to the schema the
// tag publishes (schema/result-file.schema.json), and every step's outputs
// agree with its result file.
import type { Observed } from "./bed.ts";
import { ADAPTERS } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { ACTION_REPO, type GitHub } from "./github.ts";

// The part of JSON Schema that the result file's schema uses: type, const,
// enum, minimum, maximum, required, properties, additionalProperties, items,
// anyOf and oneOf. A keyword outside that list is a problem of its own, so a
// newer schema never passes by being read only in part.
type Schema = { [key: string]: unknown };
const KNOWN = new Set([
  "$schema", "$id", "title", "description", "type", "const", "enum", "minimum", "maximum",
  "required", "properties", "additionalProperties", "items", "anyOf", "oneOf",
]);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

export function validate(schema: Schema, value: unknown, at = "$"): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) problems.push(`${at}: the schema uses "${key}", which the driver does not check`);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    const found = typeOf(value);
    if (!types.includes(found) && !(found === "integer" && types.includes("number"))) {
      return [...problems, `${at}: expected ${types.join(" or ")}, found ${found}`];
    }
  }
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) {
    problems.push(`${at}: expected ${JSON.stringify(schema.const)}, found ${JSON.stringify(value)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    problems.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) problems.push(`${at}: ${value} < ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) problems.push(`${at}: ${value} > ${schema.maximum}`);
  }
  if (typeOf(value) === "object") {
    const object = value as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in object)) problems.push(`${at}: "${key}" is missing`);
    }
    const properties = (schema.properties as Record<string, Schema> | undefined) ?? {};
    for (const [key, item] of Object.entries(object)) {
      const sub = properties[key];
      if (sub) problems.push(...validate(sub, item, `${at}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${at}: "${key}" is not in the schema`);
      else if (typeof schema.additionalProperties === "object") {
        problems.push(...validate(schema.additionalProperties as Schema, item, `${at}.${key}`));
      }
    }
  }
  if (Array.isArray(value) && typeof schema.items === "object") {
    value.forEach((item, i) => problems.push(...validate(schema.items as Schema, item, `${at}[${i}]`)));
  }
  for (const [keyword, need] of [["anyOf", "any"], ["oneOf", "one"]] as const) {
    const options = schema[keyword] as Schema[] | undefined;
    if (!options) continue;
    const results = options.map((option) => validate(option, value, at));
    const passing = results.filter((r) => r.length === 0).length;
    if (need === "any" ? passing === 0 : passing !== 1) {
      const best = results.reduce((a, b) => (a.length <= b.length ? a : b));
      problems.push(`${at}: matches ${passing} of the ${keyword} options (${best.slice(0, 3).join("; ")})`);
    }
  }
  return problems;
}

export async function fetchSchema(github: GitHub, version: string): Promise<Schema> {
  const file = await github.get<{ content: string }>(
    `/repos/${ACTION_REPO}/contents/schema/result-file.schema.json?ref=${version}`,
  );
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) as Schema;
}

// The outputs that must say what the result file says, per mode.
function agree(check: Check, mode: string, outputs: Record<string, string>, result: Record<string, unknown>, where: string, stack?: string) {
  if (mode === "scan") {
    const dashboard = result.dashboard as Record<string, unknown> | null;
    if (dashboard === null) return;
    check.equal(outputs.pending, String(dashboard.pending), `${where}: the output pending and dashboard.pending`);
    check.equal(outputs["preview-failed"], String(dashboard.previewFailed), `${where}: preview-failed and dashboard.previewFailed`);
    check.equal(outputs["in-sync"], String(dashboard.inSync), `${where}: in-sync and dashboard.inSync`);
    check.equal(outputs["dashboard-changed"], String(dashboard.changed), `${where}: dashboard-changed and dashboard.changed`);
    check.equal(outputs["dashboard-url"], String(dashboard.url), `${where}: dashboard-url and dashboard.url`);
  } else if (mode === "apply") {
    check.equal(outputs.outcome, result.outcome, `${where}: the output outcome and outcome`, stack);
    check.equal(outputs.stack, result.stack, `${where}: the output stack and stack`, stack);
  }
}

export function scenario19(schema: Schema, observed: Observed[]): Outcome[] {
  const check = new Check(19, ADAPTERS);
  const runs = new Set<string>();
  let files = 0;
  for (const o of observed) {
    for (const kept of o.kept) {
      if (!kept.result) continue;
      files++;
      runs.add(kept.run.html_url);
      const mode = String(kept.result.mode);
      const stack = mode === "apply" && typeof kept.result.stack === "string" ? kept.result.stack : undefined;
      const where = `${kept.artifact} (${o.what})`;
      for (const problem of validate(schema, kept.result)) check.fail(`${where}: ${problem}`, stack);
      agree(check, mode, kept.outputs, kept.result, where, stack);
      check.equal(kept.result.run, `${kept.run.html_url.replace(/\/attempts\/\d+$/, "")}`, `${where}: run in the result file`, stack);
    }
  }
  check.expect(files > 0, "no result file to check");
  return check.outcomes([...runs]);
}
