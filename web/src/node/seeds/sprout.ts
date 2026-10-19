import type { RepoSeed } from "./types";

const readme = `# sprout

A static site generator small enough to read in one sitting. Point it at a
folder of Markdown files, get a folder of HTML pages.

    pip install sprout
    sprout content -o site

There are no themes, plugins or config files. If you need those, you have
outgrown sprout, and that's fine.

## Templates

Pages are rendered into a single HTML template. \`{{ title }}\` and
\`{{ content }}\` are replaced; anything else in double braces becomes an
empty string. The built-in template is deliberately plain.

## Development

    python -m venv .venv && . .venv/bin/activate
    pip install -e . pytest
    pytest
`;

const pyproject = `[project]
name = "sprout"
version = "0.1.0"
description = "A very small static site generator"
readme = "README.md"
requires-python = ">=3.10"
license = "MIT"
authors = [{ name = "ada" }]
dependencies = ["markdown>=3.5"]

[project.scripts]
sprout = "sprout.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`;

const initPy = `"""sprout: a very small static site generator."""

__version__ = "0.1.0"
`;

const cliPy = `import argparse
import sys
from pathlib import Path

from . import __version__
from .build import build


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sprout", description="Build a static site from Markdown.")
    parser.add_argument("src", nargs="?", default="content", type=Path)
    parser.add_argument("-o", "--out", default="site", type=Path)
    parser.add_argument("--version", action="version", version=f"sprout {__version__}")
    args = parser.parse_args(argv)

    if not args.src.is_dir():
        print(f"sprout: {args.src} is not a directory", file=sys.stderr)
        return 1
    written = build(args.src, args.out)
    print(f"built {len(written)} pages into {args.out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

const buildPy = String.raw`"""Turn a directory of Markdown files into a directory of HTML pages."""

from dataclasses import dataclass
from pathlib import Path

import markdown

from . import templates


@dataclass
class Page:
    source: Path
    title: str
    body: str


def read_page(path: Path) -> Page:
    text = path.read_text(encoding="utf-8")
    title = path.stem.replace("-", " ").title()
    first = text.split("\n", 1)[0]
    if first.startswith("# "):
        title = first[2:].strip()
    return Page(source=path, title=title, body=markdown.markdown(text))


def build(src: Path, out: Path, template: str = templates.DEFAULT) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for path in sorted(src.glob("*.md")):
        page = read_page(path)
        target = out / (path.stem + ".html")
        target.write_text(
            templates.render(template, title=page.title, content=page.body),
            encoding="utf-8",
        )
        written.append(target)
    return written
`;

const buildPyFrontMatter = String.raw`"""Turn a directory of Markdown files into a directory of HTML pages."""

from dataclasses import dataclass, field
from pathlib import Path

import markdown

from . import templates


@dataclass
class Page:
    source: Path
    title: str
    body: str
    meta: dict[str, str] = field(default_factory=dict)


def split_front_matter(text: str) -> tuple[dict[str, str], str]:
    """Split "key: value" lines between two --- fences off the top of text."""
    if not text.startswith("---\n"):
        return {}, text
    head, sep, rest = text[4:].partition("\n---\n")
    if not sep:
        return {}, text
    meta = {}
    for line in head.splitlines():
        key, colon, value = line.partition(":")
        if colon:
            meta[key.strip().lower()] = value.strip()
    return meta, rest


def read_page(path: Path) -> Page:
    meta, text = split_front_matter(path.read_text(encoding="utf-8"))
    title = meta.get("title") or path.stem.replace("-", " ").title()
    first = text.split("\n", 1)[0]
    if "title" not in meta and first.startswith("# "):
        title = first[2:].strip()
    return Page(source=path, title=title, body=markdown.markdown(text), meta=meta)


def build(src: Path, out: Path, template: str = templates.DEFAULT) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for path in sorted(src.rglob("*.md")):
        page = read_page(path)
        target = out / path.relative_to(src).with_suffix(".html")
        target.parent.mkdir(parents=True, exist_ok=True)
        values = {**page.meta, "title": page.title, "content": page.body}
        target.write_text(templates.render(template, **values), encoding="utf-8")
        written.append(target)
    return written
`;

const templatesPy = String.raw`"""Tiny template substitution: {{ name }} is replaced with the value of name."""

import re

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")

DEFAULT = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ title }}</title>
</head>
<body>
<main>
{{ content }}
</main>
</body>
</html>
"""


def render(template: str, **values: str) -> str:
    return _VAR.sub(lambda m: values.get(m.group(1), ""), template)
`;

const testBuildPy = String.raw`from pathlib import Path

from sprout.build import build, read_page


def test_title_from_heading(tmp_path: Path):
    p = tmp_path / "hello.md"
    p.write_text("# Hello, world\n\nFirst post.\n")
    assert read_page(p).title == "Hello, world"


def test_title_from_filename(tmp_path: Path):
    p = tmp_path / "garden-notes.md"
    p.write_text("No heading here.\n")
    assert read_page(p).title == "Garden Notes"


def test_build_writes_one_page_per_file(tmp_path: Path):
    src = tmp_path / "content"
    src.mkdir()
    (src / "index.md").write_text("# Home\n")
    (src / "about.md").write_text("# About\n")
    written = build(src, tmp_path / "site")
    assert sorted(p.name for p in written) == ["about.html", "index.html"]
`;

const license = `MIT License

Copyright (c) 2025 ada

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const staticTest = String.raw`


def test_copies_static_files(tmp_path: Path):
    src = tmp_path / "content"
    (src / "img").mkdir(parents=True)
    (src / "img" / "beans.jpg").write_bytes(b"\xff\xd8\xff")
    (src / "style.css").write_text("body { max-width: 40em }\n")
    (src / ".DS_Store").write_bytes(b"\x00")
    build(src, tmp_path / "site")
    assert (tmp_path / "site" / "img" / "beans.jpg").read_bytes() == b"\xff\xd8\xff"
    assert (tmp_path / "site" / "style.css").exists()
    assert not (tmp_path / "site" / ".DS_Store").exists()
`;

export const sprout: RepoSeed = {
  owner: { person: "ada" },
  name: "sprout",
  description: "A static site generator small enough to read in one sitting.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["ada"],
  threshold: 1,
  seeding: 9,
  files: {
    "README.md": readme,
    "pyproject.toml": pyproject,
    "sprout/__init__.py": initPy,
    "sprout/cli.py": cliPy,
    "sprout/build.py": buildPy,
    "sprout/templates.py": templatesPy,
    "tests/test_build.py": testBuildPy,
    LICENSE: license,
  },
  root: {
    label: "root",
    message: `Initial commit

Markdown in, HTML out, one template. Written on a train to rebuild my
garden notes without installing half a package index.`,
    author: "ada",
    daysAgo: 212,
  },
  history: [
    {
      label: "nested",
      message: `Build Markdown files in subdirectories

content/notes/compost.md now becomes site/notes/compost.html instead of
being silently skipped.`,
      author: "ada",
      daysAgo: 196,
      changes: {
        "sprout/build.py": [
          ['src.glob("*.md")', 'src.rglob("*.md")'],
          [
            '        target = out / (path.stem + ".html")\n',
            '        target = out / path.relative_to(src).with_suffix(".html")\n        target.parent.mkdir(parents=True, exist_ok=True)\n',
          ],
        ],
        "tests/test_build.py": [
          [
            '== ["about.html", "index.html"]\n',
            String.raw`== ["about.html", "index.html"]


def test_build_keeps_directory_structure(tmp_path: Path):
    src = tmp_path / "content"
    (src / "notes").mkdir(parents=True)
    (src / "notes" / "compost.md").write_text("# Compost\n")
    build(src, tmp_path / "site")
    assert (tmp_path / "site" / "notes" / "compost.html").exists()
`,
          ],
        ],
      },
    },
    {
      label: "template-flag",
      message: `cli: add --template

Lets you swap the built-in template for your own file without writing
any Python.`,
      author: "ada",
      daysAgo: 171,
      changes: {
        "sprout/cli.py": [
          [
            "from .build import build\n",
            "from .build import build\nfrom .templates import DEFAULT\n",
          ],
          [
            '    parser.add_argument("-o", "--out", default="site", type=Path)\n',
            '    parser.add_argument("-o", "--out", default="site", type=Path)\n    parser.add_argument("-t", "--template", type=Path, help="HTML file with {{ title }} and {{ content }} slots")\n',
          ],
          [
            "    written = build(args.src, args.out)",
            '    template = args.template.read_text(encoding="utf-8") if args.template else DEFAULT\n    written = build(args.src, args.out, template)',
          ],
        ],
        "README.md": [
          [
            "empty string. The built-in template is deliberately plain.\n",
            "empty string. The built-in template is deliberately plain; use your own\nwith `sprout content -t page.html`.\n",
          ],
        ],
      },
    },
    {
      label: "frontmatter",
      message: `Read front matter from the top of pages

A block of "key: value" lines between --- fences sets the title and
any other values the template wants, e.g. {{ date }}. No YAML: values
are plain strings, which is all a template can use anyway.`,
      author: "ada",
      daysAgo: 140,
      changes: {
        "sprout/build.py": buildPyFrontMatter,
        "tests/test_build.py": [
          [
            "def test_build_writes_one_page_per_file(",
            String.raw`def test_front_matter_sets_title_and_meta(tmp_path: Path):
    p = tmp_path / "beans.md"
    p.write_text("---\ntitle: Runner beans\ndate: 2025-06-01\n---\n# Ignored heading\n")
    page = read_page(p)
    assert page.title == "Runner beans"
    assert page.meta["date"] == "2025-06-01"


def test_build_writes_one_page_per_file(`,
          ],
        ],
      },
    },
    {
      label: "copy-static",
      message: `Copy static files into the output

Anything that isn't Markdown (images, CSS, a favicon) is copied to the
same relative path under the output directory. Hidden files and
directories are skipped so .DS_Store and editor swap files stay out of
the published site.`,
      author: "self",
      daysAgo: 113,
      changes: {
        "sprout/build.py": [
          [
            "from dataclasses import dataclass, field\n",
            "import shutil\nfrom dataclasses import dataclass, field\n",
          ],
          [
            "        written.append(target)\n",
            `        written.append(target)
    for path in sorted(src.rglob("*")):
        rel = path.relative_to(src)
        if path.is_dir() or path.suffix == ".md" or any(p.startswith(".") for p in rel.parts):
            continue
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
`,
          ],
        ],
        "tests/test_build.py": [
          [
            '/ "compost.html").exists()\n',
            '/ "compost.html").exists()\n' + staticTest,
          ],
        ],
      },
    },
    {
      label: "copy-static-readme",
      message: "README: mention static files",
      author: "self",
      daysAgo: 113,
      changes: {
        "README.md": [
          [
            "## Templates\n",
            "Everything else in the source folder (images, stylesheets, fonts) is\ncopied across unchanged. Files and folders starting with a dot are skipped.\n\n## Templates\n",
          ],
        ],
      },
    },
    {
      label: "bump-0.2.0",
      message: `Release 0.2.0

Nested folders, --template, front matter and static file copying.`,
      author: "ada",
      daysAgo: 104,
      changes: {
        "sprout/__init__.py": [
          ['__version__ = "0.1.0"', '__version__ = "0.2.0"'],
        ],
        "pyproject.toml": [['version = "0.1.0"', 'version = "0.2.0"']],
      },
    },
    {
      label: "escape-title",
      message: `Escape the title before putting it in the template

A page called "Beans & Peas" produced invalid HTML in <title>. The body
is already HTML from the Markdown renderer, so only the title needs it.`,
      author: "ada",
      daysAgo: 82,
      changes: {
        "sprout/build.py": [
          ["import shutil\n", "import html\nimport shutil\n"],
          ['"title": page.title,', '"title": html.escape(page.title),'],
        ],
        "tests/test_build.py": [
          [
            "def test_build_keeps_directory_structure(",
            String.raw`def test_title_is_escaped(tmp_path: Path):
    src = tmp_path / "content"
    src.mkdir()
    (src / "beans.md").write_text("# Beans & Peas\n")
    build(src, tmp_path / "site")
    assert "<title>Beans &amp; Peas</title>" in (tmp_path / "site" / "beans.html").read_text()


def test_build_keeps_directory_structure(`,
          ],
        ],
      },
    },
    {
      label: "drafts",
      message: `Skip pages marked as drafts

"draft: true" (or "yes") in the front matter leaves the page out of
the build, so half-written notes can live next to published ones.`,
      author: "ada",
      daysAgo: 51,
      changes: {
        "sprout/build.py": [
          [
            "        page = read_page(path)\n",
            '        page = read_page(path)\n        if page.meta.get("draft", "").lower() in ("true", "yes"):\n            continue\n',
          ],
        ],
        "tests/test_build.py": [
          [
            "def test_copies_static_files(",
            String.raw`def test_drafts_are_skipped(tmp_path: Path):
    src = tmp_path / "content"
    src.mkdir()
    (src / "done.md").write_text("# Done\n")
    (src / "wip.md").write_text("---\ndraft: true\n---\n# Not yet\n")
    written = build(src, tmp_path / "site")
    assert [p.name for p in written] == ["done.html"]


def test_copies_static_files(`,
          ],
        ],
      },
    },
    {
      label: "readme-fm",
      message: `README: document front matter and drafts`,
      author: "ada",
      daysAgo: 19,
      changes: {
        "README.md": [
          [
            "## Development\n",
            `## Front matter

Start a page with \`key: value\` lines between \`---\` fences:

    ---
    title: Runner beans
    date: 2025-06-01
    draft: true
    ---

\`title\` overrides the first heading, \`draft: true\` keeps the page out of
the build, and every key is available to the template as \`{{ key }}\`.

## Development
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Pages in subfolders are ignored",
      author: "oskar",
      daysAgo: 203,
      body: "I keep notes in `content/notes/` and `content/recipes/`, and sprout only builds the top level. No warning either, they just don't appear in `site/`.",
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 170,
      comments: [
        {
          author: "ada",
          body: "That's `glob` vs `rglob`, my mistake. Fixed on main, the folder structure is mirrored in the output now.",
          hoursAfter: 170,
          reactions: [{ emoji: "🌱", by: ["oskar"] }],
        },
      ],
    },
    {
      title: "Images and CSS aren't copied to the output",
      author: "lena",
      daysAgo: 121,
      body: "If a page references `img/beans.jpg` next to the Markdown file, the built page has a broken image because only `.html` files end up in `site/`. I've been copying assets with a separate `rsync` step, which feels like something sprout should do.",
      labels: ["enhancement"],
      state: "solved",
      closedHoursAfter: 200,
      comments: [
        {
          author: "ada",
          body: "Agreed, this is in scope. Anyone want to pick it up? It should be a small change in `build()`.",
          hoursAfter: 20,
        },
        {
          author: "self",
          body: "I'll take it, I hit the same thing last week.",
          hoursAfter: 26,
          reactions: [{ emoji: "🙏", by: ["ada", "lena"] }],
        },
        {
          author: "ada",
          body: "Merged, thanks! Will go out in 0.2.0.",
          hoursAfter: 200,
        },
      ],
    },
    {
      title: "Titles with & produce invalid HTML",
      author: "yuki",
      daysAgo: 86,
      body: "A page titled `Beans & Peas` ends up as `<title>Beans & Peas</title>`. Browsers cope, but the validator I run in CI doesn't.",
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 90,
    },
    {
      title: "Watch mode",
      author: "sol",
      daysAgo: 24,
      body: "A `sprout --watch` that rebuilds when something in the source folder changes would make writing a lot nicer. Right now I have it bound to a key in my editor.",
      labels: ["enhancement"],
      comments: [
        {
          author: "ada",
          body: "I'd be open to it if it stays dependency-free. Polling mtimes once a second is fine for sites this size; I don't want to pull in a file-watching library.",
          hoursAfter: 9,
        },
        {
          author: "tomas",
          body: "A full rebuild of my 140-page site takes 0.3s, so rebuild-everything-on-any-change would be plenty.",
          hoursAfter: 30,
          replyTo: 0,
          reactions: [{ emoji: "👍", by: ["ada", "sol"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "Copy static files into the output",
      author: "self",
      daysAgo: 115,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "Closes the issue about images and CSS. After building pages, every non-Markdown file is copied to the same relative path under the output directory.",
          hoursAfter: 0,
          base: "frontmatter",
          commits: [
            {
              label: "static-r1",
              message: `Copy static files into the output

Anything that isn't Markdown is copied to the same relative path under
the output directory.`,
              author: "self",
              daysAgo: 115,
              changes: {
                "sprout/build.py": [
                  [
                    "from dataclasses import dataclass, field\n",
                    "import shutil\nfrom dataclasses import dataclass, field\n",
                  ],
                  [
                    "        written.append(target)\n",
                    `        written.append(target)
    for path in sorted(src.rglob("*")):
        if path.is_dir() or path.suffix == ".md":
            continue
        target = out / path.relative_to(src)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ada",
              hoursAfter: 10,
              summary: "Thanks for picking this up! Close, two requests.",
              comments: [
                {
                  body: "This will happily copy `.DS_Store`, `.git/` if someone keeps the content folder in its own repo, and editor swap files. Could we skip anything with a dot-prefixed path component?",
                  path: "sprout/build.py",
                  line: 55,
                },
                {
                  body: "A test would be nice, including one hidden file so the skipping doesn't regress.",
                  path: "sprout/build.py",
                  line: 54,
                  endLine: 59,
                },
              ],
            },
          ],
        },
        {
          description:
            "Skips hidden files and directories, adds a test covering nested assets and `.DS_Store`, and mentions static files in the README.",
          hoursAfter: 30,
          fromHistory: ["copy-static", "copy-static-readme"],
          reviews: [
            {
              author: "ada",
              hoursAfter: 46,
              verdict: "accept",
              summary: "Lovely. Merging.",
              comments: [
                {
                  body: "Nice, `rel.parts` catches hidden directories as well as hidden files.",
                  path: "sprout/build.py",
                  line: 56,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "templates: support {% include %}",
      author: "oskar",
      daysAgo: 95,
      labels: ["enhancement"],
      state: "archived",
      revisions: [
        {
          description:
            'Lets a template pull in another file, e.g. `{% include "nav.html" %}`, so a header and footer can be shared between a few templates. Paths are relative to the template\'s directory; nesting is capped at 8 levels.',
          hoursAfter: 0,
          base: "bump-0.2.0",
          commits: [
            {
              label: "include-1",
              message: `templates: add {% include "file" %}

Includes are expanded before variable substitution, so included files
can use {{ title }} and friends too.`,
              author: "oskar",
              daysAgo: 95,
              changes: {
                "sprout/templates.py": [
                  ["import re\n", "import re\nfrom pathlib import Path\n"],
                  [
                    "def render(",
                    String.raw`_INCLUDE = re.compile(r'\{%\s*include\s+"([^"]+)"\s*%\}')


def expand_includes(template: str, root: Path, depth: int = 0) -> str:
    if depth > 8:
        raise ValueError("templates: includes nested more than 8 levels deep")
    return _INCLUDE.sub(
        lambda m: expand_includes((root / m.group(1)).read_text(encoding="utf-8"), root, depth + 1),
        template,
    )


def render(`,
                  ],
                ],
                "sprout/cli.py": [
                  [
                    "from .templates import DEFAULT\n",
                    "from .templates import DEFAULT, expand_includes\n",
                  ],
                  [
                    'args.template.read_text(encoding="utf-8") if args.template else DEFAULT',
                    'expand_includes(args.template.read_text(encoding="utf-8"), args.template.parent) if args.template else DEFAULT',
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "ada",
              body: "Thanks for this, and it's neatly done. I've gone back and forth on it, but I'd like sprout's templates to stay as plain substitution: once there's include, the next requests are blocks and loops, and then it's a template language. For shared headers I'd generate the template with `cat header.html page.html footer.html > template.html` in a Makefile. Archiving, but I'm happy to be argued with.",
              hoursAfter: 28,
            },
            {
              author: "oskar",
              body: "Fair, that's the whole pitch of the project. The cat approach works fine for my three templates.",
              hoursAfter: 33,
              replyTo: 0,
              reactions: [{ emoji: "❤️", by: ["ada"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Generate an index page when there isn't one",
      author: "tomas",
      daysAgo: 6,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "If the source folder has no `index.md`, write an `index.html` that links to every built page, newest first by `date` front matter. Pages without a date go at the end. An existing `index.md` always wins.",
          hoursAfter: 0,
          base: "readme-fm",
          commits: [
            {
              label: "index-1",
              message: `Write an index page when the site has none

Lists every built page, newest first by the date front matter value.`,
              author: "tomas",
              daysAgo: 6,
              changes: {
                "sprout/build.py": [
                  [
                    "    written = []\n",
                    "    written = []\n    listed: list[tuple[str, Page]] = []\n",
                  ],
                  [
                    "        written.append(target)\n",
                    "        written.append(target)\n        listed.append((target.relative_to(out).as_posix(), page))\n",
                  ],
                  [
                    "    return written\n",
                    String.raw`    if not (src / "index.md").exists():
        written.append(write_index(out, listed, template))
    return written


def write_index(out: Path, listed: list[tuple[str, Page]], template: str) -> Path:
    """Write an index.html linking to every page, newest first by date."""
    listed = sorted(listed, key=lambda item: item[1].meta.get("date", ""), reverse=True)
    items = "\n".join(
        f'<li><a href="{href}">{html.escape(page.title)}</a></li>' for href, page in listed
    )
    target = out / "index.html"
    target.write_text(
        templates.render(template, title="Index", content=f"<ul>\n{items}\n</ul>"),
        encoding="utf-8",
    )
    return target
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "ada",
              hoursAfter: 15,
              summary:
                "I like it, and it's a nice default for small sites. A few thoughts.",
              comments: [
                {
                  body: "Sorting by the raw string only works for ISO dates. That's what the README example uses, but let's say so in the docs, or someone with `date: 3 June` will get a confusing order.",
                  path: "sprout/build.py",
                  line: 73,
                },
                {
                  body: 'Could the index title come from somewhere other than a hard-coded "Index"? Even just the source folder\'s name would read better in a browser tab.',
                  path: "sprout/build.py",
                  line: 79,
                },
                {
                  body: "This makes `sprout` report one more page than there are Markdown files, which surprised me in the CLI output. Probably fine, but worth a line in the commit message.",
                  path: "sprout/build.py",
                  line: 67,
                },
              ],
            },
          ],
          comments: [
            {
              author: "yuki",
              body: "Would love this. Right now my index.md is a hand-maintained list that's always two posts behind.",
              hoursAfter: 20,
              reactions: [{ emoji: "😄", by: ["tomas"] }],
            },
            {
              author: "tomas",
              body: "Thanks! I'll document the ISO date expectation and use the folder name for the title. Leaving the page count as is unless you'd rather exclude it.",
              hoursAfter: 26,
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v0.2.0",
      at: "bump-0.2.0",
      title: "sprout 0.2.0",
      notes: `- Markdown files in subfolders are built, mirroring the folder structure
- \`--template\` to use your own HTML template
- Front matter: \`key: value\` lines between \`---\` fences set the title and template values
- Static files (images, CSS) are copied into the output, hidden files skipped. Thanks to everyone who asked for this, and to the contributor who finally wrote it.`,
      author: "ada",
      daysAgo: 103,
      artifacts: [
        { name: "sprout-0.2.0-py3-none-any.whl", sizeBytes: 6_214 },
        { name: "sprout-0.2.0.tar.gz", sizeBytes: 5_873 },
      ],
    },
  ],
};
