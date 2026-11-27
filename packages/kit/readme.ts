import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Marked, type Tokens } from "marked";
import { tables } from "./markdown.ts";

/** A heading's id, as GitHub makes it. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .replace(/ /g, "-");

// only getStaticProps reads it, at build, so the server bundle needn't trace it
const read = (dir: string) => readFileSync(join(/*turbopackIgnore: true*/ dir, "README.md"), "utf8");

/** The app's `README.md` as HTML for its `/learn` page, from `getStaticProps`. */
export function readme(dir = process.cwd()) {
  const md = read(dir);
  const repo = `https://github.com/visnup/games/blob/main/apps/${basename(dir)}/`;
  const seen = new Map<string, number>();
  const marked = new Marked({
    walkTokens(t) {
      if (t.type === "image" && !/^\w+:/.test(t.href))
        t.href = "/" + t.href; // the build copies charts/ into public/
      else if (t.type === "link") t.href = t.href.replace(/^https:\/\/\w+\.visnup\.com(?=\/learn\b)/, "").replace(/^(?![\w]+:|#|\/)/, repo);
    },
    renderer: {
      heading({ tokens, depth, text }) {
        const s = slug(text);
        const n = seen.get(s) ?? 0;
        seen.set(s, n + 1);
        return `<h${depth} id="${n ? `${s}-${n}` : s}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      // a paragraph that starts "**Try it:**" links to a trainer
      paragraph({ tokens }) {
        const html = this.parser.parseInline(tokens);
        return `<p${tokens[0]?.type === "strong" && tokens[0].text.startsWith("Try it") ? ' class="try"' : ""}>${html}</p>\n`;
      },
    },
  });
  const title = md.match(/^# (.+)$/m)?.[1] ?? basename(dir);
  const description =
    md
      .split(/\n\n/)
      .find((p) => /^[A-Z]/.test(p))
      ?.replace(/\s+/g, " ") ?? "";
  return { title, description, html: marked.parse(md, { async: false }) };
}

/** Pieces of the app's `README.md` for the trainers beside the guide, so the README stays their source. */
export function guide(dir = process.cwd()) {
  const md = read(dir);
  const marked = new Marked();
  const tokens = marked.lexer(md);
  // the tokens under `heading`, up to the next heading
  const after = (heading: string) => {
    const rest = tokens.slice(tokens.findIndex((t) => t.type === "heading" && t.text === heading) + 1);
    const end = rest.findIndex((t) => t.type === "heading");
    return end < 0 ? rest : rest.slice(0, end);
  };
  const inline = (text: string) => marked.parseInline(text.replace(/\s+/g, " ").trim(), { async: false });
  return {
    table: tables(md),
    /** The first paragraph under `heading`, as HTML. */
    intro: (heading: string) => inline((after(heading).find((t) => t.type === "paragraph") as Tokens.Paragraph).text),
    /** The `k`th list under `heading`: each item's bold lead and the rest, as HTML. */
    list: (heading: string, k = 0) =>
      (after(heading).filter((t) => t.type === "list")[k] as Tokens.List).items.map((item) => {
        const [, title, rest] = item.text.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/) ?? [, item.text, ""];
        return { title: inline(title), text: inline(rest) };
      }),
    /** Every heading's text and id. */
    headings: tokens.flatMap((t) => (t.type === "heading" ? [{ text: t.text as string, id: slug(t.text) }] : [])),
  };
}
