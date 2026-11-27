# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- Use GitHub's private vulnerability reporting: the repository's **Security** tab, then **Report a vulnerability**.

Include what you found, how to reproduce it (a survey JSON, a request, a page), and what an attacker gains. You'll
get an answer within 7 days. Once a fix is released we publish a GitHub security advisory and credit you, unless you
would rather not be named.

Please give us a reasonable time to fix the problem before you disclose it, don't access or change other people's
data, and only test against your own installation.

## Supported versions

Kvesto is before 1.0. Security fixes go into the latest minor release of every package (`@kvesto/schema`,
`@kvesto/core`, `@kvesto/server`, `@kvesto/editor`, `@kvesto/dashboard`, `@kvesto/react`, `@kvesto/vue`,
`@kvesto/export` and `kvesto`):

| Version | Supported |
| --- | --- |
| 0.2.x | Yes |
| < 0.2 | No |

## What is in scope

The threat model, with what Kvesto defends against and what it leaves to the host, is in
[docs/threat-model.md](docs/threat-model.md). In short: a survey JSON document, answers, uploaded files and
anything sent to the public routes are untrusted. Problems that need a malicious server operator, or an
`authorize` function that lets everyone in, are out of scope.

## How the project is kept safe

- CI runs CodeQL, `pnpm audit --prod` (failing on high or critical advisories) and the OpenSSF Scorecard on every
  push to `main`. Dependabot keeps npm packages and GitHub Actions up to date.
- Every GitHub Action is pinned to a commit SHA, and every workflow asks for the least `permissions:` it needs.
- Packages are published from CI with npm trusted publishing, so each release carries provenance.
- Repository settings (made by the maintainers in GitHub, not in files): secret scanning and push protection on,
  private vulnerability reporting on, branch protection on `main`.
