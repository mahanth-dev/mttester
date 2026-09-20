export function printHelp() {
  const help = `
mttester — HTTP load testing CLI

USAGE
  mttester <command> [options]

COMMANDS
  url <target>     Quick load test against a URL
  run <config>     Run load test from config.js or config.json
  once <target>    Send a single HTTP request
  mock             Start built-in mock HTTP server
  selftest         Run built-in self-test suite
  report           Generate reports from report.json

URL / RUN OPTIONS
  -u, --vus <n>              Virtual users (default: 1)
  -r, --rate <n>             Open-loop request rate (req/s)
  -d, --duration <dur>       Test duration (e.g. 30s, 5m)
  -n, --iterations <n>       Iterations per VU
      --stage <spec>         Stage spec: 30s:10vus or 1m:100rps
  -c, --checks <spec>        Check spec: status:200, status:2xx, body:ok
  -t, --thresholds <spec>    Threshold: http_req_duration.p95<500
  -w, --warmup <dur>         Warmup duration
      --think <ms>           Think time between iterations
      --think-max <ms>       Max think time (random range with --think)
      --realistic            Simulate real users (browser headers, cookies, think, stagger)
      --journey <paths>      Comma-separated paths for realistic journey
      --timeout <ms>         Request timeout (default: 30000)
      --workers <n>          Worker thread count
      --confirm-high-load    Confirm high-load run (>500 VU or >2000 rps)
      --locale <lang>        Human strings locale: en, fa
      --lang <lang>          Alias for --locale
      --feeder <file>        Data feeder file (json/csv)
  -H, --header <k:v>         Request header
  -X, --method <method>      HTTP method (default: GET)
      --body <data>          Request body

MOCK OPTIONS
  -p, --port <n>             Port (default: random)

OUTPUT OPTIONS
  -o, --output <fmt>         Output: console, json, csv, html
  -q, --quiet                Suppress live view
      --no-color             Disable ANSI colors

GLOBAL
  -h, --help                 Show help
  -v, --version              Show version

EXAMPLES
  mttester url http://localhost:8080 -u 50 -d 10s
  mttester run config.json
  mttester url http://localhost:8080 -u 1000 --confirm-high-load -d 30s
  mttester once http://localhost:8080/health
  mttester mock -p 8080
  mttester selftest
`;
  process.stdout.write(help);
}
