/**
 * The small Markdown subset of content blocks: paragraphs (separated by a
 * blank line), `-` / `*` and `1.` lists, `**bold**`, `*italic*` or `_italic_`,
 * and `[links](https://…)`. `\` escapes a marker. Parsed into a tree the
 * renderer turns into DOM nodes, so markup in the text is always shown as text.
 */

export type MarkdownInline =
  | { type: "text"; text: string }
  | { type: "strong" | "em"; children: MarkdownInline[] }
  | { type: "link"; href: string; children: MarkdownInline[] };

export type MarkdownBlock =
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "list"; ordered: boolean; items: MarkdownInline[][] };

/** Links may go to http(s), mailto, or a relative address; anything else (such as `javascript:`) is shown as text. */
export function isSafeHref(href: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href.trim());
  return !scheme || ["http", "https", "mailto"].includes(scheme[1]!.toLowerCase());
}

const INLINE = /\\([\\*_[\]()])|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)\)/s;

export function parseInline(text: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last?.type === "text") last.text += t;
    else out.push({ type: "text", text: t });
  };
  let rest = text;
  for (;;) {
    const m = INLINE.exec(rest);
    if (!m) break;
    pushText(rest.slice(0, m.index));
    if (m[1] !== undefined) pushText(m[1]);
    else if (m[2] !== undefined) out.push({ type: "strong", children: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ type: "em", children: parseInline(m[3]) });
    else if (m[4] !== undefined) out.push({ type: "em", children: parseInline(m[4]) });
    else if (isSafeHref(m[6]!)) out.push({ type: "link", href: m[6]!, children: parseInline(m[5]!) });
    else pushText(m[0]);
    rest = rest.slice(m.index + m[0].length);
  }
  pushText(rest);
  return out;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const chunk of source.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;
    const flush = () => {
      if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
      if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
      paragraph = [];
      list = null;
    };
    for (const line of lines) {
      const bullet = BULLET.exec(line);
      const numbered = bullet ? null : NUMBERED.exec(line);
      const item = bullet ?? numbered;
      if (item) {
        const ordered = Boolean(numbered);
        if (paragraph.length || (list && list.ordered !== ordered)) flush();
        list ??= { ordered, items: [] };
        list.items.push(item[1]!);
      } else if (list && /^\s+/.test(line)) {
        // An indented line continues the list item above.
        list.items[list.items.length - 1] += ` ${line.trim()}`;
      } else {
        if (list) flush();
        paragraph.push(line.trim());
      }
    }
    flush();
  }
  return blocks;
}
