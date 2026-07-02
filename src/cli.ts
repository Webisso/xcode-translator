#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { getProjectRoot, getPromptPath } from "./paths.js";
import { input } from "@inquirer/prompts";
import { ensureConfig, ensureApiConfig, runSetup, promptLangList } from "./setup.js";
import { runTranslation, runBulkTranslation } from "./translator.js";
import { parseLangList, isValidLangCode } from "./lang.js";
import { saveConfig } from "./config.js";
import {
  initPromptFile,
  openPromptInEditor,
  resetPromptToDefault,
  readPrompt,
} from "./prompt.js";
import { loadConfig } from "./config.js";

const program = new Command();

program
  .name("xcode-translator")
  .description("Xcode Localizable.strings dosyalarını Gemini AI ile çevirir")
  .version("1.0.0");

program
  .command("translate", { isDefault: true })
  .description("Localizable.strings dosyasını çevir (varsayılan komut)")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .option("-f, --force", "Tüm stringleri yeniden çevir (mevcut çevirileri yoksay)")
  .action(async (opts: { cwd: string; force?: boolean }) => {
    try {
      const projectRoot = getProjectRoot(opts.cwd);
      const config = await ensureConfig(projectRoot);
      await runTranslation(config, opts.force ?? false);
    } catch (err) {
      console.error(chalk.red("\n✗ Hata:"), err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("bulk")
  .description("Bir kaynak dilden birden fazla dile toplu çeviri (örn: tr,de,es)")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .option("-f, --from <lang>", "Kaynak dil kodu (örn: en)")
  .option("-t, --to <langs>", "Hedef diller, virgülle ayrılmış (örn: tr,de,es)")
  .option("--force", "Tüm stringleri yeniden çevir")
  .action(async (opts: { cwd: string; from?: string; to?: string; force?: boolean }) => {
    try {
      const projectRoot = getProjectRoot(opts.cwd);
      const apiConfig = await ensureApiConfig(projectRoot);

      let sourceLang = opts.from ?? apiConfig.sourceLang;
      if (!sourceLang) {
        sourceLang = await input({
          message: "Kaynak dil kodu (örn: en):",
          default: "en",
          validate: (v) =>
            isValidLangCode(v.trim())
              ? true
              : "Geçerli bir dil kodu girin (örn: en, tr, pt-BR, zh-Hans)",
        }).then((v) => v.trim());
      } else if (!isValidLangCode(sourceLang)) {
        throw new Error(`Geçersiz kaynak dil kodu: ${sourceLang}`);
      }

      if (!sourceLang) {
        throw new Error("Kaynak dil belirlenemedi.");
      }

      let targetLangs: string[];
      if (opts.to) {
        targetLangs = parseLangList(opts.to);
      } else {
        targetLangs = await promptLangList();
      }

      saveConfig(projectRoot, { sourceLang, projectRoot });

      await runBulkTranslation(
        {
          geminiApiKey: apiConfig.geminiApiKey,
          geminiModel: apiConfig.geminiModel,
          projectRoot,
        },
        sourceLang,
        targetLangs,
        opts.force ?? false
      );
    } catch (err) {
      console.error(chalk.red("\n✗ Hata:"), err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("setup")
  .description("API anahtarı, model ve dil ayarlarını yapılandır")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .action(async (opts: { cwd: string }) => {
    try {
      const projectRoot = getProjectRoot(opts.cwd);
      await runSetup(projectRoot);
      console.log(chalk.green("\n✓ Kurulum tamamlandı.\n"));
    } catch (err) {
      console.error(chalk.red("\n✗ Hata:"), err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

const promptCmd = program
  .command("prompt")
  .description("Çeviri prompt dosyasını yönet");

promptCmd
  .command("edit")
  .description("Prompt dosyasını editörde aç ($EDITOR veya nano)")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .action((opts: { cwd: string }) => {
    try {
      const projectRoot = getProjectRoot(opts.cwd);
      initPromptFile(projectRoot);
      console.log(chalk.dim(`Prompt dosyası: ${getPromptPath(projectRoot)}\n`));
      openPromptInEditor(projectRoot);
      console.log(chalk.green("\n✓ Prompt kaydedildi.\n"));
    } catch (err) {
      console.error(chalk.red("\n✗ Hata:"), err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

promptCmd
  .command("show")
  .description("Mevcut prompt dosyasını göster")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .action((opts: { cwd: string }) => {
    const projectRoot = getProjectRoot(opts.cwd);
    initPromptFile(projectRoot);
    console.log(readPrompt(projectRoot));
  });

promptCmd
  .command("reset")
  .description("Prompt dosyasını varsayılana sıfırla")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .action(async (opts: { cwd: string }) => {
    const projectRoot = getProjectRoot(opts.cwd);
    const ok = await confirm({
      message: "Prompt dosyası varsayılana sıfırlansın mı?",
      default: false,
    });
    if (ok) {
      resetPromptToDefault(projectRoot);
      console.log(chalk.green("\n✓ Prompt sıfırlandı.\n"));
    }
  });

promptCmd
  .command("path")
  .description("Prompt dosyasının yolunu göster")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .action((opts: { cwd: string }) => {
    const projectRoot = getProjectRoot(opts.cwd);
    initPromptFile(projectRoot);
    console.log(getPromptPath(projectRoot));
  });

program
  .command("status")
  .description("Mevcut yapılandırmayı göster")
  .option("-c, --cwd <path>", "Proje klasörü yolu", process.cwd())
  .action((opts: { cwd: string }) => {
    const projectRoot = getProjectRoot(opts.cwd);
    const config = loadConfig(projectRoot);

    console.log(chalk.bold.cyan("\n📋 Yapılandırma Durumu\n"));
    console.log(`  Proje:       ${projectRoot}`);
    console.log(`  API Key:     ${config.geminiApiKey ? chalk.green("✓ ayarlı") : chalk.red("✗ eksik")}`);
    console.log(`  Model:       ${config.geminiModel ?? chalk.red("eksik")}`);
    console.log(`  Kaynak dil:  ${config.sourceLang ?? chalk.red("eksik")}`);
    console.log(`  Hedef dil:   ${config.targetLang ?? chalk.red("eksik")}`);
    console.log(`  Prompt:      ${getPromptPath(projectRoot)}\n`);
  });

program.parse();
