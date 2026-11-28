import { error } from "@sveltejs/kit";
import { base } from "$app/paths";
import { pages, render } from "$lib/pages";
import type { EntryGenerator, PageLoad } from "./$types";

export const entries: EntryGenerator = () => pages.filter((p) => p.slug).map((p) => ({ slug: p.slug }));

export const load: PageLoad = ({ params }) => {
  const page = pages.find((p) => p.slug === (params.slug ?? ""));
  if (!page) error(404, "Page not found");
  return { slug: page.slug, title: page.title, file: page.file, ...render(page, base) };
};
