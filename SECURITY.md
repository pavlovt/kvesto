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

- Security tests run with every test run and, deeper, in the Security tests workflow: property-based fuzzing
  (fast-check) of the survey schema, the expression parser and evaluator and the condition logic, each with a
  fixed time budget; a ReDoS check on pattern validators; an XSS corpus through every render path; and an OWASP ZAP
  baseline scan of a running server.
- CI runs CodeQL, `pnpm audit --prod` (failing on high or critical advisories) and the OpenSSF Scorecard on every
  push to `main`. Dependabot keeps npm packages and GitHub Actions up to date.
- Every GitHub Action is pinned to a commit SHA, and every workflow asks for the least `permissions:` it needs.
- Packages are published from CI with npm trusted publishing, so each release carries provenance.
- Repository settings (made by the maintainers in GitHub, not in files): secret scanning and push protection on,
  private vulnerability reporting on, branch protection on `main`.

## Release checklist

Before tagging a release:

1. CI, CodeQL, Scorecard and the Security tests workflow are green on the commit, and the ZAP report has no new
   warnings that weren't looked at.
2. `pnpm audit --prod` shows no high or critical advisories; Dependabot PRs for security updates are merged.
3. Any change to the survey format, the REST API, authentication, uploads, encryption or the hosted page has a
   matching update to [docs/threat-model.md](docs/threat-model.md).
4. New untrusted input (a new field shown to respondents, a new route, a new file type) has a test in the XSS corpus,
   the fuzzers or the API tests.
5. `CHANGELOG.md` lists security fixes and anything that changes a safe default, so people upgrading know.
6. Fixed advisories are published on GitHub after the release, crediting the reporter.
