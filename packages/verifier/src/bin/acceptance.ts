import { readFile } from "node:fs/promises";
import {
  createSubgraphFetch,
  formatReport,
  runAcceptance,
  type AcceptanceInput,
  type CheckResult,
} from "../acceptance";
import { runAllScenarios } from "../harness";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const scenarioRuns = runAllScenarios();
  const scenarioResults: CheckResult[] = scenarioRuns.flatMap((run) => run.results);

  console.log("— C5.3 · deterministic scenario pass —\n");
  for (const run of scenarioRuns) {
    const label = run.variant ? `${run.scenario}/${run.variant}` : run.scenario;
    const check = run.results[0];
    console.log(
      `${check.ok ? "PASS" : "FAIL"}  ${label.padEnd(34)} ${run.verdict} · ${run.tier} · quorum ${run.quorum}`
    );
    console.log(`        ${run.detail}`);
    console.log(`        ${run.reason}`);
    for (const mismatch of check.mismatches) {
      console.log(`        ${mismatch}`);
    }
  }

  const url = process.env.SUBGRAPH_URL ?? process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  const inputPath = argValue("--input");

  let chainResults: CheckResult[] = [];

  if (!url) {
    console.log(
      "\n— C5.1 / C5.2 · SKIPPED: SUBGRAPH_URL is unset (blocked on B2.4) —"
    );
  } else if (!inputPath) {
    console.log(
      "\n— C5.1 / C5.2 · SKIPPED: pass --input <committed.json> with the decisions and resolved gates to check —"
    );
  } else {
    const input = JSON.parse(await readFile(inputPath, "utf8")) as AcceptanceInput;
    const report = await runAcceptance(input, createSubgraphFetch(url));
    chainResults = report.results;
    console.log(`\n— C5.1 / C5.2 · against ${url} —\n`);
    console.log(formatReport(report));
  }

  const all = [...scenarioResults, ...chainResults];
  const red = all.filter((result) => !result.ok);

  console.log(
    red.length === 0
      ? `\n${all.length} check(s) green.`
      : `\n${red.length} of ${all.length} check(s) RED — add a row to the Blockers table in TASKS/BOARD.md.`
  );

  process.exit(red.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
