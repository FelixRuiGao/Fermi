---
name: web-scrape
description: Extract structured data from a web page or API responsibly — fetch, parse HTML/JSON, handle pagination, and output clean records. Use when the user wants to scrape or extract data from a website.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; recommends requests/httpx (Apache/BSD) + selectolax/bs4 (MIT), user-installed
---

# Web Scraping

Get the data, but be a good citizen and prefer the boring reliable path.

## 1. Look for a non-scraping path first

Before parsing HTML: is there an official API, an RSS/JSON feed, a sitemap, or a
documented data export? Check the page's network calls (often the data is a
clean JSON XHR you can hit directly). Scraping rendered HTML is the last resort,
not the first.

## 2. Be responsible

- Respect `robots.txt` and the site's Terms; don't scrape data behind auth or
  clearly disallowed paths. If `$ARGUMENTS` points at something that looks
  login-gated or personal, ask the user about authorization first.
- Rate-limit: a delay between requests, a real `User-Agent`, retries with
  backoff. Don't hammer a site.
- Scrape the minimum you need; cache fetched pages locally while iterating so
  you don't re-request.

## 3. Fetch and parse

- Static HTML: `httpx`/`requests` + `selectolax` (fast) or `BeautifulSoup`
  (`pip install` on demand; MIT). Select by stable selectors, not brittle nth
  paths.
- JSON endpoints: just request and parse — far more robust than HTML.
- JS-rendered pages: note that static fetch won't work; a headless browser is
  needed — say so and let the user decide rather than silently failing.
- Pagination: follow `next` links / page params until exhausted, with a hard
  cap.

## 4. Output and verify

Emit clean structured records (JSON/CSV) with consistent fields; coerce types;
mark missing fields explicitly. Validate a sample against the live page. Report
records extracted, pages fetched, and any rows that didn't parse (don't silently
drop them).
