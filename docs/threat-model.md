# Threat model

Kvesto is embedded in other systems and collects answers from the public internet. This page lists what it treats
as untrusted, what it defends against, and what it leaves to the system around it. Report gaps as described in
[SECURITY.md](../SECURITY.md).

## The pieces

```
 respondent's browser            host page                Kvesto server               admin
 ┌────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────┐
 │ runner (core)      │◄──│ embed script, iframe │   │ public routes:       │◄──│ editor,      │
 │ renders survey JSON│   │ or <kvesto-survey>   │   │  GET survey, submit, │   │ dashboard,   │
 │ sends answers      │──►│                      │   │  upload, /s/{id}     │   │ API clients  │
 └────────────────────┘   └──────────────────────┘   │ admin routes:        │   └──────────────┘
                                                     │  surveys, responses, │
                                                     │  exports, webhooks   │──► webhook receivers
                                                     └──────────────────────┘
```

## Untrusted inputs

| Input | Who controls it | Defences |
| --- | --- | --- |
| Survey JSON | Anyone who can save a survey, or a file someone imports | Validated by the Zod schema before use. No `eval`: conditions and expressions are data, parsed by Kvesto's own parser with length and depth limits. Regex validators are length-limited. Markdown and HTML in content blocks are escaped unless the host passes a `sanitizeHtml` function. Theme values can't contain `;{}<>\`. Custom question types must be registered by the host. |
| Answers | The respondent (anyone, on public routes) | Re-validated on the server with the same rules as the runner, including conditional logic; answers to hidden questions are dropped; quiz scores are recalculated on the server; the client's `meta.quiz` is ignored. Hidden fields are kept only if the survey declares them, as strings up to 500 characters. |
| Uploaded files | The respondent | Size limits per question and per server, `accept` checked, stored in the database, served with `nosniff`, a sandboxing CSP and as downloads unless they are images, PDF or plain text. Stricter checks (real file type, file names, quotas, scanning) are planned in M36. |
| Requests to public routes | Anyone | Body size limits and document limits checked before parsing; secure headers; CORS `*` only on these routes; resume tokens are random 256-bit secrets stored only as hashes and compared in constant time; respondent ids are kept as HMACs for `oneResponsePer`. Rate limiting and bot friction are planned in M35. |
| Requests to admin routes | API clients | Every action goes through the host's `authorize` function (`apiKeyAuth` compares keys in constant time). Without it the server warns at startup. |
| The embedding page | The site that embeds a survey | The hosted page runs no inline script under a strict CSP; the frame only sends its height and "complete" to its parent, never answers. The embed script accepts messages only from its own frames on the server's origin. |
| Webhook URLs | Admins | HTTPS only; names that resolve to private, loopback or link-local addresses are refused, checked again before each delivery; redirects are not followed. Deliveries are signed (HMAC-SHA256 with a timestamp). |
| Spreadsheet exports | Respondents' answers | Cells that a spreadsheet would run as formulas (`= + - @`, tab, CR) are defused in CSV and Excel exports. |

## What the host is responsible for

- Authentication and authorization of admins: Kvesto calls your `authorize` and `identifyRespondent` functions and
  trusts their answers.
- TLS, and the network in front of the server (a reverse proxy, a WAF).
- Database backups and encryption of the disk.
- The HTML sanitizer, if you allow HTML in content blocks.
- Keeping `respondentSecret` and API keys secret.

## Known limits

- `oneResponsePer: "browser"` is best effort: it relies on an id in the browser's storage.
- Until M35 there is no rate limiting.
- Until M38 answers are stored in plain text in the database.
