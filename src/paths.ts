import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSensitivePathsIgnored } from "./gitignore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TOOL_DIR = ".xcode-translator";

export function getProjectRoot(cwd: string = process.cwd()): string {
  return cwd;
}

export function getToolDir(projectRoot: string): string {
  return join(projectRoot, TOOL_DIR);
}

export function getEnvPath(projectRoot: string): string {
  return join(projectRoot, ".env");
}

export function getPromptPath(projectRoot: string): string {
  return join(getToolDir(projectRoot), "translation-prompt.txt");
}

export function getBundledPromptPath(): string {
  return join(__dirname, "prompts", "translation-prompt.txt");
}

export function ensureToolDir(projectRoot: string): void {
  const dir = getToolDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    ensureSensitivePathsIgnored(projectRoot);
  }
}

export function findLocalizableStrings(
  projectRoot: string,
  lang: string
): string | null {
  const direct = join(projectRoot, `${lang}.lproj`, "Localizable.strings");
  if (existsSync(direct)) return direct;

  function search(dir: string): string | null {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }

    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }

      if (entry === `${lang}.lproj`) {
        const candidate = join(full, "Localizable.strings");
        if (existsSync(candidate)) return candidate;
      }

      if (
        entry === "node_modules" ||
        entry === ".git" ||
        entry === "dist" ||
        entry === "build" ||
        entry === "Pods" ||
        entry === ".xcode-translator"
      ) {
        continue;
      }

      const found = search(full);
      if (found) return found;
    }
    return null;
  }

  return search(projectRoot);
}

export function getTargetStringsPath(
  projectRoot: string,
  targetLang: string,
  sourcePath: string
): string {
  const lprojDir = join(
    sourcePath.replace(/Localizable\.strings$/, "").replace(/\/$/, "")
  );
  const parentDir = dirname(lprojDir);
  return join(parentDir, `${targetLang}.lproj`, "Localizable.strings");
}
