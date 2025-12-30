import { PrismaClient } from '@prisma/client';

export class PolicyEngine {
    constructor(private prisma: PrismaClient) { }

    public async canPlaceBuyOrder(currentExposure: number, openBuysCount: number): Promise<boolean> {
        const settings = await this.prisma.globalSettings.findFirst();
        if (!settings) return false; // Default safe

        if (!settings.trading_enabled) return false; // Master Switch

        // Ramp-up check
        if (openBuysCount >= settings.max_open_buys) return false;

        // Limits
        // ... logic

        return true;
    }
}
