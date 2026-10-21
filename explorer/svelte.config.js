import rehypeSlug from "rehype-slug";
import remarkUnwrapImages from "remark-unwrap-images";
import { getSingletonHighlighter } from "shiki";
import { mdsvex, escapeSvelte } from "mdsvex";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Add an id and a leading anchor link to linkable doc entries so they can be
// deep-linked and copied: glossary term paragraphs (a bold term followed by an
// em-dash, e.g. `**Term** — definition`). Each linkable element also gets a
// `term` class that drives the shared styling and copy interaction in
// Docs.svelte.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textOf(node) {
  if (node.type === "text") {
    return node.value;
  }
  if (Array.isArray(node.children)) {
    return node.children.map(textOf).join("");
  }
  return "";
}

function addTermAnchor(node, id, label) {
  node.properties = node.properties || {};
  node.properties.className = [...(node.properties.className || []), "term"];
  node.children.unshift({
    type: "element",
    tagName: "a",
    properties: {
      className: ["term-link"],
      href: `#${id}`,
      ariaLabel: `Link to ${label}`,
    },
    children: [],
  });
}

function rehypeTermAnchors() {
  return tree => {
    const seen = new Map();

    const walk = nodes => {
      for (const node of nodes) {
        // Glossary: a bold term immediately followed by an em-dash. This is
        // pattern-based, so it never matches guide paragraphs.
        if (
          node.type === "element" &&
          node.tagName === "p" &&
          Array.isArray(node.children)
        ) {
          const firstIndex = node.children.findIndex(
            child => !(child.type === "text" && !child.value.trim()),
          );
          const first = node.children[firstIndex];
          const after = node.children[firstIndex + 1];
          const isTerm =
            first &&
            first.type === "element" &&
            first.tagName === "strong" &&
            after &&
            after.type === "text" &&
            /^\s*[—–-]/.test(after.value);

          if (isTerm) {
            const text = textOf(first).trim();
            let slug = slugify(text);
            const count = seen.get(slug) || 0;
            seen.set(slug, count + 1);
            if (count) {
              slug = `${slug}-${count}`;
            }
            node.properties = node.properties || {};
            node.properties.id = slug;
            addTermAnchor(node, slug, text);
            // Drop the em-dash separator from the rendered output, keeping just
            // the bold term followed by its definition.
            after.value = after.value.replace(/^\s*[—–-]\s*/, " ");
          }
        }
        if (Array.isArray(node.children)) {
          walk(node.children);
        }
      }
    };
    walk(tree.children);
  };
}

const mdsvexOptions = {
  extensions: [".md"],
  highlight: {
    highlighter: async (code, lang = "text") => {
      const highlighter = await getSingletonHighlighter({
        themes: ["github-light", "github-dark"],
        langs: [
          "bash",
          "sh",
          "toml",
          "ini",
          "rust",
          "javascript",
          "typescript",
          "json",
          "yaml",
          "markdown",
          "html",
          "css",
        ],
      });
      const html = escapeSvelte(
        highlighter.codeToHtml(code, {
          lang,
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        }),
      );
      return `{@html \`${html}\` }`;
    },
  },
  remarkPlugins: [remarkUnwrapImages],
  rehypePlugins: [rehypeSlug, rehypeTermAnchors],
};

export default {
  extensions: [".svelte", ".md"],
  preprocess: [vitePreprocess(), mdsvex(mdsvexOptions)],
};
