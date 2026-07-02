import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  ensureToolDir,
  getBundledPromptPath,
  getPromptPath,
} from "./paths.js";

export function initPromptFile(projectRoot: string): string {
  ensureToolDir(projectRoot);
  const promptPath = getPromptPath(projectRoot);

  if (!existsSync(promptPath)) {
    copyFileSync(getBundledPromptPath(), promptPath);
  }

  return promptPath;
}

export function readPrompt(projectRoot: string): string {
  const promptPath = initPromptFile(projectRoot);
  return readFileSync(promptPath, "utf-8");
}

export function writePrompt(projectRoot: string, content: string): void {
  ensureToolDir(projectRoot);
  writeFileSync(getPromptPath(projectRoot), content, "utf-8");
}

export function buildTranslationPrompt(
  template: string,
  sourceLang: string,
  targetLang: string,
  strings: string[]
): string {
  return template
    .replace(/\{\{SOURCE_LANG\}\}/g, sourceLang)
    .replace(/\{\{TARGET_LANG\}\}/g, targetLang)
    .replace(/\{\{STRINGS_JSON\}\}/g, JSON.stringify(strings, null, 2));
}

export function openPromptInEditor(projectRoot: string): void {
  const promptPath = initPromptFile(projectRoot);
  const editor = process.env.EDITOR || process.env.VISUAL || "nano";

  const result = spawnSync(editor, [promptPath], {
    stdio: "inherit",
    shell: true,
  });

  if (result.error) {
    throw new Error(
      `Editör açılamadı (${editor}). Dosyayı manuel düzenleyin: ${promptPath}`
    );
  }
}

export function resetPromptToDefault(projectRoot: string): void {
  ensureToolDir(projectRoot);
  copyFileSync(getBundledPromptPath(), getPromptPath(projectRoot));
}
