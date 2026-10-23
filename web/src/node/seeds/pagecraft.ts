import type { RepoSeed } from "./types";

const readme = `# pagecraft

Turn Markdown into a PDF you'd be happy to print. pagecraft sets
paragraphs with the Knuth–Plass line breaking algorithm, hyphenates with
TeX patterns and embeds real OpenType fonts, so a manuscript comes out
looking like a book rather than a web page.

    cargo install --path .
    pagecraft chapter-1.md -o chapter-1.pdf

## Page templates

Page size, margins and type are set in a small TOML file:

    [page]
    width = "148mm"
    height = "210mm"

    [margins]
    top = "18mm"
    bottom = "22mm"
    inner = "16mm"
    outer = "20mm"

    [text]
    font = "fonts/EBGaramond-Regular.ttf"
    size = 10.5
    leading = 13.5

Pass it with \`--template book.toml\`. Lengths accept \`pt\` and \`mm\`.
Without a template, pagecraft uses a plain A4 page.

## What works

- Paragraphs, headings, code blocks and thematic breaks
- Optimal line breaking with hyphenation (US English)
- TrueType and OpenType (glyf) fonts, embedded in the PDF

## What doesn't, yet

- Images, tables and lists
- More than one font per document

## Development

    cargo test
    cargo run -- examples/sample.md -o /tmp/sample.pdf
`;

const license = `MIT License

Copyright (c) 2025 Quill contributors

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

const cargoToml = String.raw`[package]
name = "pagecraft"
version = "0.1.0"
edition = "2021"
description = "Typeset Markdown into print-quality PDF"
license = "MIT"
repository = "https://quill.example.org/pagecraft"
rust-version = "1.74"

[dependencies]
anyhow = "1"
clap = { version = "4", features = ["derive"] }
pdf-writer = "0.9"
pulldown-cmark = { version = "0.10", default-features = false }
serde = { version = "1", features = ["derive"] }
toml = "0.8"
ttf-parser = "0.20"

[profile.release]
lto = "thin"
`;

const gitignore = `/target
*.pdf
!tests/fixtures/*.pdf
`;

const changelogRoot = `# Changelog

## Unreleased

- Markdown paragraphs, headings and code blocks set with Knuth–Plass
  line breaking and Liang hyphenation.
- Page templates in TOML.
`;

const changelog010 = `# Changelog

## 0.1.0

The first version anyone else should try.

- Markdown paragraphs, headings and code blocks set with Knuth–Plass
  line breaking and Liang hyphenation.
- Page templates in TOML, with lengths in pt, mm, cm or in.
- Folios (page numbers), centred at the foot of the page.
- A5 novel template and a sample chapter in examples/.
- Paragraphs that can't be set within tolerance fall back to a looser
  pass, then to first-fit breaking, instead of aborting.
- Justified lines use per-word positioning, so they are justified in
  every PDF viewer.
`;

const changelog020 = `# Changelog

## 0.2.0

- Footnotes, numbered per chapter and set at the foot of the page that
  cites them.
- Line breaking avoids a very loose line next to a very tight one
  (fitness classes), which removes most visible rivers.
- Kerning from the font's kern table.
- Hyphenation no longer panics on words with non-ASCII letters.
- Much faster on long documents: glyph advances are cached.

## 0.1.0

The first version anyone else should try.

- Markdown paragraphs, headings and code blocks set with Knuth–Plass
  line breaking and Liang hyphenation.
- Page templates in TOML, with lengths in pt, mm, cm or in.
- Folios (page numbers), centred at the foot of the page.
- A5 novel template and a sample chapter in examples/.
- Paragraphs that can't be set within tolerance fall back to a looser
  pass, then to first-fit breaking, instead of aborting.
- Justified lines use per-word positioning, so they are justified in
  every PDF viewer.
`;

const changelog030 = `# Changelog

## 0.3.0

- Widow and orphan control: no single line of a paragraph is left alone
  at the top or bottom of a page.
- Overfull lines are reported on stderr with their page number, like
  TeX's "Overfull hbox" warnings.
- PDFs declare their language and title, so screen readers pick the
  right voice and show the title instead of the file name.
- Hanging punctuation: opening quotes hang into the margin.
- Release binaries for Linux, macOS and Windows.

## 0.2.0

- Footnotes, numbered per chapter and set at the foot of the page that
  cites them.
- Line breaking avoids a very loose line next to a very tight one
  (fitness classes), which removes most visible rivers.
- Kerning from the font's kern table.
- Hyphenation no longer panics on words with non-ASCII letters.
- Much faster on long documents: glyph advances are cached.

## 0.1.0

The first version anyone else should try.

- Markdown paragraphs, headings and code blocks set with Knuth–Plass
  line breaking and Liang hyphenation.
- Page templates in TOML, with lengths in pt, mm, cm or in.
- Folios (page numbers), centred at the foot of the page.
- A5 novel template and a sample chapter in examples/.
- Paragraphs that can't be set within tolerance fall back to a looser
  pass, then to first-fit breaking, instead of aborting.
- Justified lines use per-word positioning, so they are justified in
  every PDF viewer.
`;

const mainRs = String.raw`use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::Parser;

use pagecraft::{layout, markdown, pdf, template::Template};

/// Typeset a Markdown file into a PDF.
#[derive(Parser)]
#[command(version)]
struct Args {
    /// The Markdown file to typeset.
    input: PathBuf,
    /// Where to write the PDF. Defaults to the input name with .pdf.
    #[arg(short, long)]
    output: Option<PathBuf>,
    /// A page template (TOML). Defaults to the built-in A4 template.
    #[arg(short, long)]
    template: Option<PathBuf>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let source = std::fs::read_to_string(&args.input)
        .with_context(|| format!("reading {}", args.input.display()))?;
    let template = match &args.template {
        Some(path) => Template::load(path)?,
        None => Template::default(),
    };
    let blocks = markdown::parse(&source);
    let document = layout::typeset(&blocks, &template)?;
    let output = args.output.unwrap_or_else(|| args.input.with_extension("pdf"));
    std::fs::write(&output, pdf::write(&document, &template))
        .with_context(|| format!("writing {}", output.display()))?;
    eprintln!("{} pages -> {}", document.pages.len(), output.display());
    Ok(())
}
`;

const libRs = String.raw`//! pagecraft: typeset Markdown into print-quality PDF.

pub mod font;
pub mod hyphenate;
pub mod layout;
pub mod linebreak;
pub mod markdown;
pub mod pdf;
pub mod template;
`;

const libRsFootnotes = String.raw`//! pagecraft: typeset Markdown into print-quality PDF.

pub mod font;
pub mod footnotes;
pub mod hyphenate;
pub mod layout;
pub mod linebreak;
pub mod markdown;
pub mod pdf;
pub mod template;
`;

const markdownRs = String.raw`use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Heading { level: u8, text: String },
    Paragraph(String),
    Code(String),
    Break,
}

/// Flattens Markdown into the blocks pagecraft knows how to set. Inline
/// formatting is dropped for now: emphasis needs a second font.
pub fn parse(source: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut text = String::new();
    for event in Parser::new(source) {
        match event {
            Event::Start(Tag::Paragraph | Tag::Heading { .. } | Tag::CodeBlock(_)) => text.clear(),
            Event::Text(t) | Event::Code(t) => text.push_str(&t),
            Event::SoftBreak | Event::HardBreak => text.push(' '),
            Event::End(TagEnd::Paragraph) => blocks.push(Block::Paragraph(std::mem::take(&mut text))),
            Event::End(TagEnd::Heading(level)) => blocks.push(Block::Heading {
                level: heading_level(level),
                text: std::mem::take(&mut text),
            }),
            Event::End(TagEnd::CodeBlock) => blocks.push(Block::Code(std::mem::take(&mut text))),
            Event::Rule => blocks.push(Block::Break),
            _ => {}
        }
    }
    blocks
}

fn heading_level(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}
`;

const markdownRsFootnotes = String.raw`use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Heading { level: u8, text: String },
    Paragraph(String),
    Code(String),
    Break,
    /// A footnote definition. References in paragraphs are kept as [^label]
    /// markers and resolved during layout.
    Footnote { label: String, text: String },
}

/// Flattens Markdown into the blocks pagecraft knows how to set. Inline
/// formatting is dropped for now: emphasis needs a second font.
pub fn parse(source: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut text = String::new();
    let mut footnote: Option<String> = None;
    for event in Parser::new_ext(source, Options::ENABLE_FOOTNOTES) {
        match event {
            Event::Start(Tag::FootnoteDefinition(label)) => {
                footnote = Some(label.to_string());
                text.clear();
            }
            Event::End(TagEnd::FootnoteDefinition) => {
                if let Some(label) = footnote.take() {
                    let text = std::mem::take(&mut text).trim().to_string();
                    blocks.push(Block::Footnote { label, text });
                }
            }
            Event::FootnoteReference(label) => {
                text.push_str("[^");
                text.push_str(&label);
                text.push(']');
            }
            Event::Start(Tag::Paragraph) if footnote.is_some() => {}
            Event::End(TagEnd::Paragraph) if footnote.is_some() => text.push(' '),
            Event::Start(Tag::Paragraph | Tag::Heading { .. } | Tag::CodeBlock(_)) => text.clear(),
            Event::Text(t) | Event::Code(t) => text.push_str(&t),
            Event::SoftBreak | Event::HardBreak => text.push(' '),
            Event::End(TagEnd::Paragraph) => blocks.push(Block::Paragraph(std::mem::take(&mut text))),
            Event::End(TagEnd::Heading(level)) => blocks.push(Block::Heading {
                level: heading_level(level),
                text: std::mem::take(&mut text),
            }),
            Event::End(TagEnd::CodeBlock) => blocks.push(Block::Code(std::mem::take(&mut text))),
            Event::Rule => blocks.push(Block::Break),
            _ => {}
        }
    }
    blocks
}

fn heading_level(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}
`;

const linebreakRs = String.raw`//! Knuth–Plass optimal line breaking.
//!
//! A paragraph is a list of boxes (runs of glyphs with a fixed width), glue
//! (space that can stretch and shrink) and penalties (places where a break
//! is allowed at some cost, such as a hyphenation point). Instead of filling
//! each line greedily, we choose the breaks that minimise the total
//! demerits of the whole paragraph.

#[derive(Debug, Clone, PartialEq)]
pub enum Item {
    Box { width: f32 },
    Glue { width: f32, stretch: f32, shrink: f32 },
    Penalty { width: f32, penalty: f32, flagged: bool },
}

pub const INFINITY: f32 = 10_000.0;

#[derive(Debug, Clone, Copy)]
pub struct Params {
    /// The largest adjustment ratio a line may have.
    pub tolerance: f32,
    pub line_penalty: f32,
    /// Extra demerits for two hyphenated lines in a row.
    pub flagged_demerits: f32,
}

impl Default for Params {
    fn default() -> Self {
        Params { tolerance: 2.0, line_penalty: 10.0, flagged_demerits: 3000.0 }
    }
}

/// A chosen break: the index of the item to break at, and how much the
/// line ending there is stretched (positive) or shrunk (negative).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Break {
    pub position: usize,
    pub ratio: f32,
}

#[derive(Debug, Clone, Copy)]
struct Node {
    position: usize,
    ratio: f32,
    total_width: f32,
    total_stretch: f32,
    total_shrink: f32,
    demerits: f32,
    flagged: bool,
    previous: Option<usize>,
}

fn is_feasible_break(items: &[Item], i: usize) -> bool {
    match items[i] {
        Item::Box { .. } => false,
        Item::Glue { .. } => i > 0 && matches!(items[i - 1], Item::Box { .. }),
        Item::Penalty { penalty, .. } => penalty < INFINITY,
    }
}

fn is_forced(item: &Item) -> bool {
    matches!(item, Item::Penalty { penalty, .. } if *penalty <= -INFINITY)
}

/// Returns the breaks for the paragraph, or None if no set of breaks keeps
/// every line within the tolerance.
pub fn break_lines(items: &[Item], line_width: f32, params: Params) -> Option<Vec<Break>> {
    let mut nodes = vec![Node {
        position: 0,
        ratio: 0.0,
        total_width: 0.0,
        total_stretch: 0.0,
        total_shrink: 0.0,
        demerits: 0.0,
        flagged: false,
        previous: None,
    }];
    let mut active = vec![0];
    let (mut width, mut stretch, mut shrink) = (0.0, 0.0, 0.0);

    for (i, item) in items.iter().enumerate() {
        if is_feasible_break(items, i) {
            let mut candidates = Vec::new();
            active.retain(|&a| {
                let ratio = adjustment_ratio(&nodes[a], width, stretch, shrink, item, line_width);
                if (-1.0..=params.tolerance).contains(&ratio) {
                    candidates.push((a, ratio));
                }
                // A line that is already too tight only gets tighter.
                !(ratio < -1.0 || is_forced(item))
            });
            let best = candidates
                .iter()
                .map(|&(a, ratio)| (a, ratio, demerits(&nodes[a], ratio, item, params)))
                .min_by(|x, y| x.2.total_cmp(&y.2));
            if let Some((from, ratio, total)) = best {
                let (w, st, sh) = match *item {
                    Item::Glue { width: w, stretch: st, shrink: sh } => (width + w, stretch + st, shrink + sh),
                    _ => (width, stretch, shrink),
                };
                nodes.push(Node {
                    position: i,
                    ratio,
                    total_width: w,
                    total_stretch: st,
                    total_shrink: sh,
                    demerits: total,
                    flagged: matches!(item, Item::Penalty { flagged: true, .. }),
                    previous: Some(from),
                });
                active.push(nodes.len() - 1);
            }
            if active.is_empty() {
                return None;
            }
        }
        match *item {
            Item::Box { width: w } => width += w,
            Item::Glue { width: w, stretch: st, shrink: sh } => {
                width += w;
                stretch += st;
                shrink += sh;
            }
            Item::Penalty { .. } => {}
        }
    }

    let last = items.len().checked_sub(1)?;
    let best = active
        .iter()
        .copied()
        .filter(|&a| nodes[a].position == last)
        .min_by(|&a, &b| nodes[a].demerits.total_cmp(&nodes[b].demerits))?;
    let mut breaks = Vec::new();
    let mut cursor = Some(best);
    while let Some(n) = cursor {
        if nodes[n].previous.is_some() {
            breaks.push(Break { position: nodes[n].position, ratio: nodes[n].ratio });
        }
        cursor = nodes[n].previous;
    }
    breaks.reverse();
    Some(breaks)
}

fn adjustment_ratio(node: &Node, width: f32, stretch: f32, shrink: f32, item: &Item, line_width: f32) -> f32 {
    let mut actual = width - node.total_width;
    if let Item::Penalty { width: w, .. } = item {
        actual += w;
    }
    if actual < line_width {
        let available = stretch - node.total_stretch;
        if available > 0.0 { (line_width - actual) / available } else { INFINITY }
    } else if actual > line_width {
        let available = shrink - node.total_shrink;
        if available > 0.0 { (line_width - actual) / available } else { -INFINITY }
    } else {
        0.0
    }
}

fn demerits(node: &Node, ratio: f32, item: &Item, params: Params) -> f32 {
    let badness = 100.0 * ratio.abs().powi(3);
    let mut d = (params.line_penalty + badness).powi(2);
    if let Item::Penalty { penalty, flagged, .. } = *item {
        if penalty >= 0.0 {
            d += penalty.powi(2);
        } else if penalty > -INFINITY {
            d -= penalty.powi(2);
        }
        if flagged && node.flagged {
            d += params.flagged_demerits;
        }
    }
    node.demerits + d
}
`;

const greedyFn = String.raw`
/// First-fit line breaking, for paragraphs that can't be set within any
/// tolerance (a long URL in a narrow column, say). Lines may come out
/// overfull, but every paragraph gets set.
pub fn greedy(items: &[Item], line_width: f32) -> Vec<Break> {
    let mut breaks = Vec::new();
    let mut width = 0.0;
    let mut candidate = None;
    let mut i = 0;
    while i < items.len() {
        if is_feasible_break(items, i) {
            if width > line_width {
                if let Some(c) = candidate.take() {
                    breaks.push(Break { position: c, ratio: 0.0 });
                    width = 0.0;
                    i = c + 1;
                    continue;
                }
            }
            candidate = Some(i);
        }
        if let Item::Box { width: w } | Item::Glue { width: w, .. } = items[i] {
            width += w;
        }
        i += 1;
    }
    if let Some(last) = items.len().checked_sub(1) {
        breaks.push(Break { position: last, ratio: 0.0 });
    }
    breaks
}
`;

const hyphenateRs = String.raw`//! Liang's hyphenation algorithm, using TeX-style pattern files.

use std::collections::HashMap;

pub struct Hyphenator {
    patterns: HashMap<String, Vec<u8>>,
    exceptions: HashMap<String, Vec<usize>>,
    left_min: usize,
    right_min: usize,
}

impl Hyphenator {
    /// The US English patterns bundled with pagecraft.
    pub fn english() -> Hyphenator {
        Hyphenator::parse(include_str!("../patterns/hyph-en-us.pat"))
    }

    /// Parses a pattern file: one pattern per line, with digits between the
    /// letters and "." marking the start or end of a word. Lines starting
    /// with "%" are comments.
    pub fn parse(source: &str) -> Hyphenator {
        let mut patterns = HashMap::new();
        for line in source.lines().map(str::trim) {
            if line.is_empty() || line.starts_with('%') {
                continue;
            }
            let letters: String = line.chars().filter(|c| !c.is_ascii_digit()).collect();
            let mut values = vec![0u8; letters.chars().count() + 1];
            let mut index = 0;
            for c in line.chars() {
                match c.to_digit(10) {
                    Some(d) => values[index] = d as u8,
                    None => index += 1,
                }
            }
            patterns.insert(letters, values);
        }
        Hyphenator { patterns, exceptions: HashMap::new(), left_min: 2, right_min: 3 }
    }

    /// Returns the positions in word where a hyphen may go.
    pub fn hyphenate(&self, word: &str) -> Vec<usize> {
        let lower = word.to_lowercase();
        if let Some(points) = self.exceptions.get(&lower) {
            return points.clone();
        }
        let chars: Vec<char> = format!(".{lower}.").chars().collect();
        let mut values = vec![0u8; chars.len() + 1];
        for start in 0..chars.len() {
            for end in start + 1..=chars.len() {
                let piece: String = chars[start..end].iter().collect();
                if let Some(pattern) = self.patterns.get(&piece) {
                    for (k, &v) in pattern.iter().enumerate() {
                        values[start + k] = values[start + k].max(v);
                    }
                }
            }
        }
        let n = chars.len() - 2;
        (self.left_min..=n.saturating_sub(self.right_min))
            .filter(|&i| values[i + 1] % 2 == 1)
            .collect()
    }
}
`;

const hyphenateRsFixed = String.raw`//! Liang's hyphenation algorithm, using TeX-style pattern files.

use std::collections::HashMap;

pub struct Hyphenator {
    patterns: HashMap<String, Vec<u8>>,
    /// Hyphenation points by word, counted in characters.
    exceptions: HashMap<String, Vec<usize>>,
    left_min: usize,
    right_min: usize,
}

impl Hyphenator {
    /// The US English patterns bundled with pagecraft.
    pub fn english() -> Hyphenator {
        Hyphenator::parse(include_str!("../patterns/hyph-en-us.pat"))
    }

    /// Parses a pattern file: one pattern per line, with digits between the
    /// letters and "." marking the start or end of a word. Lines containing
    /// "-" are exceptions, spelled the way they should be hyphenated
    /// ("ta-ble"). Lines starting with "%" are comments.
    pub fn parse(source: &str) -> Hyphenator {
        let mut patterns = HashMap::new();
        let mut exceptions = HashMap::new();
        for line in source.lines().map(str::trim) {
            if line.is_empty() || line.starts_with('%') {
                continue;
            }
            if line.contains('-') {
                let (word, points) = exception(line);
                exceptions.insert(word, points);
                continue;
            }
            let letters: String = line.chars().filter(|c| !c.is_ascii_digit()).collect();
            let mut values = vec![0u8; letters.chars().count() + 1];
            let mut index = 0;
            for c in line.chars() {
                match c.to_digit(10) {
                    Some(d) => values[index] = d as u8,
                    None => index += 1,
                }
            }
            patterns.insert(letters, values);
        }
        Hyphenator { patterns, exceptions, left_min: 2, right_min: 3 }
    }

    /// Returns the byte offsets in word where a hyphen may go, so callers
    /// can slice the word directly.
    pub fn hyphenate(&self, word: &str) -> Vec<usize> {
        let offsets: Vec<usize> = word.char_indices().map(|(i, _)| i).collect();
        let lower: String = word.chars().flat_map(char::to_lowercase).collect();
        if lower.chars().count() != offsets.len() {
            // Lowercasing changed the length (as with a dotted capital I), so
            // character positions in lower don't line up with word.
            return Vec::new();
        }
        if let Some(points) = self.exceptions.get(&lower) {
            return points.iter().map(|&i| offsets[i]).collect();
        }
        let chars: Vec<char> = format!(".{lower}.").chars().collect();
        let mut values = vec![0u8; chars.len() + 1];
        for start in 0..chars.len() {
            for end in start + 1..=chars.len() {
                let piece: String = chars[start..end].iter().collect();
                if let Some(pattern) = self.patterns.get(&piece) {
                    for (k, &v) in pattern.iter().enumerate() {
                        values[start + k] = values[start + k].max(v);
                    }
                }
            }
        }
        let n = chars.len() - 2;
        (self.left_min..=n.saturating_sub(self.right_min))
            .filter(|&i| values[i + 1] % 2 == 1)
            .map(|i| offsets[i])
            .collect()
    }
}

/// Splits "as-so-ciate" into "associate" and the character positions of
/// its hyphens.
fn exception(line: &str) -> (String, Vec<usize>) {
    let mut word = String::new();
    let mut points = Vec::new();
    for part in line.split('-') {
        if !word.is_empty() {
            points.push(word.chars().count());
        }
        word.push_str(part);
    }
    (word.to_lowercase(), points)
}
`;

const patterns = `% US English hyphenation patterns (excerpt).
% Derived from Frank M. Liang's hyphen.tex patterns, which are in the
% public domain. scripts/fetch-patterns regenerates the full set.
.ach4
.ad4der
.af1t
.al3t
.am5at
.an5c
.ang4
.ani5m
.ant4
.an3te
.anti5s
.ar5s
.ar4tie
.ar4ty
.as3c
.as1p
.as1s
.aster5
.atom5
.au1d
.av4i
.awn4
.ba4g
.ba5na
.bas4e
.ber4
.be5ra
.be3sm
.be5sto
.bri2
.but4ti
.ca4m
.can5c
.ca4p
.co4e
.con5g
.de3o
.de3ra
.de3ri
.des4c
.dumb5
1ba
1ca
1co
1de
1na
1tio
2io
4ab.
a4bal
ab3i
ab5it
ab3ul
ac5ard
ac5ar
ac3ul
ad4din
ad5er.
he2n
hena4
hen5at
hy3ph
n2at
o2n
typ4
ty5po
pe4r
per3s
`;

const patternsExceptions = `
% Exceptions: words the patterns get wrong, hyphenated by hand.
as-so-ciate
as-so-ciates
dec-li-na-tion
oblig-a-tory
phil-an-thropic
present
presents
project
projects
reci-procity
re-cog-ni-zance
ref-or-ma-tion
ret-ri-bu-tion
ta-ble
`;

const fontRs = String.raw`use std::path::Path;

use anyhow::{anyhow, Context, Result};

pub struct Font {
    pub name: String,
    pub data: Vec<u8>,
    pub units_per_em: f32,
    /// Ascender and descender as fractions of the em.
    pub ascender: f32,
    pub descender: f32,
}

impl Font {
    pub fn load(path: &Path) -> Result<Font> {
        let data = std::fs::read(path).with_context(|| format!("reading font {}", path.display()))?;
        let face = ttf_parser::Face::parse(&data, 0)
            .map_err(|e| anyhow!("{}: not a usable font: {e}", path.display()))?;
        let name = face
            .names()
            .into_iter()
            .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME)
            .and_then(|n| n.to_string())
            .unwrap_or_else(|| "Pagecraft-Font".to_string());
        let units_per_em = f32::from(face.units_per_em());
        let ascender = f32::from(face.ascender()) / units_per_em;
        let descender = f32::from(face.descender()) / units_per_em;
        Ok(Font { name, data, units_per_em, ascender, descender })
    }

    fn face(&self) -> ttf_parser::Face<'_> {
        ttf_parser::Face::parse(&self.data, 0).expect("font was validated in load")
    }

    /// Advance width of text at the given size in points.
    pub fn width(&self, text: &str, size: f32) -> f32 {
        let face = self.face();
        let units: f32 = text
            .chars()
            .filter_map(|c| face.glyph_index(c))
            .filter_map(|g| face.glyph_hor_advance(g))
            .map(f32::from)
            .sum();
        units * size / self.units_per_em
    }

    pub fn glyph_id(&self, c: char) -> u16 {
        self.face().glyph_index(c).map_or(0, |g| g.0)
    }

    /// Advance widths of every glyph in thousandths of an em, as the PDF
    /// font dictionary wants them.
    pub fn glyph_widths(&self) -> Vec<f32> {
        let face = self.face();
        (0..face.number_of_glyphs())
            .map(|g| {
                let advance = face.glyph_hor_advance(ttf_parser::GlyphId(g)).map_or(0.0, f32::from);
                advance * 1000.0 / self.units_per_em
            })
            .collect()
    }
}
`;

const fontRsCached = String.raw`use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;

use anyhow::{anyhow, Context, Result};

pub struct Font {
    pub name: String,
    pub data: Vec<u8>,
    pub units_per_em: f32,
    /// Ascender and descender as fractions of the em.
    pub ascender: f32,
    pub descender: f32,
    /// Advance widths in font units, filled in as characters are measured.
    advances: RefCell<HashMap<char, f32>>,
}

impl Font {
    pub fn load(path: &Path) -> Result<Font> {
        let data = std::fs::read(path).with_context(|| format!("reading font {}", path.display()))?;
        let face = ttf_parser::Face::parse(&data, 0)
            .map_err(|e| anyhow!("{}: not a usable font: {e}", path.display()))?;
        let name = face
            .names()
            .into_iter()
            .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME)
            .and_then(|n| n.to_string())
            .unwrap_or_else(|| "Pagecraft-Font".to_string());
        let units_per_em = f32::from(face.units_per_em());
        let ascender = f32::from(face.ascender()) / units_per_em;
        let descender = f32::from(face.descender()) / units_per_em;
        Ok(Font { name, data, units_per_em, ascender, descender, advances: RefCell::default() })
    }

    fn face(&self) -> ttf_parser::Face<'_> {
        ttf_parser::Face::parse(&self.data, 0).expect("font was validated in load")
    }

    /// Advance width of text at the given size in points.
    pub fn width(&self, text: &str, size: f32) -> f32 {
        let mut advances = self.advances.borrow_mut();
        let mut face = None;
        let units: f32 = text
            .chars()
            .map(|c| {
                *advances.entry(c).or_insert_with(|| {
                    let face = face.get_or_insert_with(|| self.face());
                    face.glyph_index(c).and_then(|g| face.glyph_hor_advance(g)).map_or(0.0, f32::from)
                })
            })
            .sum();
        units * size / self.units_per_em
    }

    pub fn glyph_id(&self, c: char) -> u16 {
        self.face().glyph_index(c).map_or(0, |g| g.0)
    }

    /// Advance widths of every glyph in thousandths of an em, as the PDF
    /// font dictionary wants them.
    pub fn glyph_widths(&self) -> Vec<f32> {
        let face = self.face();
        (0..face.number_of_glyphs())
            .map(|g| {
                let advance = face.glyph_hor_advance(ttf_parser::GlyphId(g)).map_or(0.0, f32::from);
                advance * 1000.0 / self.units_per_em
            })
            .collect()
    }
}
`;

const templateRs = String.raw`use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

/// A length in PostScript points, parsed from strings such as "18mm".
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(try_from = "String")]
pub struct Length(pub f32);

impl TryFrom<String> for Length {
    type Error = String;

    fn try_from(s: String) -> Result<Self, String> {
        let s = s.trim();
        let split = s.find(|c: char| c.is_ascii_alphabetic()).unwrap_or(s.len());
        let (number, unit) = s.split_at(split);
        let value: f32 = number.trim().parse().map_err(|_| format!("invalid length {s:?}"))?;
        let points = match unit {
            "pt" | "" => value,
            "mm" => value * 72.0 / 25.4,
            _ => return Err(format!("unknown unit {unit:?} in {s:?}, expected pt or mm")),
        };
        Ok(Length(points))
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Template {
    pub page: PageSize,
    pub margins: Margins,
    pub text: Text,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PageSize {
    pub width: Length,
    pub height: Length,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Margins {
    pub top: Length,
    pub bottom: Length,
    pub inner: Length,
    pub outer: Length,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Text {
    pub font: PathBuf,
    pub size: f32,
    pub leading: f32,
    #[serde(default = "yes")]
    pub hyphenate: bool,
}

fn yes() -> bool {
    true
}

impl Template {
    pub fn load(path: &Path) -> Result<Template> {
        let source = std::fs::read_to_string(path)
            .with_context(|| format!("reading template {}", path.display()))?;
        let mut template: Template = toml::from_str(&source)
            .with_context(|| format!("parsing template {}", path.display()))?;
        if template.text.font.is_relative() {
            if let Some(dir) = path.parent() {
                template.text.font = dir.join(&template.text.font);
            }
        }
        Ok(template)
    }

    /// Width of the text block.
    pub fn measure(&self) -> f32 {
        self.page.width.0 - self.margins.inner.0 - self.margins.outer.0
    }

    pub fn top(&self) -> f32 {
        self.page.height.0 - self.margins.top.0
    }

    pub fn bottom(&self) -> f32 {
        self.margins.bottom.0
    }

    pub fn left(&self) -> f32 {
        self.margins.inner.0
    }

    pub fn heading_size(&self, level: u8) -> f32 {
        match level {
            1 => self.text.size * 2.0,
            2 => self.text.size * 1.5,
            3 => self.text.size * 1.2,
            _ => self.text.size,
        }
    }
}

impl Default for Template {
    fn default() -> Self {
        toml::from_str(include_str!("../templates/a4.toml")).expect("built-in template is valid")
    }
}
`;

const a4Toml = `# The built-in template: A4, one column.
[page]
width = "210mm"
height = "297mm"

[margins]
top = "25mm"
bottom = "30mm"
inner = "25mm"
outer = "35mm"

[text]
font = "fonts/SourceSerif4-Regular.ttf"
size = 11.0
leading = 14.0
`;

const novelToml = `# A5 novel: generous margins, folios at the foot, set in EB Garamond.
[page]
width = "148mm"
height = "210mm"

[margins]
top = "18mm"
bottom = "24mm"
inner = "16mm"
outer = "21mm"

[text]
font = "../fonts/EBGaramond-Regular.ttf"
size = 10.5
leading = 13.5

[folio]
size = 9.0
offset = "12mm"
`;

const layoutRs = String.raw`use anyhow::{bail, Result};

use crate::font::Font;
use crate::hyphenate::Hyphenator;
use crate::linebreak::{break_lines, Item, Params, INFINITY};
use crate::markdown::Block;
use crate::template::Template;

/// A line of text placed on a page, in points from the bottom-left corner.
#[derive(Debug, Clone)]
pub struct Run {
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub text: String,
    /// Extra space added to (or taken from) every word space on the line.
    pub word_spacing: f32,
}

#[derive(Debug, Default)]
pub struct Page {
    pub runs: Vec<Run>,
}

pub struct Document {
    pub pages: Vec<Page>,
    pub font: Font,
}

/// A word, word fragment or space, and the line breaking item for it.
struct Piece {
    text: String,
    item: Item,
}

pub fn typeset(blocks: &[Block], template: &Template) -> Result<Document> {
    let font = Font::load(&template.text.font)?;
    let hyphenator = Hyphenator::english();
    let measure = template.measure();
    let mut pages = vec![Page::default()];
    let mut y = template.top();

    for block in blocks {
        let (text, size, leading) = match block {
            Block::Heading { level, text } => (text, template.heading_size(*level), template.text.leading * 1.5),
            Block::Paragraph(text) | Block::Code(text) => (text, template.text.size, template.text.leading),
            Block::Break => {
                y -= template.text.leading;
                continue;
            }
        };
        let space = font.width(" ", size);
        let pieces = pieces(text, &font, size, &hyphenator, template.text.hyphenate);
        let items: Vec<Item> = pieces.iter().map(|p| p.item.clone()).collect();
        let Some(breaks) = break_lines(&items, measure, Params::default()) else {
            bail!("could not set the paragraph starting {:?}", text.chars().take(40).collect::<String>());
        };
        let mut start = 0;
        for b in breaks {
            if y - leading < template.bottom() {
                pages.push(Page::default());
                y = template.top();
            }
            y -= leading;
            let mut line: String = pieces[start..b.position].iter().map(|p| p.text.as_str()).collect();
            if matches!(pieces[b.position].item, Item::Penalty { width, .. } if width > 0.0) {
                line.push('-');
            }
            let word_spacing = if b.ratio >= 0.0 { b.ratio * space / 2.0 } else { b.ratio * space / 3.0 };
            let run = Run { x: template.left(), y, size, text: line, word_spacing };
            pages.last_mut().expect("there is always a page").runs.push(run);
            start = b.position + 1;
        }
        y -= leading / 2.0;
    }
    Ok(Document { pages, font })
}

fn pieces(text: &str, font: &Font, size: f32, hyphenator: &Hyphenator, hyphenate: bool) -> Vec<Piece> {
    let space = font.width(" ", size);
    let hyphen = font.width("-", size);
    let mut out = Vec::new();
    for (i, word) in text.split_whitespace().enumerate() {
        if i > 0 {
            let item = Item::Glue { width: space, stretch: space / 2.0, shrink: space / 3.0 };
            out.push(Piece { text: " ".into(), item });
        }
        let points = if hyphenate { hyphenator.hyphenate(word) } else { Vec::new() };
        let mut last = 0;
        for point in points.into_iter().chain(std::iter::once(word.len())) {
            let part = &word[last..point];
            out.push(Piece { text: part.into(), item: Item::Box { width: font.width(part, size) } });
            if point < word.len() {
                let item = Item::Penalty { width: hyphen, penalty: 50.0, flagged: true };
                out.push(Piece { text: String::new(), item });
            }
            last = point;
        }
    }
    out.push(Piece { text: String::new(), item: Item::Glue { width: 0.0, stretch: INFINITY, shrink: 0.0 } });
    out.push(Piece { text: String::new(), item: Item::Penalty { width: 0.0, penalty: -INFINITY, flagged: true } });
    out
}
`;

const layoutRsFootnotes = String.raw`use anyhow::Result;

use crate::font::Font;
use crate::footnotes::Notes;
use crate::hyphenate::Hyphenator;
use crate::linebreak::{break_lines, greedy, Break, Item, Params, INFINITY};
use crate::markdown::Block;
use crate::template::Template;

/// A line of text placed on a page, in points from the bottom-left corner.
#[derive(Debug, Clone)]
pub struct Run {
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub text: String,
    /// Extra space added to (or taken from) every word space on the line.
    pub word_spacing: f32,
}

#[derive(Debug, Default)]
pub struct Page {
    pub runs: Vec<Run>,
    /// Footnote lines, set from the bottom margin upwards when the page is
    /// finished.
    pub notes: Vec<Run>,
}

pub struct Document {
    pub pages: Vec<Page>,
    pub font: Font,
}

/// A word, word fragment or space, and the line breaking item for it.
struct Piece {
    text: String,
    item: Item,
}

pub fn typeset(blocks: &[Block], template: &Template) -> Result<Document> {
    let font = Font::load(&template.text.font)?;
    let hyphenator = Hyphenator::english();
    let measure = template.measure();
    let mut notes = Notes::collect(blocks);
    let note_size = template.text.size * 0.8;
    let note_leading = template.text.leading * 0.8;
    let mut pages = vec![Page::default()];
    let mut y = template.top();
    let mut bottom = template.bottom();

    for block in blocks {
        let (text, size, leading) = match block {
            Block::Heading { level, text } => (text.clone(), template.heading_size(*level), template.text.leading * 1.5),
            Block::Paragraph(text) => (text.clone(), template.text.size, template.text.leading),
            Block::Code(text) => (text.clone(), template.text.size, template.text.leading),
            Block::Footnote { .. } => continue,
            Block::Break => {
                y -= template.text.leading;
                continue;
            }
        };
        if text.trim().is_empty() {
            continue;
        }
        let (text, cited) = notes.cite(&text);
        let lines = set(&text, &font, size, measure, &hyphenator, template.text.hyphenate);
        let note_lines: Vec<Run> = cited
            .iter()
            .flat_map(|(number, note)| {
                let text = format!("{number} {note}");
                set(&text, &font, note_size, measure, &hyphenator, template.text.hyphenate)
            })
            .collect();

        for (i, mut run) in lines.into_iter().enumerate() {
            let reserve = if i == 0 { note_lines.len() as f32 * note_leading } else { 0.0 };
            if y - leading < bottom + reserve {
                pages.push(Page::default());
                y = template.top();
                bottom = template.bottom();
            }
            y -= leading;
            run.y = y;
            pages.last_mut().expect("there is always a page").runs.push(run);
            if i == 0 && !note_lines.is_empty() {
                bottom += note_lines.len() as f32 * note_leading;
                pages.last_mut().expect("there is always a page").notes.extend(note_lines.iter().cloned());
            }
        }
        y -= leading / 2.0;
    }

    for page in &mut pages {
        let mut y = template.bottom() + page.notes.len() as f32 * note_leading;
        for note in &mut page.notes {
            y -= note_leading;
            note.y = y;
        }
    }
    if let Some(folio) = &template.folio {
        for (index, page) in pages.iter_mut().enumerate() {
            let text = (index + 1).to_string();
            let x = (template.page.width.0 - font.width(&text, folio.size)) / 2.0;
            page.runs.push(Run { x, y: folio.offset.0, size: folio.size, text, word_spacing: 0.0 });
        }
    }
    Ok(Document { pages, font })
}

/// Breaks text into lines of the given measure. The runs have their x
/// position and spacing set; the caller sets y.
fn set(text: &str, font: &Font, size: f32, measure: f32, hyphenator: &Hyphenator, hyphenate: bool) -> Vec<Run> {
    let space = font.width(" ", size);
    let pieces = pieces(text, font, size, hyphenator, hyphenate);
    let items: Vec<Item> = pieces.iter().map(|p| p.item.clone()).collect();
    let breaks: Vec<Break> = break_lines(&items, measure, Params::default())
        .or_else(|| break_lines(&items, measure, Params { tolerance: 10.0, ..Params::default() }))
        .unwrap_or_else(|| greedy(&items, measure));
    let mut runs = Vec::new();
    let mut start = 0;
    for b in breaks {
        let mut line: String = pieces[start..b.position].iter().map(|p| p.text.as_str()).collect();
        if matches!(pieces[b.position].item, Item::Penalty { width, .. } if width > 0.0) {
            line.push('-');
        }
        let word_spacing = if b.ratio >= 0.0 { b.ratio * space / 2.0 } else { b.ratio * space / 3.0 };
        runs.push(Run { x: 0.0, y: 0.0, size, text: line, word_spacing });
        start = b.position + 1;
    }
    runs
}

fn pieces(text: &str, font: &Font, size: f32, hyphenator: &Hyphenator, hyphenate: bool) -> Vec<Piece> {
    let space = font.width(" ", size);
    let hyphen = font.width("-", size);
    let mut out = Vec::new();
    for (i, word) in text.split_whitespace().enumerate() {
        if i > 0 {
            let item = Item::Glue { width: space, stretch: space / 2.0, shrink: space / 3.0 };
            out.push(Piece { text: " ".into(), item });
        }
        let points = if hyphenate { hyphenator.hyphenate(word) } else { Vec::new() };
        let mut last = 0;
        for point in points.into_iter().chain(std::iter::once(word.len())) {
            let part = &word[last..point];
            out.push(Piece { text: part.into(), item: Item::Box { width: font.width(part, size) } });
            if point < word.len() {
                let item = Item::Penalty { width: hyphen, penalty: 50.0, flagged: true };
                out.push(Piece { text: String::new(), item });
            }
            last = point;
        }
    }
    out.push(Piece { text: String::new(), item: Item::Glue { width: 0.0, stretch: INFINITY, shrink: 0.0 } });
    out.push(Piece { text: String::new(), item: Item::Penalty { width: 0.0, penalty: -INFINITY, flagged: true } });
    out
}
`;

const footnotesRs = String.raw`//! Footnotes: numbered markers in the text, and the notes they point to,
//! set at the foot of the page that cites them.

use std::collections::HashMap;

use crate::markdown::Block;

#[derive(Debug, Default)]
pub struct Notes {
    texts: HashMap<String, String>,
    numbers: HashMap<String, usize>,
}

impl Notes {
    pub fn collect(blocks: &[Block]) -> Notes {
        let mut notes = Notes::default();
        for block in blocks {
            if let Block::Footnote { label, text } = block {
                notes.texts.insert(label.clone(), text.clone());
            }
        }
        notes
    }

    /// Replaces each [^label] marker in text with a superscript number and
    /// returns the notes it cites, in order. A note cited twice is only
    /// returned the first time.
    pub fn cite(&mut self, text: &str) -> (String, Vec<(usize, String)>) {
        let mut out = String::with_capacity(text.len());
        let mut cited = Vec::new();
        let mut rest = text;
        while let Some(start) = rest.find("[^") {
            let Some(len) = rest[start..].find(']') else { break };
            let label = &rest[start + 2..start + len];
            out.push_str(&rest[..start]);
            let next = self.numbers.len() + 1;
            let first = !self.numbers.contains_key(label);
            let number = *self.numbers.entry(label.to_string()).or_insert(next);
            out.push_str(&superscript(number));
            if let (true, Some(note)) = (first, self.texts.get(label)) {
                cited.push((number, note.clone()));
            }
            rest = &rest[start + len + 1..];
        }
        out.push_str(rest);
        (out, cited)
    }
}

fn superscript(n: usize) -> String {
    const DIGITS: [char; 10] = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    n.to_string().chars().map(|d| DIGITS[d as usize - '0' as usize]).collect()
}
`;

const pdfRs = String.raw`use pdf_writer::types::{CidFontType, FontFlags, SystemInfo};
use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref, Str};

use crate::layout::Document;
use crate::template::Template;

/// Writes the document as a PDF with the font embedded as a CID font, so
/// glyphs are addressed by ID and any character the font has can be shown.
pub fn write(document: &Document, template: &Template) -> Vec<u8> {
    let mut pdf = Pdf::new();
    let mut next = 0;
    let mut alloc = || {
        next += 1;
        Ref::new(next)
    };
    let catalog_id = alloc();
    let tree_id = alloc();
    let font_id = alloc();
    let cid_id = alloc();
    let descriptor_id = alloc();
    let file_id = alloc();
    let page_ids: Vec<Ref> = document.pages.iter().map(|_| alloc()).collect();
    let content_ids: Vec<Ref> = document.pages.iter().map(|_| alloc()).collect();

    pdf.catalog(catalog_id).pages(tree_id);
    pdf.pages(tree_id).kids(page_ids.iter().copied()).count(page_ids.len() as i32);

    let media = Rect::new(0.0, 0.0, template.page.width.0, template.page.height.0);
    for ((page, &id), &content_id) in document.pages.iter().zip(&page_ids).zip(&content_ids) {
        let mut p = pdf.page(id);
        p.media_box(media).parent(tree_id).contents(content_id);
        p.resources().fonts().pair(Name(b"F1"), font_id);
        p.finish();

        let mut content = Content::new();
        for run in &page.runs {
            content.begin_text();
            content.set_font(Name(b"F1"), run.size);
            content.set_word_spacing(run.word_spacing);
            content.next_line(run.x, run.y);
            content.show(Str(&encode(document, &run.text)));
            content.end_text();
        }
        pdf.stream(content_id, &content.finish());
    }

    let font = &document.font;
    let font_name = Name(font.name.as_bytes());
    pdf.type0_font(font_id)
        .base_font(font_name)
        .encoding_predefined(Name(b"Identity-H"))
        .descendant_font(cid_id);

    let mut cid = pdf.cid_font(cid_id);
    cid.subtype(CidFontType::Type2)
        .base_font(font_name)
        .system_info(SystemInfo { registry: Str(b"Adobe"), ordering: Str(b"Identity"), supplement: 0 })
        .font_descriptor(descriptor_id)
        .cid_to_gid_map_predefined(Name(b"Identity"));
    cid.widths().consecutive(0, font.glyph_widths());
    cid.finish();

    pdf.font_descriptor(descriptor_id)
        .name(font_name)
        .flags(FontFlags::SERIF | FontFlags::NON_SYMBOLIC)
        .bbox(Rect::new(0.0, font.descender * 1000.0, 1000.0, font.ascender * 1000.0))
        .italic_angle(0.0)
        .ascent(font.ascender * 1000.0)
        .descent(font.descender * 1000.0)
        .cap_height(font.ascender * 700.0)
        .stem_v(80.0)
        .font_file2(file_id);
    pdf.stream(file_id, &font.data);

    pdf.finish()
}

/// Encodes text as big-endian glyph IDs for the Identity-H encoding.
fn encode(document: &Document, text: &str) -> Vec<u8> {
    text.chars().flat_map(|c| document.font.glyph_id(c).to_be_bytes()).collect()
}
`;

const linebreakTestRs = String.raw`use pagecraft::linebreak::{break_lines, Item, Params, INFINITY};

fn words(widths: &[f32]) -> Vec<Item> {
    let mut items = Vec::new();
    for (i, &w) in widths.iter().enumerate() {
        if i > 0 {
            items.push(Item::Glue { width: 3.0, stretch: 1.5, shrink: 1.0 });
        }
        items.push(Item::Box { width: w });
    }
    items.push(Item::Glue { width: 0.0, stretch: INFINITY, shrink: 0.0 });
    items.push(Item::Penalty { width: 0.0, penalty: -INFINITY, flagged: true });
    items
}

#[test]
fn a_short_paragraph_is_one_line() {
    let items = words(&[10.0, 10.0]);
    let breaks = break_lines(&items, 100.0, Params::default()).unwrap();
    assert_eq!(breaks.len(), 1);
    assert_eq!(breaks[0].position, items.len() - 1);
}

#[test]
fn lines_break_at_glue() {
    let items = words(&[20.0; 8]);
    let breaks = break_lines(&items, 70.0, Params::default()).unwrap();
    assert!(breaks.len() >= 2);
    for b in &breaks[..breaks.len() - 1] {
        assert!(matches!(items[b.position], Item::Glue { .. }));
    }
}

#[test]
fn a_box_wider_than_the_line_cannot_be_set() {
    let items = words(&[200.0]);
    assert!(break_lines(&items, 100.0, Params::default()).is_none());
}
`;

const hyphenateTestRs = String.raw`use pagecraft::hyphenate::Hyphenator;

#[test]
fn hyphenates_with_the_bundled_patterns() {
    let h = Hyphenator::english();
    assert_eq!(h.hyphenate("hyphenation"), vec![2, 6]);
}

#[test]
fn short_words_are_left_alone() {
    let h = Hyphenator::english();
    assert!(h.hyphenate("the").is_empty());
}
`;

const sampleMd = `# The Lighthouse Keeper

The lamp had been lit every evening for forty-one years, and on the
forty-second the keeper decided, for reasons she never wrote down, that
it would be the last.

She climbed the hundred and twelve steps as she always did, counting
them under her breath, and stopped at the small window on the
seventy-third to look at the weather coming in from the west.

---

Nobody in the village noticed at first. The light went on at dusk the
next day and the day after that, because the keeper had trained her
nephew, and the nephew was conscientious in the way of people who have
not yet decided whether they like a job.
`;

const releaseSh = `#!/bin/sh
# Builds release binaries for the platforms we ship and writes checksums.
# Run from the repository root on a tagged commit: scripts/release.sh v0.3.0
set -eu

version="\${1:?usage: scripts/release.sh <tag>}"
out="target/dist/$version"
mkdir -p "$out"

for target in x86_64-unknown-linux-musl aarch64-unknown-linux-musl \\
              x86_64-apple-darwin aarch64-apple-darwin x86_64-pc-windows-gnu; do
    cargo build --release --locked --target "$target"
    case "$target" in
        *windows*) bin=pagecraft.exe ;;
        *) bin=pagecraft ;;
    esac
    archive="$out/pagecraft-$version-$target.tar.gz"
    tar -czf "$archive" -C "target/$target/release" "$bin"
done

(cd "$out" && sha256sum ./*.tar.gz > SHA256SUMS)
echo "release artifacts in $out"
`;

export const pagecraft: RepoSeed = {
  owner: { org: "quill" },
  name: "pagecraft",
  description:
    "A Rust typesetter that turns Markdown into print-quality PDF: Knuth–Plass line breaking, hyphenation, real fonts, footnotes.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["wren", "jonas"],
  threshold: 1,
  seeding: 18,
  files: {
    "README.md": readme,
    LICENSE: license,
    "CHANGELOG.md": changelogRoot,
    "Cargo.toml": cargoToml,
    ".gitignore": gitignore,
    "src/main.rs": mainRs,
    "src/lib.rs": libRs,
    "src/markdown.rs": markdownRs,
    "src/linebreak.rs": linebreakRs,
    "src/hyphenate.rs": hyphenateRs,
    "src/font.rs": fontRs,
    "src/layout.rs": layoutRs,
    "src/pdf.rs": pdfRs,
    "src/template.rs": templateRs,
    "templates/a4.toml": a4Toml,
    "patterns/hyph-en-us.pat": patterns,
    "tests/linebreak.rs": linebreakTestRs,
    "tests/hyphenate.rs": hyphenateTestRs,
  },
  root: {
    label: "root",
    message: `Initial commit

Markdown to PDF with Knuth–Plass line breaking and Liang hyphenation.
It sets my test chapter without embarrassing itself, which is the bar
for showing it to anyone.`,
    author: "wren",
    daysAgo: 331,
  },
  history: [
    {
      label: "units",
      message: `template: accept cm and in as well as pt and mm

Most printers I work with quote trim sizes in inches, and I was tired
of converting.`,
      author: "wren",
      daysAgo: 322,
      changes: {
        "src/template.rs": [
          [
            '            "mm" => value * 72.0 / 25.4,\n',
            '            "mm" => value * 72.0 / 25.4,\n            "cm" => value * 72.0 / 2.54,\n            "in" => value * 72.0,\n',
          ],
          ["expected pt or mm", "expected pt, mm, cm or in"],
        ],
        "README.md": [["Lengths accept `pt` and `mm`.", "Lengths accept `pt`, `mm`, `cm` and `in`."]],
      },
    },
    {
      label: "hyph-exceptions",
      message: `hyphenate: support exception words in pattern files

Lines with hyphens in them ("ta-ble") are taken as exceptions and used
instead of the patterns for that word, the same as TeX's \\hyphenation.
Adds the classic exception list from hyphen.tex.`,
      author: "jonas",
      daysAgo: 311,
      changes: {
        "src/hyphenate.rs": [
          [
            "        let mut patterns = HashMap::new();\n",
            "        let mut patterns = HashMap::new();\n        let mut exceptions = HashMap::new();\n",
          ],
          [
            "                continue;\n            }\n            let letters",
            "                continue;\n            }\n            if line.contains('-') {\n                let (word, points) = exception(line);\n                exceptions.insert(word, points);\n                continue;\n            }\n            let letters",
          ],
          [
            "Hyphenator { patterns, exceptions: HashMap::new(), left_min: 2, right_min: 3 }",
            "Hyphenator { patterns, exceptions, left_min: 2, right_min: 3 }",
          ],
          [
            "            .collect()\n    }\n}\n",
            String.raw`            .collect()
    }
}

/// Splits "as-so-ciate" into "associate" and the positions of its hyphens.
fn exception(line: &str) -> (String, Vec<usize>) {
    let mut word = String::new();
    let mut points = Vec::new();
    for part in line.split('-') {
        if !word.is_empty() {
            points.push(word.chars().count());
        }
        word.push_str(part);
    }
    (word.to_lowercase(), points)
}
`,
          ],
        ],
        "patterns/hyph-en-us.pat": [["per3s\n", "per3s\n" + patternsExceptions]],
        "tests/hyphenate.rs": [
          [
            "#[test]\nfn short_words",
            `#[test]
fn exceptions_override_the_patterns() {
    let h = Hyphenator::english();
    assert_eq!(h.hyphenate("table"), vec![2]);
    assert!(h.hyphenate("project").is_empty());
}

#[test]
fn short_words`,
          ],
        ],
      },
    },
    {
      label: "fallback",
      message: `layout: fall back instead of failing on hard paragraphs

A paragraph that can't be set within the tolerance used to abort the
whole document. Now we retry with a much looser tolerance, and if that
fails too, break first-fit. The result can be ugly, but you get a PDF
and can see which paragraph needs attention.`,
      author: "wren",
      daysAgo: 297,
      changes: {
        "src/linebreak.rs": [["    node.demerits + d\n}\n", "    node.demerits + d\n}\n" + greedyFn]],
        "src/layout.rs": [
          ["use anyhow::{bail, Result};", "use anyhow::Result;"],
          [
            "use crate::linebreak::{break_lines, Item, Params, INFINITY};",
            "use crate::linebreak::{break_lines, greedy, Item, Params, INFINITY};",
          ],
          [
            `        let Some(breaks) = break_lines(&items, measure, Params::default()) else {
            bail!("could not set the paragraph starting {:?}", text.chars().take(40).collect::<String>());
        };
`,
            `        let breaks = break_lines(&items, measure, Params::default())
            .or_else(|| break_lines(&items, measure, Params { tolerance: 10.0, ..Params::default() }))
            .unwrap_or_else(|| greedy(&items, measure));
`,
          ],
        ],
      },
    },
    {
      label: "empty-paragraph",
      message: `layout: skip paragraphs with no text

A paragraph containing only an image has no text once we drop the
image, and indexing the empty piece list panicked. Skip it until images
are supported.`,
      author: "felix",
      daysAgo: 281,
      changes: {
        "src/layout.rs": [
          [
            "        let space = font.width(\" \", size);\n        let pieces = pieces(",
            "        if text.trim().is_empty() {\n            continue;\n        }\n        let space = font.width(\" \", size);\n        let pieces = pieces(",
          ],
        ],
      },
    },
    {
      label: "justify-tj",
      message: `pdf: justify with TJ offsets instead of Tw

Tw only applies to the single-byte character code 32, and with a CID
font and Identity-H encoding there is no such code, so every line came
out ragged-right in conforming viewers. (pdf.js applies it anyway,
which is why it looked fine in Firefox.) Show each word separately and
put the space in a TJ adjustment instead.`,
      author: "wren",
      daysAgo: 278,
      changes: {
        "src/pdf.rs": [
          [
            `            content.set_word_spacing(run.word_spacing);
            content.next_line(run.x, run.y);
            content.show(Str(&encode(document, &run.text)));
`,
            `            content.next_line(run.x, run.y);
            let space = document.font.width(" ", run.size) + run.word_spacing;
            let mut shown = content.show_positioned();
            let mut items = shown.items();
            for (i, word) in run.text.split(' ').enumerate() {
                if i > 0 {
                    items.adjust(-space * 1000.0 / run.size);
                }
                items.show(Str(&encode(document, word)));
            }
            items.finish();
            shown.finish();
`,
          ],
        ],
      },
    },
    {
      label: "folios",
      message: `Add folios

A [folio] section in the template puts the page number centred at the
foot of each page, offset from the bottom edge.`,
      author: "wren",
      daysAgo: 266,
      changes: {
        "src/template.rs": [
          [
            "    pub text: Text,\n}\n",
            "    pub text: Text,\n    #[serde(default)]\n    pub folio: Option<Folio>,\n}\n\n#[derive(Debug, Clone, Deserialize)]\npub struct Folio {\n    pub size: f32,\n    /// Distance from the bottom edge of the page to the baseline.\n    pub offset: Length,\n}\n",
          ],
        ],
        "src/layout.rs": [
          [
            "    Ok(Document { pages, font })",
            `    if let Some(folio) = &template.folio {
        for (index, page) in pages.iter_mut().enumerate() {
            let text = (index + 1).to_string();
            let x = (template.page.width.0 - font.width(&text, folio.size)) / 2.0;
            page.runs.push(Run { x, y: folio.offset.0, size: folio.size, text, word_spacing: 0.0 });
        }
    }
    Ok(Document { pages, font })`,
          ],
        ],
      },
    },
    {
      label: "novel-template",
      message: `Add an A5 novel template and a sample chapter

templates/novel.toml is what I use for fiction proofs. The sample is
public domain-ish (I wrote it) and exercises hyphenation and section
breaks.`,
      author: "jonas",
      daysAgo: 251,
      changes: {
        "templates/novel.toml": novelToml,
        "examples/sample.md": sampleMd,
        "README.md": [
          [
            "Without a template, pagecraft uses a plain A4 page.\n",
            "Without a template, pagecraft uses a plain A4 page. `templates/novel.toml`\nis an A5 book page with folios; try it on `examples/sample.md`.\n",
          ],
        ],
      },
    },
    {
      label: "release-0.1.0",
      message: `Release 0.1.0`,
      author: "wren",
      daysAgo: 240,
      changes: {
        "CHANGELOG.md": changelog010,
      },
    },
    {
      label: "hyph-bytes",
      message: `hyphenate: return byte offsets, not character indices

layout slices the word at the returned positions, which are character
indices. For any word with a non-ASCII letter before a hyphenation point
("naïveté", "Gödel's") that panicked with "byte index is not a char
boundary". Convert to byte offsets before returning, for exceptions as
well as patterns.

Lowercasing can change the number of characters (a dotted capital I
becomes two), in which case we don't hyphenate the word at all rather
than guess.`,
      author: "ines",
      daysAgo: 225,
      changes: {
        "src/hyphenate.rs": hyphenateRsFixed,
        "tests/hyphenate.rs": [
          [
            "#[test]\nfn short_words",
            `#[test]
fn positions_are_byte_offsets() {
    let h = Hyphenator::english();
    for word in ["naïveté", "Gödelization", "ﬁligree"] {
        for point in h.hyphenate(word) {
            assert!(word.is_char_boundary(point), "{word}: {point}");
        }
    }
}

#[test]
fn short_words`,
          ],
        ],
      },
    },
    {
      label: "fitness",
      message: `linebreak: add fitness classes

Classify each line as tight, decent, loose or very loose and add
demerits when adjacent lines are more than one class apart. A very
loose line right after a tight one is what makes rivers jump out in
narrow columns; Knuth and Plass call this out for a reason.

Active nodes are now kept per fitness class, so we don't throw away a
slightly worse break that would fit better with the next line.`,
      author: "jonas",
      daysAgo: 206,
      changes: {
        "src/linebreak.rs": [
          [
            "    /// Extra demerits for two hyphenated lines in a row.\n    pub flagged_demerits: f32,\n}",
            "    /// Extra demerits for two hyphenated lines in a row.\n    pub flagged_demerits: f32,\n    /// Extra demerits for adjacent lines more than one fitness class apart.\n    pub fitness_demerits: f32,\n}",
          ],
          [
            "flagged_demerits: 3000.0 }",
            "flagged_demerits: 3000.0, fitness_demerits: 3000.0 }",
          ],
          [
            "    flagged: bool,\n    previous: Option<usize>,\n}\n",
            `    flagged: bool,
    fitness: u8,
    previous: Option<usize>,
}

/// 0 = tight, 1 = decent, 2 = loose, 3 = very loose.
fn fitness(ratio: f32) -> u8 {
    match ratio {
        r if r < -0.5 => 0,
        r if r <= 0.5 => 1,
        r if r <= 1.0 => 2,
        _ => 3,
    }
}
`,
          ],
          [
            "        flagged: false,\n        previous: None,\n    }];",
            "        flagged: false,\n        fitness: 1,\n        previous: None,\n    }];",
          ],
          [
            `            let best = candidates
                .iter()
                .map(|&(a, ratio)| (a, ratio, demerits(&nodes[a], ratio, item, params)))
                .min_by(|x, y| x.2.total_cmp(&y.2));
            if let Some((from, ratio, total)) = best {`,
            `            // The best candidate for each fitness class of the new line.
            let mut best: [Option<(usize, f32, f32)>; 4] = [None; 4];
            for &(a, ratio) in &candidates {
                let class = fitness(ratio);
                let mut total = demerits(&nodes[a], ratio, item, params);
                if class.abs_diff(nodes[a].fitness) > 1 {
                    total += params.fitness_demerits;
                }
                if best[class as usize].map_or(true, |(_, _, d)| total < d) {
                    best[class as usize] = Some((a, ratio, total));
                }
            }
            for (from, ratio, total) in best.into_iter().flatten() {`,
          ],
          [
            "                    flagged: matches!(item, Item::Penalty { flagged: true, .. }),\n",
            "                    flagged: matches!(item, Item::Penalty { flagged: true, .. }),\n                    fitness: fitness(ratio),\n",
          ],
        ],
        "tests/linebreak.rs": [
          [
            "#[test]\nfn a_box_wider",
            `#[test]
fn avoids_a_loose_line_after_a_tight_one() {
    let items = words(&[18.0, 30.0, 12.0, 25.0, 9.0, 31.0, 14.0, 22.0, 17.0, 28.0]);
    let breaks = break_lines(&items, 80.0, Params::default()).unwrap();
    for pair in breaks[..breaks.len() - 1].windows(2) {
        assert!((pair[0].ratio - pair[1].ratio).abs() < 1.5, "{pair:?}");
    }
}

#[test]
fn a_box_wider`,
          ],
        ],
      },
    },
    {
      label: "font-cache",
      message: `font: cache advance widths

Font::width parsed the font's tables again on every call, and layout
calls it for every word fragment. On a 300-page manuscript that was
70% of the run time. Cache advances per character the first time we
see them.

Before: 41.2 s, after: 3.9 s for the sample book on my laptop.`,
      author: "yuki",
      daysAgo: 190,
      changes: {
        "src/font.rs": fontRsCached,
      },
    },
    {
      label: "kerning",
      message: `font: apply kerning from the kern table

Pairs like "AV", "To" and "y." were measured at their full advance, so
lines measured slightly wider than they were drawn. Read the kern table
(format 0) and include pair adjustments in Font::width.

GPOS kerning isn't handled yet; most of the fonts we test with still
ship a kern table as well.`,
      author: "wren",
      daysAgo: 172,
      changes: {
        "src/font.rs": [
          [
            "            .sum();\n        units * size / self.units_per_em\n    }\n",
            `            .sum();
        drop(advances);
        let mut chars = text.chars().peekable();
        let mut kerning = 0.0;
        while let (Some(left), Some(&right)) = (chars.next(), chars.peek()) {
            kerning += self.kern(left, right);
        }
        (units + kerning) * size / self.units_per_em
    }

    /// Kerning adjustment between two characters, in font units.
    pub fn kern(&self, left: char, right: char) -> f32 {
        let face = self.face();
        let (Some(l), Some(r)) = (face.glyph_index(left), face.glyph_index(right)) else {
            return 0.0;
        };
        face.tables()
            .kern
            .into_iter()
            .flat_map(|kern| kern.subtables)
            .filter(|s| s.horizontal && !s.variable)
            .find_map(|s| s.glyphs_kerning(l, r))
            .map_or(0.0, f32::from)
    }
`,
          ],
        ],
      },
    },
    {
      label: "footnotes",
      message: `Add footnotes

Markdown footnotes ([^label] and [^label]: text) are numbered in order
of first reference and set in a smaller size at the foot of the page
that cites them. Space for a note is reserved when the line with its
marker is placed, so a note never ends up on a different page from its
reference.

Long notes don't break across pages yet.`,
      author: "wren",
      daysAgo: 161,
      changes: {
        "src/footnotes.rs": footnotesRs,
        "src/lib.rs": libRsFootnotes,
        "src/markdown.rs": markdownRsFootnotes,
        "src/layout.rs": layoutRsFootnotes,
        "src/pdf.rs": [
          ["        for run in &page.runs {\n", "        for run in page.runs.iter().chain(&page.notes) {\n"],
        ],
      },
    },
    {
      label: "footnote-numbering",
      message: `footnotes: restart numbering at each chapter

A level-one heading starts a new chapter, and footnote numbers start
again from 1, which is what every book I've designed has wanted.`,
      author: "wren",
      daysAgo: 159,
      changes: {
        "src/footnotes.rs": [
          [
            "fn superscript(",
            "impl Notes {\n    /// Starts numbering from 1 again, at the start of a chapter.\n    pub fn restart(&mut self) {\n        self.numbers.clear();\n    }\n}\n\nfn superscript(",
          ],
        ],
        "src/layout.rs": [
          [
            "        if text.trim().is_empty() {\n            continue;\n        }\n",
            "        if text.trim().is_empty() {\n            continue;\n        }\n        if matches!(block, Block::Heading { level: 1, .. }) {\n            notes.restart();\n        }\n",
          ],
        ],
        "README.md": [
          [
            "- Optimal line breaking with hyphenation (US English)\n",
            "- Optimal line breaking with hyphenation (US English)\n- Footnotes, numbered per chapter, at the foot of the page that cites them\n",
          ],
        ],
      },
    },
    {
      label: "bump-0.2.0",
      message: `Release 0.2.0`,
      author: "wren",
      daysAgo: 141,
      changes: {
        "Cargo.toml": [['version = "0.1.0"', 'version = "0.2.0"']],
        "CHANGELOG.md": changelog020,
      },
    },
    {
      label: "overfull",
      message: `layout: warn about overfull lines

When the greedy fallback sets a line wider than the measure (usually a
long URL or identifier), print where it is, the way TeX reports an
overfull hbox:

    pagecraft: overfull line on page 12 (4.7pt too wide): "https://..."

Previously the text just ran into the margin with no hint.`,
      author: "theo",
      daysAgo: 121,
      changes: {
        "src/layout.rs": [
          [
            "        runs.push(Run { x: 0.0, y: 0.0, size, text: line, word_spacing });\n",
            `        let excess = font.width(&line, size) - measure;
        if excess > 0.5 {
            eprintln!("pagecraft: overfull line ({excess:.1}pt too wide): {line:?}");
        }
        runs.push(Run { x: 0.0, y: 0.0, size, text: line, word_spacing });
`,
          ],
        ],
      },
    },
    {
      label: "widows",
      message: `layout: avoid widows and orphans

Don't leave the first line of a paragraph alone at the foot of a page
(an orphan) or its last line alone at the top of the next (a widow).
Either way we move one more line over, which can leave a page a line
short; that's the usual trade.`,
      author: "wren",
      daysAgo: 104,
      changes: {
        "src/layout.rs": [
          [
            "        for (i, mut run) in lines.into_iter().enumerate() {\n",
            `        let count = lines.len();
        for (i, mut run) in lines.into_iter().enumerate() {
            let fits = |lines: usize| y - leading * lines as f32 >= bottom;
            // Orphan: only the first line would fit on this page.
            let orphan = i == 0 && count > 1 && fits(1) && !fits(2);
            // Widow: everything but the last line would fit on this page.
            let widow = count > 2 && i == count - 2 && fits(1) && !fits(2);
            if orphan || widow {
                pages.push(Page::default());
                y = template.top();
                bottom = template.bottom();
            }
`,
          ],
        ],
      },
    },
    {
      label: "pdf-lang",
      message: `pdf: set the document language and title

Without /Lang, screen readers guess the language and often read an
English book with a German voice (or the other way round, as reported).
The template's [document] section sets the language, defaulting to
"en". The first level-one heading becomes the document title, and
viewers are asked to show it instead of the file name.`,
      author: "lena",
      daysAgo: 72,
      changes: {
        "src/template.rs": [
          [
            "    #[serde(default)]\n    pub folio: Option<Folio>,\n}\n",
            "    #[serde(default)]\n    pub folio: Option<Folio>,\n    #[serde(default)]\n    pub document: DocumentInfo,\n}\n\n#[derive(Debug, Clone, Deserialize)]\npub struct DocumentInfo {\n    /// A BCP 47 language tag, such as \"en-GB\" or \"de\".\n    pub language: String,\n}\n\nimpl Default for DocumentInfo {\n    fn default() -> Self {\n        DocumentInfo { language: \"en\".into() }\n    }\n}\n",
          ],
        ],
        "src/layout.rs": [
          [
            "pub struct Document {\n    pub pages: Vec<Page>,\n    pub font: Font,\n}",
            "pub struct Document {\n    pub pages: Vec<Page>,\n    pub font: Font,\n    /// The text of the first level-one heading, if there is one.\n    pub title: Option<String>,\n}",
          ],
          [
            "    Ok(Document { pages, font })",
            "    let title = blocks.iter().find_map(|b| match b {\n        Block::Heading { level: 1, text } => Some(text.clone()),\n        _ => None,\n    });\n    Ok(Document { pages, font, title })",
          ],
        ],
        "src/pdf.rs": [
          ["use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref, Str};", "use pdf_writer::{Content, Finish, Name, Pdf, Rect, Ref, Str, TextStr};"],
          ["    let file_id = alloc();\n", "    let file_id = alloc();\n    let info_id = alloc();\n"],
          [
            "    pdf.catalog(catalog_id).pages(tree_id);\n",
            `    let mut catalog = pdf.catalog(catalog_id);
    catalog.pages(tree_id);
    catalog.lang(TextStr(&template.document.language));
    catalog.viewer_preferences().display_doc_title(true);
    catalog.finish();
    let mut info = pdf.document_info(info_id);
    info.producer(TextStr(concat!("pagecraft ", env!("CARGO_PKG_VERSION"))));
    if let Some(title) = &document.title {
        info.title(TextStr(title));
    }
    info.finish();
`,
          ],
        ],
      },
    },
    {
      label: "hanging-punctuation",
      message: `layout: hang opening quotes into the margin

A line that starts with a quotation mark looks indented by the width of
the quote. Shift it left by that width so the letters line up with the
lines above and below. Only opening quotes for now; hanging trailing
punctuation needs the line breaker to know about it too.`,
      author: "wren",
      daysAgo: 55,
      changes: {
        "src/layout.rs": [
          [
            "            run.y = y;\n",
            "            run.y = y;\n            run.x = template.left() - hang(&run.text, &font, size);\n",
          ],
          [
            "fn pieces(",
            `/// How far a line should hang into the left margin: the width of an
/// opening quotation mark at its start.
fn hang(line: &str, font: &Font, size: f32) -> f32 {
    match line.chars().next() {
        Some(c @ ('“' | '‘' | '"' | '\\'' | '«')) => font.width(c.encode_utf8(&mut [0; 4]), size),
        _ => 0.0,
    }
}

fn pieces(`,
          ],
        ],
      },
    },
    {
      label: "release-script",
      message: `Add a release script

Builds static Linux binaries (musl), macOS for both architectures and a
Windows binary, and writes SHA256SUMS next to them. Run on a tagged
commit; the CI job will call this once the runners are set up.`,
      author: "kofi",
      daysAgo: 42,
      changes: {
        "scripts/release.sh": releaseSh,
        "Cargo.toml": [['lto = "thin"\n', 'lto = "thin"\ncodegen-units = 1\nstrip = true\n']],
      },
    },
    {
      label: "bump-0.3.0",
      message: `Release 0.3.0`,
      author: "wren",
      daysAgo: 33,
      changes: {
        "Cargo.toml": [['version = "0.2.0"', 'version = "0.3.0"']],
        "CHANGELOG.md": changelog030,
      },
    },
    {
      label: "template-exceptions",
      message: `template: add hyphenation exceptions

Every book has a few names and terms the patterns get wrong. List them
in the template, hyphenated the way you want, and they take precedence
over both the patterns and the built-in exceptions:

    [text]
    exceptions = ["Ta-mar-isk", "Ed-in-burgh"]`,
      author: "jonas",
      daysAgo: 20,
      changes: {
        "src/hyphenate.rs": [
          [
            "    /// Returns the byte offsets in word",
            `    /// Adds exceptions written with hyphens at the allowed break points.
    pub fn add_exceptions<'a>(&mut self, words: impl IntoIterator<Item = &'a str>) {
        for line in words {
            let (word, points) = exception(line);
            self.exceptions.insert(word, points);
        }
    }

    /// Returns the byte offsets in word`,
          ],
        ],
        "src/template.rs": [
          [
            "    #[serde(default = \"yes\")]\n    pub hyphenate: bool,\n",
            "    #[serde(default = \"yes\")]\n    pub hyphenate: bool,\n    /// Words hyphenated by hand, such as \"Ed-in-burgh\".\n    #[serde(default)]\n    pub exceptions: Vec<String>,\n",
          ],
        ],
        "src/layout.rs": [
          [
            "    let hyphenator = Hyphenator::english();\n",
            "    let mut hyphenator = Hyphenator::english();\n    hyphenator.add_exceptions(template.text.exceptions.iter().map(String::as_str));\n",
          ],
        ],
      },
    },
    {
      label: "keep-with-next",
      message: `layout: keep headings with the next paragraph

A heading at the foot of a page with its text on the next is the
oldest mistake in the book. If fewer than two lines of body text would
fit after a heading, start a new page before it.`,
      author: "wren",
      daysAgo: 9,
      changes: {
        "src/layout.rs": [
          [
            "        let count = lines.len();\n",
            `        let count = lines.len();
        if matches!(block, Block::Heading { .. }) {
            let needed = leading * count as f32 + template.text.leading * 2.0;
            if y - needed < bottom {
                pages.push(Page::default());
                y = template.top();
                bottom = template.bottom();
            }
        }
`,
          ],
        ],
      },
    },
    {
      label: "readme-install",
      message: `README: fix the install instructions

"cargo install --path ." only works from a clone, and the README
reads as if it works anywhere. Show cloning with rad first, and point
to the release binaries for people without a Rust toolchain.`,
      author: "self",
      daysAgo: 3,
      changes: {
        "README.md": [
          [
            "    cargo install --path .\n    pagecraft chapter-1.md -o chapter-1.pdf\n",
            `    rad clone rad:z3pGkWq8cTfAmR2vLxN5yJhD7sBe
    cd pagecraft
    cargo install --path .
    pagecraft chapter-1.md -o chapter-1.pdf

Prebuilt binaries for Linux, macOS and Windows are attached to each
release.
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Panic: byte index is not a char boundary when hyphenating",
      author: "ines",
      daysAgo: 231,
      body: `Typesetting a Spanish-English glossary:

\`\`\`
thread 'main' panicked at src/layout.rs:96:30:
byte index 4 is not a char boundary; it is inside 'ï' (bytes 3..5) of \`naïveté\`
\`\`\`

Looks like \`hyphenate()\` returns character positions and layout uses them as byte offsets. pagecraft 0.1.0, rustc 1.79.`,
      labels: ["bug"],
      assignees: ["ines"],
      state: "solved",
      closedHoursAfter: 150,
      comments: [
        {
          author: "wren",
          body: "Oh no, that's exactly it. The doc comment even says byte offsets. Would you like to fix it, or shall I?",
          hoursAfter: 4,
        },
        {
          author: "ines",
          body: "I'll send a patch tonight, I already have it half done locally.",
          hoursAfter: 6,
          replyTo: 0,
          reactions: [{ emoji: "🙏", by: ["wren"] }],
        },
        {
          author: "jonas",
          body: "We should probably also hyphenate non-English words with non-English patterns at some point, but that's a different issue.",
          hoursAfter: 30,
        },
      ],
    },
    {
      title: "Paragraph with only an image crashes the layout",
      author: "felix",
      daysAgo: 283,
      body: `\`\`\`md
Some text.

![diagram](diagram.png)

More text.
\`\`\`

\`\`\`
thread 'main' panicked at src/layout.rs:62:40:
index out of bounds: the len is 2 but the index is 2
\`\`\`

I know images aren't supported, but I'd expect them to be skipped rather than crash.`,
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 50,
      comments: [
        {
          author: "wren",
          body: "Agreed. A patch that skips empty paragraphs would be very welcome if you have time; otherwise I'll get to it this week.",
          hoursAfter: 10,
        },
        {
          author: "felix",
          body: "Pushed a one-line fix to main via the patch, thanks for the quick merge.",
          hoursAfter: 50,
        },
      ],
    },
    {
      title: "Footnotes",
      author: "jonas",
      daysAgo: 246,
      body: "The Quill style guide uses footnotes for every source, so this is the one thing stopping me from using pagecraft for it. pulldown-cmark already parses `[^1]` references and definitions. Notes at the foot of the citing page, numbered per chapter, would cover what I need.",
      labels: ["enhancement"],
      assignees: ["wren"],
      state: "solved",
      closedHoursAfter: 2050,
      comments: [
        {
          author: "wren",
          body: "Yes, this is next after the fitness classes. The hard part is that a note's height changes where the page breaks, which changes which notes go on which page. I'll start with the simple version: reserve space when the reference line is placed, and never break a note across pages.",
          hoursAfter: 20,
          reactions: [{ emoji: "👍", by: ["jonas"] }],
        },
        {
          author: "mira",
          body: "Please keep the markers as real text rather than drawing them as graphics, so they survive copy and paste and screen readers can find them.",
          hoursAfter: 40,
        },
        {
          author: "wren",
          body: "They're superscript digit characters for now, so they copy as ¹²³. Proper tagged PDF footnotes would need structure tags, which we don't write yet.",
          hoursAfter: 44,
          replyTo: 1,
        },
        {
          author: "wren",
          body: "Merged. Notes longer than the remaining space still push the paragraph to the next page rather than splitting; let's see if anyone runs into that.",
          hoursAfter: 2050,
          reactions: [{ emoji: "🎉", by: ["jonas", "mira"] }],
        },
      ],
    },
    {
      title: "Rivers in narrow columns",
      author: "hana",
      daysAgo: 214,
      body: `Setting a 60mm column for a field guide sidebar, I get very loose lines right after very tight ones, and the spaces line up into obvious rivers. Screenshot of page 3 attached in the thread on our forum, but basically: line 4 has 1pt spaces, line 5 has 9pt spaces.

Is this the line breaker or my settings?`,
      labels: ["bug", "typography"],
      state: "solved",
      closedHoursAfter: 200,
      comments: [
        {
          author: "jonas",
          body: "It's the line breaker. We only implement half of Knuth–Plass: there are no fitness classes, so nothing penalises a loose line next to a tight one. I'll add them.",
          hoursAfter: 6,
        },
        {
          author: "wren",
          body: "Also worth trying `hyphenate = true` with a narrower tolerance once that lands. 60mm at 10pt is tough for any breaker.",
          hoursAfter: 12,
        },
        {
          author: "hana",
          body: "Tried main after the fitness patch: much better. There's still one loose line on page 7 but it's next to a long word that can't be hyphenated.",
          hoursAfter: 200,
          reactions: [{ emoji: "🎉", by: ["jonas"] }],
        },
      ],
    },
    {
      title: "Typesetting a 300-page book takes 40 seconds",
      author: "yuki",
      daysAgo: 195,
      body: `\`perf\` says 70% of the time is in \`ttf_parser::Face::parse\`, called from \`Font::width\`. Every measurement re-parses the font tables.

\`\`\`
  70.3%  ttf_parser::Face::parse
   9.1%  pagecraft::hyphenate::Hyphenator::hyphenate
   6.0%  pagecraft::linebreak::break_lines
\`\`\``,
      labels: ["perf"],
      assignees: ["yuki"],
      state: "solved",
      closedHoursAfter: 120,
      comments: [
        {
          author: "wren",
          body: "Ouch, yes. I wrote face() as a convenience and then called it in the hottest loop. Caching advances per char would be the easy win.",
          hoursAfter: 3,
        },
        {
          author: "yuki",
          body: "On it. Hyphenation is next on the list: it builds a String for every substring of every word. A trie would fix that, but it's a bigger change.",
          hoursAfter: 5,
          replyTo: 0,
        },
        {
          author: "yuki",
          body: "41.2 s to 3.9 s with the cache. Leaving the hyphenation trie for another day.",
          hoursAfter: 120,
          reactions: [{ emoji: "🚀", by: ["wren", "jonas", "kofi"] }],
        },
      ],
    },
    {
      title: "Long URLs run off the page without any warning",
      author: "theo",
      daysAgo: 127,
      body: "A paragraph with `https://archive.example.org/collections/2019/field-notes/volume-3/index.html` in a 100mm column gets set with the URL sticking 20pt into the right margin. That's probably the best we can do, but it would be nice to be told, like TeX does, so I can fix the source.",
      labels: ["enhancement"],
      state: "solved",
      closedHoursAfter: 140,
      comments: [
        {
          author: "wren",
          body: "Yes. An \"overfull line\" warning on stderr with the page and the line text. Want to take it?",
          hoursAfter: 8,
        },
        {
          author: "theo",
          body: "Sure. Page numbers aren't known when the line is set though, only once it's placed. I'll start with the text and add the page later.",
          hoursAfter: 20,
          replyTo: 0,
        },
        {
          author: "kofi",
          body: "A `--strict` flag that turns these into errors would be great for CI.",
          hoursAfter: 60,
        },
      ],
    },
    {
      title: "Widows and orphans",
      author: "jonas",
      daysAgo: 110,
      body: "The sample chapter ends page 2 with the first line of a paragraph, and page 5 starts with the last line of one. Any book designer would send that back.",
      labels: ["enhancement", "typography"],
      assignees: ["wren"],
      state: "solved",
      closedHoursAfter: 150,
      comments: [
        {
          author: "wren",
          body: "I know, it hurts me every time I open the sample. Moving one line over is the simple fix; balancing facing pages is a lot more work and can wait.",
          hoursAfter: 2,
          reactions: [{ emoji: "😂", by: ["jonas"] }],
        },
      ],
    },
    {
      title: "PDF has no document language, screen reader uses the wrong voice",
      author: "lena",
      daysAgo: 76,
      body: `Opening a pagecraft PDF with NVDA on a German system, the English text is read with the German voice, which is close to unintelligible. The PDF has no /Lang entry, so the reader falls back to the system language.

The title bar also shows the file name instead of the document title. Both are one-line fixes in the catalog, I think. I can send a patch.`,
      labels: ["accessibility", "bug"],
      assignees: ["lena"],
      state: "solved",
      closedHoursAfter: 100,
      comments: [
        {
          author: "wren",
          body: "Please do! Language should come from the template, I think, with \"en\" as the default.",
          hoursAfter: 5,
        },
        {
          author: "lena",
          body: "Done. Proper tagged PDF (headings, paragraphs, reading order) is the bigger job. Should I open a separate issue for that?",
          hoursAfter: 100,
        },
        {
          author: "wren",
          body: "Yes please. It's a big one, but I'd like pagecraft PDFs to be accessible by default rather than as an afterthought.",
          hoursAfter: 104,
          replyTo: 1,
          reactions: [{ emoji: "❤️", by: ["lena", "mira"] }],
        },
      ],
    },
    {
      title: "Images",
      author: "amara",
      daysAgo: 62,
      body: "We'd like to use pagecraft for our printed field guides, which need photos and simple diagrams. PNG and JPEG would be enough, scaled to the text width, with the alt text as a caption. Is this in scope?",
      labels: ["enhancement"],
      comments: [
        {
          author: "wren",
          body: "Yes, it's the most requested thing. The design question is placement: in the flow (simple, but leaves big gaps at page ends) or floated to the top of the next page like LaTeX figures. I'd start with in-flow.",
          hoursAfter: 9,
        },
        {
          author: "amara",
          body: "In-flow is fine for us. I can try a patch: decode with the image crate, embed as XObjects.",
          hoursAfter: 30,
          replyTo: 0,
        },
        {
          author: "lena",
          body: "Please keep the alt text in the PDF as well (as /Alt on the figure), not only as a visible caption. Some captions describe the image, others don't.",
          hoursAfter: 33,
        },
        {
          author: "jonas",
          body: "The image crate is a big dependency for a typesetter. Could we take PNG and JPEG as they are (JPEG can be embedded with DCTDecode directly)?",
          hoursAfter: 40,
        },
        {
          author: "amara",
          body: "JPEG yes. PNG needs at least un-filtering the rows, but the png crate alone is much smaller than image. I'll go with that.",
          hoursAfter: 52,
          replyTo: 3,
        },
      ],
    },
    {
      title: "Ligatures (fi, fl) aren't used",
      author: "self",
      daysAgo: 28,
      body: "I'm setting a short story in EB Garamond, and \"find\" and \"flow\" come out with separate f and i glyphs that collide. The font has fi and fl ligatures in GSUB. Is shaping on the roadmap, or would a small ligature table for the common cases be acceptable?",
      labels: ["enhancement", "typography"],
      assignees: ["wren"],
      comments: [
        {
          author: "wren",
          body: "Shaping is on the roadmap, and I'd rather do it properly with rustybuzz than special-case fi and fl. It also gets us kerning from GPOS, which the kern table doesn't always have.",
          hoursAfter: 7,
        },
        {
          author: "self",
          body: "Makes sense. Happy to test a branch when there is one, I have a few fonts with unusual ligatures.",
          hoursAfter: 12,
          replyTo: 0,
        },
        {
          author: "jonas",
          body: "One thing to keep in mind: ligatures need ActualText or a ToUnicode map, or copying \"find\" out of the PDF gives you \"nd\" with a strange glyph in front.",
          hoursAfter: 26,
          reactions: [{ emoji: "👀", by: ["wren", "lena"] }],
        },
      ],
    },
    {
      title: "Headings stranded at the foot of the page",
      author: "kofi",
      daysAgo: 17,
      body: "Rendering our ops handbook, three chapters have their \"## Before you start\" heading as the last line of a page, with the text on the next. Is there a keep-with-next setting?",
      labels: ["bug", "typography"],
      state: "solved",
      closedHoursAfter: 190,
      comments: [
        {
          author: "wren",
          body: "Not yet, but there should be, and it shouldn't be a setting: nobody wants a stranded heading. I'll make headings require room for two lines of the following paragraph.",
          hoursAfter: 4,
          reactions: [{ emoji: "👍", by: ["kofi"] }],
        },
      ],
    },
    {
      title: "Can I use variable fonts?",
      author: "diego",
      daysAgo: 13,
      body: "I tried Source Serif 4 Variable and the PDF uses the default instance (regular weight, 'text' optical size) regardless of the heading size. Is there a way to pick an axis value per element, or should I use static instances?",
      labels: ["question"],
      comments: [
        {
          author: "wren",
          body: "Use static instances for now. The PDF needs a separate embedded font per instance, since PDF has no notion of variations, so we'd have to instantiate the font ourselves. It's on my list but not soon.",
          hoursAfter: 10,
        },
        {
          author: "diego",
          body: "Static instances it is, thanks. Might be worth a line in the README, I spent a while thinking I'd set something up wrong.",
          hoursAfter: 22,
          replyTo: 0,
        },
      ],
    },
  ],
  patches: [
    {
      title: "hyphenate: return byte offsets",
      author: "ines",
      daysAgo: 229,
      labels: ["bug"],
      state: "merged",
      revisions: [
        {
          description:
            "Fixes the panic on words with non-ASCII letters. `hyphenate()` now converts character positions to byte offsets before returning them, which is what layout expects (and what the doc comment already promised).",
          hoursAfter: 0,
          base: "release-0.1.0",
          commits: [
            {
              message: `hyphenate: return byte offsets, not character indices`,
              author: "ines",
              daysAgo: 229,
              changes: {
                "src/hyphenate.rs": [
                  [
                    "        let n = chars.len() - 2;\n        (self.left_min..=n.saturating_sub(self.right_min))\n            .filter(|&i| values[i + 1] % 2 == 1)\n            .collect()",
                    "        let n = chars.len() - 2;\n        let offsets: Vec<usize> = word.char_indices().map(|(i, _)| i).collect();\n        (self.left_min..=n.saturating_sub(self.right_min))\n            .filter(|&i| values[i + 1] % 2 == 1)\n            .map(|i| offsets[i])\n            .collect()",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "wren",
              hoursAfter: 14,
              summary: "Thanks for the quick fix! Two more places with the same problem, I think.",
              comments: [
                {
                  body: "Exceptions are returned before the conversion, so \"naïve\" with an exception entry would still panic. Could the offsets be computed first and used for both?",
                  path: "src/hyphenate.rs",
                  line: 50,
                },
                {
                  body: "If to_lowercase changes the length of the word (Turkish dotted İ becomes two chars), indices into lower and word no longer correspond and offsets[i] could even go out of bounds.",
                  path: "src/hyphenate.rs",
                  line: 49,
                },
              ],
            },
          ],
        },
        {
          description:
            "Computes offsets up front and uses them for exceptions too. Words whose length changes when lowercased aren't hyphenated at all, since there's no sensible mapping. Adds a test with three tricky words.",
          hoursAfter: 70,
          fromHistory: ["hyph-bytes"],
          reviews: [
            {
              author: "wren",
              hoursAfter: 3,
              verdict: "accept",
              summary: "Perfect, thank you. The ligature in the test is a nice touch.",
              comments: [
                {
                  body: "Good call to bail out here rather than guess.",
                  path: "src/hyphenate.rs",
                  line: 54,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "linebreak: add fitness classes",
      author: "jonas",
      daysAgo: 209,
      labels: ["typography"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds Knuth and Plass's fitness classes: lines are tight, decent, loose or very loose, and adjacent lines more than one class apart get extra demerits. Fixes most of the rivers reported in narrow columns.",
          hoursAfter: 0,
          base: "hyph-bytes",
          commits: [
            {
              message: `linebreak: penalise adjacent lines in distant fitness classes`,
              author: "jonas",
              daysAgo: 209,
              changes: {
                "src/linebreak.rs": [
                  [
                    "    flagged: bool,\n    previous: Option<usize>,\n}\n",
                    `    flagged: bool,
    fitness: u8,
    previous: Option<usize>,
}

fn fitness(ratio: f32) -> u8 {
    match ratio {
        r if r < -0.5 => 0,
        r if r <= 0.5 => 1,
        r if r <= 1.0 => 2,
        _ => 3,
    }
}
`,
                  ],
                  [
                    "        flagged: false,\n        previous: None,\n    }];",
                    "        flagged: false,\n        fitness: 1,\n        previous: None,\n    }];",
                  ],
                  [
                    "                .map(|&(a, ratio)| (a, ratio, demerits(&nodes[a], ratio, item, params)))",
                    "                .map(|&(a, ratio)| {\n                    let mut total = demerits(&nodes[a], ratio, item, params);\n                    if fitness(ratio).abs_diff(nodes[a].fitness) > 1 {\n                        total += 3000.0;\n                    }\n                    (a, ratio, total)\n                })",
                  ],
                  [
                    "                    flagged: matches!(item, Item::Penalty { flagged: true, .. }),\n",
                    "                    flagged: matches!(item, Item::Penalty { flagged: true, .. }),\n                    fitness: fitness(ratio),\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "wren",
              hoursAfter: 20,
              summary: "The classes are right, but keeping one node per position defeats the purpose.",
              comments: [
                {
                  body: "We still keep only the single cheapest node for each break position, so a slightly more expensive break that would be compatible with the next line is thrown away before the fitness penalty can matter. The paper keeps the best node per fitness class at each position.",
                  path: "src/linebreak.rs",
                  line: 112,
                  endLine: 113,
                },
                {
                  body: "Make this a Params field like flagged_demerits? I'd like to tune it per template eventually.",
                  path: "src/linebreak.rs",
                  line: 108,
                },
              ],
            },
            {
              author: "hana",
              hoursAfter: 26,
              summary: "Ran my 60mm sidebar through this: better, but still two rivers on page 3.",
            },
          ],
        },
        {
          description:
            "Keeps the best active node per fitness class at each break, as in the paper, and moves the demerits into `Params::fitness_demerits`. Adds a regression test from hana's sidebar text.",
          hoursAfter: 72,
          fromHistory: ["fitness"],
          reviews: [
            {
              author: "wren",
              hoursAfter: 6,
              verdict: "accept",
              summary: "That's the real thing now. Merging.",
              comments: [
                {
                  body: "Nice and compact.",
                  path: "src/linebreak.rs",
                  line: 118,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "hana",
              body: "No rivers left on page 3. Thank you both!",
              hoursAfter: 20,
              reactions: [{ emoji: "🎉", by: ["jonas", "wren"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Add footnotes",
      author: "wren",
      daysAgo: 163,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "Markdown footnotes, set at the foot of the page that cites them and numbered per chapter. Space is reserved when the line with the marker is placed. Notes don't break across pages yet.",
          hoursAfter: 0,
          fromHistory: ["footnotes", "footnote-numbering"],
          reviews: [
            {
              author: "jonas",
              hoursAfter: 18,
              verdict: "accept",
              summary: "Tried it on the style guide, 140 notes, all on the right pages. 🎉",
              comments: [
                {
                  body: "A note cited a second time in a later paragraph doesn't reserve space again, which is right on the same page but wrong if the second citation is on a later page. Fine for now, but worth a known-issues line.",
                  path: "src/footnotes.rs",
                  line: 37,
                },
              ],
            },
            {
              author: "lena",
              hoursAfter: 30,
              summary: "Looks good. One accessibility note for later.",
              comments: [
                {
                  body: "Superscript digits are fine for copy and paste, but screen readers announce them as \"superscript one\", which is better than nothing. Linking the marker to the note will need tagged PDF, so let's track that separately.",
                  path: "src/footnotes.rs",
                  line: 58,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "Add a greedy --draft mode",
      author: "yuki",
      daysAgo: 198,
      labels: ["perf"],
      state: "archived",
      revisions: [
        {
          description:
            "Adds `--draft`, which uses first-fit line breaking for every paragraph. It's around 5x faster on long books, useful while writing when you only care about page count and flow.",
          hoursAfter: 0,
          commits: [
            {
              message: `Add --draft for fast first-fit layout`,
              author: "yuki",
              daysAgo: 198,
              changes: {
                "src/main.rs": [
                  [
                    "    template: Option<PathBuf>,\n}",
                    "    template: Option<PathBuf>,\n    /// Use fast first-fit line breaking. Pages will look worse.\n    #[arg(long)]\n    draft: bool,\n}",
                  ],
                  [
                    "    let document = layout::typeset(&blocks, &template)?;",
                    "    let document = layout::typeset(&blocks, &template, args.draft)?;",
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "wren",
              body: "Thanks for trying this. After the advance cache, the full layout of the sample book takes under 4 seconds, and I'd rather not have a mode whose output looks different from the real thing: people will send draft PDFs to printers. Can we revisit if it gets slow again?",
              hoursAfter: 20,
            },
            {
              author: "yuki",
              body: "Fair, the cache made most of the difference. Archiving.",
              hoursAfter: 26,
              replyTo: 0,
              reactions: [{ emoji: "👍", by: ["wren"] }],
            },
          ],
        },
      ],
    },
    {
      title: "README: fix the install instructions",
      author: "self",
      daysAgo: 3,
      labels: ["docs"],
      state: "merged",
      revisions: [
        {
          description:
            "The install command only works from inside a clone, which the README didn't say. Shows `rad clone` first and mentions the release binaries.",
          hoursAfter: 0,
          fromHistory: ["readme-install"],
          reviews: [
            {
              author: "wren",
              hoursAfter: 5,
              verdict: "accept",
              summary: "Thank you, this has tripped up at least three people.",
            },
          ],
        },
      ],
    },
    {
      title: "Add PNG and JPEG images",
      author: "amara",
      daysAgo: 48,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "First pass at images. JPEG is embedded as is with DCTDecode; PNG will need the png crate for un-filtering, not done yet. Images are scaled to the measure and placed in the flow, with the alt text as a caption underneath.",
          hoursAfter: 0,
          commits: [
            {
              message: `markdown: parse images into blocks`,
              author: "amara",
              daysAgo: 48,
              changes: {
                "src/markdown.rs": [
                  [
                    "    Footnote { label: String, text: String },\n}",
                    "    Footnote { label: String, text: String },\n    /// An image on its own line. Alt text becomes the caption.\n    Image { path: String, alt: String },\n}",
                  ],
                  [
                    "    let mut footnote: Option<String> = None;\n",
                    "    let mut footnote: Option<String> = None;\n    let mut image: Option<String> = None;\n",
                  ],
                  [
                    "            Event::Rule => blocks.push(Block::Break),\n",
                    `            Event::Start(Tag::Image { dest_url, .. }) => {
                image = Some(dest_url.to_string());
                text.clear();
            }
            Event::End(TagEnd::Image) => {
                if let Some(path) = image.take() {
                    let alt = std::mem::take(&mut text);
                    blocks.push(Block::Image { path, alt });
                }
            }
            Event::Rule => blocks.push(Block::Break),
`,
                  ],
                ],
              },
            },
            {
              message: `layout: place JPEG images in the flow`,
              author: "amara",
              daysAgo: 47,
              changes: {
                "src/image.rs": String.raw`//! Images placed in the text flow. Only JPEG for now: PDF can embed it
//! as is with the DCTDecode filter.

use std::path::Path;

use anyhow::{bail, Context, Result};

pub struct Image {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub alt: String,
}

impl Image {
    pub fn load(path: &Path, alt: &str) -> Result<Image> {
        let data = std::fs::read(path).with_context(|| format!("reading image {}", path.display()))?;
        let Some((width, height)) = jpeg_size(&data) else {
            bail!("{}: only JPEG images are supported so far", path.display());
        };
        Ok(Image { data, width, height, alt: alt.to_string() })
    }
}

/// Reads the size from a JPEG's start-of-frame marker.
fn jpeg_size(data: &[u8]) -> Option<(u32, u32)> {
    if data.get(..2)? != [0xFF, 0xD8] {
        return None;
    }
    let mut i = 2;
    while i + 9 < data.len() {
        if data[i] != 0xFF {
            return None;
        }
        let marker = data[i + 1];
        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
        if matches!(marker, 0xC0..=0xC3) {
            let height = u16::from_be_bytes([data[i + 5], data[i + 6]]) as u32;
            let width = u16::from_be_bytes([data[i + 7], data[i + 8]]) as u32;
            return Some((width, height));
        }
        i += 2 + len;
    }
    None
}
`,
                "src/lib.rs": [["pub mod hyphenate;\n", "pub mod hyphenate;\npub mod image;\n"]],
              },
            },
          ],
          reviews: [
            {
              author: "wren",
              hoursAfter: 30,
              summary: "Great start, and thanks for avoiding the image crate. A few notes before this goes further.",
              comments: [
                {
                  body: "Progressive JPEGs use SOF2 (0xC2), which this covers, but arithmetic-coded ones use 0xC9 to 0xCB. Rare, but worth an explicit error rather than \"not a JPEG\".",
                  path: "src/image.rs",
                  line: 37,
                },
                {
                  body: "Image paths should be resolved relative to the Markdown file, not the working directory, or `pagecraft book/ch1.md` breaks.",
                  path: "src/image.rs",
                  line: 17,
                },
              ],
            },
            {
              author: "lena",
              hoursAfter: 34,
              summary: "Please carry the alt text through to the PDF as well.",
              comments: [
                {
                  body: "When this gets to pdf.rs, the alt text should go into the figure's /Alt entry, in addition to the visible caption.",
                  path: "src/image.rs",
                  line: 12,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "Add --watch to rebuild on change",
      author: "kofi",
      daysAgo: 6,
      labels: ["enhancement"],
      state: "open",
      revisions: [
        {
          description:
            "`pagecraft --watch book.md` rebuilds whenever the Markdown file or the template changes. Polls modification times every 500 ms, so no new dependency.",
          hoursAfter: 0,
          commits: [
            {
              message: `Add --watch`,
              author: "kofi",
              daysAgo: 6,
              changes: {
                "src/main.rs": [
                  [
                    "    template: Option<PathBuf>,\n}",
                    "    template: Option<PathBuf>,\n    /// Rebuild whenever the input or template changes.\n    #[arg(long)]\n    watch: bool,\n}",
                  ],
                  [
                    "fn main() -> Result<()> {\n    let args = Args::parse();\n",
                    `fn main() -> Result<()> {
    let args = Args::parse();
    if !args.watch {
        return build(&args);
    }
    let mut last = None;
    loop {
        let stamp = modified(&args);
        if stamp != last {
            last = stamp;
            if let Err(e) = build(&args) {
                eprintln!("pagecraft: {e:#}");
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

fn modified(args: &Args) -> Option<Vec<std::time::SystemTime>> {
    std::iter::once(&args.input)
        .chain(&args.template)
        .map(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
        .collect()
}

fn build(args: &Args) -> Result<()> {
`,
                  ],
                  [
                    "    let output = args.output.unwrap_or_else(|| args.input.with_extension(\"pdf\"));",
                    "    let output = args.output.clone().unwrap_or_else(|| args.input.with_extension(\"pdf\"));",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "wren",
              hoursAfter: 10,
              summary: "Nice and small. One question about failures.",
              comments: [
                {
                  body: "If the file is mid-save when we read it, we build from a truncated file and then won't rebuild until the next change. Could we wait for the mtime to be stable across two polls before building?",
                  path: "src/main.rs",
                  line: 33,
                },
                {
                  body: "Fonts referenced by the template aren't watched. Not essential, but it surprised me when swapping fonts.",
                  path: "src/main.rs",
                  line: 45,
                },
              ],
            },
          ],
        },
        {
          description:
            "Waits for two identical polls before rebuilding, and watches the template's font too.",
          hoursAfter: 30,
          commits: [
            {
              message: `watch: wait for files to settle, and watch the font`,
              author: "kofi",
              daysAgo: 5,
              changes: {
                "src/main.rs": [
                  [
                    "    let mut last = None;\n    loop {\n        let stamp = modified(&args);\n        if stamp != last {\n            last = stamp;\n",
                    "    let mut last = None;\n    let mut previous = None;\n    loop {\n        let stamp = modified(&args);\n        // Only build once the stamps match two polls in a row, so a file\n        // that is still being written isn't read half-way through.\n        if stamp == previous && stamp != last {\n            last = stamp.clone();\n",
                  ],
                  [
                    "        std::thread::sleep(std::time::Duration::from_millis(500));\n",
                    "        previous = stamp;\n        std::thread::sleep(std::time::Duration::from_millis(500));\n",
                  ],
                  [
                    "    std::iter::once(&args.input)\n        .chain(&args.template)\n",
                    "    let font = args\n        .template\n        .as_ref()\n        .and_then(|t| Template::load(t).ok())\n        .map(|t| t.text.font);\n    std::iter::once(&args.input)\n        .chain(&args.template)\n        .chain(&font)\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "jonas",
              hoursAfter: 8,
              verdict: "accept",
              summary: "Works well with my editor's atomic saves. 👍",
            },
          ],
          comments: [
            {
              author: "wren",
              body: "Looks good to me too. I'll merge after the 0.3.1 fixes go out.",
              hoursAfter: 20,
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v0.1.0",
      at: "release-0.1.0",
      title: "pagecraft 0.1.0",
      notes: `The first release worth trying.

- Knuth–Plass line breaking with Liang hyphenation (US English)
- Page templates in TOML, lengths in pt, mm, cm or in
- Folios, and an A5 novel template with a sample chapter
- Paragraphs that can't be set well are still set, never aborted
- Justification that works in every PDF viewer, not just Firefox`,
      author: "wren",
      daysAgo: 240,
      artifacts: [
        { name: "pagecraft-v0.1.0-x86_64-unknown-linux-musl.tar.gz", sizeBytes: 2_184_330 },
        { name: "pagecraft-v0.1.0-aarch64-apple-darwin.tar.gz", sizeBytes: 1_962_118 },
      ],
    },
    {
      tag: "v0.2.0",
      at: "bump-0.2.0",
      title: "pagecraft 0.2.0",
      notes: `- Footnotes, numbered per chapter, at the foot of the citing page
- Fitness classes in the line breaker: far fewer rivers in narrow columns
- Kerning from the kern table
- No more panics hyphenating words with accents (thanks ines)
- About 10x faster on long documents (thanks yuki)`,
      author: "wren",
      daysAgo: 140,
      artifacts: [
        { name: "pagecraft-v0.2.0-x86_64-unknown-linux-musl.tar.gz", sizeBytes: 2_241_907 },
        { name: "pagecraft-v0.2.0-aarch64-apple-darwin.tar.gz", sizeBytes: 2_015_446 },
      ],
    },
    {
      tag: "v0.3.0",
      at: "bump-0.3.0",
      title: "pagecraft 0.3.0",
      notes: `- Widow and orphan control
- Overfull line warnings, like TeX's
- PDFs declare their language and title, for screen readers and window titles (thanks lena)
- Opening quotes hang into the margin
- Release binaries for Linux, macOS and Windows, with checksums`,
      author: "wren",
      daysAgo: 32,
      artifacts: [
        { name: "pagecraft-v0.3.0-x86_64-unknown-linux-musl.tar.gz", sizeBytes: 2_310_552 },
        { name: "pagecraft-v0.3.0-aarch64-unknown-linux-musl.tar.gz", sizeBytes: 2_198_004 },
        { name: "pagecraft-v0.3.0-aarch64-apple-darwin.tar.gz", sizeBytes: 2_087_913 },
        { name: "pagecraft-v0.3.0-x86_64-pc-windows-gnu.tar.gz", sizeBytes: 2_642_771 },
        { name: "SHA256SUMS", sizeBytes: 512 },
      ],
    },
  ],
};
