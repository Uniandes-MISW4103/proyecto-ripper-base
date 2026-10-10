// Command line: `node src/cli.js test` starts a run; `node src/cli.js resume [runId]` continues the
// latest unfinished run (or the given one). Exit codes: 0 completed or stopped by a budget,
// 1 configuration or preparation error, 2 interrupted.
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CheckpointError, Run } from "./checkpoint.js";
import { ConfigError, loadConfig } from "./config.js";
import { resumeRun, startRun } from "./run.js";

const moduleRoot = fileURLToPath(new URL("..", import.meta.url));
const resultsDir = join(moduleRoot, "results");
const abp = createRequire(import.meta.url)("../abp.cjs");

const USAGE = "Uso: node src/cli.js test | resume [runId]";

async function main([command, runId]) {
  const config = loadConfig(join(moduleRoot, "config.json"));
  const hooks = await import(new URL("../hooks.js", import.meta.url).href);

  let ripper = null;
  let interrupts = 0;
  process.on("SIGINT", () => {
    interrupts++;
    if (interrupts > 1) process.exit(2);
    console.log("\nDeteniendo después de la acción en curso… (Ctrl+C otra vez para salir de inmediato)");
    ripper?.stop();
  });
  process.on("SIGTERM", () => ripper?.stop());

  const options = { config, hooks, abp, onRipper: (created) => (ripper = created) };
  let run;
  if (command === "test") {
    console.log(`Explorando ${config.url} con ${config.browser} (semilla ${config.seed})`);
    run = await startRun({ resultsDir, ...options });
  } else if (command === "resume") {
    const runDir = runId ? join(resultsDir, runId) : Run.latestUnfinished(resultsDir);
    if (!runDir) throw new CheckpointError("No hay ejecuciones sin terminar en results/. Inicie una con ripper:test.");
    console.log(`Continuando ${runDir}`);
    run = await resumeRun({ runDir, ...options });
  } else {
    throw new ConfigError(USAGE);
  }

  const { model } = run;
  const failures = model.events.reduce((total, event) => total + event.failures.length, 0);
  console.log("-".repeat(72));
  console.log(
    `Estado: ${run.status}. ${model.states.length} estados, ${model.events.length} eventos, ${failures} fallas, ` +
      `${model.frontier.length} acciones pendientes.`,
  );
  console.log(`Reporte: ${run.path("report.html")}`);
  console.log(`Resumen: ${run.path("summary.json")}`);
  if (run.status !== "completed") console.log("Para continuar la exploración: npm run ripper:resume (desde la raíz)");
  return run.status === "interrupted" ? 2 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    const expected = error instanceof ConfigError || error instanceof CheckpointError;
    console.error(expected ? error.message : error);
    process.exit(1);
  },
);
