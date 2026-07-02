# Xcode Translator

A CLI tool that translates Xcode `Localizable.strings` files using Google Gemini AI. Run it from your iOS/macOS project directory, point it at a source language, and it writes properly formatted target `.lproj` files — preserving keys, comments, format specifiers, and structure.

## Features

- **Interactive setup** — verifies your Gemini API key, lists available text models, and saves project settings locally
- **Single-language translation** — e.g. `en.lproj` → `tr.lproj`
- **Bulk translation** — translate one source language into many targets in one run (`tr,de,es,zh-Hans,...`)
- **Incremental updates** — skips strings that are already translated; only new or changed source strings are sent to the API
- **Custom prompt** — edit the translation prompt to match your app's tone and terminology
- **Smart file discovery** — finds `Localizable.strings` recursively under your project root
- **Safe by default** — automatically adds `.env` and `.xcode-translator/` to your `.gitignore` so API keys are not committed

## Requirements

- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey) with billing enabled

## Installation

Clone and build the CLI:

```bash
git clone <repo-url> xcode-translator
cd xcode-translator
npm install
npm run build
```

Link it locally so you can run it with `npx`:

```bash
npm link
```

Or run it directly from the repo path:

```bash
npx /path/to/xcode-translator
```

## Quick Start

1. Go to your **Xcode project directory** (where your `.lproj` folders live):

```bash
cd /path/to/your/ios-app
```

2. Run setup (first time only):

```bash
npx xcode-translator setup
```

You'll be asked for:

- Gemini API key (validated live against Google's API)
- Gemini model (e.g. `gemini-2.0-flash`)
- Source language (e.g. `en`)
- Target language (e.g. `tr`)

3. Translate:

```bash
npx xcode-translator
```

That's it. The tool finds `en.lproj/Localizable.strings`, translates it, and writes `tr.lproj/Localizable.strings`.

## Commands

| Command | Description |
|---------|-------------|
| `npx xcode-translator` | Translate using saved source → target languages |
| `npx xcode-translator setup` | Configure API key, model, and languages |
| `npx xcode-translator bulk` | Translate to multiple target languages |
| `npx xcode-translator status` | Show current configuration |
| `npx xcode-translator prompt edit` | Open the translation prompt in your editor |
| `npx xcode-translator prompt show` | Print the current prompt |
| `npx xcode-translator prompt reset` | Reset prompt to default |
| `npx xcode-translator prompt path` | Print prompt file path |

### Options

**Translate**

```bash
npx xcode-translator --force          # Re-translate all strings
npx xcode-translator -c /path/to/app  # Use a specific project directory
```

**Bulk translate**

```bash
npx xcode-translator bulk --from en --to tr,de,es,ja,zh-Hans,zh-Hant
npx xcode-translator bulk --force     # Re-translate all strings for every language
```

## Project Files

When you run setup, the following files are created **in your Xcode project directory** (not inside the CLI repo):

| Path | Purpose |
|------|---------|
| `.env` | API key, model, source/target languages |
| `.xcode-translator/translation-prompt.txt` | Editable translation prompt |
| `.xcode-translator/translation-state.json` | Tracks which source strings were already translated |

Example `.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
SOURCE_LANG=en
TARGET_LANG=tr
PROJECT_ROOT=/path/to/your/ios-app
```

## Security & `.gitignore`

Setup automatically protects sensitive files from being committed to git:

- If a `.gitignore` exists in your project directory **or any parent directory up to the git repo root**, the tool appends:

  ```
  # xcode-translator (auto-added — keeps API keys local)
  .env
  .xcode-translator/
  ```

- If you're inside a git repository but no `.gitignore` exists on that path, one is **created** in your project directory.

**Never commit your `.env` file.** If you accidentally exposed an API key, revoke it in [Google AI Studio](https://aistudio.google.com/apikey) and create a new one.

## Incremental Translation

On subsequent runs, the tool:

1. Reads the existing target `Localizable.strings`
2. Skips keys that are already translated and unchanged
3. Translates only **new keys** or keys whose **source text changed**
4. Reports how many strings were translated vs skipped

Use `--force` to re-translate everything from scratch.

## Supported Language Codes

Any Xcode `.lproj` folder name is supported, including:

- `en`, `tr`, `de`, `ja`, `ko`
- `pt-BR`, `zh-Hans`, `zh-Hant`, `es-419`

Bulk example:

```bash
npx xcode-translator bulk --from en --to tr,de,es,ja,fr,ko,pt-BR,zh-Hans,zh-Hant
```

## Custom Translation Prompt

The default prompt instructs Gemini to:

- Preserve `%@`, `%d`, `%1$@`, and other format specifiers
- Keep escape sequences (`\n`, `\"`, etc.)
- Use concise, UI-appropriate phrasing
- Return a JSON array of translated strings

Edit it anytime:

```bash
npx xcode-translator prompt edit
```

Placeholders in the prompt:

| Placeholder | Replaced with |
|-------------|---------------|
| `{{SOURCE_LANG}}` | Source language code |
| `{{TARGET_LANG}}` | Target language code |
| `{{STRINGS_JSON}}` | JSON array of strings to translate |

## Troubleshooting

**API key rejected (403)**

If Google returns an error like `Lightning dunning decision is deny`, your API key format may be valid but the linked Google Cloud project has a **billing or payment issue**. Fix billing at [Google Cloud Console](https://console.cloud.google.com/billing) and try again.

**No strings to translate**

All keys are already translated and unchanged. Add new keys to your source `Localizable.strings` or run with `--force`.

**Source file not found**

Make sure you run the CLI from your Xcode project root (or pass `-c`). The tool searches recursively for `{lang}.lproj/Localizable.strings`.

## License

MIT
