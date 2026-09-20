# MTTESTER

**HTTP load testing — CLI + Web UI + Docker**

Point MTTESTER at a URL, flood it with 50 / 100 / 1000 live virtual users, and get a clear report of what held and what broke.

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)

> فارسی: [README.fa.md](./README.fa.md)

---

## Why MTTESTER?

| You need | MTTESTER gives you |
| --- | --- |
| Concurrent users on a site | Closed-loop VUs (`-u 50`, `-u 1000`) |
| Steady request rate | Open-loop RPS (`-r 200`) |
| GET / POST / anything HTTP | Full method, headers, body support |
| Know what failed | Request failures **vs** check failures (never mixed) |
| CI / reports | Exit codes + JSON / CSV / HTML artifacts |
| Zero friction UI | Browser UI at `:3000` via Docker |

---

## Quick start (Docker)

```bash
git clone https://github.com/mahanth-dev/mttester.git
cd mttester
docker-compose up --build -d
```

Open **http://localhost:3000**

```bash
docker-compose down
```

The container serves the **MTTESTER** web UI and runs load tests through an HTTP API backed by the same engine as the CLI.

---

## Quick start (CLI)

```bash
npm install
chmod +x bin/mttester.js

# Mock target (other terminal)
node bin/mttester.js mock -p 8080

# 50 users for 10 seconds
node bin/mttester.js url http://127.0.0.1:8080/health -u 50 -d 10s

# 1000 users (explicit high-load confirm)
node bin/mttester.js url http://127.0.0.1:8080/health -u 1000 -d 30s --confirm-high-load

# POST with body
node bin/mttester.js url http://127.0.0.1:8080/echo \
  -X POST -H 'Content-Type: application/json' \
  --body '{"ok":true}' -u 20 -d 15s

# Self-test (offline)
node bin/mttester.js selftest
```

Local web UI without Docker:

```bash
npm run web
# → http://localhost:3000
```

---

## Features

- **Web UI** — brand title **MTTESTER**, live meters, once-probe, cancel run
- **Closed-loop** (`--vus`) and **open-loop** (`--rate`) load models
- **Worker-thread pool** — coordinator never sends HTTP; workers own undici pools
- **Timing fidelity** — DNS / connect / TTFB / total via undici (not `fetch`)
- **Log-linear histograms** — p50 / p90 / p95 / p99 without unbounded sample arrays
- **Checks & thresholds** — CI-friendly; request fail ≠ check fail
- **Reports** — console + `report.json` + `report.csv` + self-contained `report.html`
- **Scenarios** — multi-step `mttester run config.json` with extract / feeder
- **Safety** — auth banner, bounded runs required, high-load gate (>500 VU or >2000 RPS)
- **i18n** — English + Persian for human CLI strings (`--lang fa`)

---

## Architecture

```text
┌─────────────┐     ┌────────────────┐     ┌─────────────────┐
│  Web UI     │────▶│  HTTP API      │────▶│  Coordinator    │
│  :3000      │     │  /api/runs     │     │  (no HTTP out)  │
└─────────────┘     └────────────────┘     └────────┬────────┘
                                                    │ plan + ticks
                         ┌──────────────────────────┼──────────────────────────┐
                         ▼                          ▼                          ▼
                   ┌──────────┐              ┌──────────┐              ┌──────────┐
                   │ Worker 0 │              │ Worker 1 │     …        │ Worker N │
                   │ undici   │              │ undici   │              │ undici   │
                   └────┬─────┘              └────┬─────┘              └────┬─────┘
                        └────────────┬────────────┴────────────┬────────────┘
                                     ▼                         ▼
                              Target URL                 Metrics merge
                                                     (histogram + counters)
```

---

## CLI commands

| Command | Description |
| --- | --- |
| `url <target>` | Quick load test against a URL |
| `run <config>` | Scenario / config file (`.json` / `.js`) |
| `once <target>` | Single request with timing + body dump |
| `mock` | Built-in mock HTTP server |
| `selftest` | Offline fidelity self-check |
| `report` | Re-render reports from `report.json` |

### Common flags

```text
-u, --vus <n>              Virtual users
-r, --rate <n>             Open-loop request rate (req/s)
-d, --duration <dur>       e.g. 30s, 5m
-n, --iterations <n>       Iterations per VU
-X, --method <method>      GET, POST, PUT, …
-H, --header <k:v>         Repeatable headers
    --body <data>          Request body
-c, --checks <spec>        status:200, status:2xx, body:ok
-t, --thresholds <spec>    http_req_duration.p95<500
    --confirm-high-load    Required above 500 VU / 2000 RPS
    --lang fa|en           Human output language
```

### Exit codes

| Code | Meaning |
| ---: | --- |
| 0 | Success (thresholds met) |
| 1 | Thresholds breached |
| 2 | Usage / configuration error |
| 3 | Target unreachable (100% failed) |
| 4 | Internal error |
| 130 | Interrupted (SIGINT) — report still written |

---

## Web API (Docker / `npm run web`)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/runs` | Start a load test (JSON body) |
| `GET` | `/api/runs/:id` | Poll status, live meters, report |
| `POST` | `/api/runs/:id/cancel` | Cancel an active run |
| `POST` | `/api/once` | Single probe request |

Example:

```bash
curl -s http://localhost:3000/api/health

curl -s -X POST http://localhost:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com",
    "method": "GET",
    "vus": 50,
    "duration": "20s",
    "checks": "status:2xx",
    "authorized": true
  }'
```

---

## Example config (`mttester run`)

```json
{
  "name": "checkout-smoke",
  "vus": 20,
  "duration": "30s",
  "baseUrl": "http://127.0.0.1:8080",
  "scenarios": [
    {
      "name": "health",
      "method": "GET",
      "url": "${baseUrl}/health",
      "checks": ["status:200"]
    }
  ],
  "thresholds": ["http_req_duration.p95<300", "http_req_failed<0.01"]
}
```

```bash
node bin/mttester.js run ./examples/checkout.json
```

---

## Responsible use

**Only load-test systems you own or have explicit written permission to test.**

Unauthorized traffic can be illegal and harmful. MTTESTER requires:

- an authorization confirmation (CLI banner / UI checkbox)
- a bounded run (`--duration`, `--iterations`, or `--stages`)
- `--confirm-high-load` (or UI checkbox) for >500 VUs or >2000 req/s

Permanently out of scope: IP/UA rotation for evasion, WAF/CAPTCHA bypass, Slowloris-style exhaustion, remote attack fleets.

---

## Development

```bash
npm install
npm test
npm run typecheck
npm run web
```

Requirements: **Node.js ≥ 22**. Runtime dependency: **undici** only.

---

## Project layout

```text
bin/mttester.js          CLI entry
src/core/                coordinator, workers, HTTP client, plan
src/metrics/             histogram, thresholds, timeseries
src/server/              Web API + static UI host
web/                     MTTESTER frontend
Dockerfile               Production image
docker-compose.yml       One-command UI
```

---

## License

[MIT](./LICENSE)
