// Xcode .lproj klasör adları: en, tr, pt-BR, zh-Hans, zh-Hant, es-419, ...
const LANG_REGEX = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isValidLangCode(lang: string): boolean {
  return LANG_REGEX.test(lang);
}

export function parseLangList(input: string): string[] {
  const langs = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const invalid = langs.filter((l) => !isValidLangCode(l));
  if (invalid.length > 0) {
    throw new Error(
      `Geçersiz dil kodu: ${invalid.join(", ")} (örn: en, tr, pt-BR, zh-Hans, zh-Hant)`
    );
  }

  return [...new Set(langs)];
}
