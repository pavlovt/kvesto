# Survey and form tools: a competitive review

Researched on 2026-11-27 for Kvesto's roadmap (M11–M73, all still planned when this was written). It looks at the
main open-source survey libraries and form builders and at the leading hosted survey and form products. For each one
it covers features, question types, logic, the editor, results, integrations, localization, accessibility, security
and privacy, licensing and pricing, and strengths and weaknesses. The last part checks `ROADMAP.md` against what
these tools do.

`ROADMAP.md` describes features in generic terms and names no products. This file is where the product names live.

## How to read this

- **Sources.** Each section ends with the pages it rests on. Most facts were read from official sites, docs and
  repositories on the research date.
- **†** marks a claim taken from the author's general knowledge of the product. It was not re-checked against a live
  page on the research date, usually because the vendor's page returned 403 or 404 or its docs showed only an
  introduction. Treat † claims as likely but unconfirmed, and check them before quoting them elsewhere.
- **Vendor claims.** Compliance and accessibility statements (SOC 2, WCAG, HIPAA and so on) are the vendor's own
  claims unless an audit is named. Nothing here was independently audited.
- **Prices** change often and differ by region. They are listed to show the pricing *model*, not as a quote.

## Contents

1. [Summary](#summary)
2. [Open-source libraries and builders](#part-1--open-source-libraries-and-builders)
3. [Hosted products](#part-2--hosted-products)
4. [Cross-cutting comparison](#part-3--cross-cutting-comparison)
5. [What this means for Kvesto's roadmap](#part-4--what-this-means-for-kvestos-roadmap)

---

## Summary

| Tool | Kind | Licence | Pricing model | Stands out for |
| --- | --- | --- | --- | --- |
| SurveyJS | JS survey library + builder + dashboard | Form Library MIT; Creator, Dashboard, PDF commercial | One-time per developer, yearly renewal for updates | Closest match to Kvesto: JSON surveys, expression language, triggers, many question types |
| Form.io | Form platform (renderer + API server) | Renderer MIT; server OSL-3.0; enterprise add-ons | Hosted and enterprise licences | Forms as API resources, role-based access per form, i18next |
| react-jsonschema-form | JSON Schema form renderer | Apache-2.0 | Free | Many UI themes, standard JSON Schema |
| JSON Forms | JSON Schema form renderer | MIT | Free | Framework-neutral, UI schema with rules |
| Tripetto | Form SDK + hosted builder | Runners MIT; builder licensed for embedding | Per domain per year for the SDK | Conversational runners, calculator and score blocks |
| LimeSurvey | Self-hosted survey platform | GPL-2.0+ | Free self-host; paid cloud | 36 question types, ExpressionScript, quotas, participant tokens, 80+ languages |
| ODK + XLSForm | Offline field data collection | Apache-2.0 | Free self-host; ODK Cloud from $199/mo | Offline, GPS, barcode, encrypted submissions, entities, XLSForm standard |
| KoboToolbox | Humanitarian data collection (ODK-based) | AGPL-3.0 | Free community plan for eligible orgs; paid plans | Same field features as ODK with a friendlier web builder |
| Formbricks | Experience management (link + in-app surveys) | AGPL-3.0 core; `ee` directory under enterprise licence | Quote-based enterprise; self-host free | In-app targeting, recontact rules, quotas, workflows |
| OpnForm | Form builder | AGPL-3.0 core; enterprise directory proprietary | Free, Pro $25, Business $67, Enterprise $220 per month | Unlimited submissions on every tier |
| HeyForm | Conversational form builder | AGPL-3.0 | Cloud from $15/mo; self-host free | One-question-at-a-time forms, payments |
| Typebot | Chatbot-style form builder | Functional Source License | Per chat started | Chat flows, OpenAI blocks, WhatsApp |
| Typeform | Hosted conversational forms | Proprietary | Monthly tiers by responses | One-question-at-a-time UX, logic jumps, scoring |
| Tally | Hosted forms | Proprietary | Generous free tier; Pro and Business | Document-style editor, calculations free, MCP server |
| Jotform | Hosted forms and workflows | Proprietary | Tiers by forms and submissions | Widest feature set: approvals, PDF, HIPAA tier, 150+ integrations |
| Fillout | Hosted forms | Proprietary | Free 1,000 responses/mo; tiers | Logic and calculations on every plan, condition groups |
| Google Forms | Hosted forms | Proprietary | Free with a Google account | Quiz mode, Sheets, zero setup |
| Microsoft Forms | Hosted forms | Proprietary | Included in Microsoft 365 | Quiz mode, Excel, organisation-only access |
| SurveyMonkey | Hosted surveys | Proprietary | Per user per year with response caps | Cross-tabs, A/B tests, AI analysis, benchmarks |
| Qualtrics | Enterprise experience management | Proprietary | Quote-based | Survey flow, research question types, response quality, Stats iQ, FedRAMP |
| Alchemer | Hosted surveys | Proprietary | Tiers † | Actions and scripting (JavaScript, Lua) |

**The short version for Kvesto.** Kvesto's plan already covers most of what these tools offer, and in places it
goes further (server parity for validation, conditions as data, end-to-end encryption, MCP). The clearest gaps are in
four areas: the *choice model* (other/none/exclusive options, per-choice conditions, shared choice lists), *field
data capture* (location, barcode, photo), *what happens after a response arrives* (review status, notes, admin
edits, response-quality flags, test responses), and a set of smaller items spread over existing milestones
(defaults and read-only fields, input masks, translation files, WCAG 2.2 specifics, kiosk mode, notification emails,
significance tests, anonymity thresholds). Part 4 lists them.

---

## Part 1 · Open-source libraries and builders

### SurveyJS

The most direct comparison: a JSON survey format, a framework-agnostic model, a visual builder and a dashboard.

- **Feature set.** Form Library (runner), Survey Creator (builder), Dashboard (analytics) and PDF Generator. The
  2025–2026 releases added design tokens shared across the libraries (CSS variables), theme adapters for Bootstrap,
  Material UI and shadcn/ui, server-side rendering support with hydration, exclusive checkbox options, per-choice
  comments, and a slider. An MIT "AI Form Response Extractor" turns scanned forms into SurveyJS JSON.
- **Question types.** Radio group, rating scale, checkboxes, dropdown, multi-select dropdown (tag box), yes/no,
  file upload, image picker, ranking, single-line input, long text, multiple textboxes, dynamic panel (repeat),
  single-select matrix, multi-select matrix (cells with inputs), dynamic matrix (respondent adds rows), HTML,
  expression (computed), image, signature, slider; panels as containers. An image map type is in progress.
- **Logic and expressions.** A text expression language (built on Peggy) with `and`, `or`, `contains`, `anyof`,
  `allof`, `empty`, and functions such as `iif`, `age`, `today`, `dateAdd`, `dateDiff`, `sum`, `avg`, `round`,
  `sumInArray`, `countInArray`, `displayValue`. Custom functions with `registerFunction`, including async ones
  (callback or Promise). Properties `visibleIf`, `enableIf`, `requiredIf`, `choicesVisibleIf`, `setValueIf`;
  `calculatedValues` with an `includeIntoResult` flag; triggers `complete`, `setvalue`, `copyvalue`,
  `runexpression`, `skip`. Placeholders `{firstName}` in titles, descriptions and HTML, with
  `{matrix.row.column}` and `{panel[0].question}` paths and `{$question.visible}` element properties.
  † Choices from a URL (`choicesByUrl`), carry-forward (`choicesFromQuestion`), `defaultValueExpression`, input
  masks (numeric, currency, date-time, pattern), quiz mode with correct answers and timers.
- **Editor.** Survey Creator: toolbox, drag and drop, property grid, a UI preset editor for configuring toolbox, tabs
  and property grid. † Logic, translation, theme and JSON tabs, undo/redo, custom component and composite question
  types. Real-time collaboration is planned for Q4 2026.
- **Results and analytics.** Dashboard with Chart.js as the default engine (Plotly still supported), pivot and radar
  charts, date-range filtering and cross-filtering. † Table view with CSV/Excel/PDF export. No backend is shipped:
  storage is the host's job.
- **Integrations.** None built in beyond the host's own backend; † framework packages for React, Angular, Vue,
  jQuery and vanilla JS. `llms.txt` and Markdown versions of every doc page for AI tools; AI prompt packs planned.
- **Localization.** † Dozens of UI locales and per-string survey translations with a translation tab in the Creator.
- **Accessibility.** The Form Library (from v2.1.0, with the Contrast theme) and the Creator (from v2.2.2) are
  described as complying with WCAG, Section 508 and ARIA, verified with axe-core; the Dashboard repo names
  WCAG 2.1 AA. No VPAT was found, and the default theme had a known contrast issue at v2.1.0.
- **Security and privacy.** Client-side library; the host handles storage, auth and privacy. Expressions are parsed,
  not `eval`'d. † HTML questions render markup from the survey JSON, so the host must trust or sanitise surveys.
- **Licensing and pricing.** Form Library MIT; Creator, Dashboard and PDF Generator under a commercial EULA. One-time
  per-developer licences: Basic (Library + Creator) $559, PRO (+ Dashboard + PDF) $1,019, Enterprise from $2,259,
  with yearly renewals for updates and support.
- **Strengths.** Very complete logic, mature question set, framework coverage, active development.
- **Weaknesses.** The builder and analytics are not open source, which is Kvesto's main opening. No server, so
  server-side validation of answers is left to the host. The expression language is text, which is harder to
  validate and edit visually than data.

Sources: [library licence](https://github.com/surveyjs/survey-library/blob/master/LICENSE) ·
[Creator licence](https://github.com/surveyjs/survey-creator/blob/master/LICENSE) ·
[pricing](https://surveyjs.io/pricing) ·
[question types](https://surveyjs.io/form-library/documentation/question-types) ·
[conditional logic and expressions](https://surveyjs.io/form-library/documentation/design-survey/conditional-logic) ·
[major updates 2025–2026](https://surveyjs.io/stay-updated/major-updates/2025-2026) ·
[2026 roadmap](https://surveyjs.io/stay-updated/blog/surveyjs-2026-roadmap) ·
[accessibility FAQ](https://surveyjs.io/faq/accessibility) ·
[v2.1.0 release notes](https://surveyjs.io/stay-updated/release-notes/v2.1.0) ·
[Dashboard repo](https://github.com/surveyjs/survey-analytics)

### Form.io

A form platform where every form is also a REST resource.

- **Feature set.** A JavaScript renderer (`formio.js`), a JSON-based drag-and-drop builder (`Formio.builder`) and an
  API server (Node and MongoDB) that stores submissions. Forms can reference "resources" (other forms used as data
  tables). Self-hosted with Docker Compose, or hosted through the Form.io portal.
- **Question types.** † Basic inputs (text field, text area, number, password, checkbox, select boxes, select, radio),
  advanced inputs (email, URL, phone, tags, address, date/time, day, time, currency, survey grid, signature), layout
  components (columns, field set, panel, table, tabs, well, HTML, content), data components (container, data map,
  data grid, edit grid, nested form) and file upload.
- **Logic.** † Simple and JSONLogic conditionals, calculated values, custom JavaScript conditions, "logic" rules that
  change component properties, and server-side "actions" (email, webhook, save to resource, role assignment).
- **Editor.** The embeddable builder; † a PDF-overlay builder in the enterprise edition.
- **Results.** Submissions are JSON records behind a REST API with JWT, admin keys and temporary tokens; † a data
  grid in the portal, CSV/JSON export.
- **Integrations.** † Webhooks and server actions; integrations with cloud storage, email and identity providers in
  the enterprise offering.
- **Localization.** i18next-based: an `i18n` option keyed by language code, translations embedded in the form or
  stored as a Language resource.
- **Accessibility.** WCAG 2.1 AA and Section 508 support is claimed through a separately licensed Accessibility
  Compliance Module; only some components are listed as tested, and there is no VPAT for the whole product.
- **Security.** Role-based create/read/update/delete/index permissions per form; submission access off by default.
  Field-level encryption and HIPAA readiness appear in marketing, with no certification or BAA found; self-hosting
  puts compliance on the deployer.
- **Licensing.** Renderer MIT; server OSL-3.0 (copyleft, OSI-approved); enterprise modules and the hosted portal are
  commercial.
- **Strengths.** Forms-as-API, fine-grained per-form permissions, nested forms and data grids, PDF forms.
- **Weaknesses.** Copyleft server, MongoDB dependency, accessibility sold as an add-on, aimed at forms rather than
  survey research (no quotas, randomization or survey analytics).

Sources: [formio.js](https://github.com/formio/formio.js) · [server](https://github.com/formio/formio) ·
[multi-language forms](https://form.io/features/multi-language-forms/) ·
[translations](https://help.form.io/developers/form-development/translations) ·
[security](https://form.io/features/form-data-security-compliance/) · [auth](https://help.form.io/developers/auth) ·
[accessibility](https://form.io/features/form-accessibility/) · [a11y dev notes](https://help.form.io/dev/accessibility) ·
[HIPAA page](https://form.io/hipaa-compliant-form-builder-healthcare-saas-platforms/)

### react-jsonschema-form (RJSF)

- **Feature set.** Renders a form from a JSON Schema plus a "uiSchema" for widgets and layout; validates with AJV
  (`@rjsf/validator-ajv8`) or alternative validators. React 19.2+.
- **Question types.** Whatever JSON Schema expresses (strings with formats, numbers, booleans, enums, arrays, objects),
  mapped to widgets per theme. Themes: Ant Design, Chakra, DaisyUI, Fluent UI, Mantine, Material UI, React-Bootstrap,
  shadcn, and a deprecated Bootstrap 3.
- **Logic.** JSON Schema `dependencies` (including dynamic `oneOf`); † `if`/`then`/`else` support depends on the
  version. No survey logic such as piping, skip or quotas.
- **Editor, results, integrations.** None; it is a renderer. † Community playgrounds exist.
- **Localization.** † Message translation through a `translateString` hook.
- **Accessibility.** Inherited from the chosen theme's components †.
- **Licence.** Apache-2.0, free.
- **Strengths.** Standard schema, many UI kits, good for data-entry forms in React apps.
- **Weaknesses.** React only, no builder, no survey features, uiSchema gets verbose for complex layouts.

Sources: [repo](https://github.com/rjsf-team/react-jsonschema-form) ·
[docs](https://rjsf-team.github.io/react-jsonschema-form/docs/) ·
[dependencies](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/dependencies)

### JSON Forms

- **Feature set.** JSON Schema for data plus a UI schema (`VerticalLayout`, `HorizontalLayout`, `Group`, `Control`)
  for layout, with renderer sets for React (vanilla, Material), Angular Material and Vue (vanilla, Vuetify).
- **Logic.** UI schema "rules" show, hide, enable or disable elements based on a JSON Schema condition.
- **Editor, results, integrations.** None built in. † A separate commercial editor exists from the maintainer.
- **Localization.** † An i18n option for labels and errors.
- **Licence.** MIT.
- **Strengths.** Framework-neutral core with custom renderers; standards-based.
- **Weaknesses.** No survey semantics or analytics; layout and data are split into two documents.

Sources: [jsonforms.io](https://jsonforms.io/) · [repo](https://github.com/eclipsesource/jsonforms)

### Tripetto

- **Feature set.** A visual "storyboard" builder and three runners (autoscroll, chat, classic). Available as a
  WordPress plugin, a hosted studio and an SDK for embedding the builder and runners.
- **Logic.** Branches on conditions and a set of action blocks: calculator, scores, hidden field, custom variable,
  set value, send email, force stop, raise error; conditions include evaluate, password match, regex and device
  size. Recall (piping) and conversational branching.
- **Integrations.** Webhooks, Zapier, Make, Slack ("1,000+ connections"); with the SDK, data never reaches Tripetto's
  servers.
- **Licensing and pricing.** Runner foundation and blocks MIT. The builder package is CC-BY-NC-ND-4.0 per npm †;
  embedding the builder needs a paid licence (from about €325/month), and removing runner branding from about
  €75/month, priced per domain per year. Free for development.
- **Strengths.** Logic as a visual flow; three presentation modes from one definition; calculator blocks.
- **Weaknesses.** The builder is not open source for embedding; question-type list, i18n and accessibility details
  were not found.

Sources: [tripetto.com](https://tripetto.com/) · [SDK pricing](https://tripetto.com/sdk/pricing/) ·
[builder on npm](https://www.npmjs.com/package/@tripetto/builder)

### LimeSurvey

The long-standing open-source survey platform for research.

- **Feature set.** A self-hosted PHP application with survey design, participant management, quotas, assessments,
  statistics and a JSON-RPC API.
- **Question types.** 36 in five groups: arrays (9, including numbers, texts, dual scale, by column), mask questions
  (11, including date, equation, file upload, gender, language switch, numerical, ranking, yes/no), multiple choice
  (4, including with comments), single choice (6, including list with comment, 5-point choice) and text (6, including
  huge and multiple short text).
- **Logic and expressions.** ExpressionScript: relevance equations on questions, groups and sub-questions,
  processed in survey order so relevance cascades; the equation question type stores computed values. Quotas cap
  completed responses by answer options, and screened-out participants cannot restart. † Assessments (scores with
  result messages), randomization groups, array filters (carry-forward), validation equations.
- **Editor.** A web admin UI with question groups and a † "question theme" system.
- **Results.** Statistics output as HTML, PDF or Excel with field summaries and pChart charts; no significance tests
  or cross-tabs mentioned. Exports to CSV, and from there SPSS and R †.
- **Integrations.** RemoteControl 2 API over JSON-RPC (recommended) or XML-RPC; † plugins.
- **Localization.** "Over 80 languages"; † multilingual surveys with one translation per string.
- **Accessibility.** Claims "WCAG 2.2 Level AA-aligned" (vendor, not audited).
- **Security and privacy.** Anonymised responses stop admins linking answers to participants, while tokens still
  track who responded (a bug report notes token attributes leaking into anonymised surveys). Participant tokens,
  closed-access surveys, EU/US hosting; ISO 27001 described as in progress.
- **Licensing.** GPL-2.0 or later; a paid cloud offering (prices not public on the home page).
- **Strengths.** Research-grade features (tokens, quotas, assessments, many languages) for free.
- **Weaknesses.** Dated UI, PHP monolith that is hard to embed, basic analytics, GPL.

Sources: [repo](https://github.com/LimeSurvey/LimeSurvey) · [limesurvey.org](https://www.limesurvey.org/) ·
[question types](https://www.limesurvey.org/manual/Question_types) ·
[ExpressionScript](https://www.limesurvey.org/manual/ExpressionScript_-_Presentation) ·
[quotas](https://www.limesurvey.org/manual/Quotas) · [statistics](https://www.limesurvey.org/manual/Statistics) ·
[RemoteControl 2 API](https://www.limesurvey.org/manual/RemoteControl_2_API) ·
[participant settings](https://www.limesurvey.org/manual/Participant_settings) ·
[bug 18253](https://bugs.limesurvey.org/view.php?id=18253)

### ODK and the XLSForm standard (with Enketo)

The reference toolchain for offline field data collection, and the source of the XLSForm spreadsheet format that
KoboToolbox and others also use.

- **Feature set.** ODK Collect (Android app), ODK Central (server and web UI), Enketo/Web Forms (browser runner),
  forms authored as XLSForm spreadsheets.
- **Question types.** `integer`, `decimal`, `range`, `text`, `select_one`, `select_multiple`, `select_one_from_file`,
  `select_multiple_from_file`, `rank`, `note`, `geopoint`, `geotrace`, `geoshape`, `date`, `time`, `dateTime`,
  `image`, `audio`, `background-audio`, `video`, `file`, `barcode`, `calculate`, `acknowledge`, `hidden`, external
  selects; groups and repeats (nestable); metadata fields (`start`, `end`, `today`, `deviceid`, `username`, `audit`).
- **Logic.** `relevant` (visibility), `constraint` (validation with a message), `calculation`, `choice_filter`
  (cascading and filtered choices), `required` as an expression, `pulldata()` and attached CSV files for lookups;
  † "entities" that let one form create and update records another form reads (follow-up visits).
- **Editor.** Spreadsheets (any editor), with † an online converter and validator; KoboToolbox adds a web builder.
- **Results.** Central exports and an OData feed for Excel, Power BI and R; Briefcase for decryption and export.
  † Submission review states (received, has issues, edited, approved) with comments and edit history in Central.
- **Integrations.** REST API, OData, OpenRosa; resources include projects, forms, submissions, users, datasets
  (entities) and roles.
- **Localization.** Multiple languages per form (`label::French` columns).
- **Accessibility.** No claims found.
- **Security and privacy.** Encrypted forms: the form carries a public key, Collect encrypts each submission with a
  random 256-bit key that is itself encrypted with the public key, and the server never holds the private key.
  Documented caveats: unencrypted drafts on the device, data left in free storage, no protection against a form being
  replaced wholesale. Central also offers managed keys.
- **Offline.** Collect works fully offline and syncs later; web forms can be cached.
- **Licensing and pricing.** Apache-2.0; self-hosting free; ODK Cloud Standard $199/mo, Professional $499/mo,
  Enterprise custom, with US, EU or India hosting.
- **Strengths.** Offline, location and media capture, encryption, a widely used open authoring standard.
- **Weaknesses.** Spreadsheet authoring and an expression syntax (XPath) that non-technical users find hard; little
  built-in analysis; not designed for embedding in web apps.

Sources: [getodk.org](https://getodk.org/) · [encrypted forms](https://docs.getodk.org/encrypted-forms/) ·
[Central intro](https://docs.getodk.org/central-intro/) · [Central API](https://docs.getodk.org/central-api/) ·
[Collect repo](https://github.com/getodk/collect) · [Central repo](https://github.com/getodk/central) ·
[XLSForm reference](https://xlsform.org/en/) · † [submission review states](https://docs.getodk.org/central-submissions/)

### KoboToolbox

- **Feature set.** ODK-compatible data collection with a web form builder, KoboCollect (Android) and Enketo web forms,
  aimed at humanitarian, development and research work.
- **Question types and logic.** The XLSForm set above (the builder exports and imports XLSForm), including skip
  logic, validation, calculations, cascading selects, repeats, GPS and media.
- **Results.** Data table, † validation status per submission (approved, not approved, on hold), reports, maps of
  GPS data, exports for SPSS and Stata.
- **Integrations.** REST API and data endpoints; † REST services (webhooks).
- **Security and privacy.** GDPR compliance, EU hosting and private servers are listed in the help centre; † a
  separate EU server for European organisations.
- **Offline.** KoboCollect fills forms offline; web forms cache in the browser, and clearing the cache deletes
  queued submissions.
- **Licensing and pricing.** AGPL-3.0; a free community plan for eligible non-profit, government, UN and education
  users (reported limits around 5,000 submissions/month and 1 GB); paid plans for others (prices not verified: the
  pricing page returned 403).
- **Strengths.** ODK's power with a friendlier builder; free for its target users.
- **Weaknesses.** Same limits as ODK for embedding and analysis.

Sources: [kpi repo](https://github.com/kobotoolbox/kpi) · [help centre](https://support.kobotoolbox.org/) ·
[KoboCollect](https://support.kobotoolbox.org/data_collection_kobocollect.html) ·
[web forms](https://support.kobotoolbox.org/data_through_webforms.html)

### Formbricks

An open-source experience-management suite: link surveys, website surveys and in-app surveys.

- **Feature set.** "Ask" (surveys), "Analyze" (unified feedback, dashboards) and "Act" (workflows with triggers,
  filters, actions and observable runs).
- **Question types.** "Over a dozen" †: free text, single and multi select, picture selection, rating, NPS, ranking,
  matrix, address, contact info, date, file upload, cal booking, consent, call to action.
- **Logic.** Conditional logic, recall (piping), variables and hidden fields in the builder; quotas.
- **Distinctive: targeting.** In-app surveys shown on actions (code or no-code events such as page views and
  clicks) to users matching attributes and segments, with recontact rules (wait N days between surveys for the same
  user, show once, show until submitted) †.
- **Editor.** Drag-and-drop builder with a live preview.
- **Results.** Summary, responses with † tags and notes per response, drop-offs, dashboards.
- **Integrations.** Slack, Notion, Zapier, n8n; REST API; † webhooks, Google Sheets, Airtable; JS SDK for in-app.
- **Localization.** Multi-language surveys.
- **Accessibility.** An `ACCESSIBILITY.md` exists; no conformance claim found.
- **Security and privacy.** "Privacy-first", self-hostable; SSO, roles and audit logs are enterprise features.
- **Licensing and pricing.** AGPL-3.0 core; the `ee` directory under an enterprise licence needing a key. Hosted
  "Experience Suite" priced by responses per year, workspaces and term, quote-only; a managed cloud is "coming soon".
- **Strengths.** In-app targeting and recontact control; modern stack; self-hostable.
- **Weaknesses.** AGPL plus a gated enterprise directory; not an embeddable library; enterprise pricing opaque.

Sources: [repo](https://github.com/formbricks/formbricks) · [pricing](https://formbricks.com/pricing) ·
[docs](https://formbricks.com/docs) · [surveys overview](https://formbricks.com/docs/surveys/overview)

### OpnForm

- **Feature set.** A form builder for simple data-collection forms, hosted or self-hosted.
- **Question types.** Text, date, URL, phone, email, checkboxes, select, multi-select, number, star rating, file
  upload.
- **Logic.** Form logic (show/hide, require), including relative date conditions ("within the next X days").
- **Results and integrations.** Submissions table, analytics (Pro), Slack, Discord, Telegram, webhooks, API;
  HubSpot, Salesforce and Airtable on Business.
- **Localization.** Form messages localized into a fixed list of languages.
- **Security.** Captcha, password-protected forms, form expiry; OIDC for self-hosting free up to 2 users; SAML/LDAP
  SSO and audit logs in Enterprise.
- **Licensing and pricing.** AGPL-3.0 core, proprietary enterprise directory; Free (branding), Pro $25, Business $67
  (roles, partial submissions, versioning), Enterprise $220 per month; unlimited submissions on every tier.
- **Strengths.** Simple, generous limits.
- **Weaknesses.** Thin question set and logic; not a survey tool.

Sources: [repo](https://github.com/JhumanJ/OpnForm) · [pricing](https://opnform.com/pricing) ·
[docs](https://docs.opnform.com)

### HeyForm

- **Feature set.** One-question-at-a-time forms with payments, hosted or self-hosted.
- **Question types.** Text, email, phone, picture choice, date, file upload, payments †, rating †.
- **Logic.** Conditional logic and URL redirects.
- **Results and integrations.** Drop-off and completion rates, CSV export; Zapier, Make, webhooks, Google Sheets,
  Airtable, Notion, Telegram.
- **Security.** OIDC SSO for self-hosting.
- **Licensing and pricing.** AGPL-3.0; cloud Basic $15, Premium $24, Business $40 per month with response caps and a
  payment commission on lower tiers.
- **Strengths.** Conversational UX in open source.
- **Weaknesses.** Limited logic and analytics; thin docs.

Sources: [repo](https://github.com/heyform/heyform) · [pricing](https://heyform.net/pricing)

### Typebot

- **Feature set.** Chatbot-style forms built as a flow graph.
- **Blocks.** Bubbles (text, image, video, audio, embed); inputs (text, email, phone, buttons, picture choice, date,
  payment, file); logic (condition, redirect, script, A/B test, variables †); OpenAI and other integrations.
- **Integrations.** HTTP request/webhook, Google Sheets, Google Analytics, Meta Pixel, Zapier, Make, Chatwoot,
  WhatsApp (Pro); public API.
- **Licensing and pricing.** Functional Source License ("fair source"; becomes open source after a delay); hosted
  plans priced per chat started (Free 200 chats/mo, Starter $39, Pro $89, Enterprise with SSO and ISO 27001).
- **Strengths.** Conversational flows, AI blocks, messaging channels.
- **Weaknesses.** Not a survey tool (no matrix, quotas, analytics); scripting blocks run custom JavaScript; not OSI
  open source.

Sources: [repo](https://github.com/baptisteArno/typebot.io) · [pricing](https://typebot.com/pricing)

---

## Part 2 · Hosted products

### Typeform

- **Feature set.** One question per screen, keyboard-first, with strong visual design; forms, quizzes and lead
  capture.
- **Question types.** † Short and long text, multiple choice, picture choice, dropdown, yes/no, rating, opinion scale,
  NPS, ranking, matrix, date, number, email, phone, address, contact info, file upload, payment, calendar booking,
  legal/consent, statement, question groups, video questions.
- **Logic.** Logic jumps (branching by answer), † variables with calculations and scores, hidden fields from URL
  parameters, recall of earlier answers in later questions, multiple endings chosen by logic. Logic and scores are on
  the free plan.
- **Editor.** Visual builder with a logic map †; AI form creation.
- **Results.** Summary, responses table, drop-off rates and conversion tracking (Business), "Clarify with AI"
  follow-up questions (Talent tier), † AI insights.
- **Integrations.** † 100+ native integrations, webhooks, Create/Responses/Webhooks APIs, an Embed SDK (inline,
  popup, slider, popover, side tab).
- **Localization.** † Interface labels in many languages; multi-language forms with translations.
- **Accessibility.** No WCAG conformance statement found.
- **Security and privacy.** Third-party sources report SOC 2 Type II, ISO 27001, AES-256 at rest, GDPR DPA; HIPAA
  and the EU/US data-centre choice are Enterprise-only. Claims conflict and were not verified at the trust centre.
- **Pricing.** Free (10 responses/month), Basic $39, Plus $79, Business $129, Talent $169, Growth Flow $379 per month,
  Enterprise custom; each tier has included and maximum responses.
- **Strengths.** The benchmark for respondent experience and completion rates.
- **Weaknesses.** Very low free cap; expensive per response; key security features locked to Enterprise.

Sources: [pricing](https://www.typeform.com/pricing) ·
[security update (community, secondary)](https://community.typeform.com/typeform-updates-24/update-on-typeform-s-security-privacy-and-compliance-features-2572)

### Tally

- **Feature set.** Forms written like a document: type `/` to insert blocks, with logic, calculations and payments.
- **Question types.** † Short/long text, email, number, phone, link, date, time, file upload, multiple choice,
  checkboxes, dropdown, multi-select, ranking, rating, linear scale, matrix, signature, payment, hidden fields.
- **Logic.** Conditional logic, hidden fields, answer piping (`@` mentions), calculated fields (`+ - * /`,
  parentheses, assign and concatenate), with calculate actions run top to bottom before jump actions and calculated
  fields placed below the questions they use. Logic and calculations are free.
- **Results.** Responses table, drop-off analytics and partial submissions (Pro).
- **Integrations.** Google Sheets, Notion, Slack, Airtable, Discord; Zapier, Make, n8n; webhooks (free); a Claude
  connector, a ChatGPT integration and an MCP server.
- **Localization.** A "supported languages" setting for form UI †; † multi-language forms.
- **Accessibility.** No WCAG certification yet; WCAG form guidelines are followed as a reference.
- **Security and privacy.** Belgium-based, data stored in Europe, encrypted at rest and in transit (vendor); SOC 2
  status unclear.
- **Pricing.** Free with unlimited forms and submissions under fair use; Pro €20, Business €65 per month.
- **Strengths.** Lowest-friction editor; very generous free tier; AI integrations.
- **Weaknesses.** Limited research features (no quotas, randomization, cross-tabs); no accessibility certification.

Sources: [pricing](https://tally.so/pricing) · [calculator](https://tally.so/help/form-calculator) ·
[help centre](https://tally.so/help) · [accessibility](https://tally.so/help/accessibility)

### Jotform

- **Feature set.** Forms plus tables, apps, approvals, PDF editing, signing and AI agents.
- **Question types.** † Hundreds of fields and widgets: all basic inputs, matrix, star rating, scale, appointment,
  signature, payments (many processors), product lists, input tables, configurable list, spreadsheet-like inputs.
- **Logic.** Conditions that show/hide fields, change emails and thank-you pages; † calculation conditions and a
  form calculation widget, skip-to-page, require fields, update/copy values.
- **Workflows.** Approval flows and assigned tasks after submission.
- **Results.** Form analytics, a visual report builder, Jotform Tables, Google Analytics.
- **Integrations.** 150–200+ native, plus Zapier; † webhooks and a REST API.
- **Localization.** Form translation into multiple languages; † auto-translate.
- **Accessibility.** An accessibility statement exists; † a form accessibility checker.
- **Security and privacy.** HIPAA features on Gold and Enterprise; SSO on Enterprise; local data residency
  (Enterprise); † encrypted forms with a private key held by the form owner; GDPR.
- **Pricing.** Starter free (5 forms, 100 submissions/month, branding), Bronze $39, Silver $49, Gold $129 per month,
  Enterprise custom.
- **Strengths.** Breadth: approvals, PDF output, payments, compliance tiers.
- **Weaknesses.** Small free tier; crowded UI; survey-research features thin.

Sources: [pricing](https://www.jotform.com/pricing/) · [features](https://www.jotform.com/features/)

### Fillout

- **Feature set.** Hosted forms with strong logic and database integrations.
- **Logic.** Condition groups with and/or, show/hide on earlier answers, URL parameters, integration data and dates,
  "hide always"; calculations and scoring on every plan.
- **Integrations.** 50+ native, including Airtable and Notion as data sources; Salesforce on higher tiers.
- **Security.** SOC 2 Type 2 and AES-256 claimed (vendor).
- **Pricing.** Free 1,000 responses/month; Starter $15, Pro $40, Business $75 (unlimited responses) per month.
- **Strengths.** Generous free tier; logic on every plan.
- **Weaknesses.** Thin public docs on translation, accessibility and the API.

Sources: [pricing](https://www.fillout.com/pricing) · [conditional hiding](https://www.fillout.com/help/conditional-hiding)
· [condition groups](https://www.fillout.com/help/condition-logic-groups) · [fillout.com](https://www.fillout.com/)

### Google Forms

- **Feature set.** Free forms and quizzes tied to Google accounts and Sheets.
- **Question types.** † Short answer, paragraph, multiple choice, checkboxes, dropdown, file upload (signed-in
  respondents), linear scale, rating, multiple-choice grid, checkbox grid, date, time.
- **Logic.** Sections with "go to section based on answer" on multiple choice and dropdown only; checkboxes cannot
  branch; quiz points cannot drive routing.
- **Quiz mode.** Answer keys, points, † feedback per answer, release scores immediately or after manual review.
- **Limits.** Up to 300 pieces of content and 75 sections per form; draft responses autosaved for 30 days.
- **Results.** Summary charts and individual responses; † link to Sheets.
- **Access.** † Restrict to one response per Google account or to an organisation.
- **Strengths.** Free, zero setup, familiar.
- **Weaknesses.** Shallow logic, no piping †, no embedding control, Google account dependencies.

Sources: [limits and autosave](https://support.google.com/docs/answer/2839737)

### Microsoft Forms

- **Feature set.** Forms and quizzes in Microsoft 365 with Excel integration.
- **Logic.** Per-question branching, forward only, one source per rule; score-based branching not supported;
  shuffle disabled when a form has sections.
- **Access.** † "Only people in my organisation" and one response per person.
- **Strengths.** Included in Microsoft 365; quiz mode for education.
- **Weaknesses.** Very limited logic; official documentation could not be fetched on the research date, so details
  rest on Microsoft Q&A and third-party guides.

Sources: [Microsoft Q&A on quiz branching](https://learn.microsoft.com/en-us/answers/questions/5431316/branching-based-on-quiz-correct-answers?forum=msoffice-all)

### SurveyMonkey

- **Feature set.** General-purpose surveys with analytics, team collaboration and a respondent panel †.
- **Question types.** † Multiple choice, checkboxes, star rating, matrix/rating scale, dropdown, ranking, NPS,
  slider, text, file upload, date/time, click map; MaxDiff and conjoint as paid add-ons.
- **Logic.** Skip logic, A/B tests, randomization; advanced logic on Premier † (custom variables, piping, quotas).
- **Results.** Custom charts, cross-tabs (Premier), filters and comparisons, "Analyze with AI" and thematic analysis,
  † benchmarks.
- **Distribution.** † Web links, email invitations with reminders, embedded surveys, offline kiosk app (SurveyMonkey
  Anywhere).
- **Localization.** Multilingual surveys on Premier.
- **Security.** † SOC 2, GDPR, HIPAA on Enterprise; SSO on Enterprise.
- **Pricing.** Per user per month billed yearly: Team Advantage €30 (50,000 responses/year), Team Premier €75
  (100,000), Enterprise custom; extra responses €0.10 each.
- **Strengths.** Analysis features and AI on mid tiers; brand recognition.
- **Weaknesses.** Per-seat and per-response pricing; key logic gated behind Premier.

Sources: [pricing](https://www.surveymonkey.com/pricing/) ·
[custom charts](https://help.surveymonkey.com/en/surveymonkey/analyze/custom-charts/)

### Qualtrics

The enterprise reference for survey research.

- **Feature set.** Survey platform, distributions, contact directory, dashboards, Stats iQ, Text iQ and experience
  management products for customer, employee and market research.
- **Question types.** Multiple choice, text entry, text/graphic, matrix table, form field, calendar, slider, rank
  order, side by side, NPS, timing, graphic slider, constant sum, file upload, pick-group-and-rank, drill down,
  signature, heat map, hot spot, meta info, captcha, highlight, screen capture, video response, unmoderated user
  testing, location selector, ArcGIS map, tree testing, number scale; † MaxDiff and conjoint as advanced projects.
- **Logic.** Survey flow with branches, embedded data and randomizers; display, skip and † carry-forward logic,
  piped text, loop and merge, quotas, per-question JavaScript.
- **Data quality.** Response quality flags: speeders, straight-lining in matrices, bots, duplicates, sensitive data,
  with an "ExpertReview: quality responses" filter; a "Survey issues and tips" checker for survey design.
- **Results.** † Dashboards, cross-tabs with weighting, Stats iQ (significance tests and regression), Text iQ (topics
  and sentiment); † anonymity thresholds in employee reports.
- **Distribution.** † Email, SMS, panels, offline app with kiosk mode, website and app intercepts.
- **Accessibility.** Section 508 and WCAG 2.0 AA claimed; † an accessibility checker in the editor.
- **Security.** ISO 27001, ISO 42001, SOC 2 Type 2, FedRAMP for the government environment, HITRUST and HIPAA claims;
  data residency options.
- **Pricing.** Quote-based by interactions or employee count.
- **Strengths.** Depth everywhere, especially research methods and data quality.
- **Weaknesses.** Cost and complexity; JavaScript in questions makes surveys code.

Sources: [pricing](https://www.qualtrics.com/pricing/) ·
[survey flow](https://www.qualtrics.com/support/survey-platform/survey-module/survey-flow/survey-flow-overview/) ·
[question types](https://www.qualtrics.com/support/survey-platform/survey-module/editing-questions/question-types-guide/question-types-overview/) ·
[response quality](https://www.qualtrics.com/support/survey-platform/survey-module/survey-checker/response-quality/) ·
[response quality in data](https://www.qualtrics.com/support/survey-platform/data-and-analysis-module/data/response-quality-functionality/) ·
[survey issues and tips](https://www.qualtrics.com/support/survey-platform/survey-module/survey-checker/quality-iq-functionality/) ·
[security](https://www.qualtrics.com/platform/security/) · [FedRAMP](https://www.qualtrics.com/platform/fedramp/)

### Alchemer

- **Feature set.** Hosted surveys for business research † with workflows and integrations.
- **Logic.** † Page and question logic, piping, quotas, URL variables; a JavaScript action and a Lua "custom script"
  action (Lua only for accounts created after October 2018; JavaScript does not run on auto-submitting pages).
- **Weaknesses.** Pricing and most help pages returned 404 on the research date, so only the scripting details are
  verified.

Sources: [scripting](https://help.alchemer.com/help/scripting) ·
[adding JavaScript](https://help.alchemer.com/help/adding-javascript-to-your-survey)

---

## Part 3 · Cross-cutting comparison

What the field looks like per area, and where Kvesto's plan stands. "M" numbers refer to `ROADMAP.md`.

| Area | Common in the field | Best in class | Kvesto plan |
| --- | --- | --- | --- |
| Format | JSON (SurveyJS, Form.io), JSON Schema (RJSF, JSON Forms), spreadsheets (XLSForm) | XLSForm for portability; SurveyJS for richness | JSON with Zod and a published JSON Schema (done), JSON Schema interop (M31), importers (M66) |
| Conditions | Text expressions (SurveyJS, LimeSurvey, XLSForm XPath) or UI rules | SurveyJS: visible/enable/required/choices-visible/set-value | JSON conditions (done) plus text expressions (M11); no `enableIf`, no per-choice conditions |
| Calculations | Expression fields, variables, scores | Tally (free), SurveyJS, Tripetto | M13, M24 |
| Triggers and flow | Jumps, end screens, redirects | Qualtrics survey flow, Typeform logic jumps | M14, M47; no start screen |
| Choices | Other, none, exclusive, carry-forward, from URL, cascading | SurveyJS, XLSForm `choice_filter` | M43, M45; no other/none/exclusive or shared lists |
| Repeats | Dynamic panels and matrices, nested repeats | SurveyJS, XLSForm | M5 and M6 done without nesting, files in repeats or added rows |
| Field capture | GPS, map, barcode, photo, audio, offline | ODK, Kobo, Qualtrics location | Audio/video (M54), offline (M52); no location or barcode |
| Inputs | Masks, phone, address | SurveyJS input masks, Jotform | M49 without masks |
| Presentation | One question at a time, chat | Typeform, Typebot, Tripetto | M19 |
| Localization | Per-string translations, translation tab, machine translation | LimeSurvey (80+), Qualtrics, Jotform | M20 without translation files or machine-translation drafts |
| Accessibility | WCAG 2.0–2.2 AA claims, mostly automated checks | SurveyJS (axe in demos), Qualtrics checker | M25 (axe, ARIA) without WCAG 2.2 specifics or a conformance report |
| After submission | Notifications, autoresponders, approvals, tags, notes, review states | Jotform approvals, ODK review states, Formbricks tags | Webhooks (M29), respondent copy (M50); no owner notifications or response management |
| Data quality | Speeders, straight-liners, duplicates, bots, test data | Qualtrics response quality and test responses | Anti-spam (M35); no quality flags or test responses |
| Analytics | Charts, filters, cross-tabs, drop-off, AI text analysis | Qualtrics Stats iQ, SurveyMonkey | M27, M59–M62 without significance tests or anonymity thresholds |
| Distribution | Links, embeds, email, SMS, QR, in-app targeting, kiosks | Qualtrics, Formbricks targeting | M30, M56–M58 without SMS or kiosk mode |
| Access | One response per account, organisation-only | Google and Microsoft Forms | M32 one per browser only |
| Security and privacy | SOC 2, GDPR, HIPAA tiers, SSO, encryption | ODK encryption, Qualtrics certifications | Phase 8 is stronger than most open-source tools |
| Licence | Open core (AGPL + enterprise) or MIT runner + paid builder | — | MIT for everything, including editor and dashboard |

**Where Kvesto is already ahead or distinctive.** MIT editor and dashboard (SurveyJS charges for both; Formbricks and
OpnForm gate enterprise code); conditions stored as data, validated on the server with the same functions as the
runner; a published JSON Schema and OpenAPI contract; a security phase (limits, outbound URL guard, upload checks,
audit log, fuzzing) that open-source tools rarely document; planned end-to-end encryption comparable to ODK's;
typed answers (M71), a survey linter (M72) and an MCP server (M73).

---

## Part 4 · What this means for Kvesto's roadmap

### Already covered well

These features appear across the field and the roadmap already plans them with enough detail: expression engine
(M11), piping (M12), calculated values (M13), triggers (M14), custom question types (M15), content blocks (M16),
slider, tags and image choice (M17), signature (M18), one question at a time (M19), partial responses (M21), hidden
fields (M22), themes (M23), quiz mode (M24), web component and wrappers (M26), table view and filters (M27), CSV and
Excel export (M28), webhooks (M29), embeds (M30), availability windows (M32), the whole security and privacy phase
(M33–M41), randomization (M42), carry-forward (M43), loop and merge (M44), remote and cascading choices (M45), quotas
(M46), score presets (M48), RTL (M51), offline (M52), payments and scheduling (M53), audio and video (M54), research
question types (M55), invitations (M56), in-app targeting (M57), cross-tabs and funnels (M59), text analysis (M60),
statistical exports (M62), versions (M63), templates (M64), AI authoring (M65), importers (M66), collaboration (M67),
storage adapters (M68), integrations (M69), UI kits (M70).

### Missing or weak: proposed changes

Each item names the tools it comes from and the roadmap change it led to. All of them were accepted on 2026-11-27;
`ROADMAP.md` has the final wording (the new milestones are in its "Beyond M73" section).

**New milestones**

| Gap | Seen in | Proposed |
| --- | --- | --- |
| "Other (please specify)" with a text box, exclusive "None of the above", "Select all", per-choice `visibleIf`/`enableIf`, survey-level shared choice lists | SurveyJS (exclusive options, per-choice comments, `choicesVisibleIf`), XLSForm (choices sheet, `choice_filter`), Qualtrics, LimeSurvey (list with comment) | New **M74 · Choice options and per-choice logic** |
| Nested repeats, file questions inside repeats, respondent-added grid rows, repeats shown as a table | SurveyJS dynamic panel and dynamic matrix, XLSForm nested repeats, Form.io data grid | New **M75 · Finishing the containers** (picks up the "Not yet" notes on M5 and M6 without changing their status) |
| Location (point, map pin, area), barcode and QR scanning, photo capture, map view of results | ODK and KoboToolbox (`geopoint`, `geotrace`, `geoshape`, `barcode`, `image`), Qualtrics location selector and map | New **M76 · Location, scanning and photo capture** |
| Test responses: generate valid random responses, mark preview and test submissions, exclude them from results | Qualtrics test responses †, SurveyJS-style preview in every builder | New **M77 · ★ Test responses** |
| Review status, tags, internal notes, assignments, admin edits kept as revisions, approval steps | ODK Central review states †, KoboToolbox validation status †, Jotform approvals, Formbricks tags † | New **M78 · ★ Response management and approvals** |
| Response quality flags: speeders, straight-lining, duplicates, low-effort text, failed attention checks | Qualtrics response quality and ExpertReview | New **M79 · ★ Response quality flags** |

**Edits to planned milestones**

| Milestone | Change | Seen in |
| --- | --- | --- |
| M13 | Add `defaultValue` and `defaultExpr`, `readOnly`, `enableIf`, and `resetIf` (clear an answer when a condition becomes true) | SurveyJS (`enableIf`, `setValueIf`, `defaultValueExpression` †), Form.io |
| M20 | Translation files (CSV and XLIFF export and import), a `translate` host hook for machine-translated drafts marked for review, locale-aware number and date formatting, locale from URL or browser | LimeSurvey, Qualtrics †, Jotform auto-translate †, SurveyJS translation tab † |
| M24 | Feedback text for correct and wrong answers, partial credit, and releasing scores after manual review | Google Forms †, Microsoft Forms † |
| M25 | Target WCAG 2.2 AA by name, `autocomplete` tokens on personal-data inputs (1.3.5), an error summary with links, target size and focus-not-obscured checks, a high-contrast theme preset, manual screen-reader passes, and an accessibility conformance report per release | SurveyJS (Contrast theme, axe), LimeSurvey (WCAG 2.2 claim), Form.io (no VPAT), Qualtrics checker † |
| M32 | Respondent identity from the host, so "one response per signed-in user" and "signed-in users only" are enforced by the server | Google Forms †, Microsoft Forms † |
| M47 | Add a start (welcome) screen next to the end screens | Typeform †, Formbricks †, Tally † |
| M49 | Input masks (pattern, numeric with separators, currency, date) with the unmasked value stored | SurveyJS input masks †, Jotform †, Form.io currency † |
| M50 | Owner notification emails on new responses and respondent autoresponders through `sendMail`, respecting PII masking | Jotform, Tally †, Google Forms †, Formbricks workflows |
| M52 | Kiosk mode: restart after completion, reset after inactivity, no resume across respondents | SurveyMonkey Anywhere †, Qualtrics offline app † |
| M56 | Message channels beyond email (an SMS adapter example) | Qualtrics †, SurveyMonkey † |
| M57 | A global recontact waiting period across surveys for the same user | Formbricks recontact rules † |
| M59 | Significance tests on cross-tabs, base sizes, and trends over time for score metrics | Qualtrics Stats iQ †, SurveyMonkey cross-tabs |
| M61 | An anonymity threshold: shared reports hide any breakdown with fewer than N responses | Qualtrics employee experience † |
| M72 | Run the lint rules live in the editor as an issues panel, with survey-design hints (unbalanced scales, missing "none" option, long matrices on mobile) | Qualtrics survey issues and tips |

**Considered and left out**

- **Per-question JavaScript** (Qualtrics, Alchemer, Typebot, Form.io). It breaks the "conditions are data" rule and
  server parity. Custom question types (M15), custom validators (done) and custom functions (M11) cover the needs
  without putting code in survey documents.
- **A chat-style presentation** (Typebot, Tripetto). M19 delivers the conversational benefit; a chat skin can be a
  theme or a custom renderer on `SurveyModel` later.
- **A hosted SaaS with certifications** (SOC 2, ISO 27001, HIPAA BAAs). These belong to whoever hosts Kvesto. The
  security phase gives deployers the controls; certifications are not a library feature.
- **Respondent panels and benchmarks** (Qualtrics, SurveyMonkey). They need a business with respondents and data,
  not a library.
- **PDF form overlays** (Form.io, Jotform). Print stylesheets (M28) and display mode (M50) cover printing; filling
  existing PDFs is a separate product.
