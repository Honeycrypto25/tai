import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Create Default Settings
    await prisma.globalSettings.upsert({
        where: { id: 1 },
        update: {},
        create: {
            trading_enabled: true,
            dry_run: true,
            max_open_buys: 2,
            max_daily_sells: 1,
            target_sell_usdt: 200,
        }
    });

    // 2. Create Mock Audit Logs
    await prisma.auditLog.createMany({
        data: [
            {
                action: 'settings.update',
                actor_type: 'user',
                env: 'live',
                before_json: { max_open_buys: 2 },
                after_json: { max_open_buys: 4 },
                diff_json: { max_open_buys: [2, 4] },
                reason: 'Ramp up phase 2 initiated'
            },
            {
                action: 'order.place',
                actor_type: 'bot',
                env: 'live',
                entity_type: 'order',
                entity_id: 'ord_123',
                reason: 'Anchor buy triggered at -5%',
                diff_json: { price: 98500, size: 0.005 }
            }
        ]
    });

    // 3. Create Mock Orders and Cycles is optional for now as I hardcoded the dashboard
    // but good for the /orders page if I hook it up later.

    console.log('Seeding completed.');
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    });
