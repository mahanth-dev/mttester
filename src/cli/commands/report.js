import { readFile, writeFile } from 'node:fs/promises';
import { buildCsvReport } from '../../report/csv.js';
import { buildHtmlReport } from '../../report/html.js';
import { buildSummary } from '../../report/summary.js';
import { MetricsRegistry } from '../../metrics/registry.js';
import { Histogram } from '../../metrics/histogram.js';

/**
 * @param {import('../args.js').ParsedArgs} args
 * @returns {Promise<number>}
 */
export async function reportCommand(args) {
  const reportPath = args.reportFile || args._positional?.[0] || 'report.json';
  const outputs = args.output ?? ['console'];

  let report;
  try {
    const content = await readFile(reportPath, 'utf8');
    report = JSON.parse(content);
  } catch (err) {
    process.stderr.write(`Failed to read report: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  if (outputs.includes('console')) {
    const metrics = MetricsRegistry.fromSnapshot({
      httpDuration: report.metrics.http_req_duration.histogram,
      ttfb: report.metrics.http_req_waiting
        ? Histogram.fromJSON({ counts: [], count: 0, sum: 0, min: 0, max: 0 }).toJSON()
        : report.metrics.http_req_duration.histogram,
      requestsTotal: report.metrics.http_reqs.count,
      requestsFailed: report.metrics.http_req_failed.count,
      checksTotal: report.metrics.checks.total,
      checksFailed: report.metrics.checks.failed,
      statusCodes: report.metrics.status_codes,
      bytesReceived: report.metrics.data_received,
      bytesSent: report.metrics.data_sent,
      iterations: report.metrics.iterations,
    });

    process.stdout.write(buildSummary({
      metrics,
      durationSec: report.meta.durationSec,
      vus: report.meta.vus,
      thresholds: report.thresholds,
      workerSaturated: report.meta.workerSaturated,
      locale: args.locale ?? 'en',
    }));
  }

  if (outputs.includes('csv')) {
    await writeFile('report.csv', buildCsvReport(report));
  }
  if (outputs.includes('html')) {
    await writeFile('report.html', buildHtmlReport(report));
  }

  return 0;
}
