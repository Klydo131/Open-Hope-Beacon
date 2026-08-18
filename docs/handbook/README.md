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

## Rebuilding

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
