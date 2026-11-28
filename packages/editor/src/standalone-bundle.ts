// Entry of the prebuilt `standalone` bundle: standalone.ts (whose re-exports are also its types) plus the
// editor's Tailwind CSS. The bundle ships no CSS file, so the styles are added to the page once, the way the
// components' own CSS is injected.
import css from "./lib/editor.css?inline";

if (typeof document !== "undefined" && !document.getElementById("kv-editor-styles")) {
  const style = document.createElement("style");
  style.id = "kv-editor-styles";
  style.textContent = css;
  document.head.append(style);
}

export * from "./standalone.js";
