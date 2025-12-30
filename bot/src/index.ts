import { PrismaClient } from '@prisma/client';
import { config } from './config';

const prisma = new PrismaClient();

async function main() {
    console.log('-------------------------------------------');
    console.log(` TAI BOT SYSTEM STARTING - MODE: ${config.MODE}`);
    console.log('-------------------------------------------');

    try {
        // 1. Check DB Connection
        console.log('[INIT] Connecting to Database...');
        // We can run a simple query to verify connection
        // Note: This might fail if the DB URL is dummy or network is down
        // Since we don't have migrations run yet, we just check connectivity if possible or assume lazy connect
        // await prisma.$connect(); 
        console.log('[INIT] Database Client Initialized (Lazy).');

        // 2. Load Settings from DB (if available)
        // const settings = await prisma.globalSettings.findFirst();
        // console.log('[INIT] Current Settings:', settings || "Defaults will be used (DB empty)");

        // 3. Start Loop
        console.log('[CORE] Starting Main Loop...');

        // Placeholder for loop
        setInterval(() => {
            // console.log(`[HEARTBEAT] ${new Date().toISOString()} - Bot is alive in ${config.MODE} mode.`);
        }, 60000);

        console.log('[CORE] Bot is running. Press Ctrl+C to stop.');

    } catch (error) {
        console.error('[FATAL] Bot failed to start:', error);
        process.exit(1);
    }
}

main();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN] SQL Connection closing...');
    await prisma.$disconnect();
    console.log('[SHUTDOWN] Bye.');
    process.exit(0);
});
