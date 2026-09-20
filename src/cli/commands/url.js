import { planFromArgs } from '../../core/plan.js';
import { runTest, assertThresholds } from '../../core/coordinator.js';
import { MtTesterError } from '../../core/errors.js';
import { printAuthBanner, printWorkerSaturation } from '../confirm.js';
import { createLiveView } from '../live-view.js';
import { printSummary } from '../../report/summary.js';
import { buildJsonReport, writeJsonReport } from '../../report/json.js';
import { writeCsvReport } from '../../report/csv.js';
import { writeHtmlReport } from '../../report/html.js';
import { t } from '../../i18n/index.js';

/**
 * @param {import('../args.js').ParsedArgs} args
 * @param {import('../../core/plan.js').TestPlan} plan
 * @returns {Promise<number>}
 */
export async function executeLoadTest(args, plan) {
  const locale = args.locale ?? 'en';
  const strings = t(locale);

  printAuthBanner(locale);

  if (!args.quiet) {
    process.stderr.write(`${strings.runStarting}\n`);
  }

  const liveView = createLiveView({ enabled: !args.quiet, noColor: args.noColor });
  const controller = new AbortController();

  const sigintHandler = () => {
    process.stderr.write(`\n${strings.runInterrupted}\n`);
    controller.abort();
  };
  process.on('SIGINT', sigintHandler);

  const result = await runTest({
    plan,
    onUpdate: (state) => {
      liveView.update(state);
      if (state.workerSaturated) {
        printWorkerSaturation('pending queue full', 0, locale);
      }
    },
    signal: controller.signal,
  });

  process.off('SIGINT', sigintHandler);
  liveView.finish();

  if (result.workerSaturated && result.saturatedReason) {
    printWorkerSaturation(result.saturatedReason, 0, locale);
  }

  const outputs = args.output ?? ['console', 'json', 'csv', 'html'];
  const jsonReport = buildJsonReport({
    plan,
    metrics: result.metrics,
    timeSeries: result.timeSeries,
    durationSec: result.durationSec,
    thresholds: result.thresholds,
    interrupted: result.interrupted,
    workerSaturated: result.workerSaturated,
  });

  if (outputs.includes('console')) {
    printSummary({
      metrics: result.metrics,
      durationSec: result.durationSec,
      vus: plan.vus,
      thresholds: result.thresholds,
      workerSaturated: result.workerSaturated,
      locale,
    });
  }

  if (outputs.includes('json')) await writeJsonReport(jsonReport);
  if (outputs.includes('csv')) await writeCsvReport(jsonReport);
  if (outputs.includes('html')) await writeHtmlReport(jsonReport);

  if (!args.quiet) {
    process.stderr.write(`${strings.runComplete}\n`);
  }

  if (result.interrupted) return 130;
  if (result.allUnreachable) return 3;

  try {
    assertThresholds(result);
  } catch (err) {
    if (err instanceof MtTesterError) {
      process.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }
    throw err;
  }

  return 0;
}

/**
 * @param {import('../args.js').ParsedArgs} args
 * @returns {Promise<number>}
 */
export async function urlCommand(args) {
  const locale = args.locale ?? 'en';
  const strings = t(locale);

  if (!args.url) {
    process.stderr.write(`${strings.errors.missingTarget}\n`);
    return 2;
  }

  let plan;
  try {
    plan = planFromArgs(args);
  } catch (err) {
    if (err instanceof MtTesterError) {
      process.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }
    throw err;
  }

  return executeLoadTest(args, plan);
}
