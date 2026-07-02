import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getToolDir } from "./paths.js";

interface LangState {
  [key: string]: string;
}

interface StateFile {
  files: {
    [sourcePath: string]: {
      [targetLang: string]: LangState;
    };
  };
}

function getStatePath(projectRoot: string): string {
  return join(getToolDir(projectRoot), "translation-state.json");
}

function emptyState(): StateFile {
  return { files: {} };
}

export function loadTranslationState(projectRoot: string): StateFile {
  const path = getStatePath(projectRoot);
  if (!existsSync(path)) return emptyState();

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as StateFile;
  } catch {
    return emptyState();
  }
}

export function saveTranslationState(
  projectRoot: string,
  state: StateFile
): void {
  const dir = getToolDir(projectRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getStatePath(projectRoot), JSON.stringify(state, null, 2) + "\n", "utf-8");
}

export function getSavedSourceValues(
  state: StateFile,
  sourcePath: string,
  targetLang: string
): LangState {
  return state.files[sourcePath]?.[targetLang] ?? {};
}

export function updateSavedSourceValues(
  state: StateFile,
  sourcePath: string,
  targetLang: string,
  keySourceValues: LangState
): void {
  if (!state.files[sourcePath]) state.files[sourcePath] = {};
  state.files[sourcePath][targetLang] = keySourceValues;
}

export function getKeyValueMap(
  entries: Array<{ key?: string; value?: string; type: string }>,
  indices: number[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const idx of indices) {
    const entry = entries[idx];
    if (entry.key !== undefined && entry.value !== undefined) {
      map.set(entry.key, entry.value);
    }
  }
  return map;
}

export interface TranslationPlan {
  toTranslate: Array<{ index: number; key: string; value: string }>;
  existingByIndex: Map<number, string>;
  skipped: number;
}

export function planTranslation(
  sourceEntries: Array<{ key?: string; value?: string; type: string }>,
  sourceIndices: number[],
  targetKeyValues: Map<string, string>,
  savedSourceValues: LangState,
  force: boolean
): TranslationPlan {
  const toTranslate: TranslationPlan["toTranslate"] = [];
  const existingByIndex = new Map<number, string>();
  let skipped = 0;

  for (const idx of sourceIndices) {
    const entry = sourceEntries[idx];
    const key = entry.key!;
    const sourceValue = entry.value!;
    const hasTarget = targetKeyValues.has(key);
    const savedValue = savedSourceValues[key];
    const sourceUnchanged = savedValue === sourceValue;

    if (
      !force &&
      hasTarget &&
      (savedValue === undefined || sourceUnchanged)
    ) {
      existingByIndex.set(idx, targetKeyValues.get(key)!);
      skipped++;
      continue;
    }

    toTranslate.push({ index: idx, key, value: sourceValue });
  }

  return { toTranslate, existingByIndex, skipped };
}
