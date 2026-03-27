import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function normalizeFingerprint(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replaceAll(":", "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(compact)) {
    throw new Error("SHA256 fingerprint không hợp lệ. Cần 64 ký tự hex (có hoặc không có dấu ':').");
  }
  return compact.match(/.{1,2}/g).join(":");
}

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(appDir, "..", "..");
const args = parseArgs(process.argv.slice(2));

const pkg = (args.package || args.packageName || "com.daop.phim").trim();
const sha = normalizeFingerprint(args.sha256 || args.fingerprint || "");
if (!sha) {
  throw new Error("Thiếu SHA256. Dùng: --sha256 \"AA:BB:...\" hoặc --sha256 \"AABB...\"");
}

const outPath = path.resolve(
  repoRoot,
  args.out || path.join("public", ".well-known", "assetlinks.json")
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const payload = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: pkg,
      sha256_cert_fingerprints: [sha],
    },
  },
];

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Đã tạo assetlinks.json tại: ${outPath}`);
console.log(`package_name: ${pkg}`);
console.log(`sha256: ${sha}`);

