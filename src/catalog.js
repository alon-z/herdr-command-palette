import { loadConfig, projectCatalog, result, PLUGIN_ID } from "./lib.js";

try {
  // Outside Herdr's plugin runtime, resolve the same config directory used by the palette.
  process.env.HERDR_PLUGIN_CONFIG_DIR ||= result(["plugin", "config-dir", PLUGIN_ID]);
  process.stdout.write(JSON.stringify({ projects: projectCatalog(loadConfig()) }) + "\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
