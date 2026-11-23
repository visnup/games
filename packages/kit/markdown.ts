export type Row = Record<string, string>;

/** A reader of `markdown`'s tables: the one whose first header cell is `first`, after the heading `after` if given, as rows keyed by header. */
export const tables =
  (markdown: string) =>
  (first: string, after = ""): Row[] => {
    const lines = markdown.split("\n");
    const from = after ? lines.indexOf(after) : 0;
    const start = lines.findIndex((l, i) => i > from && l.startsWith(first ? `| ${first} |` : "| |"));
    if (start < 0) throw new Error(`no table starting with "${first}"`);
    const cells = (l: string) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
    const head = cells(lines[start]);
    const rows: Row[] = [];
    for (let i = start + 2; lines[i]?.startsWith("|"); i++) rows.push(Object.fromEntries(cells(lines[i]).map((c, j) => [head[j], c])));
    return rows;
  };

/** A cell's leading number: "56.8%", "+2.1", "−0.3" or "49% (12%)". */
export const num = (cell: string) => Number(cell.replace("−", "-").match(/^[-+]?[\d.]+/)?.[0]);
