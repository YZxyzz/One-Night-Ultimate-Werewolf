class GeminiService {
  private apiKey: string | undefined;
  // Using v1beta endpoint standard for Gemini
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  constructor() {
    // The API key is injected via vite.config.ts define
    this.apiKey = process.env.API_KEY;
    if (!this.apiKey) {
      console.warn("Gemini API Key not found. AI features will be disabled.");
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generates audio narration using Gemini TTS model via REST API.
   */
  async generateNarration(text: string): Promise<ArrayBuffer | null> {
    if (!this.apiKey) return null;
    
    // Using the specific model mentioned in requirements
    const model = "gemini-2.5-flash-preview-tts"; 
    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' }
              }
            }
          }
        })
      });

      if (!response.ok) {
        console.error(`Gemini API Error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

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
   * Answers a specific rule question using Gemini Text model via REST API.
   */
  async askRuleQuestion(question: string, activeRoles: string[]): Promise<string> {
    if (!this.apiKey) return "AI 连接不可用，请参考规则书。";
    
    // Using the text model mentioned in requirements
    const model = "gemini-3-flash-preview";
    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;

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

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        console.error(`Gemini API Error: ${response.status} ${response.statusText}`);
        return "迷雾遮蔽了真相（API请求失败）。";
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "古老的卷轴对此保持沉默...";
    } catch (error) {
      console.error("Gemini Rule Error:", error);
      return "迷雾遮蔽了真相（网络错误）。";
    }
  }
}

export const geminiService = new GeminiService();