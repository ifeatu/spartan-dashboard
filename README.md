# SPARTAN Dashboard v2

Fleet monitoring dashboard for SPARTAN infrastructure — 10 MCP agents, ERLAI CCI platform (7 services), and infrastructure.

**Live:** https://dashboard.fatu.ai  
**Port:** 8780 (nginx) → Cloudflare tunnel  
**Auth:** HTTP Basic (pierre / spartan2026)

## Stack

- **Frontend:** React 18 + Vite → compiled static SPA
- **Server:** nginx:alpine — serves static files + proxies `/api/health/*` (fleet) and `/api/bob/*` (Build Queue / Tech Debt panels)
- **Auth:** nginx `auth_basic` + htpasswd
- **Deploy:** Docker Compose on SPARTAN NAS (192.168.1.19)

## Features

- Fleet SVG ring chart (% healthy)
- Auto-refresh every 30s with countdown
- Grouped service cards with live status badges
- Click-to-expand detail panel with full JSON response + latency
- JetBrains Mono, dark theme (#0a0a0c), green accent (#00ff88)
- Status: 🟢 healthy · 🟡 degraded · 🔴 down · ⚫ unknown
- Mobile responsive

## Agents monitored

| Group | Services |
|---|---|
| Core Agents | CHIEF (8752), SCRIBE (8742), FORGE (8768) |
| Domain Agents | BOB (8755), SUSAN (8756), CYCLEFORGE (8743), COACH (8744), IRIS (8761), IFEOMA (8758), ERLAI (8771) |
| ERLAI CCI Platform | GW (8800), INGEST (8801), SCORE (8802), ORCH (8803), TRANSFORM (8804), WEB (3100), GRAFANA (3002) |
| Infrastructure | CHROMADB (8200) |

## Local development

```bash
cd frontend
npm install
npm run dev   # Vite dev server on :5173
```

Health endpoints won't resolve locally without the NAS — use mock data or VPN.

## Deploy to SPARTAN

```bash
./deploy.sh            # full deploy (rsync → docker build → health check)
./deploy.sh --dry-run  # preview actions without executing
./deploy.sh --quick    # skip git fetch / ahead-of-origin check
./deploy.sh --force    # allow dirty working tree (use sparingly)
```

The script rsyncs the repo to `synology:/volume1/docker/spartan-dashboard/`,
runs `docker compose up -d --build` (required — Vite output is baked into the
image), and polls `http://192.168.1.19:8780/` for HTTP 200 before tagging the
deploy in git.

## File structure

```
spartan-dashboard/
├── frontend/           React + Vite source
│   ├── src/
│   │   ├── App.jsx     Main dashboard component
│   │   ├── App.css     Dashboard styles
│   │   ├── index.css   Global reset + CSS vars
│   │   └── main.jsx    Entry point
│   ├── index.html
│   └── package.json
├── nginx.conf          nginx proxy + auth config
├── Dockerfile          Multi-stage build
├── docker-compose.yml
├── htpasswd            Basic auth credentials
└── README.md
```
