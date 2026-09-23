// Scenario 30: a resource name that GitHub turns into links when it reaches
// a page as it is, "#1 @sluiceway www.example.com *x*", stays plain text on
// the dashboard and on the stack's preview page. It reads what GitHub
// renders, not only the Markdown: the escaping writes `*` as a reference, but
// nothing in it stops an issue reference, a mention or an autolink
// (`src/render/escape.ts`, `docs/later.md`, "Stopping GitHub from linking").
import type { Observed } from "./bed.ts";
import { HOSTILE_STACK } from "./catalogue.ts";
import { Check, type Outcome } from "./check.ts";
import { runUrls } from "./scans.ts";

// What GitHub made of the name, from the rendered HTML around each place the
// web address shows. The name sits in a <b> on the row and on the page.
function linked(check: Check, html: string | undefined, where: string): void {
  if (!html) {
    check.fail(`no rendered HTML of ${where}`);
    return;
  }
  const places = [...html.matchAll(/example\.com/g)].map((match) => match.index ?? 0);
  // An autolink holds the address twice, in its href and in its text, so
  // count the names by their bold ends.
  const names = new Set(places.map((at) => html.lastIndexOf("<b>", at)));
  check.expect(names.size > 0, `expected the name in the rendered ${where}`);
  for (const start of names) {
    const end = html.indexOf("</b>", start);
    const name = html.slice(start, end < 0 ? undefined : end + 4);
    const shown = name.replace(/<[^>]+>/g, "");
    if (/class="issue-link/.test(name)) check.fail(`${where}: "#1" became a link to an issue: ${shown}`);
    if (/class="user-mention/.test(name)) check.fail(`${where}: "@sluiceway" became a mention: ${shown}`);
    if (/<a href="http:\/\/www\.example\.com"/.test(name)) check.fail(`${where}: "www.example.com" became a link: ${shown}`);
    if (/<em>/.test(name)) check.fail(`${where}: "*x*" became emphasis: ${shown}`);
    if (/<a\s/.test(name) && !/issue-link|user-mention|www\.example\.com"/.test(name)) check.fail(`${where}: a link in the name: ${name}`);
  }
}

// `pageHtml` is the preview page of the stack that holds the name, its
// summary and text rendered as GitHub renders a check run's output.
export function scenario30(o: Observed, pageHtml: string | undefined): Outcome[] {
  const check = new Check(30, ["Tofu"]);
  const row = o.dashboard?.rows.get(HOSTILE_STACK);
  check.expect(
    row?.block.includes("#1 @sluiceway www.example.com &#42;x&#42;") === true,
    `expected the name on the row of ${HOSTILE_STACK}, with its * written as &#42;`,
  );
  linked(check, o.html, "dashboard");
  linked(check, pageHtml, `preview page of ${HOSTILE_STACK}`);
  return check.outcomes(runUrls(o));
}
