"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const prisma_1 = require("./lib/prisma");
const config_1 = require("./config");
async function runTest() {
    console.log('>>> IDEMPOTENCY TEST: RUNNY RUN <<<');
    // Ensure Testnet/DryRun
    // NOTE: Env vars MUST be set before running this script
    if (config_1.config.MODE === config_1.BotMode.LIVE && !config_1.config.DRY_RUN) {
        throw new Error('SAFETY: Cannot run idempotency test in LIVE mode without DRY_RUN');
    }
    // 1. Run First Cycle
    console.log('[TEST] Cycle 1...');
    await (0, index_1.runCycle)();
    // Check Order Count
    const count1 = await prisma_1.prisma.order.count({ where: { created_at: { gt: new Date(Date.now() - 60000) } } });
    console.log(`[TEST] Orders after Cycle 1: ${count1}`);
    // 2. Run Second Cycle immediately
    console.log('[TEST] Cycle 2...');
    await (0, index_1.runCycle)();
    const count2 = await prisma_1.prisma.order.count({ where: { created_at: { gt: new Date(Date.now() - 60000) } } });
    console.log(`[TEST] Orders after Cycle 2: ${count2}`);
    if (count2 > count1) {
        console.error('[FAIL] Orders increased in Cycle 2! Idempotency check failed.');
        process.exit(1);
    }
    else {
        console.log('[PASS] Order count stable. Idempotency verified.');
    }
    process.exit(0);
}
runTest();
