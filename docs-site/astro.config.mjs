// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://fermi-code.com",
  integrations: [
    starlight({
      title: "Fermi",
      customCss: ["./src/styles/custom.css"],
      // Self-hosted fonts (no Google Fonts round-trip / FOUT). Preload the
      // Instrument Serif faces used above the fold (wordmark + page title).
      head: [
        {
          tag: "link",
          attrs: {
            rel: "preload",
            href: "/fonts/instrument-serif-400-normal-latin.woff2",
            as: "font",
            type: "font/woff2",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preload",
            href: "/fonts/instrument-serif-400-italic-latin.woff2",
            as: "font",
            type: "font/woff2",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: { rel: "stylesheet", href: "/fonts/fonts.css" },
        },
      ],
      disable404Route: false,
      expressiveCode: {
        themes: ["github-dark"],
        // No macOS window chrome / traffic lights — clean like the homepage box
        defaultProps: { frame: "none" },
        styleOverrides: {
          borderRadius: "11px",
          borderColor: "#23262d",
          codeFontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
          codeFontSize: "0.85rem",
          codeBackground: "#15171c",
          codePaddingBlock: "0.9rem",
          codePaddingInline: "1.1rem",
        },
      },
      components: {
        ThemeSelect: "./src/components/ThemeSelect.astro",
        Header: "./src/components/Header.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/FelixRuiGao/Fermi",
        },
      ],
      sidebar: [
        {
          label: "Introduction",
          items: [{ label: "Getting Started", slug: "getting-started" }],
        },
        {
          label: "Providers",
          items: [
            { label: "Overview", slug: "providers" },
            { label: "Cloud Providers", slug: "providers/cloud" },
            { label: "Local Providers", slug: "providers/local" },
            { label: "GitHub Copilot", slug: "providers/copilot" },
            {
              label: "ChatGPT OAuth Login",
              slug: "providers/openai-oauth",
            },
          ],
        },
        {
          label: "Guide",
          items: [
            { label: "Context Management", slug: "guide/context" },
            { label: "Sub-Agents", slug: "guide/sub-agents" },
            { label: "Model Switching", slug: "guide/model-switching" },
            { label: "Permissions & Hooks", slug: "guide/permissions" },
            { label: "Skills", slug: "guide/skills" },
            { label: "MCP Integration", slug: "guide/mcp" },
            { label: "Tools Reference", slug: "guide/tools" },
            { label: "Slash Commands", slug: "guide/commands" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Configuration", slug: "configuration" },
            { label: "FAQ", slug: "faq" },
          ],
        },
      ],
    }),
  ],
});
