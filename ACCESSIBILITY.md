# Accessibility

Kvesto aims for **WCAG 2.2 level AA** in the survey runner (`@kvesto/core`), the editor and the dashboard. This page
says how that is checked, how to use everything with a keyboard, and where Kvesto stands against each criterion.

## How it is checked

- **Automated, on every test run:** [axe-core](https://github.com/dequelabs/axe-core) runs over a survey with every
  question type (with and without errors showing) and over every editor tab. The tests fail on any violation.
  Colour contrast is not part of these runs: the test DOM has no layout or computed colours, so contrast is
  checked by hand against the themes (see below).
- **By hand, before each minor release:** a pass with NVDA (Firefox, Windows) and VoiceOver (Safari, macOS and iOS)
  over the same fixtures: every question type, the error summary, the question layout, ranking, signature, repeats,
  and the editor's outline and logic builder. **This pass has not been done yet for the current development
  version;** results will be recorded below with the release.

## Keyboard

### Survey runner

| Where | Keys |
| --- | --- |
| Everywhere | Tab / Shift+Tab move between fields and buttons. Enter in a text field goes to the next page (or step). |
| Choices, ratings, yes/no | Arrow keys move between options of a group, Space picks. |
| One question at a time | Enter goes on; number keys 1–9 pick the nth option (or that rating value); a one-click answer moves on by itself unless `autoAdvance` is off. |
| Ranking | Each item has Move up / Move down buttons; the new position is announced. Dragging is optional. |
| Signature | Type your full name in the field under the pad instead of drawing. |
| Tags | Type, then Enter (or a comma) adds; each tag has a Remove button. |
| Error summary | After a failed submit, focus moves to the summary; each entry is a link to its field. |

### Editor

| Where | Keys |
| --- | --- |
| Outline | Move up / Move down / Duplicate / Delete buttons on each element. Keyboard drag and drop: Space picks an element up, arrow keys move it, Space drops, Escape cancels; every move is announced. |
| Undo and redo | Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. |
| Logic builder | Every rule is a set of ordinary selects, inputs and buttons. |

## Conformance report

In the style of a VPAT (Accessibility Conformance Report). "Supports" means the criterion is met by design and
covered by the automated checks; nothing here has been verified by an independent audit.

| Criterion | Level | Status | Remarks |
| --- | --- | --- | --- |
| 1.1.1 Non-text content | A | Supports | Images need `alt` (empty only for decorative ones); image choices use their label; the signature pad has a text alternative. |
| 1.3.1 Info and relationships | A | Supports | Questions are fieldsets with legends; matrices and grids are tables with row and column headers; errors are tied to inputs with `aria-describedby`. |
| 1.3.2 Meaningful sequence | A | Supports | Document order is reading order. |
| 1.3.5 Identify input purpose | AA | Supports | `autocomplete` on text questions; email, phone and URL inputs get one by default. Survey authors set it for names and addresses. |
| 1.4.1 Use of colour | A | Supports | Errors and quiz results use text as well as colour. |
| 1.4.3 Contrast (minimum) | AA | Partially supports | The light, dark and contrast themes are designed for 4.5:1 text contrast; custom themes are the author's responsibility. Not machine-checked yet. |
| 1.4.10 Reflow | AA | Supports | Single column; tables scroll inside their own box. |
| 1.4.11 Non-text contrast | AA | Partially supports | Borders in the light theme are light; use the `contrast` preset where this matters. |
| 2.1.1 Keyboard | A | Supports | Everything works without a mouse, drawing a signature included (typed alternative). |
| 2.2.1 Timing adjustable | A | Partially supports | Quiz time limits are set by the author and can't be extended by the respondent. Use them only where timing is essential (for example exams). |
| 2.4.3 Focus order | A | Supports | Focus follows the document; the question layout moves focus to each new step. |
| 2.4.6 Headings and labels | AA | Supports | |
| 2.4.7 Focus visible | AA | Supports | A focus outline in the theme's primary colour. |
| 2.4.11 Focus not obscured (minimum) | AA | Supports | Nothing is sticky or overlaid. |
| 2.5.7 Dragging movements | AA | Supports | Ranking and the editor outline have buttons and keyboard moves. |
| 2.5.8 Target size (minimum) | AA | Supports | Buttons, radios and checkboxes are at least 24 by 24 CSS pixels with their labels. |
| 3.1.1 / 3.1.2 Language | A / AA | Supports | The survey element carries `lang` for its locale; the host page sets its own. |
| 3.3.1 Error identification | A | Supports | Each error is shown next to its field and in a summary. |
| 3.3.2 Labels or instructions | A | Supports | |
| 3.3.3 Error suggestion | AA | Supports | Messages say what to enter (in the respondent's language). |
| 3.3.7 Redundant entry | A | Supports | Answers stay when moving between pages; piping and defaults avoid asking twice. |
| 3.3.8 Accessible authentication | AA | Not applicable | The runner has no login. |
| 4.1.2 Name, role, value | A | Supports | Native controls; custom ones (ranking, tags, slider "not set", signature) carry labels and state. |
| 4.1.3 Status messages | AA | Supports | Upload status, ranking moves and the completion message use live regions. |

## Known gaps

- The manual screen reader pass described above.
- Colour contrast is not checked automatically.
- The dashboard's charts are bars with numbers next to them; there is no table view of the same data yet (planned
  with M27).
