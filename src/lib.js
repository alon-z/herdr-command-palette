import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const PLUGIN_ID = "alonz.command-palette";

export function herdr(args) {
  const bin = process.env.HERDR_BIN_PATH || "herdr";
  const res = spawnSync(bin, args, { encoding: "utf8" });
  if (res.error) throw new Error(`${bin} ${args.join(" ")}: ${res.error.message}`);
  const out = (res.stdout || "").trim();
  if (res.status !== 0) throw new Error(`${bin} ${args.join(" ")} exited ${res.status}: ${(res.stderr || out).trim()}`);
  if (!out) return null;
  try { return JSON.parse(out); } catch { return out; }
}

export function result(args) {
  const j = herdr(args);
  if (j && typeof j === "object" && "error" in j) throw new Error(j.error?.message || JSON.stringify(j.error));
  return j && typeof j === "object" && "result" in j ? j.result : j;
}

export function expandHome(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function pathKey(value) {
  const resolved = path.resolve(expandHome(value));
  let real = resolved;
  try { real = fs.realpathSync.native(resolved); } catch {}
  return process.platform === "win32" ? real.toLowerCase() : real;
}

export function labelForDir(dir) {
  return path.basename(dir) || dir;
}

function defaultConfigDir() {
  return path.join(os.homedir(), ".config", "herdr-command-palette");
}

function defaultFolders() {
  return ["~/Private/clones", "~/Private/things", "~/Projects", "~/Developer"].filter((dir) => {
    try { return fs.statSync(expandHome(dir)).isDirectory(); } catch { return false; }
  });
}

export function loadConfig() {
  const configDir = process.env.HERDR_PLUGIN_CONFIG_DIR || defaultConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify({ folders: defaultFolders(), maxDepth: 1, ignore: [".git", "node_modules", "dist", "build", ".next"], sort: "priority" }, null, 2)}\n`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    configPath,
    folders: Array.isArray(config.folders) ? config.folders.map(expandHome) : [],
    maxDepth: Number.isInteger(config.maxDepth) ? Math.max(1, Math.min(config.maxDepth, 5)) : 1,
    ignore: new Set(Array.isArray(config.ignore) ? config.ignore : []),
    sort: config.sort === "fuzzy" ? "fuzzy" : "priority",
  };
}

export function listProjectDirs(config, { strict = false } = {}) {
  const seen = new Set();
  const dirs = [];
  const visit = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (error) { if (strict) throw error; return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (config.ignore.has(entry.name)) continue;
      const child = path.join(dir, entry.name);
      const key = pathKey(child);
      if (!seen.has(key)) {
        seen.add(key);
        dirs.push({ path: child, key });
      }
      if (depth + 1 < config.maxDepth) visit(child, depth + 1);
    }
  };
  for (const folder of config.folders) visit(folder, 0);
  return dirs.sort((a, b) => a.path.localeCompare(b.path));
}

export function projectCatalog(config) {
  for (const folder of config.folders) {
    if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Project folder unavailable: ${folder}`);
    }
  }
  return listProjectDirs(config, { strict: true }).map((dir) => ({
    id: createHash("sha256").update(dir.key).digest("hex"),
    name: labelForDir(dir.path),
    path: dir.key,
  }));
}

export function fuzzyScore(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  let ti = 0, score = 0, streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    const boundary = found === 0 || "/-_ .".includes(t[found - 1]);
    streak = found === ti ? streak + 1 : 1;
    score += 10 + streak * 4 + (boundary ? 8 : 0) - Math.min(found - ti, 12);
    ti = found + 1;
  }
  return score - Math.min(t.length / 50, 10);
}

export function pathIsSameOrInside(childKey, parentKey) {
  const rel = path.relative(parentKey, childKey);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

export function parseZoxideScores(output) {
  const scores = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s+(.+)$/);
    if (!match) continue;
    scores.set(pathKey(match[2]), Number(match[1]));
  }
  return scores;
}

function loadZoxideScores() {
  const res = spawnSync("zoxide", ["query", "--list", "--score"], { encoding: "utf8" });
  if (res.error || res.status !== 0) return new Map();
  return parseZoxideScores(res.stdout || "");
}

function addZoxidePath(dir) {
  if (dir) spawnSync("zoxide", ["add", dir], { stdio: "ignore" });
}

export function priorityForPath(dir, zoxideScores) {
  if (!dir) return 0;
  const key = pathKey(dir);
  let best = zoxideScores.get(key) || 0;
  for (const [zoxideKey, score] of zoxideScores) {
    if (pathIsSameOrInside(zoxideKey, key)) best = Math.max(best, score * 0.8);
  }
  return best;
}

export function filterChoices(query, choices, limit = 12, sort = "priority") {
  return choices
    .map((choice) => {
      const score = fuzzyScore(query, choice.search);
      const priority = Number(choice.priority) || 0;
      const rank = sort === "priority" ? score + Math.log1p(priority) * 5 : score;
      return { choice, score, priority, rank };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.rank - a.rank || (sort === "priority" ? b.priority - a.priority : 0) || a.choice.title.localeCompare(b.choice.title))
    .slice(0, limit)
    .map((item) => item.choice);
}

async function paneDirsForWorkspace(workspaceId) {
  try {
    const paneList = result(["pane", "list", "--workspace", workspaceId])?.panes || [];
    return paneList.flatMap((pane) => [pane.foreground_cwd, pane.cwd].filter(Boolean));
  } catch {
    return [];
  }
}

export function workspaceRepresentsDir(workspace, dir) {
  const dirLabel = labelForDir(dir.path);
  return workspace.pathKeys?.some((key) => key === dir.key || (workspace.title === dirLabel && pathIsSameOrInside(key, dir.key)));
}

export async function buildChoices() {
  const config = loadConfig();
  const zoxideScores = loadZoxideScores();
  const workspaceList = result(["workspace", "list"])?.workspaces || [];
  const workspaces = [];
  const openByPath = new Map();

  for (const ws of workspaceList) {
    const paths = new Set();
    if (ws.worktree?.checkout_path) paths.add(ws.worktree.checkout_path);
    for (const paneDir of await paneDirsForWorkspace(ws.workspace_id)) paths.add(paneDir);
    const pathList = [...paths];
    const keys = pathList.map(pathKey);
    for (const key of keys) if (!openByPath.has(key)) openByPath.set(key, ws.workspace_id);
    const firstPath = pathList[0] || "";
    workspaces.push({
      type: "workspace",
      title: ws.label || ws.workspace_id,
      subtitle: firstPath ? `open workspace · ${firstPath}` : `open workspace · ${ws.workspace_id}`,
      workspaceId: ws.workspace_id,
      path: firstPath,
      pathKeys: keys,
      priority: 1000 + priorityForPath(firstPath, zoxideScores),
      search: `${ws.label || ""} ${ws.workspace_id} ${pathList.join(" ")}`,
    });
  }

  const directories = listProjectDirs(config).flatMap((dir) => {
    if (workspaces.some((workspace) => workspaceRepresentsDir(workspace, dir))) return [];
    const openWorkspaceId = openByPath.get(dir.key);
    return [{
      type: "directory",
      title: labelForDir(dir.path),
      subtitle: `${openWorkspaceId ? `open in ${openWorkspaceId} · ` : "new workspace · "}${dir.path}`,
      path: dir.path,
      openWorkspaceId,
      priority: priorityForPath(dir.path, zoxideScores),
      search: `${labelForDir(dir.path)} ${dir.path}`,
    }];
  });

  return { configPath: config.configPath, sort: config.sort, choices: [...workspaces, ...directories] };
}

export function openChoice(choice) {
  const workspaceId = choice.workspaceId || choice.openWorkspaceId;
  const opened = workspaceId
    ? result(["workspace", "focus", workspaceId])
    : (() => {
        if (!choice.path) throw new Error("choice has no path");
        return result(["workspace", "create", "--cwd", choice.path, "--label", labelForDir(choice.path), "--focus"]);
      })();
  addZoxidePath(choice.path);
  return opened;
}
