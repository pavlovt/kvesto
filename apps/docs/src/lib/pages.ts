import { Marked } from "marked";
import gettingStarted from "../../../../docs/guide/getting-started.md?raw";
import surveyJson from "../../../../docs/guide/survey-json.md?raw";
import results from "../../../../docs/guide/results.md?raw";
import server from "../../../../docs/guide/server.md?raw";
import editor from "../../../../packages/editor/README.md?raw";
import dashboard from "../../../../packages/dashboard/README.md?raw";
import serverReference from "../../../../packages/server/README.md?raw";
import accessibility from "../../../../ACCESSIBILITY.md?raw";

export const repo = "https://github.com/pavlovt/kvesto";

export interface Page {
  /** URL segment; "" is the home page. */
  slug: string;
  title: string;
  /** Source file, relative to the repo root: links in it are resolved against it. */
  file: string;
  source: string;
}

/** The pages in sidebar order. Every file here is also the source an "Edit on GitHub" link points to. */
export const pages: Page[] = [
  { slug: "", title: "Getting started", file: "docs/guide/getting-started.md", source: gettingStarted },
  { slug: "survey-json", title: "Survey JSON", file: "docs/guide/survey-json.md", source: surveyJson },
  { slug: "editor", title: "Editor", file: "packages/editor/README.md", source: editor },
  { slug: "dashboard", title: "Dashboard", file: "packages/dashboard/README.md", source: dashboard },
  { slug: "results", title: "Results", file: "docs/guide/results.md", source: results },
  { slug: "server", title: "Server", file: "docs/guide/server.md", source: server },
  { slug: "server-reference", title: "Server reference", file: "packages/server/README.md", source: serverReference },
  { slug: "accessibility", title: "Accessibility", file: "ACCESSIBILITY.md", source: accessibility },
];

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
}

/** GitHub's heading anchors, so links such as README.md#safe-defaults keep working. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/**
 * Renders a page's markdown. Links to another page's source file go to that page on this site, other repo links
 * go to GitHub. `base` is the site's base path.
 */
export function render(page: Page, base: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();
  const sitePath = new Map(pages.map((p) => [p.file, `${base}/${p.slug ? `${p.slug}/` : ""}`]));

  const marked = new Marked({
    renderer: {
      heading({ tokens, depth, text }) {
        let id = slugify(text);
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) toc.push({ id, text: text.replaceAll("`", ""), depth });
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, tokens }) {
        return `<a href="${resolveLink(href, page.file, sitePath)}">${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, text }) {
        const src = /^https?:/.test(href) ? href : `${repo}/raw/main/${new URL(href, `file:///${page.file}`).pathname.slice(1)}`;
        return `<img src="${src}" alt="${text}">`;
      },
    },
  });
  return { html: marked.parse(page.source, { async: false }), toc };
}

function resolveLink(href: string, file: string, sitePath: Map<string, string>): string {
  if (/^([a-z]+:|#)/i.test(href)) return href;
  const url = new URL(href, `file:///${file}`);
  const path = decodeURIComponent(url.pathname.slice(1));
  return sitePath.get(path) ? `${sitePath.get(path)}${url.hash}` : `${repo}/blob/main/${path}${url.hash}`;
}
