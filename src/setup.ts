import chalk from "chalk";
import { input, select, confirm } from "@inquirer/prompts";
import { listTextModels, verifyApiKey } from "./gemini.js";
import { loadConfig, saveConfig, type AppConfig } from "./config.js";
import { ensureSensitivePathsIgnored } from "./gitignore.js";
import { isValidLangCode, parseLangList } from "./lang.js";

export async function runSetup(projectRoot: string): Promise<AppConfig> {
  let config = loadConfig(projectRoot);
  config.projectRoot = projectRoot;

  console.log(chalk.bold.cyan("\n🌍 Xcode Translator — Kurulum\n"));
  console.log(chalk.dim(`Proje klasörü: ${projectRoot}\n`));

  if (!config.geminiApiKey) {
    config.geminiApiKey = await promptApiKey();
    saveConfig(projectRoot, config);
  } else {
    const verification = await verifyApiKey(config.geminiApiKey);
    if (!verification.ok) {
      console.log(chalk.yellow("⚠ Kayıtlı API anahtarı çalışmıyor."));
      if (verification.error) {
        console.log(chalk.dim(`  Google: ${verification.error}\n`));
      }
      config.geminiApiKey = await promptApiKey();
      saveConfig(projectRoot, config);
    } else {
      console.log(chalk.green("✓ API anahtarı doğrulandı\n"));
    }
  }

  if (!config.geminiModel) {
    config.geminiModel = await promptModelSelection(config.geminiApiKey);
    saveConfig(projectRoot, config);
  } else {
    const changeModel = await confirm({
      message: `Mevcut model: ${chalk.cyan(config.geminiModel)}. Değiştirmek ister misiniz?`,
      default: false,
    });
    if (changeModel) {
      config.geminiModel = await promptModelSelection(config.geminiApiKey);
      saveConfig(projectRoot, config);
    }
  }

  if (!config.sourceLang) {
    config.sourceLang = await promptLang("Kaynak dil kodu", "en");
    saveConfig(projectRoot, config);
  }

  if (!config.targetLang) {
    config.targetLang = await promptLang("Hedef dil kodu", "tr");
    saveConfig(projectRoot, config);
  } else {
    const changeLangs = await confirm({
      message: `Diller: ${chalk.cyan(config.sourceLang)} → ${chalk.cyan(config.targetLang)}. Değiştirmek ister misiniz?`,
      default: false,
    });
    if (changeLangs) {
      config.sourceLang = await promptLang("Kaynak dil kodu", config.sourceLang);
      config.targetLang = await promptLang("Hedef dil kodu", config.targetLang);
      saveConfig(projectRoot, config);
    }
  }

  saveConfig(projectRoot, { ...config, projectRoot });

  const gitignore = ensureSensitivePathsIgnored(projectRoot);
  for (const path of gitignore.created) {
    console.log(chalk.green(`✓ .gitignore oluşturuldu: ${path}`));
  }
  for (const path of gitignore.updated) {
    console.log(chalk.green(`✓ .gitignore güncellendi: ${path}`));
  }

  return config as AppConfig;
}

async function promptApiKey(): Promise<string> {
  while (true) {
    const apiKey = await input({
      message: "Gemini API anahtarınızı girin:",
      validate: (v) => (v.trim().length > 0 ? true : "API anahtarı boş olamaz"),
    });

    process.stdout.write(chalk.dim("API anahtarı doğrulanıyor... "));
    const verification = await verifyApiKey(apiKey.trim());
    if (verification.ok) {
      console.log(chalk.green("✓"));
      return apiKey.trim();
    }
    console.log(chalk.red("✗ API anahtarı reddedildi."));
    if (verification.error) {
      console.log(chalk.dim(`  Google (${verification.status ?? "?"}): ${verification.error}`));
    }
    console.log(chalk.dim("  AI Studio: https://aistudio.google.com/apikey\n"));
  }
}

async function promptModelSelection(apiKey: string): Promise<string> {
  process.stdout.write(chalk.dim("Gemini modelleri yükleniyor... "));
  const models = await listTextModels(apiKey);
  console.log(chalk.green(`✓ (${models.length} model)\n`));

  if (models.length === 0) {
    throw new Error("Kullanılabilir Gemini text modeli bulunamadı.");
  }

  const defaultModel =
    models.find((m) => m.name.includes("flash"))?.name ??
    models.find((m) => m.name.includes("pro"))?.name ??
    models[0].name;

  return select({
    message: "Çeviri için Gemini modelini seçin:",
    choices: models.map((m) => ({
      name: `${m.displayName} (${m.name})`,
      value: m.name,
      description: m.description.slice(0, 80),
    })),
    default: defaultModel,
  });
}

async function promptLang(label: string, defaultValue: string): Promise<string> {
  return input({
    message: `${label} (örn: en, tr, de):`,
    default: defaultValue,
    validate: (v) =>
      isValidLangCode(v.trim())
        ? true
        : "Geçerli bir dil kodu girin (örn: en, tr, pt-BR, zh-Hans)",
  }).then((v) => v.trim());
}

export async function promptLangList(defaultValue = "tr,de,es"): Promise<string[]> {
  return input({
    message: "Hedef diller (virgülle ayırın, örn: tr,de,es):",
    default: defaultValue,
    validate: (v) => {
      try {
        const langs = parseLangList(v);
        return langs.length > 0 ? true : "En az bir hedef dil girin";
      } catch (err) {
        return err instanceof Error ? err.message : "Geçersiz dil listesi";
      }
    },
  }).then((v) => parseLangList(v));
}

export async function ensureApiConfig(
  projectRoot: string
): Promise<
  Pick<AppConfig, "geminiApiKey" | "geminiModel" | "projectRoot"> & {
    sourceLang?: string;
  }
> {
  let config = loadConfig(projectRoot);
  config.projectRoot = projectRoot;

  const needsSetup = !config.geminiApiKey || !config.geminiModel;

  if (needsSetup) {
    console.log(chalk.bold.cyan("\n🌍 Xcode Translator — Kurulum\n"));
    console.log(chalk.dim(`Proje klasörü: ${projectRoot}\n`));

    if (!config.geminiApiKey) {
      config.geminiApiKey = await promptApiKey();
      saveConfig(projectRoot, config);
    } else {
      const verification = await verifyApiKey(config.geminiApiKey);
      if (!verification.ok) {
        console.log(chalk.yellow("⚠ Kayıtlı API anahtarı çalışmıyor."));
        if (verification.error) {
          console.log(chalk.dim(`  Google: ${verification.error}\n`));
        }
        config.geminiApiKey = await promptApiKey();
        saveConfig(projectRoot, config);
      }
    }

    if (!config.geminiModel) {
      config.geminiModel = await promptModelSelection(config.geminiApiKey);
      saveConfig(projectRoot, config);
    }
  }

  return {
    geminiApiKey: config.geminiApiKey!,
    geminiModel: config.geminiModel!,
    projectRoot,
    sourceLang: config.sourceLang,
  };
}

export async function ensureConfig(projectRoot: string): Promise<AppConfig> {
  const config = loadConfig(projectRoot);
  const needsSetup =
    !config.geminiApiKey ||
    !config.geminiModel ||
    !config.sourceLang ||
    !config.targetLang;

  if (needsSetup) {
    return runSetup(projectRoot);
  }

  return {
    geminiApiKey: config.geminiApiKey!,
    geminiModel: config.geminiModel!,
    sourceLang: config.sourceLang!,
    targetLang: config.targetLang!,
    projectRoot: config.projectRoot ?? projectRoot,
  };
}
