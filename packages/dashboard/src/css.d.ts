// Vite's `?inline` import (used by the standalone entry) gives the compiled CSS as a string.
declare module "*.css?inline" {
  const css: string;
  export default css;
}
