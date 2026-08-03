const fs = require("fs");
const path = require("path");

const MAX_LINES = 600;
const ROOT = path.resolve(__dirname, "..");
const IGNORED_DIRS = new Set([".git", "node_modules", "assets", "backups"]);
const IGNORED_FILES = new Set(["package-lock.json"]);
const IGNORED_PREFIXES = [];
const CHECKED_EXTENSIONS = new Set([".js", ".css", ".html", ".json", ".md"]);

function shouldIgnore(relativePath, entryName) {
  if (IGNORED_FILES.has(entryName)) return true;
  return IGNORED_PREFIXES.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}${path.sep}`));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT, fullPath);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !shouldIgnore(relativePath, entry.name)) {
        walk(fullPath, files);
      }
      continue;
    }
    if (!CHECKED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    if (shouldIgnore(relativePath, entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

const oversized = walk(ROOT)
  .map((file) => {
    const text = fs.readFileSync(file, "utf8");
    return {
      file: path.relative(ROOT, file),
      lines: text.split(/\r?\n/).length,
    };
  })
  .filter((item) => item.lines > MAX_LINES)
  .sort((a, b) => b.lines - a.lines);

if (oversized.length) {
  console.error(`Arquivos acima de ${MAX_LINES} linhas:`);
  for (const item of oversized) {
    console.error(`- ${item.file}: ${item.lines} linhas`);
  }
  process.exit(1);
}

console.log(`File Size Guardian: todos os arquivos verificados têm até ${MAX_LINES} linhas.`);
