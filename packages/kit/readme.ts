import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Marked } from "marked";

/** The app's `README.md` as HTML for its `/learn` page, from `getStaticProps`. */
export function readme(dir = process.cwd()) {
  // only getStaticProps reads it, at build, so the server bundle needn't trace it
  const md = readFileSync(join(/*turbopackIgnore: true*/ dir, "README.md"), "utf8");
  const repo = `https://github.com/visnup/games/blob/main/apps/${basename(dir)}/`;
  const seen = new Map<string, number>();
  const marked = new Marked({
    walkTokens(t) {
      if (t.type === "image" && !/^\w+:/.test(t.href)) t.href = "/" + t.href; // the build copies charts/ into public/
      else if (t.type === "link" && !/^(\w+:|#)/.test(t.href)) t.href = repo + t.href;
    },
    renderer: {
      heading({ tokens, depth, text }) {
        const slug = text
          .toLowerCase()
          .replace(/[^\w\- ]/g, "")
          .replace(/ /g, "-");
        const n = seen.get(slug) ?? 0;
        seen.set(slug, n + 1);
        return `<h${depth} id="${n ? `${slug}-${n}` : slug}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
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
