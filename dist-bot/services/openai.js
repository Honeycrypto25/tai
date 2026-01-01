"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = exports.OpenAIService = void 0;
const config_1 = require("../config");
const openai_1 = __importDefault(require("openai"));
class OpenAIService {
    constructor() {
        this.client = null;
        if (config_1.config.OPENAI_API_KEY) {
            this.client = new openai_1.default({ apiKey: config_1.config.OPENAI_API_KEY });
        }
    }
    async generateDailyReport(contextHtml) {
        if (!this.client) {
            console.warn('[OPENAI] Skipped: No API Key');
            return { text: 'AI Reports disabled (No Key)', json: {} };
        }
        const systemPrompt = `
You are the TAI (Trading AI) Decision Engine. Analyze the daily trading data and output a rigorous decision report.
Output MUST be strict JSON matching this schema:
{
  "summary": "1-2 sentence exec summary",
  "analysis": "Detailed bullet points",
  "sentiment": "BULLISH|BEARISH|NEUTRAL",
  "score": 0-100,
  "anomalies": ["list of issues or 'None'"]
}
        `;
        try {
            const response = await this.client.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: contextHtml }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2
            });
            const content = response.choices[0].message.content || '{}';
            const json = JSON.parse(content);
            return {
                text: json.analysis || json.summary,
                json: json
            };
        }
        catch (e) {
            console.error('[OPENAI] Generation failed:', e.message);
            // Return fallback artifact
            return {
                text: 'Report generation failed due to API error.',
                json: { error: e.message, fallback: true }
            };
        }
    }
    async analyzeAnomaly(context) {
        // ...
    }
}
exports.OpenAIService = OpenAIService;
exports.openai = new OpenAIService();
