# Releasing Kvesto to npm

Published packages (all in `packages/`, always released together with the same version):

| npm package | Folder |
| --- | --- |
| `kvesto` | `packages/kvesto`: one install, re-exports `@kvesto/core`, plus the `<script>` bundle `dist/kvesto.min.js` |
| `@kvesto/core` | `packages/core` |
| `@kvesto/schema` | `packages/schema` |
| `@kvesto/server` | `packages/server` (also the `kvesto-server` CLI) |

The SvelteKit apps in `apps/` are private and are not published.

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

   pnpm publishes in dependency order and replaces `workspace:*` with real versions. npm will ask for your
   2FA code.

3. For each of the four packages on npmjs.com: **Settings > Trusted publishing > GitHub Actions**, owner
   `pavlovt`, repository `kvesto`, workflow `release.yml`. Then, under **Publishing access**, you can choose to
   disallow tokens.

## Every later release

```sh
pnpm release:version 0.2.0
git commit -am "Release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

The tag triggers `.github/workflows/release.yml`: it builds, type-checks and tests, checks that the tag matches the
package versions, and publishes with OIDC (no secrets) and provenance. Versions already on npm are skipped, so a
failed run can be re-run. A pre-release such as `0.2.0-beta.1` is published under the `next` dist-tag.
