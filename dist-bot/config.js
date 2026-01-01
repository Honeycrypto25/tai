"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.BotMode = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Load .env file
dotenv_1.default.config();
var BotMode;
(function (BotMode) {
    BotMode["LIVE"] = "live";
    BotMode["TESTNET"] = "testnet";
    BotMode["PAPER"] = "paper";
})(BotMode || (exports.BotMode = BotMode = {}));
function getEnv(key, required = true) {
    const value = process.env[key];
    if (!value && required) {
        throw new Error(`MISSING ENV VARIABLE: ${key}`);
    }
    return value || '';
}
function getBotMode() {
    const mode = process.env.BOT_MODE?.toLowerCase();
    if (mode === 'testnet')
        return BotMode.TESTNET;
    if (mode === 'paper')
        return BotMode.PAPER;
    return BotMode.LIVE; // Default to Live (but without keys if missing)
}
const mode = getBotMode();
// Select keys based on mode
const apiKey = mode === BotMode.TESTNET
    ? process.env.BINANCE_API_KEY_TESTNET
    : process.env.BINANCE_API_KEY_LIVE;
const apiSecret = mode === BotMode.TESTNET
    ? process.env.BINANCE_API_SECRET_TESTNET
    : process.env.BINANCE_API_SECRET_LIVE;
exports.config = {
    DATABASE_URL: getEnv('NEON_DATABASE_URL'),
    OPENAI_API_KEY: getEnv('OPENAI_API_KEY', false), // Optional if not using AI Service strictly
    MODE: mode,
    DRY_RUN: process.env.DRY_RUN === 'true', // Defaults to false if not set
    LOOP_MINUTES: parseInt(process.env.LOOP_MINUTES || '60', 10),
    BINANCE: {
        // Allows override, but sets clear defaults based on docs if not provided (though README says provide them)
        REST_BASE_URL: process.env.BINANCE_REST_BASE_URL || (mode === BotMode.TESTNET ? 'https://testnet.binance.vision' : 'https://api.binance.com'),
        WS_BASE_URL: process.env.BINANCE_WS_BASE_URL || (mode === BotMode.TESTNET ? 'wss://testnet.binance.vision' : 'wss://stream.binance.com:9443'),
        API_KEY: apiKey || '',
        API_SECRET: apiSecret || '',
    }
};
// Validate critical keys if not in PAPER mode (where we might just watch)
if (exports.config.MODE !== BotMode.PAPER) {
    if (!exports.config.BINANCE.API_KEY || !exports.config.BINANCE.API_SECRET) {
        console.warn(`WARNING: Running in ${exports.config.MODE} mode but API Keys are missing! Orders will fail.`);
    }
}
console.log(`[CONFIG] Loaded configurations for MODE: ${exports.config.MODE}`);
