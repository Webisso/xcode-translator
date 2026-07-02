import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import chalk from "chalk";
import { translateBatch } from "./gemini.js";
import { readPrompt, buildTranslationPrompt } from "./prompt.js";
import {
  findLocalizableStrings,
  getTargetStringsPath,
} from "./paths.js";
import {
  parseLocalizableStrings,
  buildStringsFile,
  type ParsedStringsFile,
} from "./strings-parser.js";
import type { AppConfig } from "./config.js";
import {
  loadTranslationState,
  saveTranslationState,
  getSavedSourceValues,
  updateSavedSourceValues,
  getKeyValueMap,
  planTranslation,
} from "./translation-state.js";

const BATCH_SIZE = 25;

export interface TranslationParams {
  projectRoot: string;
  sourceLang: string;
  targetLang: string;
  geminiApiKey: string;
  geminiModel: string;
  parsed?: ParsedStringsFile;
  sourcePath?: string;
  quiet?: boolean;
  force?: boolean;
}

async function translateParsed(
  params: TranslationParams,
  parsed: ParsedStringsFile,
  indicesToTranslate: number[]
): Promise<Map<number, string>> {
  const {
    projectRoot,
    sourceLang,
    targetLang,
    geminiApiKey,
    geminiModel,
    quiet,
  } = params;

  const promptTemplate = readPrompt(projectRoot);
  const translatedValues = new Map<number, string>();

  if (indicesToTranslate.length === 0) {
    return translatedValues;
  }

  const totalBatches = Math.ceil(indicesToTranslate.length / BATCH_SIZE);

  for (let batch = 0; batch < totalBatches; batch++) {
    const start = batch * BATCH_SIZE;
    const batchIndices = indicesToTranslate.slice(start, start + BATCH_SIZE);
    const batchStrings = batchIndices.map((i) => parsed.entries[i].value!);

    if (!quiet) {
      process.stdout.write(
        chalk.dim(
          `  Batch ${batch + 1}/${totalBatches} (${batchStrings.length} string)... `
        )
      );
    }

    const prompt = buildTranslationPrompt(
      promptTemplate,
      sourceLang,
      targetLang,
      batchStrings
    );

    const translations = await translateBatch(
      geminiApiKey,
      geminiModel,
      prompt
    );

    if (translations.length !== batchStrings.length) {
      throw new Error(
        `Batch ${batch + 1}: Beklenen ${batchStrings.length} çeviri, alınan ${translations.length}`
      );
    }

    for (let j = 0; j < batchIndices.length; j++) {
      translatedValues.set(batchIndices[j], translations[j]);
    }

    if (!quiet) {
      console.log(chalk.green("✓"));
    }
  }

  return translatedValues;
}

export async function translateToLanguage(
  params: TranslationParams
): Promise<{ targetPath: string; translated: number; skipped: number }> {
  const { projectRoot, sourceLang, targetLang, quiet, force = false } = params;

  let sourcePath = params.sourcePath;
  if (!sourcePath) {
    sourcePath = findLocalizableStrings(projectRoot, sourceLang) ?? undefined;
  }

  if (!sourcePath) {
    throw new Error(
      `${sourceLang}.lproj/Localizable.strings dosyası bulunamadı.\n` +
        `Proje klasöründe (${projectRoot}) arama yapıldı.`
    );
  }

  const parsed =
    params.parsed ?? parseLocalizableStrings(readFileSync(sourcePath, "utf-8"));

  if (parsed.translatableIndices.length === 0) {
    throw new Error("Çevrilecek string bulunamadı.");
  }

  const targetPath = getTargetStringsPath(projectRoot, targetLang, sourcePath);
  const targetDir = dirname(targetPath);

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    if (!quiet) {
      console.log(chalk.dim(`Hedef klasör oluşturuldu: ${targetDir}`));
    }
  }

  const targetKeyValues = (() => {
    if (!existsSync(targetPath)) return new Map<string, string>();
    const targetParsed = parseLocalizableStrings(readFileSync(targetPath, "utf-8"));
    return getKeyValueMap(targetParsed.entries, targetParsed.translatableIndices);
  })();

  const state = loadTranslationState(projectRoot);
  const savedSourceValues = getSavedSourceValues(state, sourcePath, targetLang);

  const plan = planTranslation(
    parsed.entries,
    parsed.translatableIndices,
    targetKeyValues,
    savedSourceValues,
    force
  );

  if (plan.toTranslate.length === 0) {
    if (!quiet) {
      console.log(
        chalk.green(
          `  ✓ Güncel — ${plan.skipped} string zaten çevrilmiş, atlandı`
        )
      );
    }
    return { targetPath, translated: 0, skipped: plan.skipped };
  }

  if (!quiet) {
    console.log(
      chalk.dim(
        `  ${plan.toTranslate.length} yeni/değişen string çevrilecek, ${plan.skipped} atlanacak`
      )
    );
  }

  const newTranslations = await translateParsed(
    params,
    parsed,
    plan.toTranslate.map((t) => t.index)
  );

  const merged = new Map<number, string>(plan.existingByIndex);
  for (const [idx, value] of newTranslations) {
    merged.set(idx, value);
  }

  for (const idx of parsed.translatableIndices) {
    if (!merged.has(idx)) {
      const entry = parsed.entries[idx];
      merged.set(idx, targetKeyValues.get(entry.key!) ?? entry.value!);
    }
  }

  const output = buildStringsFile(parsed.entries, merged);
  writeFileSync(targetPath, output, "utf-8");

  const keySourceValues: Record<string, string> = {};
  for (const idx of parsed.translatableIndices) {
    const entry = parsed.entries[idx];
    keySourceValues[entry.key!] = entry.value!;
  }
  updateSavedSourceValues(state, sourcePath, targetLang, keySourceValues);
  saveTranslationState(projectRoot, state);

  return {
    targetPath,
    translated: plan.toTranslate.length,
    skipped: plan.skipped,
  };
}

export async function runTranslation(
  config: AppConfig,
  force = false
): Promise<void> {
  const { projectRoot, sourceLang, targetLang } = config;

  console.log(chalk.bold.cyan("\n📝 Çeviri başlatılıyor\n"));
  console.log(chalk.dim(`Kaynak: ${sourceLang}.lproj/Localizable.strings`));
  console.log(chalk.dim(`Hedef:  ${targetLang}.lproj/Localizable.strings\n`));

  const sourcePath = findLocalizableStrings(projectRoot, sourceLang);
  if (!sourcePath) {
    throw new Error(
      `${sourceLang}.lproj/Localizable.strings dosyası bulunamadı.\n` +
        `Proje klasöründe (${projectRoot}) arama yapıldı.`
    );
  }

  console.log(chalk.green(`✓ Kaynak dosya: ${sourcePath}\n`));

  const parsed = parseLocalizableStrings(readFileSync(sourcePath, "utf-8"));
  const total = parsed.translatableIndices.length;
  console.log(chalk.dim(`Toplam ${total} string kontrol ediliyor...\n`));

  const { targetPath, translated, skipped } = await translateToLanguage({
    ...config,
    sourcePath,
    parsed,
    force,
  });

  if (translated === 0) {
    console.log(chalk.bold.green(`\n✓ Çeviri gerekmiyor — tüm stringler güncel.`));
    console.log(chalk.dim(`${skipped}/${total} string atlandı\n`));
    return;
  }

  console.log(chalk.bold.green(`\n✓ Çeviri tamamlandı!`));
  console.log(chalk.dim(`${translated} çevrildi, ${skipped} atlandı`));
  console.log(chalk.dim(`Çıktı: ${targetPath}\n`));
}

export async function runBulkTranslation(
  base: Pick<AppConfig, "geminiApiKey" | "geminiModel" | "projectRoot">,
  sourceLang: string,
  targetLangs: string[],
  force = false
): Promise<void> {
  const { projectRoot } = base;

  const filtered = targetLangs.filter((l) => l !== sourceLang);
  if (filtered.length === 0) {
    throw new Error("En az bir hedef dil gerekli (kaynak dille aynı olamaz).");
  }

  console.log(chalk.bold.cyan("\n🌐 Toplu çeviri başlatılıyor\n"));
  console.log(chalk.dim(`Kaynak: ${sourceLang}.lproj/Localizable.strings`));
  console.log(chalk.dim(`Hedefler: ${filtered.join(", ")}\n`));

  const sourcePath = findLocalizableStrings(projectRoot, sourceLang);
  if (!sourcePath) {
    throw new Error(
      `${sourceLang}.lproj/Localizable.strings dosyası bulunamadı.\n` +
        `Proje klasöründe (${projectRoot}) arama yapıldı.`
    );
  }

  console.log(chalk.green(`✓ Kaynak dosya: ${sourcePath}`));

  const parsed = parseLocalizableStrings(readFileSync(sourcePath, "utf-8"));
  console.log(
    chalk.dim(`${parsed.translatableIndices.length} string × ${filtered.length} dil kontrol ediliyor...\n`)
  );

  const results: Array<{
    lang: string;
    path: string;
    ok: boolean;
    translated: number;
    skipped: number;
    error?: string;
  }> = [];

  for (let i = 0; i < filtered.length; i++) {
    const targetLang = filtered[i];
    console.log(
      chalk.bold(`\n[${i + 1}/${filtered.length}] ${sourceLang} → ${targetLang}`)
    );

    try {
      const { targetPath, translated, skipped } = await translateToLanguage({
        ...base,
        sourceLang,
        targetLang,
        sourcePath,
        parsed,
        quiet: false,
        force,
      });
      if (translated === 0) {
        console.log(chalk.green(`✓ Güncel — ${skipped} string atlandı`));
      } else {
        console.log(
          chalk.green(`✓ ${translated} çevrildi, ${skipped} atlandı → ${targetPath}`)
        );
      }
      results.push({
        lang: targetLang,
        path: targetPath,
        ok: true,
        translated,
        skipped,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`✗ ${message}`));
      results.push({
        lang: targetLang,
        path: "",
        ok: false,
        translated: 0,
        skipped: 0,
        error: message,
      });
    }
  }

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const totalTranslated = succeeded.reduce((n, r) => n + r.translated, 0);
  const totalSkipped = succeeded.reduce((n, r) => n + r.skipped, 0);

  console.log(chalk.bold.cyan("\n📊 Özet\n"));
  console.log(chalk.green(`  Başarılı: ${succeeded.length}/${filtered.length}`));
  console.log(chalk.dim(`  Çevrilen string: ${totalTranslated}`));
  console.log(chalk.dim(`  Atlanan string: ${totalSkipped}`));
  if (failed.length > 0) {
    console.log(chalk.red(`  Başarısız: ${failed.length}`));
    for (const f of failed) {
      console.log(chalk.red(`    • ${f.lang}: ${f.error}`));
    }
  }

  if (succeeded.length > 0) {
    console.log(chalk.dim("\n  Oluşturulan dosyalar:"));
    for (const s of succeeded) {
      console.log(chalk.dim(`    • ${s.path}`));
    }
  }

  console.log();

  if (failed.length > 0) {
    throw new Error(`${failed.length} dil çevirisi başarısız oldu.`);
  }
}
