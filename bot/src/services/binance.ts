import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { config, BotMode } from '../config';
import { Decimal } from 'decimal.js';
import { roundToTick, floorToStep } from '../lib/math';

export interface SymbolFilters {
    minNotional: Decimal;
    stepSize: Decimal;
    tickSize: Decimal;
    minQty: Decimal;
}

export class BinanceService {
    private baseURL: string;
    private apiKey: string;
    private apiSecret: string;

    // Cache filters to avoid spamming exchangeInfo
    private symbolFilters: Map<string, SymbolFilters> = new Map();

    constructor() {
        this.baseURL = config.BINANCE.REST_BASE_URL;
        this.apiKey = config.BINANCE.API_KEY || '';
        this.apiSecret = config.BINANCE.API_SECRET || '';
    }

    private sign(queryString: string): string {
        return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
    }

    // --- Public API ---

    public async getExchangeInfo(symbol?: string): Promise<any> {
        try {
            const url = symbol
                ? `${this.baseURL}/api/v3/exchangeInfo?symbol=${symbol}`
                : `${this.baseURL}/api/v3/exchangeInfo`;

            const res = await axios.get(url);

            // Parse filters for caching
            const symbols = res.data.symbols;
            if (Array.isArray(symbols)) {
                for (const s of symbols) {
                    const filters: any = {};
                    s.filters.forEach((f: any) => {
                        if (f.filterType === 'NOTIONAL') {
                            filters.minNotional = new Decimal(f.minNotional || 0);
                        } else if (f.filterType === 'MIN_NOTIONAL') { // Legacy check
                            filters.minNotional = new Decimal(f.minNotional || 0);
                        } else if (f.filterType === 'LOT_SIZE') {
                            filters.stepSize = new Decimal(f.stepSize || 0);
                            filters.minQty = new Decimal(f.minQty || 0);
                        } else if (f.filterType === 'PRICE_FILTER') {
                            filters.tickSize = new Decimal(f.tickSize || 0);
                        }
                    });

                    if (filters.stepSize && filters.tickSize) {
                        this.symbolFilters.set(s.symbol, filters as SymbolFilters);
                    }
                }
            }
            return res.data;
        } catch (e) {
            console.error('[BINANCE] getExchangeInfo failed', e);
            throw e;
        }
    }

    public getCachedFilters(symbol: string): SymbolFilters | undefined {
        return this.symbolFilters.get(symbol);
    }

    // --- Private API (Authenticated) ---

    public async getTickerPrice(symbol: string): Promise<Decimal> {
        try {
            const res = await axios.get(`${this.baseURL}/api/v3/ticker/price?symbol=${symbol}`);
            return new Decimal(res.data.price);
        } catch (e) {
            // Fallback
            return new Decimal(0);
        }
    }

    public async getAccountInfo() {
        return this.signedRequest('GET', '/api/v3/account');
    }

    public async getOpenOrders(symbol: string) {
        return this.signedRequest('GET', '/api/v3/openOrders', { symbol });
    }

    public async getOrder(symbol: string, orderId?: string, clientOrderId?: string) {
        const params: any = { symbol };
        if (orderId) params.orderId = orderId;
        if (clientOrderId) params.origClientOrderId = clientOrderId;
        return this.signedRequest('GET', '/api/v3/order', params);
    }

    public async cancelOrder(symbol: string, orderId?: string, clientOrderId?: string) {
        const params: any = { symbol };
        if (orderId) params.orderId = orderId;
        if (clientOrderId) params.origClientOrderId = clientOrderId;
        return this.signedRequest('DELETE', '/api/v3/order', params);
    }

    public async placeLimitBuy(symbol: string, quantity: Decimal, price: Decimal, clientOrderId: string) {
        return this.placeOrder(symbol, 'BUY', 'LIMIT', quantity, price, clientOrderId);
    }

    public async placeMarketSell(symbol: string, quantity: Decimal, clientOrderId: string) {
        return this.placeOrder(symbol, 'SELL', 'MARKET', quantity, undefined, clientOrderId);
    }

    private async placeOrder(
        symbol: string,
        side: 'BUY' | 'SELL',
        type: 'LIMIT' | 'MARKET',
        quantity: Decimal,
        price?: Decimal,
        clientOrderId?: string
    ) {
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
            const qty = floorToStep(quantity, finalFilters.stepSize);
            qtyStr = qty.toString();

            if (qty.lt(finalFilters.minQty)) {
                throw new Error(`Quantity ${qtyStr} below minQty ${finalFilters.minQty}`);
            }

            if (price && side === 'BUY') {
                const p = roundToTick(price, finalFilters.tickSize);
                priceStr = p.toString();

                const notional = qty.mul(p);
                if (finalFilters.minNotional && notional.lt(finalFilters.minNotional)) {
                    throw new Error(`Notional ${notional} below minNotional ${finalFilters.minNotional}`);
                }
            }
        }

        const params: any = {
            symbol,
            side,
            type,
            quantity: qtyStr,
            newClientOrderId: clientOrderId
        };

        if (type === 'LIMIT') {
            if (!priceStr) throw new Error('Price required for LIMIT order');
            params.price = priceStr;
            params.timeInForce = 'GTC';
        }

        return this.signedRequest('POST', '/api/v3/order', params);
    }

    private async signedRequest(method: 'GET' | 'POST' | 'DELETE', endpoint: string, params: any = {}) {
        if (config.MODE === BotMode.PAPER && method !== 'GET') {
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
            const res = await axios({
                method,
                url: fullUrl,
                headers: { 'X-MBX-APIKEY': this.apiKey }
            });
            return res.data;
        } catch (err) {
            if (axios.isAxiosError(err)) {
                console.error(`[BINANCE API ERROR] ${err.response?.status} - ${JSON.stringify(err.response?.data)}`);
                throw new Error(JSON.stringify(err.response?.data));
            }
            throw err;
        }
    }
}

export const binance = new BinanceService();
