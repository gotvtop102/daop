import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

function run(cmd, cwd = appDir, env = process.env) {
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    shell: true,
    env,
  });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function findLatestIpa(exportDir) {
  if (!fileExists(exportDir)) return null;
  const candidates = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".ipa")) {
        const st = fs.statSync(full);
        candidates.push({ path: full, mtimeMs: st.mtimeMs });
      }
    }
  };
  walk(exportDir, 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].path;
}

function detectScheme() {
  const workspace = path.join(appDir, "ios", "App", "App.xcworkspace");
  if (!fileExists(workspace)) return "App";

  // Best-effort: look for a scheme name.
  try {
    const out = execSync(`xcodebuild -workspace "${workspace}" -list`, {
      cwd: appDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    }).toString("utf8");

    const m = out.match(/Schemes:\s*\n([\s\S]*?)\n\n/m);
    if (m?.[1]) {
      const lines = m[1].split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (lines.length > 0) return lines[0];
    }
  } catch {
    // ignore
  }
  return "App";
}

const args = parseArgs(process.argv.slice(2));

const url = args.url || process.env.CAPACITOR_SERVER_URL;
if (!url) throw new Error("Thiếu URL web. Dùng: --url https://...");
if (!/^https?:\/\//i.test(url)) throw new Error("URL không hợp lệ. Vui lòng nhập dạng https://...");

const appId = args.appId || process.env.CAPACITOR_APP_ID || "com.daop.phim";
const appName = args.appName || process.env.CAPACITOR_APP_NAME || "DAOP Phim";

// App Store Connect API key params for altool
// - ASC_API_KEY_ID
// - ASC_API_ISSUER_ID
// - ASC_API_KEY_P8_PATH (đường dẫn tới .p8; script sẽ copy vào ~/private_keys/AuthKey_<id>.p8)
const ascApiKeyId = process.env.ASC_API_KEY_ID || args.ascApiKeyId;
const ascIssuerId = process.env.ASC_API_ISSUER_ID || args.ascIssuerId;
const ascP8Path = process.env.ASC_API_KEY_P8_PATH || args.ascP8Path;

if (!ascApiKeyId || !ascIssuerId) {
  throw new Error(
    "Thiếu thông tin upload TestFlight. Cần set env: ASC_API_KEY_ID và ASC_API_ISSUER_ID (hoặc truyền --ascApiKeyId/--ascIssuerId)."
  );
}

if (process.platform !== "darwin") {
  throw new Error("Script này cần chạy trên macOS (Xcode).");
}

// Prepare key file location expected by altool: ~/private_keys/AuthKey_<keyId>.p8
if (ascP8Path && /^https?:\/\//i.test(ascP8Path) === false) {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const targetDir = path.join(home, "private_keys");
  ensureDir(targetDir);
  const targetP8 = path.join(targetDir, `AuthKey_${ascApiKeyId}.p8`);
  fs.copyFileSync(ascP8Path, targetP8);
  console.log(`[INFO] Đã copy API key p8 tới: ${targetP8}`);
} else if (!ascP8Path) {
  console.log(
    "[WARN] Không cung cấp ASC_API_KEY_P8_PATH. altool sẽ tự tìm AuthKey_<id>.p8 trong ~/private_keys (hoặc các thư mục mặc định)."
  );
}

const env = { ...process.env };
env.CAPACITOR_SERVER_URL = url;
env.CAPACITOR_APP_ID = appId;
env.CAPACITOR_APP_NAME = appName;

// Ensure iOS platform exists
const iosDir = path.join(appDir, "ios");
if (!fileExists(iosDir)) {
  console.log("Chưa có platform iOS -> chạy `npx cap add ios`...");
  run("npx cap add ios", appDir, env);
}

// Sync & build web -> native
run("npx cap sync ios", appDir, env);
run("npx cap build ios", appDir, env);

const workspace = path.join(appDir, "ios", "App", "App.xcworkspace");
if (!fileExists(workspace)) {
  throw new Error(`Không thấy workspace: ${workspace}`);
}

const scheme = args.scheme || detectScheme();

const buildBaseDir = path.join(appDir, "ios", "build", "testflight");
ensureDir(buildBaseDir);

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const archivePath = path.join(buildBaseDir, `daop-${ts}.xcarchive`);
const exportDir = path.join(buildBaseDir, "export");
const exportOptionsPlist = path.join(buildBaseDir, "ExportOptions.plist");

// Clean previous export folder
if (fileExists(exportDir)) {
  fs.rmSync(exportDir, { recursive: true, force: true });
}
ensureDir(exportDir);

// ExportOptions for TestFlight (App Store distribution)
const exportOptions = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>uploadSymbols</key>
  <false/>
  <key>uploadBitcode</key>
  <false/>
</dict>
</plist>
`;
writeFile(exportOptionsPlist, exportOptions);

// Archive
const devTeam = env.IOS_DEVELOPMENT_TEAM || env.DEVELOPMENT_TEAM;
const devTeamArg = devTeam ? ` DEVELOPMENT_TEAM="${devTeam}"` : "";

console.log(`[INFO] Archiving with scheme=${scheme}...`);
run(
  `xcodebuild -workspace "${workspace}" -scheme "${scheme}" -configuration Release -archivePath "${archivePath}" -allowProvisioningUpdates${devTeamArg} archive`,
  appDir,
  env
);

// Export IPA
console.log("[INFO] Exporting IPA...");
run(
  `xcodebuild -exportArchive -archivePath "${archivePath}" -exportPath "${exportDir}" -exportOptionsPlist "${exportOptionsPlist}"`,
  appDir,
  env
);

const latestIpa = findLatestIpa(exportDir);
if (!latestIpa) throw new Error("Không tìm thấy IPA sau khi export.");
console.log(`[INFO] IPA: ${latestIpa}`);

// Upload to App Store Connect -> TestFlight
console.log("[INFO] Uploading to TestFlight via altool...");
run(
  `xcrun altool --upload-app -f "${latestIpa}" -t ios --apiKey "${ascApiKeyId}" --apiIssuer "${ascIssuerId}"`,
  appDir,
  env
);

// Copy artifact to dist
const distIpaDir = path.join(appDir, "dist", "ipa");
ensureDir(distIpaDir);
const outIpa = path.join(distIpaDir, `daop-ios-${ts}.ipa`);
fs.copyFileSync(latestIpa, outIpa);
console.log(`[INFO] IPA đã copy: ${outIpa}`);

console.log("[DONE] Đã upload. Bên TestFlight có thể mất vài phút để xử lý.");

