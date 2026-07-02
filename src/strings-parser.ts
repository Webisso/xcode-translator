export type StringEntryType = "comment" | "entry" | "blank";

export interface StringEntry {
  type: StringEntryType;
  key?: string;
  value?: string;
  raw: string;
  lineStart: number;
}

export interface ParsedStringsFile {
  entries: StringEntry[];
  translatableIndices: number[];
}

const ENTRY_REGEX =
  /^(\s*)"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;\s*$/;
const BLOCK_COMMENT_START = /^(\s*)\/\*/;
const BLOCK_COMMENT_END = /\*\//;
const LINE_COMMENT = /^(\s*)\/\/.*$/;

export function parseLocalizableStrings(content: string): ParsedStringsFile {
  const lines = content.split("\n");
  const entries: StringEntry[] = [];
  const translatableIndices: number[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      entries.push({ type: "blank", raw: line, lineStart: i });
      i++;
      continue;
    }

    if (BLOCK_COMMENT_START.test(line)) {
      let block = line;
      let j = i;
      while (j < lines.length && !BLOCK_COMMENT_END.test(lines[j])) {
        j++;
        if (j < lines.length && j !== i) block += "\n" + lines[j];
      }
      if (j < lines.length && j !== i) {
        block = lines.slice(i, j + 1).join("\n");
      }
      entries.push({ type: "comment", raw: block, lineStart: i });
      i = j + 1;
      continue;
    }

    if (LINE_COMMENT.test(line)) {
      entries.push({ type: "comment", raw: line, lineStart: i });
      i++;
      continue;
    }

    const match = line.match(ENTRY_REGEX);
    if (match) {
      const key = unescapeString(match[2]);
      const value = unescapeString(match[3]);
      const idx = entries.length;
      entries.push({
        type: "entry",
        key,
        value,
        raw: line,
        lineStart: i,
      });
      translatableIndices.push(idx);
      i++;
      continue;
    }

    entries.push({ type: "comment", raw: line, lineStart: i });
    i++;
  }

  return { entries, translatableIndices };
}

function unescapeString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

export function formatEntry(key: string, value: string, indent = ""): string {
  return `${indent}"${escapeString(key)}" = "${escapeString(value)}";`;
}

export function buildStringsFile(
  entries: StringEntry[],
  translatedValues: Map<number, string>
): string {
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.type === "entry" && translatedValues.has(i)) {
      const indent = entry.raw.match(/^(\s*)/)?.[1] ?? "";
      lines.push(formatEntry(entry.key!, translatedValues.get(i)!, indent));
    } else {
      lines.push(entry.raw);
    }
  }

  return lines.join("\n") + (lines.length > 0 && !lines[lines.length - 1].endsWith("\n") ? "\n" : "");
}

export function extractIndent(raw: string): string {
  return raw.match(/^(\s*)/)?.[1] ?? "";
}
