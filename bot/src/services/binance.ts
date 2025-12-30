import axios from 'axios';
import { config } from '../config';
import crypto from 'crypto';

// Types from Binance API
export interface ExchangeInfo {
    symbols: any[];
    // ... maps to full Binance response
}

export class BinanceService {
    private baseURL: string;
    private apiKey: string;
    private apiSecret: string;

    constructor() {
        this.baseURL = config.BINANCE.REST_BASE_URL;
        this.apiKey = config.BINANCE.API_KEY;
        this.apiSecret = config.BINANCE.API_SECRET;
    }

    private sign(queryString: string): string {
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    public async getExchangeInfo(): Promise<ExchangeInfo> {
        const res = await axios.get(`${this.baseURL}/api/v3/exchangeInfo`);
        return res.data;
    }

    public async getAccountInfo() {
        const timestamp = Date.now();
        const query = `timestamp=${timestamp}`;
        const signature = this.sign(query);

        const res = await axios.get(`${this.baseURL}/api/v3/account?${query}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': this.apiKey }
        });
        return res.data;
    }

    public async placeOrder(symbol: string, side: 'BUY' | 'SELL', type: 'LIMIT' | 'MARKET', quantity: string, price?: string, clientOrderId?: string) {
        // Idempotency check via clientOrderId happens here
        // ...
        // implementation
        return {}; // mocked return
    }

    // Rate Limiter logic would go here
}

export const binance = new BinanceService();
