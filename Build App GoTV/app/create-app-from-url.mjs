import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function run(cmd, cwd = appDir) {
  execSync(cmd, { cwd, stdio: "inherit", shell: true, env: process.env });
}

function runCap(args, cwd = appDir) {
  const isWin = process.platform === "win32";
  const localBin = isWin
    ? path.join(appDir, "node_modules", ".bin", "cap.cmd")
    : path.join(appDir, "node_modules", ".bin", "cap");
  const localCapacitor = isWin
    ? path.join(appDir, "node_modules", ".bin", "capacitor.cmd")
    : path.join(appDir, "node_modules", ".bin", "capacitor");

  if (fs.existsSync(localBin)) return run(`"${localBin}" ${args.join(" ")}`, cwd);
  if (fs.existsSync(localCapacitor)) return run(`"${localCapacitor}" ${args.join(" ")}`, cwd);

  const npxCmd = isWin ? "npx.cmd" : "npx";
  return run(`${npxCmd} cap ${args.join(" ")}`, cwd);
}

const args = parseArgs(process.argv.slice(2));
let url = args.url;
const platform = (args.platform || "android").toLowerCase();

if (!url) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  url = (await rl.question("Nhập URL web (https://...): ")).trim();
  rl.close();
}

if (!/^https?:\/\//i.test(url)) {
  throw new Error("URL không hợp lệ. Vui lòng nhập dạng https://...");
}

process.env.CAPACITOR_SERVER_URL = url;

const androidDir = path.join(appDir, "android");
const iosDir = path.join(appDir, "ios");

const needsAndroid = platform === "android" || platform === "both";
const needsIos = platform === "ios" || platform === "both";

if (needsAndroid && !fs.existsSync(androidDir)) runCap(["add", "android"]);
if (needsIos && !fs.existsSync(iosDir)) runCap(["add", "ios"]);

// Chỉ cần sync để nạp lại cấu hình server.url.
// Vì đang load remote URL nên không nhất thiết phải build web cho lần chạy này.
if (needsAndroid && needsIos) runCap(["sync"]);
else if (needsAndroid) runCap(["sync", "android"]);
else if (needsIos) runCap(["sync", "ios"]);

if (needsAndroid) runCap(["open", "android"]);
if (needsIos) runCap(["open", "ios"]);

