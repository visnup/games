import { num } from "kit/markdown.ts";
import { guide, readme } from "kit/readme.ts";
import { CHEAT_SHEET } from "./advice.ts";

/** A rule of `CHEAT_SHEET`, from the README: its bold lead and the rest as HTML, the section it's in, and what each row that breaks it costs at 2 and 5 players. */
export type Rule = { rule: string; title: string; text: string; id: string; breaks: { name: string; cost: number[] }[] };

const AT = ["2 players (fair 50.0%)", "5 players (fair 20.0%)"];

/** The README's advice in `CHEAT_SHEET`, for `getStaticProps`. */
export function rules(): Rule[] {
  const g = guide();
  const { html } = readme();
  const section = html.slice(html.indexOf('<h2 id="playing-well">'), html.indexOf("<h3", html.indexOf('<h2 id="playing-well">')));
  const leads = [
    ...[...section.matchAll(/<p><strong>([\s\S]+?)<\/strong>\s*([\s\S]*?)<\/p>/g)].map(([, title, text]) => ({ title: title.replace(/\s+/g, " "), text: text.replace(/\s+/g, " "), id: "playing-well" })),
    ...g.list("Paying, saying no and discarding").map((item) => ({ ...item, id: "paying-saying-no-and-discarding" })),
  ];
  const fair = g.table("strategy").find((r) => r.strategy === "default")!;
  const variants = g.table("variant");
  return Object.entries(CHEAT_SHEET).map(([rule, { lead, breaks }]) => {
    const found = leads.find((l) => l.title.replace(/&#39;/g, "'").startsWith(lead));
    if (!found) throw new Error(`no "${lead}" in README.md`);
    return {
      rule,
      ...found,
      breaks: breaks.map((name) => {
        const row = variants.find((r) => r.variant === name);
        if (!row) throw new Error(`no variant "${name}" in README.md`);
        return { name: name.replace(" (previous)", ""), cost: AT.map((at) => Math.round(10 * (num(fair[at]) - num(row[at]))) / 10) };
      }),
    };
  });
}
