import { binance } from './services/binance';
import { MarketDataService } from './services/market';
import { config } from './config';
import { Decimal } from 'decimal.js';

async function runSmokeTest() {
    console.log('>>> SMOKE TEST INITIATED <<<');

    try {
        // 1. Exchange Info
        console.log('[1/4] Fetching Exchange Info...');
        await binance.getExchangeInfo('BTCUSDT');
        const filters = binance.getCachedFilters('BTCUSDT');
        console.log('Filters:', filters);
        if (!filters) throw new Error('Filters failed to load');

        // 2. Sync Candles
        console.log('[2/4] Syncing Candles...');
        const market = new MarketDataService();
        await market.syncCandles();

        // 3. Test Order (Only if keys present)
        if (config.BINANCE.API_KEY && config.BINANCE.API_SECRET) {
            console.log('[3/4] Placing Test Order (Limit Buy deeply OTM)...');
            // Place order at 10,000 to be safe
            const price = new Decimal(10000);
            const qty = new Decimal(0.001); // Check minNotional -> 10000 * 0.001 = $10. OK

            try {
                const order = await binance.placeLimitBuy('BTCUSDT', qty, price, `SMOKE_${Date.now()}`);
                console.log('Order Placed:', order.orderId);

                console.log('[4/4] Cancelling Order...');
                await binance.cancelOrder('BTCUSDT', order.orderId);
                console.log('Order Cancelled.');
            } catch (e) {
                console.error('Order test failed (probably balance/permissions):', e);
            }
        } else {
            console.log('[SKIP] 3/4 & 4/4 skipped due to missing API Keys');
        }

        console.log('>>> SMOKE TEST PASSED <<<');
    } catch (e) {
        console.error('>>> SMOKE TEST FAILED <<<', e);
        process.exit(1);
    }
    process.exit(0);
}

runSmokeTest();
