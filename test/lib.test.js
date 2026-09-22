import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  filterChoices,
  fuzzyScore,
  labelForDir,
  listProjectDirs,
  parseZoxideScores,
  pathIsSameOrInside,
  priorityForPath,
  projectCatalog,
  workspaceRepresentsDir,
} from "../src/lib.js";

test("fuzzyScore matches ordered initials and rejects missing letters", () => {
  assert.ok(fuzzyScore("hcp", "herdr-command-palette") > 0);
  assert.equal(fuzzyScore("zzz", "herdr-command-palette"), -1);
});

test("filterChoices ranks stronger path match first", () => {
  const choices = [
    { title: "website", search: "website /tmp/website" },
    { title: "herdr", search: "herdr /tmp/herdr" },
  ];
  assert.equal(filterChoices("hdr", choices)[0].title, "herdr");
});

test("labelForDir uses final path segment", () => {
  assert.equal(labelForDir(path.join("/tmp", "herdr")), "herdr");
});

test("listProjectDirs honors maxDepth and ignore list", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hcp-"));
  fs.mkdirSync(path.join(root, "app", "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  assert.deepEqual(
    listProjectDirs({ folders: [root], maxDepth: 1, ignore: new Set(["node_modules"]) }).map((dir) => path.basename(dir.path)),
    ["app"],
  );
});

test("projectCatalog includes open directories, stable canonical IDs, and refuses missing roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hcp-catalog-"));
  fs.mkdirSync(path.join(root, "app"));
  const config = { folders: [root], maxDepth: 1, ignore: new Set() };
  const first = projectCatalog(config);
  assert.equal(first.length, 1);
  assert.equal(first[0].name, "app");
  assert.equal(first[0].path, fs.realpathSync.native(path.join(root, "app")));
  assert.deepEqual(projectCatalog(config), first);
  assert.throws(() => projectCatalog({ ...config, folders: [path.join(root, "missing")] }), /Project folder unavailable/);
});

test("catalog rejects unreadable nested directories rather than publishing a partial snapshot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hcp-catalog-"));
  const nested = path.join(root, "nested");
  fs.mkdirSync(path.join(nested, "app"), { recursive: true });
  fs.chmodSync(nested, 0o000);
  try {
    assert.throws(() => projectCatalog({ folders: [root], maxDepth: 2, ignore: new Set() }), /EACCES|EPERM/);
  } finally {
    fs.chmodSync(nested, 0o700);
  }
});

// ponytail: pure ranking/dedupe checks cover zoxide integration; full Herdr API stays mocked by manual smoke tests.
test("filterChoices can rank by priority", () => {
  const choices = [
    { title: "a-app", search: "app", priority: 0 },
    { title: "b-app", search: "app", priority: 1000 },
  ];
  assert.equal(filterChoices("app", choices)[0].title, "b-app");
  assert.equal(filterChoices("app", choices, 12, "fuzzy")[0].title, "a-app");
});

test("parseZoxideScores and priorityForPath boost project roots from nested paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hcp-"));
  const app = path.join(root, "app");
  const nested = path.join(app, "src");
  fs.mkdirSync(nested, { recursive: true });
  const scores = parseZoxideScores(` 10.0 ${nested}\n`);
  assert.equal(priorityForPath(app, scores), 8);
});

test("workspaceRepresentsDir hides parent dir when workspace label matches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hcp-"));
  const project = path.join(root, "kashi-app");
  const cwd = path.join(project, "KashiApp");
  fs.mkdirSync(cwd, { recursive: true });
  const dir = { path: project, key: fs.realpathSync.native(project) };
  const workspace = { title: "kashi-app", pathKeys: [fs.realpathSync.native(cwd)] };
  assert.equal(pathIsSameOrInside(workspace.pathKeys[0], dir.key), true);
  assert.equal(workspaceRepresentsDir(workspace, dir), true);
});
