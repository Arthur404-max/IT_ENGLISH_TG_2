import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const backupDir = path.join(__dirname, "backups");
const sources = ["purchases.json", "profiles.json"];
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `backup-${stamp}.json`);
const snapshot = {
  created_at: new Date().toISOString(),
  files: {},
};

for (const source of sources) {
  const sourcePath = path.join(dataDir, source);
  const content = fs.existsSync(sourcePath)
    ? fs.readFileSync(sourcePath, "utf8")
    : "{}";
  JSON.parse(content);
  snapshot.files[source] = {
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    content: JSON.parse(content),
  };
}

const tempPath = `${backupPath}.tmp`;
fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2));
fs.renameSync(tempPath, backupPath);

const backups = fs.readdirSync(backupDir)
  .filter((name) => /^backup-.+\.json$/.test(name))
  .sort()
  .reverse();
for (const old of backups.slice(30)) {
  fs.rmSync(path.join(backupDir, old), { force: true });
}

console.log(`Backup created: ${backupPath}`);
