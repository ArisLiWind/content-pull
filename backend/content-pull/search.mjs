const SEARCH_ENDPOINTS = [
  "https://lite.duckduckgo.com/lite/",
  "https://html.duckduckgo.com/html/"
];

export async function searchWeb(query, { limit = 5, timeoutMs = 12000 } = {}) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return { ok: false, error: "query is required", results: [] };

  const errors = [];
  for (const endpoint of SEARCH_ENDPOINTS) {
    const result = await searchDuckDuckGo(endpoint, normalizedQuery, limit, timeoutMs);
    if (result.ok && result.results.length) return result;
    if (result.error) errors.push(result.error);
  }

  const chromeResult = await searchWithChromeCdp(normalizedQuery, limit);
  if (chromeResult.ok && chromeResult.results.length) return chromeResult;
  if (chromeResult.error) errors.push(chromeResult.error);

  return {
    ok: false,
    query: normalizedQuery,
    results: [],
    error: errors.join("; ") || "No search results returned."
  };
}

async function searchWithChromeCdp(query, limit) {
  try {
    const { callLocalAgentTool } = await import("./local-agent.mjs");
    const result = await callLocalAgentTool("local.chrome.search_web", { query, limit });
    if (!result.ok) return { ok: false, query, results: [], error: result.error || "Chrome CDP search failed" };
    return {
      ok: true,
      query,
      source: result.source,
      results: result.results || [],
      tab: result.tab
    };
  } catch (error) {
    return {
      ok: false,
      query,
      results: [],
      error: `Chrome CDP fallback failed: ${error.message}`
    };
  }
}

export function formatSearchResults(result) {
  if (!result?.ok || !result.results?.length) {
    return `Web search failed: ${result?.error || "unknown error"}`;
  }

  return [
    `Web search query: ${result.query}`,
    ...result.results.map((item, index) => [
      `${index + 1}. ${item.title}`,
      `   URL: ${item.url}`,
      item.snippet ? `   Summary: ${item.snippet}` : ""
    ].filter(Boolean).join("\n"))
  ].join("\n");
}

async function searchDuckDuckGo(endpoint, query, limit, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = new URLSearchParams({ q: query }).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ContentPull/0.1 (+local-agent)"
      },
      body,
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, query, results: [], error: `${endpoint} returned ${response.status}` };
    }

    const html = await response.text();
    const results = parseDuckDuckGoHtml(html).slice(0, limit);
    return { ok: results.length > 0, query, source: endpoint, results };
  } catch (error) {
    return {
      ok: false,
      query,
      results: [],
      error: error.name === "AbortError" ? `${endpoint} timed out` : `${endpoint}: ${error.message}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseDuckDuckGoHtml(html) {
  const results = [];
  const normalized = String(html || "").replace(/\r?\n/g, " ");
  const linkPattern = /<a[^>]+class="[^"]*(?:result-link|result__a)[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(normalized))) {
    const url = normalizeDuckDuckGoUrl(decodeHtml(match[1]));
    const title = cleanText(match[2]);
    if (!title || !url) continue;

    const after = normalized.slice(match.index + match[0].length, match.index + match[0].length + 1200);
    const snippetMatch = after.match(/<(?:td|a|div)[^>]+class="[^"]*(?:result-snippet|result__snippet)[^"]*"[^>]*>(.*?)<\/(?:td|a|div)>/i);
    results.push({
      title,
      url,
      snippet: snippetMatch ? cleanText(snippetMatch[1]) : ""
    });
  }

  return dedupeResults(results);
}

function normalizeDuckDuckGoUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch {
    return url;
  }
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((item) => {
    const key = item.url || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
