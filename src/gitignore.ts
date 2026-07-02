import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SENSITIVE_ENTRIES = [".env", ".xcode-translator/"] as const;
const AUTO_HEADER = "# xcode-translator (auto-added — keeps API keys local)";

export interface GitignoreUpdateResult {
  updated: string[];
  created: string[];
}

function findGitRoot(startPath: string): string | null {
  let dir = resolve(startPath);

  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function collectGitignoreTargets(projectRoot: string): string[] {
  const resolvedRoot = resolve(projectRoot);
  const gitRoot = findGitRoot(resolvedRoot);
  const targets: string[] = [];

  let dir = resolvedRoot;
  const stopAt = gitRoot ? resolve(gitRoot) : resolvedRoot;

  while (true) {
    const gitignorePath = join(dir, ".gitignore");
    if (existsSync(gitignorePath)) {
      targets.push(gitignorePath);
    }

    if (dir === stopAt) break;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (gitRoot && targets.length === 0) {
    targets.push(join(resolvedRoot, ".gitignore"));
  }

  return targets;
}

function isEntryCovered(lines: string[], entry: string): boolean {
  const normalizedEntry = entry.replace(/\/$/, "");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.replace(/\/$/, "");
    if (normalizedLine === normalizedEntry) return true;

    if (entry === ".env") {
      if (line === ".env*" || line.startsWith(".env.")) return true;
    }

    if (entry.startsWith(".xcode-translator")) {
      if (normalizedLine.startsWith(".xcode-translator")) return true;
    }
  }

  return false;
}

function appendEntries(content: string, missing: string[]): string {
  const trimmed = content.replace(/\s+$/, "");
  const block = [AUTO_HEADER, ...missing].join("\n");
  return trimmed.length > 0 ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

function updateGitignoreFile(path: string): "updated" | "created" | "unchanged" {
  const missing = SENSITIVE_ENTRIES.filter((entry) => {
    if (!existsSync(path)) return true;
    const content = readFileSync(path, "utf-8");
    return !isEntryCovered(content.split("\n"), entry);
  });

  if (missing.length === 0) return "unchanged";

  if (!existsSync(path)) {
    writeFileSync(path, appendEntries("", [...missing]), "utf-8");
    return "created";
  }

  const content = readFileSync(path, "utf-8");
  writeFileSync(path, appendEntries(content, [...missing]), "utf-8");
  return "updated";
}

export function ensureSensitivePathsIgnored(
  projectRoot: string
): GitignoreUpdateResult {
  const result: GitignoreUpdateResult = { updated: [], created: [] };
  const targets = collectGitignoreTargets(projectRoot);

  for (const target of targets) {
    const status = updateGitignoreFile(target);
    if (status === "updated") result.updated.push(target);
    if (status === "created") result.created.push(target);
  }

  return result;
}
