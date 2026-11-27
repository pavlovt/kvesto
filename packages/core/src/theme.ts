/**
 * Themes for the bundled renderer. A theme is a preset name, or CSS custom
 * properties without their `--kv-` prefix: `{ "color-primary": "#e11d48",
 * radius: "0" }`. Both can be combined: `{ preset: "dark", "color-primary": "#f472b6" }`.
 */

/** The built-in presets: light (the default look), dark, auto (light or dark following the device), compact and contrast. */
export const THEME_PRESETS = ["light", "dark", "auto", "compact", "contrast"] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** A preset, or variables (optionally with a `preset` to start from). */
export type Theme = ThemePreset | ({ preset?: ThemePreset } & Record<string, string>);

/** The theme variables and their light defaults, for theme editors. */
export const THEME_VARIABLES: readonly { name: string; default: string; kind: "color" | "size" | "font" }[] = [
  { name: "color-primary", default: "#2563eb", kind: "color" },
  { name: "color-on-primary", default: "#ffffff", kind: "color" },
  { name: "color-text", default: "inherit", kind: "color" },
  { name: "color-bg", default: "transparent", kind: "color" },
  { name: "color-muted", default: "#4b5563", kind: "color" },
  { name: "color-error", default: "#b91c1c", kind: "color" },
  { name: "color-border", default: "#e5e7eb", kind: "color" },
  { name: "color-border-strong", default: "#d1d5db", kind: "color" },
  { name: "color-surface", default: "#ffffff", kind: "color" },
  { name: "color-tint", default: "rgba(37, 99, 235, 0.1)", kind: "color" },
  { name: "radius", default: "0.375rem", kind: "size" },
  { name: "radius-large", default: "0.5rem", kind: "size" },
  { name: "control-radius", default: "0", kind: "size" },
  { name: "gap", default: "1rem", kind: "size" },
  { name: "control-padding", default: "0.45rem 0.6rem", kind: "size" },
  { name: "font", default: "inherit", kind: "font" },
];

const NAME = /^[a-z0-9-]+$/;
/** No characters that could end a declaration or a rule. */
const SAFE_VALUE = /^[^;{}<>\\]{0,200}$/;

/** The theme's variables as `[ "--kv-name", value ]`, safe values only. */
export function themeVariables(theme: Theme | undefined): [string, string][] {
  if (!theme || typeof theme === "string") return [];
  return Object.entries(theme)
    .filter(([k, v]) => k !== "preset" && NAME.test(k.replace(/^--kv-/, "")) && typeof v === "string" && SAFE_VALUE.test(v))
    .map(([k, v]) => [`--kv-${k.replace(/^--kv-/, "")}`, v]);
}

/** The preset a theme uses, if any. */
export function themePreset(theme: Theme | undefined): ThemePreset | undefined {
  const p = typeof theme === "string" ? theme : theme?.preset;
  return p && (THEME_PRESETS as readonly string[]).includes(p) ? p : undefined;
}

/** Apply a theme to a rendered survey's root element. */
export function applyTheme(root: HTMLElement, theme: Theme | undefined): void {
  const preset = themePreset(theme);
  if (preset && preset !== "light") root.setAttribute("data-kv-theme", preset);
  else root.removeAttribute("data-kv-theme");
  for (const [name, value] of themeVariables(theme)) root.style.setProperty(name, value);
}

/** A theme as a CSS rule, to copy into a stylesheet. Presets are applied with `data-kv-theme` and noted. */
export function themeToCss(theme: Theme, selector = ".kv-survey"): string {
  const preset = themePreset(theme);
  const lines = themeVariables(theme).map(([k, v]) => `  ${k}: ${v};`);
  const note = preset && preset !== "light" ? `/* Preset: add data-kv-theme="${preset}" to the survey element, or pass theme: "${preset}". */\n` : "";
  return `${note}${selector} {\n${lines.join("\n")}\n}\n`;
}
