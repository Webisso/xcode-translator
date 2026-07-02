import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
}

export interface ApiKeyVerification {
  ok: boolean;
  error?: string;
  status?: number;
}

export async function verifyApiKey(apiKey: string): Promise<ApiKeyVerification> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );

    if (response.ok) {
      return { ok: true };
    }

    let message = response.statusText;
    try {
      const body = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // ignore JSON parse errors
    }

    return { ok: false, error: message, status: response.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listTextModels(apiKey: string): Promise<GeminiModel[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
  );

  if (!response.ok) {
    throw new Error(`Model listesi alınamadı: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    models?: Array<{
      name: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (data.models ?? [])
    .filter(
      (m) =>
        m.supportedGenerationMethods?.includes("generateContent") &&
        m.name.includes("gemini") &&
        !m.name.includes("embedding") &&
        !m.name.includes("aqa") &&
        !m.name.includes("imagen") &&
        !m.name.includes("veo")
    )
    .map((m) => ({
      name: m.name.replace("models/", ""),
      displayName: m.displayName ?? m.name,
      description: m.description ?? "",
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function translateBatch(
  apiKey: string,
  model: string,
  prompt: string,
  retries = 3
): Promise<string[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await geminiModel.generateContent(prompt);
      const text = result.response.text().trim();

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error(`Geçersiz yanıt formatı: ${text.slice(0, 200)}`);
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Yanıt bir JSON dizisi değil");
      }

      return parsed.map(String);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError ?? new Error("Çeviri başarısız");
}
