import { GoogleGenAI, Modality } from "@google/genai";

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = this.getApiKey();

    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      console.warn("Gemini API Key not found. AI features will be disabled.");
    }
  }

  // Robust way to get environment variable in different build systems (Vite, Webpack, Next.js)
  private getApiKey(): string | undefined {
    // 1. Check Vite standard (import.meta.env)
    // Note: TypeScript might complain about import.meta if tsconfig isn't set for ESNext, 
    // so we use a safe check.
    try {
      // Cast to any to avoid TypeScript errors if ImportMeta is not fully defined in the environment
      const meta = import.meta as any;
      if (meta && meta.env) {
        if (meta.env.VITE_API_KEY) return meta.env.VITE_API_KEY;
        if (meta.env.API_KEY) return meta.env.API_KEY;
      }
    } catch (e) {
      // Ignore errors if import.meta is not supported
    }

    // 2. Check Node/Webpack standard (process.env)
    try {
      if (typeof process !== 'undefined' && process.env) {
        if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
        if (process.env.NEXT_PUBLIC_API_KEY) return process.env.NEXT_PUBLIC_API_KEY;
        if (process.env.API_KEY) return process.env.API_KEY;
      }
    } catch (e) {
      // Ignore errors if process is not defined
    }

    return undefined;
  }

  isAvailable(): boolean {
    return !!this.ai;
  }

  /**
   * Generates audio narration for the "God" role.
   */
  async generateNarration(text: string): Promise<ArrayBuffer | null> {
    if (!this.ai) return null;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              // 'Kore' is typically a clear, natural female voice suitable for narration.
              prebuiltVoiceConfig: { voiceName: 'Kore' }, 
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        // Decode base64 to ArrayBuffer
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }
      return null;
    } catch (error) {
      console.error("Gemini TTS Error:", error);
      return null;
    }
  }

  /**
   * Answers a specific rule question based on the current game state context.
   */
  async askRuleQuestion(question: string, activeRoles: string[]): Promise<string> {
    if (!this.ai) return "AI 连接不可用，请参考规则书。";

    try {
      const prompt = `
        你是一本关于“一夜狼人杀”的《古老智慧之书》。
        当前游戏角色：${activeRoles.join(', ')}。
        用户问题：${question}
        
        要求：
        1. 必须像一句神秘的箴言或格言一样简短（不超过 3 句话）。
        2. 不要长篇大论，直接切中要害。
        3. 风格神秘、古老、精炼。
        4. 如果规则涉及逻辑，用最精简的语言解释。
      `;

      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      return response.text || "古老的卷轴对此保持沉默...";
    } catch (error) {
      console.error("Gemini Rule Error:", error);
      return "迷雾遮蔽了真相（网络错误）。";
    }
  }
}

export const geminiService = new GeminiService();