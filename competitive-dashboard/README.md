# Competitive Intelligence Dashboard

A lightweight competitive intelligence dashboard that pulls live news and funding updates for up to 5 competitors at once, powered by the You.com Search API.

## What it does

- Enter 1–5 competitor names and click **Search**
- Fetches the latest news, product launches, and funding news for each company in parallel
- Displays results in a dark-themed card grid — one column per competitor, top 3 results each (title, snippet, source, link)
- **15-minute server-side cache** — repeat searches are instant; a `(cached)` badge shows when results come from cache
- **Refresh All** button clears the cache and re-fetches everything live
- Per-column error states if one API call fails, without breaking the rest

## Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JS, no build step
- **API:** [You.com Search API](https://api.you.com) via `ydc-index.io`

## Setup

```bash
cd competitive-dashboard
npm install
```

Create a `.env` file in the `competitive-dashboard/` directory:

```
YDC_API_KEY=your_api_key_here
```

## Run

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
competitive-dashboard/
├── server.js          # Express server, cache, API proxy
├── public/
│   └── index.html     # Single-page frontend
├── package.json
└── .env               # API key (not committed)
```
