import { buildChoices, filterChoices, openChoice } from "./lib.js";

const stdin = process.stdin;
const stdout = process.stdout;

let query = "";
let selected = 0;
let choices = [];
let configPath = "";
let sort = "priority";
let message = "Loading…";
let mode = "loading";

const esc = "\x1b[";
const clear = () => stdout.write("\x1b[2J\x1b[H");
const fit = (s, width) => [...s].slice(0, Math.max(0, width - 1)).join("");
const visible = () => filterChoices(query, choices, Math.max(3, Math.min((stdout.rows || 24) - 7, 15)), sort);

function render() {
  const cols = stdout.columns || 80;
  const rows = stdout.rows || 24;
  const list = visible();
  if (selected >= list.length) selected = Math.max(0, list.length - 1);

  clear();
  stdout.write(`${esc}1mHerdr Command Palette${esc}0m  ${esc}2mEnter opens · Esc quits · ↑/↓ move${esc}0m\n\n`);
  stdout.write(`${esc}36m❯${esc}0m ${query}\n\n`);

  if (mode === "error") {
    stdout.write(`${esc}31m${fit(message, cols)}${esc}0m\n\nPress any key to close.`);
    return;
  }
  if (mode === "opening") {
    stdout.write(`${esc}33m${fit(message, cols)}${esc}0m`);
    return;
  }
  if (!list.length) {
    stdout.write(`${esc}2mNo matches. Configure folders in ${configPath}.${esc}0m`);
    return;
  }

  for (let i = 0; i < list.length && i < rows - 5; i++) {
    const choice = list[i];
    const active = i === selected;
    const marker = active ? "›" : " ";
    const style = active ? `${esc}7m` : "";
    const reset = active ? `${esc}0m` : "";
    stdout.write(`${style}${marker} ${fit(choice.title, cols - 4)}${reset}\n`);
    stdout.write(`${active ? `${esc}7m` : `${esc}2m`}  ${fit(choice.subtitle, cols - 3)}${esc}0m\n`);
  }
}

function close(code = 0) {
  stdout.write("\x1b[?25h\x1b[?1049l\x1b[0m");
  if (stdin.isTTY) stdin.setRawMode(false);
  process.exit(code);
}

async function choose() {
  const choice = visible()[selected];
  if (!choice) return;
  mode = "opening";
  message = choice.workspaceId || choice.openWorkspaceId ? `Switching to ${choice.title}…` : `Creating workspace for ${choice.path}…`;
  render();
  try {
    openChoice(choice);
    close(0);
  } catch (err) {
    mode = "error";
    message = err instanceof Error ? err.message : String(err);
    render();
  }
}

function onKey(buf) {
  const s = buf.toString("utf8");
  if (mode === "error") close(1);
  if (s === "\x03" || s === "\x04" || s === "\x1b") close(0);
  if (s === "\r" || s === "\n") return void choose();
  if (s === "\x7f" || s === "\b") query = query.slice(0, -1);
  else if (s === "\x15") query = "";
  else if (s === "\x1b[A" || s === "\x10") selected = Math.max(0, selected - 1);
  else if (s === "\x1b[B" || s === "\x0e") selected += 1;
  else if (!s.startsWith("\x1b") && /^[\x20-\x7e]+$/.test(s)) query += s;
  if (!["\x1b[A", "\x1b[B", "\x10", "\x0e"].includes(s)) selected = 0;
  render();
}

try {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("command palette needs a TTY");
  stdout.write("\x1b[?1049h\x1b[?25l");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", onKey);
  process.on("SIGWINCH", render);
  ({ choices, configPath, sort } = await buildChoices());
  mode = "ready";
  render();
} catch (err) {
  mode = "error";
  message = err instanceof Error ? err.message : String(err);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.once("data", () => close(1));
  render();
}
