# Notion Live Charts

Free live charts for a Notion finance tracker.

Frontend: `docs/` for GitHub Pages.
Worker: `worker/index.js` for Cloudflare Worker.

## Notion data sources

- Expenses: `c6466c54-4c7d-4753-8284-8d55207b8f46`
- Income: `54e91f62-f449-469e-894a-f6d0a1f6b6f1`

## Setup

1. Create a Cloudflare Worker and paste `worker/index.js`.
2. Add Worker secret: `NOTION_TOKEN`.
3. Add Worker variables:

```text
NOTION_EXPENSES_DATA_SOURCE_ID = c6466c54-4c7d-4753-8284-8d55207b8f46
NOTION_INCOME_DATA_SOURCE_ID = 54e91f62-f449-469e-894a-f6d0a1f6b6f1
CACHE_SECONDS = 60
```

4. Open `https://your-worker.workers.dev/api/health`.
5. Open `https://your-worker.workers.dev/api/summary`.
6. Put your Worker URL into `docs/config.js`.
7. Enable GitHub Pages from branch `main`, folder `/docs`.
8. Embed the GitHub Pages URL into Notion with `/embed`.
