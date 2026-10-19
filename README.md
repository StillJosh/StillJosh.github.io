# StillJosh.github.io

Personal page, plain Jekyll (no theme), built by GitHub Pages.

## Edit

| What | Where |
|---|---|
| Name, position, photo, links | `_config.yml` |
| About text | `index.md` |
| Publications | `_data/publications.yml` (`selected: true` → home page, `blog:` → link to a note) |
| Styles | `assets/css/main.css` |
| Post header animation | `assets/js/flow.js` |

## Posts

New file `_posts/YYYY-MM-DD-title.md`:

```markdown
---
title: My post
---
Text with inline math $$x$$ and display math on its own lines:

$$
\partial_t u = \mathcal{N}(u)
$$
```

Math is rendered with KaTeX. Use `$$...$$` for both inline and display math. Drafts go in `_drafts/`.

## Preview locally

```sh
bundle install
bundle exec jekyll serve --drafts
```

Then open http://localhost:4000.
