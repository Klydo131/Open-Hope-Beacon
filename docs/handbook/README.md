# The two handbooks

Word documents, generated from the scripts here, for people who are not going to
read a repository:

| Script | Produces | For |
|---|---|---|
| `build-handbook.js` | Installation & Contribution Handbook | The IT person standing up an instance |
| `build-ai-guide.js` | Building It With an AI Assistant | Developers using Claude, Codex, Cursor or similar |

## Why .docx and not more markdown

The repository already documents all of this, and anybody comfortable here does
not need these files. They exist for the other audience: somebody handed a
laptop and told to "look into that church app", who wants a document they can
edit, cut down, add their own hostnames to, and forward to a colleague. Markdown
is not that, and a PDF cannot be edited at all.

Keep them in step with `docs/` when the setup changes — a handbook that
describes last year's install is worse than none.

## The combined PDF — the one to hand out

One file, both halves: setting it up, and using an AI assistant to do the work.
This is what a church's IT volunteer should be given.

```bash
node docs/handbook/build-pdf.js --combine "IT and AI Guide" \
  START-HERE.md AI-SETUP-GUIDE.md EMAIL.md SECURITY.md
```

Lands in `docs/handbook/pdf/`. About 31 A4 pages.

It is rendered **from the Markdown already in `docs/`**, not from a separate
source. That is the whole point: a combined document written by hand would be a
third copy to keep in step, and the copy that fell behind would be the one
printed and handed to a church. Change the Markdown; rebuild; the PDF cannot
disagree with the repository.

## Rebuilding the Word handbooks

```bash
cd docs/handbook
npm install docx
node build-handbook.js
node build-ai-guide.js
```

To preview without Word:

```bash
soffice --headless --convert-to pdf Open-Hope-Beacon-Handbook.docx
```

The generated `.docx` files are deliberately **not** committed — they are build
output, and a binary that drifts from its source is a document nobody can trust.
