import { herdr, PLUGIN_ID } from "./lib.js";

try {
  herdr(["plugin", "pane", "open", "--plugin", process.env.HERDR_PLUGIN_ID || PLUGIN_ID, "--entrypoint", "palette", "--placement", "overlay", "--focus"]);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  try { herdr(["notification", "show", "Command palette failed", "--body", message]); } catch {}
  console.error(message);
  process.exit(1);
}
