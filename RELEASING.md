# Releasing Kvesto to npm

Published packages (all in `packages/`, always released together with the same version):

| npm package | Folder |
| --- | --- |
| `kvesto` | `packages/kvesto`: one install, re-exports `@kvesto/core`, plus the `<script>` bundle `dist/kvesto.min.js` |
| `@kvesto/core` | `packages/core` |
| `@kvesto/schema` | `packages/schema` |
| `@kvesto/server` | `packages/server` (also the `kvesto-server` CLI) |
| `@kvesto/editor` | `packages/editor`: Svelte component plus a `standalone` bundle |
| `@kvesto/dashboard` | `packages/dashboard`: Svelte components plus a `standalone` bundle |

The SvelteKit apps in `apps/` are demos around the editor and dashboard packages; they are private and not published.

## First release (once, from your machine)

npm trusted publishing can only be configured for packages that already exist, so the very first version is
published by hand.

1. On npmjs.com, create the free organization **kvesto** (Add Organization), so the `@kvesto` scope is yours.
2. Publish:

   ```sh
   npm login
   pnpm install
   pnpm release:check                       # build, then list what each tarball would contain
   pnpm -r --filter "./packages/*" publish --access public
   ```

   pnpm publishes in dependency order and replaces `workspace:^` with real versions. Each package's `prepack`
   script builds it first, so a tarball can never go out without `dist`. npm will ask you to authenticate in
   the browser.

   npm uses staged publishing: each version first appears as a `0.0.0-stage` placeholder and goes live only after
   you approve it on npmjs.com. Check the tarball contents before approving.

3. For each of the six packages on npmjs.com: **Settings > Trusted publishing > GitHub Actions**, owner
   `pavlovt`, repository `kvesto`, workflow `release.yml`. Then, under **Publishing access**, you can choose to
   disallow tokens.

## Every later release

In CHANGELOG.md, rename `## Unreleased` to `## [0.2.0] - YYYY-MM-DD` and add a new empty `## Unreleased` above it.
At the bottom, add links for the commits its entries don't link yet and the compare link
(`[0.2.0]: https://github.com/pavlovt/kvesto/compare/v0.1.2...v0.2.0`). Then:

```sh
pnpm release:version 0.2.0
git commit -am "Release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

The tag triggers `.github/workflows/release.yml`: it builds, type-checks and tests, checks that the tag matches the
package versions, and publishes with OIDC (no secrets) and provenance. Versions already on npm are skipped, so a
failed run can be re-run. A pre-release such as `0.2.0-beta.1` is published under the `next` dist-tag.
