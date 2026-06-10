// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://fermi-code.com",
  integrations: [
    starlight({
      title: "Fermi",
      locales: {
        root: { label: "English", lang: "en" },
        zh: { label: "中文", lang: "zh-CN" },
      },
      defaultLocale: "root",
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
        LanguageSelect: "./src/components/LanguageSelect.astro",
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
          translations: { "zh-CN": "介绍" },
          items: [
            {
              label: "Getting Started",
              translations: { "zh-CN": "快速开始" },
              slug: "getting-started",
            },
          ],
        },
        {
          label: "Providers",
          translations: { "zh-CN": "模型提供商" },
          items: [
            { label: "Overview", translations: { "zh-CN": "概览" }, slug: "providers" },
            { label: "Cloud Providers", translations: { "zh-CN": "云端提供商" }, slug: "providers/cloud" },
            { label: "Local Providers", translations: { "zh-CN": "本地提供商" }, slug: "providers/local" },
            { label: "GitHub Copilot", translations: { "zh-CN": "GitHub Copilot" }, slug: "providers/copilot" },
            {
              label: "ChatGPT OAuth Login",
              translations: { "zh-CN": "ChatGPT OAuth 登录" },
              slug: "providers/openai-oauth",
            },
          ],
        },
        {
          label: "Guide",
          translations: { "zh-CN": "指南" },
          items: [
            { label: "Context Management", translations: { "zh-CN": "上下文管理" }, slug: "guide/context" },
            { label: "Sub-Agents", translations: { "zh-CN": "子代理" }, slug: "guide/sub-agents" },
            { label: "Model Switching", translations: { "zh-CN": "模型切换" }, slug: "guide/model-switching" },
            { label: "Permissions & Hooks", translations: { "zh-CN": "权限与 Hooks" }, slug: "guide/permissions" },
            { label: "Skills", translations: { "zh-CN": "技能" }, slug: "guide/skills" },
            { label: "MCP Integration", translations: { "zh-CN": "MCP 集成" }, slug: "guide/mcp" },
            { label: "Tools Reference", translations: { "zh-CN": "工具参考" }, slug: "guide/tools" },
            { label: "Slash Commands", translations: { "zh-CN": "斜杠命令" }, slug: "guide/commands" },
          ],
        },
        {
          label: "Reference",
          translations: { "zh-CN": "参考" },
          items: [
            { label: "Configuration", translations: { "zh-CN": "配置" }, slug: "configuration" },
            { label: "FAQ", translations: { "zh-CN": "常见问题" }, slug: "faq" },
          ],
        },
      ],
    }),
  ],
});
