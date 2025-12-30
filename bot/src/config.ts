import dotenv from 'dotenv';
import { Decimal } from 'decimal.js';

// Load .env file
dotenv.config();

export enum BotMode {
    LIVE = 'live',
    TESTNET = 'testnet',
    PAPER = 'paper',
}

interface BotConfig {
    // Infrastructure
    DATABASE_URL: string;
    R2_CONFIG: {
        ACCOUNT_ID: string;
        ACCESS_KEY_ID: string;
        SECRET_ACCESS_KEY: string;
        BUCKET: string;
    };
    OPENAI_API_KEY: string;

    // Trading Mode
    MODE: BotMode;
    DRY_RUN: boolean;

    // Binance
    BINANCE: {
        REST_BASE_URL: string;
        WS_BASE_URL: string;
        API_KEY: string;
        API_SECRET: string;
    };
}

function getEnv(key: string, required: boolean = true): string {
    const value = process.env[key];
    if (!value && required) {
        throw new Error(`MISSING ENV VARIABLE: ${key}`);
    }
    return value || '';
}

function getBotMode(): BotMode {
    const mode = process.env.BOT_MODE?.toLowerCase();
    if (mode === 'testnet') return BotMode.TESTNET;
    if (mode === 'paper') return BotMode.PAPER;
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

export const config: BotConfig = {
    DATABASE_URL: getEnv('NEON_DATABASE_URL'),

    R2_CONFIG: {
        ACCOUNT_ID: getEnv('R2_ACCOUNT_ID'),
        ACCESS_KEY_ID: getEnv('R2_ACCESS_KEY_ID'),
        SECRET_ACCESS_KEY: getEnv('R2_SECRET_ACCESS_KEY'),
        BUCKET: getEnv('R2_BUCKET'),
    },

    OPENAI_API_KEY: getEnv('OPENAI_API_KEY'),

    MODE: mode,
    DRY_RUN: process.env.DRY_RUN === 'true', // Defaults to false if not set

    BINANCE: {
        // Allows override, but sets clear defaults based on docs if not provided (though README says provide them)
        REST_BASE_URL: process.env.BINANCE_REST_BASE_URL || (mode === BotMode.TESTNET ? 'https://testnet.binance.vision' : 'https://api.binance.com'),
        WS_BASE_URL: process.env.BINANCE_WS_BASE_URL || (mode === BotMode.TESTNET ? 'wss://testnet.binance.vision' : 'wss://stream.binance.com:9443'),
        API_KEY: apiKey || '',
        API_SECRET: apiSecret || '',
    }
};

// Validate critical keys if not in PAPER mode (where we might just watch)
if (config.MODE !== BotMode.PAPER) {
    if (!config.BINANCE.API_KEY || !config.BINANCE.API_SECRET) {
        console.warn(`WARNING: Running in ${config.MODE} mode but API Keys are missing! Orders will fail.`);
    }
}

console.log(`[CONFIG] Loaded configurations for MODE: ${config.MODE}`);
