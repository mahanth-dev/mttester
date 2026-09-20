# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-09-20

### Added
- Initial release of mttester load testing CLI
- Commands: `url`, `run`, `once`, `mock`, `selftest`, `report`
- Worker-thread pool with coordinator/worker architecture
- Closed-loop (`--vus`) and open-loop (`--rate`) execution modes
- Log-linear bucketed histogram with quantile estimation
- Checks, thresholds, scenarios, and data feeders
- Reports: console summary, `report.json`, `report.csv`, `report.html`
- Built-in mock HTTP server for offline testing
- High-load safety gate (`--confirm-high-load`)
- Bilingual human-facing strings (English / Persian)
