import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(appDir, "dist", "apk");

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

function prependToWindowsPath(env, prefix) {
  const current = env.Path ?? env.PATH ?? "";
  const next = `${prefix};${current}`;
  // On Windows, Path is the canonical key in most shells.
  env.Path = next;
  env.PATH = next;
}

function quoteArg(a) {
  // Minimal quoting for cmd.exe / sh
  if (a === "") return '""';
  if (/[\s"]/g.test(a)) return `"${a.replaceAll('"', '\\"')}"`;
  return a;
}

function runCap(args, cwd = appDir, env = process.env) {
  // Prefer local Capacitor binary to avoid PATH issues.
  const isWin = process.platform === "win32";
  const localBin = isWin
    ? path.join(appDir, "node_modules", ".bin", "cap.cmd")
    : path.join(appDir, "node_modules", ".bin", "cap");
  const localCapacitor = isWin
    ? path.join(appDir, "node_modules", ".bin", "capacitor.cmd")
    : path.join(appDir, "node_modules", ".bin", "capacitor");

  try {
    if (fileExists(localBin)) {
      run(`${quoteArg(localBin)} ${args.map(quoteArg).join(" ")}`, cwd, env);
      return;
    }
    if (fileExists(localCapacitor)) {
      run(`${quoteArg(localCapacitor)} ${args.map(quoteArg).join(" ")}`, cwd, env);
      return;
    }
    // Fallback to npx when available.
    const npxCmd = isWin ? "npx.cmd" : "npx";
    run(`${npxCmd} cap ${args.map(quoteArg).join(" ")}`, cwd, env);
    return;
  } catch (e) {
    // Fallback: call Capacitor CLI directly from node_modules (works if app deps installed).
    const cliPath = path.join(appDir, "node_modules", "@capacitor", "cli", "bin", "capacitor");
    if (fileExists(cliPath) || fileExists(`${cliPath}.js`)) {
      const cli = fileExists(cliPath) ? cliPath : `${cliPath}.js`;
      // Use current Node executable (avoid relying on PATH).
      run(`${quoteArg(process.execPath)} ${quoteArg(cli)} ${args.map(quoteArg).join(" ")}`, cwd, env);
      return;
    }
    throw e;
  }
}

function runGradleAssembleDebug(env) {
  const androidDir = path.join(appDir, "android");
  const gradlew = isWindows() ? path.join(androidDir, "gradlew.bat") : path.join(androidDir, "gradlew");
  if (!fileExists(gradlew)) {
    throw new Error(`Không tìm thấy gradlew: ${gradlew}. Hãy chạy cap add android/sync trước.`);
  }
  // Debug APK does NOT require signing config.
  run(`${quoteArg(gradlew)} :app:assembleDebug`, androidDir, env);
}

function tryGetJavaMajor(javaExePath) {
  try {
    const out = execSync(`"${javaExePath}" -version`, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    }).toString("utf8");
    // Some JDKs print version to stderr; fallback:
    const err = execSync(`"${javaExePath}" -version`, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    }).toString("utf8");
    const combined = `${out}\n${err}`;
    const m = combined.match(/version "(?<ver>\d+)(?:\.\d+)?/i);
    if (!m?.groups?.ver) return null;
    return Number(m.groups.ver);
  } catch {
    return null;
  }
}

function findJdk17HomeOnWindows() {
  const candidates = [];

  const addDirMatches = (parentDir, startsWith) => {
    try {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (!e.name.toLowerCase().startsWith(startsWith.toLowerCase())) continue;
        const full = path.join(parentDir, e.name);
        const javaExe = path.join(full, "bin", "java.exe");
        if (fileExists(javaExe)) candidates.push(full);
      }
    } catch {
      // ignore
    }
  };

  // Common install locations
  addDirMatches("C:\\Program Files\\Java", "jdk-17");
  addDirMatches("C:\\Program Files\\Eclipse Adoptium", "jdk-17");
  addDirMatches("C:\\Program Files\\Microsoft", "OpenJDK-17");

  // Prefer newest-looking folder name by sort desc
  candidates.sort((a, b) => b.localeCompare(a));
  return candidates[0] || null;
}

function ensureGradleCompatibleJava(env) {
  // Gradle 8.0.2 in Capacitor template works reliably with Java 17.
  // If user points JAVA_HOME to Java 21 (major 65 class files), build fails.
  const isWin = process.platform === "win32";
  if (!isWin) return env;

  const currentJavaHome = env.JAVA_HOME;
  const currentJavaExe = currentJavaHome ? path.join(currentJavaHome, "bin", "java.exe") : null;
  const currentMajor = currentJavaExe && fileExists(currentJavaExe) ? tryGetJavaMajor(currentJavaExe) : null;

  if (currentMajor && currentMajor <= 17) {
    // OK
    prependToWindowsPath(env, path.join(currentJavaHome, "bin"));
    return env;
  }

  const jdk17Home = findJdk17HomeOnWindows();
  if (!jdk17Home) {
    if (currentMajor && currentMajor > 17) {
      console.log(`[ERROR] Đang dùng Java ${currentMajor} (không tương thích Gradle 8.0.2). Cần cài JDK 17 và set JAVA_HOME.`);
    } else {
      console.log("[ERROR] Không tìm thấy JDK phù hợp. Cần cài JDK 17 và set JAVA_HOME.");
    }
    console.log("Gợi ý cài: Temurin/OpenJDK 17. Sau đó set JAVA_HOME trỏ tới thư mục JDK 17 (vd: C:\\Program Files\\Java\\jdk-17...).");
    throw new Error("Missing/invalid JAVA_HOME (need JDK 17).");
  }

  env.JAVA_HOME = jdk17Home;
  prependToWindowsPath(env, path.join(jdk17Home, "bin"));
  console.log(`[INFO] Tự động dùng JDK 17 tại: ${jdk17Home}`);
  return env;
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

function findAndroidSdkOnWindows() {
  // Common default: %LOCALAPPDATA%\Android\Sdk
  const localAppData = process.env.LOCALAPPDATA || "";
  const userProfile = process.env.USERPROFILE || "";
  const candidates = [
    localAppData ? path.join(localAppData, "Android", "Sdk") : null,
    userProfile ? path.join(userProfile, "AppData", "Local", "Android", "Sdk") : null,
    "C:\\Android\\Sdk",
  ].filter(Boolean);

  for (const c of candidates) {
    const adb = path.join(c, "platform-tools", isWindows() ? "adb.exe" : "adb");
    const platforms = path.join(c, "platforms");
    if (fileExists(platforms) || fileExists(adb)) return c;
  }
  return null;
}

function isWindows() {
  return process.platform === "win32";
}

function ensureAndroidSdkConfigured(env) {
  if (!isWindows()) return env;

  const sdk =
    env.ANDROID_SDK_ROOT ||
    env.ANDROID_HOME ||
    findAndroidSdkOnWindows();

  if (!sdk) {
    console.log("[ERROR] Không tìm thấy Android SDK.");
    console.log("Cách fix nhanh: cài Android Studio -> SDK Manager, rồi set ANDROID_SDK_ROOT/ANDROID_HOME.");
    console.log("Đường dẫn thường là: %LOCALAPPDATA%\\Android\\Sdk");
    throw new Error("Missing Android SDK (ANDROID_HOME/ANDROID_SDK_ROOT or local.properties sdk.dir).");
  }

  env.ANDROID_SDK_ROOT = sdk;
  env.ANDROID_HOME = sdk;

  // Ensure local.properties exists for Gradle.
  const androidDir = path.join(appDir, "android");
  const localPropsPath = path.join(androidDir, "local.properties");
  if (fileExists(androidDir)) {
    const sdkDirLine = `sdk.dir=${sdk.replace(/\\/g, "\\\\")}`;
    let content = "";
    if (fileExists(localPropsPath)) {
      content = fs.readFileSync(localPropsPath, "utf8");
      if (content.includes("sdk.dir=")) {
        // Replace existing sdk.dir line
        content = content.replace(/^sdk\.dir=.*$/m, sdkDirLine);
      } else {
        content = `${content.trimEnd()}\n${sdkDirLine}\n`;
      }
    } else {
      content = `${sdkDirLine}\n`;
    }
    fs.writeFileSync(localPropsPath, content, "utf8");
    console.log(`[INFO] Đã cấu hình Android SDK tại: ${sdk}`);
  }

  // Prepend tools to PATH (some builds expect aapt/adb/avdmanager)
  prependToWindowsPath(env, path.join(sdk, "platform-tools"));
  prependToWindowsPath(env, path.join(sdk, "tools"));
  prependToWindowsPath(env, path.join(sdk, "tools", "bin"));
  return env;
}

function findLatestApk(apkRoot) {
  if (!fileExists(apkRoot)) return null;
  const candidates = [];

  // Limit scan to reasonable depth/output dirs.
  const walk = (dir, depth) => {
    if (depth > 6) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".apk")) {
        const st = fs.statSync(full);
        candidates.push({ path: full, mtimeMs: st.mtimeMs });
      }
    }
  };

  walk(apkRoot, 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].path;
}

// Leanback launcher is now handled via productFlavors manifests:
// - app/src/main/AndroidManifest.xml (phone default)
// - app/src/tv/AndroidManifest.xml (adds LEANBACK_LAUNCHER)

async function downloadToBuffer(downloadUrl) {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Tải ảnh thất bại: ${res.status} ${res.statusText}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function patchAndroidLauncherIcon(resDir, downloadUrl) {
  if (!downloadUrl) return;
  if (!/^https?:\/\//i.test(downloadUrl)) {
    console.log(`[WARN] iconUrl không hợp lệ: ${downloadUrl}`);
    return;
  }

  const fileCandidates = [];

  const mdpi = 48;
  const hdpi = 72;
  const xhdpi = 96;
  const xxhdpi = 144;
  const xxxhdpi = 192;
  const anydpiV26 = 108;

  const addIfExists = (p, size) => {
    if (fileExists(p)) fileCandidates.push({ path: p, size });
  };

  // Typical launcher icon files (Capacitor template).
  addIfExists(path.join(resDir, "mipmap-mdpi", "ic_launcher.png"), mdpi);
  addIfExists(path.join(resDir, "mipmap-hdpi", "ic_launcher.png"), hdpi);
  addIfExists(path.join(resDir, "mipmap-xhdpi", "ic_launcher.png"), xhdpi);
  addIfExists(path.join(resDir, "mipmap-xxhdpi", "ic_launcher.png"), xxhdpi);
  addIfExists(path.join(resDir, "mipmap-xxxhdpi", "ic_launcher.png"), xxxhdpi);

  addIfExists(path.join(resDir, "mipmap-mdpi", "ic_launcher_round.png"), mdpi);
  addIfExists(path.join(resDir, "mipmap-hdpi", "ic_launcher_round.png"), hdpi);
  addIfExists(path.join(resDir, "mipmap-xhdpi", "ic_launcher_round.png"), xhdpi);
  addIfExists(path.join(resDir, "mipmap-xxhdpi", "ic_launcher_round.png"), xxhdpi);
  addIfExists(path.join(resDir, "mipmap-xxxhdpi", "ic_launcher_round.png"), xxxhdpi);

  addIfExists(path.join(resDir, "mipmap-anydpi-v26", "ic_launcher_foreground.png"), anydpiV26);
  addIfExists(path.join(resDir, "mipmap-anydpi-v26", "ic_launcher_background.png"), anydpiV26);

  if (fileCandidates.length === 0) {
    console.log("[WARN] Không tìm thấy file icon launcher (ic_launcher*.png) để thay thế.");
    return;
  }

  console.log(`[INFO] Đang cập nhật icon launcher từ URL ảnh: ${downloadUrl}`);
  const sourceBuffer = await downloadToBuffer(downloadUrl);

  let sharpLib = null;
  try {
    sharpLib = (await import("sharp")).default;
  } catch {
    sharpLib = null;
  }

  for (const { path: targetPath, size } of fileCandidates) {
    ensureDir(path.dirname(targetPath));
    if (sharpLib) {
      await sharpLib(sourceBuffer)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(targetPath);
    } else {
      // Fallback: copy raw bytes (works best if source is already PNG).
      fs.writeFileSync(targetPath, sourceBuffer);
    }
  }

  console.log(`[INFO] Icon đã được thay thế ở ${fileCandidates.length} file(s).`);
}

function getAndroidResDir() {
  return path.join(appDir, "android", "app", "src", "main", "res");
}

function getApkRoot(buildDir, release) {
  return path.join(buildDir, "outputs", "apk", release ? "release" : "debug");
}

const args = parseArgs(process.argv.slice(2));
let url = args.url;
const iconUrl = args.iconUrl || args["icon-url"] || args.icon;
const buildRelease = !!args.release;
const appNameArg = args.appName || args["app-name"];

if (!url) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  url = (await rl.question("Nhập URL web (https://...): ")).trim();
  rl.close();
}

if (!/^https?:\/\//i.test(url)) {
  throw new Error("URL không hợp lệ. Vui lòng nhập dạng https://...");
}

ensureDir(distDir);

// Ensure native android project exists.
const androidAppDir = path.join(appDir, "android");
if (!fileExists(androidAppDir)) {
  console.log("Chưa có project android -> chạy `npx cap add android`...");
  runCap(["add", "android"], appDir);
}

const variants = [
  {
    name: "phone",
    appId: "com.daop.phim",
    appName: "DAOP Phim",
    gradleTask: ":app:assemblePhoneDebug",
  },
  {
    name: "tv",
    appId: "com.daop.phim.tv",
    appName: "DAOP Phim TV",
    gradleTask: ":app:assembleTvDebug",
  },
];

for (const v of variants) {
  console.log(`\n=== Build Android variant: ${v.name} ===`);
  const env = { ...process.env };
  env.CAPACITOR_SERVER_URL = url;
  env.CAPACITOR_APP_ID = v.appId;
  env.CAPACITOR_APP_NAME = appNameArg || v.appName;
  ensureGradleCompatibleJava(env);
  ensureAndroidSdkConfigured(env);

  // Sync config into Android project (so appId/appName/server.url reflect).
  // Use platform-specific sync for speed.
  runCap(["sync", "android"], appDir, env);

  // Patch launcher icon (optional)
  await patchAndroidLauncherIcon(getAndroidResDir(), iconUrl);

  // Build APK
  // - Default: debug APK (installable, no signing needed)
  // - Optional: release via Capacitor (requires signing)
  try {
    if (buildRelease) {
      runCap(["build", "android", "--release"], appDir, env);
    } else {
      const androidDir = path.join(appDir, "android");
      const gradlew = isWindows() ? path.join(androidDir, "gradlew.bat") : path.join(androidDir, "gradlew");
      run(`${quoteArg(gradlew)} ${v.gradleTask}`, androidDir, env);
    }
  } catch (e) {
    console.log("[WARN] Build thất bại.");
    console.log(String(e?.message || e));
    throw e;
  }

  const apkRoot = path.join(appDir, "android", "app", "build", "outputs", "apk", buildRelease ? "release" : "debug");
  let latestApk = findLatestApk(apkRoot);
  if (!latestApk) {
    // Fallback: scan whole outputs/apk
    latestApk = findLatestApk(path.join(appDir, "android", "app", "build", "outputs", "apk"));
  }
  if (!latestApk) {
    console.error("Không tìm thấy APK sau khi build.");
    continue;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(distDir, `daop-${v.name}-${ts}.apk`);
  fs.copyFileSync(latestApk, outPath);
  console.log(`APK đã copy: ${outPath}`);
}

console.log(`\nXong. APK nằm ở: ${distDir}`);

