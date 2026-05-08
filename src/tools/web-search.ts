/**
 * Web search tool definition, client-side executor, and pass-through handler.
 *
 * Providers with native search (Anthropic, OpenAI, GLM, Kimi) replace this
 * ToolDef in their `convertTools()` with provider-specific formats.
 * Providers without native search keep it as a regular function tool;
 * the client-side executor handles it via a priority chain:
 *
 *   1. API key backends (SERPER → TAVILY → EXA → BRAVE)
 *   2. Exa free MCP endpoint (zero-config)
 *   3. DuckDuckGo lite scraping (zero-config fallback)
 */

import type { ToolDef } from "../providers/base.js";

// ------------------------------------------------------------------
// Tool definition
// ------------------------------------------------------------------

export const WEB_SEARCH: ToolDef = {
  name: "web_search",
  description:
    "Search the web for current information. " +
    "Returns titles, URLs and snippets for the top results.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      num_results: {
        type: "integer",
        description: "Number of results to return (default: 5)",
        default: 5,
      },
    },
    required: ["query"],
  },
  summaryTemplate: "{agent} is searching the web for '{query}'",
  tuiPolicy: { partialReveal: { completeArgs: ["query"] } },
};

// ------------------------------------------------------------------
// Pass-through for Kimi $web_search
// ------------------------------------------------------------------

export function toolBuiltinWebSearchPassthrough(
  kwargs: Record<string, unknown>,
): string {
  return JSON.stringify(kwargs);
}

// ------------------------------------------------------------------
// Client-side web search executor
// ------------------------------------------------------------------

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_TIMEOUT_MS = 25_000;

function formatResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return "No results found. Try rephrasing your search.";
  }
  const lines: string[] = [`Found ${results.length} results for "${query}":\n`];
  for (let i = 0; i < results.length; i++) {
    lines.push(`${i + 1}. ${results[i].title}`);
    lines.push(`   URL: ${results[i].url}`);
    if (results[i].snippet) {
      lines.push(`   ${results[i].snippet}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── Backend detection (cached) ──────────────────────────────────

type BackendKind = "serper" | "tavily" | "exa_api" | "brave" | "exa_free" | "ddg";

interface ApiBackend {
  kind: "serper" | "tavily" | "exa_api" | "brave";
  key: string;
}

let _resolvedBackend: BackendKind | null = null;
let _resolvedApiKey: string | null = null;

function resolveBackend(): { kind: BackendKind; key?: string } {
  if (_resolvedBackend !== null) {
    return _resolvedApiKey
      ? { kind: _resolvedBackend, key: _resolvedApiKey }
      : { kind: _resolvedBackend };
  }

  const checks: Array<{ env: string; kind: ApiBackend["kind"] }> = [
    { env: "SERPER_API_KEY", kind: "serper" },
    { env: "TAVILY_API_KEY", kind: "tavily" },
    { env: "EXA_API_KEY", kind: "exa_api" },
    { env: "BRAVE_SEARCH_API_KEY", kind: "brave" },
  ];

  for (const { env, kind } of checks) {
    const key = process.env[env];
    if (key && key.trim()) {
      _resolvedBackend = kind;
      _resolvedApiKey = key.trim();
      return { kind, key: _resolvedApiKey };
    }
  }

  _resolvedBackend = "exa_free";
  _resolvedApiKey = null;
  return { kind: "exa_free" };
}

// Allow tests to reset the cached backend
export function _resetSearchBackend(): void {
  _resolvedBackend = null;
  _resolvedApiKey = null;
}

// ── API backends ────────────────────────────────────────────────

async function searchSerper(query: string, numResults: number, key: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: numResults }),
    signal,
  });
  if (!resp.ok) throw new Error(`Serper HTTP ${resp.status}`);
  const data = await resp.json() as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (data.organic ?? []).slice(0, numResults).map((r) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: r.snippet ?? "",
  }));
}

async function searchTavily(query: string, numResults: number, key: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: numResults }),
    signal,
  });
  if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`);
  const data = await resp.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).slice(0, numResults).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content ?? "",
  }));
}

async function searchExaApi(query: string, numResults: number, key: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const resp = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, numResults, type: "auto" }),
    signal,
  });
  if (!resp.ok) throw new Error(`Exa API HTTP ${resp.status}`);
  const data = await resp.json() as { results?: Array<{ title?: string; url?: string; text?: string }> };
  return (data.results ?? []).slice(0, numResults).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.text ?? "",
  }));
}

async function searchBrave(query: string, numResults: number, key: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, count: String(numResults) });
  const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": key,
    },
    signal,
  });
  if (!resp.ok) throw new Error(`Brave HTTP ${resp.status}`);
  const data = await resp.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? []).slice(0, numResults).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
  }));
}

// ── Exa free MCP ────────────────────────────────────────────────

async function searchExaFreeMcp(query: string, numResults: number, signal?: AbortSignal): Promise<SearchResult[]> {
  const resp = await fetch("https://mcp.exa.ai/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: { query, type: "auto", numResults, livecrawl: "fallback" },
      },
    }),
    signal,
  });

  if (!resp.ok) throw new Error(`Exa MCP HTTP ${resp.status}`);

  const body = await resp.text();
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const data = JSON.parse(line.substring(6)) as {
        result?: { content?: Array<{ text?: string }> };
      };
      const text = data?.result?.content?.[0]?.text;
      if (text) return [{ title: "Exa Search Results", url: "", snippet: text }];
    } catch { /* skip malformed lines */ }
  }
  throw new Error("Exa MCP returned no results");
}

// ── DuckDuckGo lite ─────────────────────────────────────────────

const DDG_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
];

const DDG_ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-GB,en;q=0.9,en-US;q=0.8",
  "en-US,en;q=0.5",
];

let _lastDdgSearch = 0;

async function searchDuckDuckGo(query: string, numResults: number, signal?: AbortSignal): Promise<SearchResult[]> {
  // Rate limiting: 500-2000ms random gap between requests
  const minGap = 500 + Math.floor(Math.random() * 1500);
  const elapsed = Date.now() - _lastDdgSearch;
  if (elapsed < minGap) {
    await new Promise((r) => setTimeout(r, minGap - elapsed));
  }
  _lastDdgSearch = Date.now();

  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const ua = DDG_USER_AGENTS[Math.floor(Math.random() * DDG_USER_AGENTS.length)];
  const lang = DDG_ACCEPT_LANGUAGES[Math.floor(Math.random() * DDG_ACCEPT_LANGUAGES.length)];

  const resp = await fetch(url, {
    headers: {
      "User-Agent": ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": lang,
      "Accept-Encoding": "identity",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
    },
    signal,
  });

  if (!resp.ok && resp.status !== 202) {
    throw new Error(`DuckDuckGo HTTP ${resp.status}`);
  }

  const html = await resp.text();
  return parseDdgLiteResults(html, numResults);
}

function parseDdgLiteResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // <a ... href="..." ... class='result-link'>Title</a>
  const linkRe = /<a[^>]*href=['"]([^'"]*)['"]\s*[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
  // <td class='result-snippet'>...</td>
  const snippetRe = /<td[^>]+class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const rawUrl = m[1].replace(/&amp;/g, "&");
    const title = m[2].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    let finalUrl = rawUrl;
    if (rawUrl.includes("uddg=")) {
      try {
        const uddg = new URL("https://duckduckgo.com" + rawUrl).searchParams.get("uddg");
        if (uddg) finalUrl = uddg;
      } catch { /* keep rawUrl */ }
    }
    links.push({ url: finalUrl, title });
  }

  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(m[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim());
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}

// ── Main executor ───────────────────────────────────────────────

export async function toolWebSearch(
  query: string,
  numResults?: number,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const max = Math.min(Math.max(numResults ?? 5, 1), 20);
  const backend = resolveBackend();

  if (opts.signal?.aborted) {
    return "ERROR: web_search was interrupted.";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const onExternal = () => controller.abort();
  opts.signal?.addEventListener("abort", onExternal, { once: true });

  try {
    const signal = controller.signal;

    // 1. API key backends
    if (backend.key) {
      switch (backend.kind) {
        case "serper": return formatResults(await searchSerper(query, max, backend.key, signal), query);
        case "tavily": return formatResults(await searchTavily(query, max, backend.key, signal), query);
        case "exa_api": return formatResults(await searchExaApi(query, max, backend.key, signal), query);
        case "brave": return formatResults(await searchBrave(query, max, backend.key, signal), query);
      }
    }

    // 2. Exa free MCP
    try {
      const results = await searchExaFreeMcp(query, max, signal);
      return formatResults(results, query);
    } catch {
      if (signal.aborted) throw new Error("aborted");
    }

    // 3. DuckDuckGo lite
    try {
      const results = await searchDuckDuckGo(query, max, signal);
      if (results.length > 0) return formatResults(results, query);
    } catch {
      if (signal.aborted) throw new Error("aborted");
    }

    return (
      "Web search failed — no results from any backend.\n\n" +
      "For more reliable search, set one of these environment variables:\n" +
      "  SERPER_API_KEY (serper.dev — 2,500 free queries/month)\n" +
      "  TAVILY_API_KEY (tavily.com — 1,000 free queries/month)\n" +
      "  EXA_API_KEY (exa.ai — 2,000 free queries one-time)\n" +
      "  BRAVE_SEARCH_API_KEY (brave.com/search/api)"
    );
  } catch (e) {
    if (opts.signal?.aborted) return "ERROR: web_search was interrupted.";
    return `ERROR: Web search failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternal);
  }
}
