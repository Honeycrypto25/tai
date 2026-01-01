"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.binance = exports.BinanceService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const decimal_js_1 = require("decimal.js");
const math_1 = require("../lib/math");
class BinanceService {
    constructor() {
        // Cache filters to avoid spamming exchangeInfo
        this.symbolFilters = new Map();
        this.baseURL = config_1.config.BINANCE.REST_BASE_URL;
        this.apiKey = config_1.config.BINANCE.API_KEY || '';
        this.apiSecret = config_1.config.BINANCE.API_SECRET || '';
    }
    sign(queryString) {
        return crypto_1.default.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
    }
    // --- Public API ---
    async getExchangeInfo(symbol) {
        try {
            const url = symbol
                ? `${this.baseURL}/api/v3/exchangeInfo?symbol=${symbol}`
                : `${this.baseURL}/api/v3/exchangeInfo`;
            const res = await axios_1.default.get(url);
            // Parse filters for caching
            const symbols = res.data.symbols;
            if (Array.isArray(symbols)) {
                for (const s of symbols) {
                    const filters = {};
                    s.filters.forEach((f) => {
                        if (f.filterType === 'NOTIONAL') {
                            filters.minNotional = new decimal_js_1.Decimal(f.minNotional || 0);
                        }
                        else if (f.filterType === 'MIN_NOTIONAL') { // Legacy check
                            filters.minNotional = new decimal_js_1.Decimal(f.minNotional || 0);
                        }
                        else if (f.filterType === 'LOT_SIZE') {
                            filters.stepSize = new decimal_js_1.Decimal(f.stepSize || 0);
                            filters.minQty = new decimal_js_1.Decimal(f.minQty || 0);
                        }
                        else if (f.filterType === 'PRICE_FILTER') {
                            filters.tickSize = new decimal_js_1.Decimal(f.tickSize || 0);
                        }
                    });
                    if (filters.stepSize && filters.tickSize) {
                        this.symbolFilters.set(s.symbol, filters);
                    }
                }
            }
            return res.data;
        }
        catch (e) {
            console.error('[BINANCE] getExchangeInfo failed', e);
            throw e;
        }
    }
    getCachedFilters(symbol) {
        return this.symbolFilters.get(symbol);
    }
    // --- Private API (Authenticated) ---
    async getTickerPrice(symbol) {
        try {
            const res = await axios_1.default.get(`${this.baseURL}/api/v3/ticker/price?symbol=${symbol}`);
            return new decimal_js_1.Decimal(res.data.price);
        }
        catch (e) {
            // Fallback
            return new decimal_js_1.Decimal(0);
        }
    }
    async getAccountInfo() {
        return this.signedRequest('GET', '/api/v3/account');
    }
    async getOpenOrders(symbol) {
        return this.signedRequest('GET', '/api/v3/openOrders', { symbol });
    }
    async getOrder(symbol, orderId, clientOrderId) {
        const params = { symbol };
        if (orderId)
            params.orderId = orderId;
        if (clientOrderId)
            params.origClientOrderId = clientOrderId;
        return this.signedRequest('GET', '/api/v3/order', params);
    }
    async cancelOrder(symbol, orderId, clientOrderId) {
        const params = { symbol };
        if (orderId)
            params.orderId = orderId;
        if (clientOrderId)
            params.origClientOrderId = clientOrderId;
        return this.signedRequest('DELETE', '/api/v3/order', params);
    }
    async placeLimitBuy(symbol, quantity, price, clientOrderId) {
        return this.placeOrder(symbol, 'BUY', 'LIMIT', quantity, price, clientOrderId);
    }
    async placeMarketSell(symbol, quantity, clientOrderId) {
        return this.placeOrder(symbol, 'SELL', 'MARKET', quantity, undefined, clientOrderId);
    }
    async placeOrder(symbol, side, type, quantity, price, clientOrderId) {
        // 1. Validate Filters
        const filters = this.symbolFilters.get(symbol);
        if (!filters) {
            // Try fetching if missing
            await this.getExchangeInfo(symbol);
        }
        const finalFilters = this.symbolFilters.get(symbol);
        // Auto-rounding
        let qtyStr = quantity.toString();
        let priceStr = price?.toString();
        if (finalFilters) {
            const qty = (0, math_1.floorToStep)(quantity, finalFilters.stepSize);
            qtyStr = qty.toString();
            if (qty.lt(finalFilters.minQty)) {
                throw new Error(`Quantity ${qtyStr} below minQty ${finalFilters.minQty}`);
            }
            if (price && side === 'BUY') {
                const p = (0, math_1.roundToTick)(price, finalFilters.tickSize);
                priceStr = p.toString();
                const notional = qty.mul(p);
                if (finalFilters.minNotional && notional.lt(finalFilters.minNotional)) {
                    throw new Error(`Notional ${notional} below minNotional ${finalFilters.minNotional}`);
                }
            }
        }
        const params = {
            symbol,
            side,
            type,
            quantity: qtyStr,
            newClientOrderId: clientOrderId
        };
        if (type === 'LIMIT') {
            if (!priceStr)
                throw new Error('Price required for LIMIT order');
            params.price = priceStr;
            params.timeInForce = 'GTC';
        }
        // Ensure we get detailed response for quote quantity
        params.newOrderRespType = 'RESULT';
        return this.signedRequest('POST', '/api/v3/order', params);
    }
    async signedRequest(method, endpoint, params = {}) {
        if (config_1.config.MODE === config_1.BotMode.PAPER && method !== 'GET') {
            console.log(`[PAPER] Mock Executed: ${method} ${endpoint}`, params);
            return { status: 'FILLED', orderId: 'mock_' + Date.now(), ...params };
        }
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('Missing API Keys for signed request');
        }
        const timestamp = Date.now();
        // Merge timestamp into params
        const queryParams = new URLSearchParams(params);
        queryParams.append('timestamp', timestamp.toString());
        const queryString = queryParams.toString();
        const signature = this.sign(queryString);
        const fullUrl = `${this.baseURL}${endpoint}?${queryString}&signature=${signature}`;
        try {
            const res = await (0, axios_1.default)({
                method,
                url: fullUrl,
                headers: { 'X-MBX-APIKEY': this.apiKey }
            });
            return res.data;
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err)) {
                console.error(`[BINANCE API ERROR] ${err.response?.status} - ${JSON.stringify(err.response?.data)}`);
                throw new Error(JSON.stringify(err.response?.data));
            }
            throw err;
        }
    }
}
exports.BinanceService = BinanceService;
exports.binance = new BinanceService();
