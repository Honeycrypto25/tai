"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEngine = void 0;
class PolicyEngine {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async canPlaceBuyOrder(currentExposure, openBuysCount) {
        const settings = await this.prisma.globalSettings.findFirst();
        if (!settings)
            return false; // Default safe
        if (!settings.trading_enabled)
            return false; // Master Switch
        // Ramp-up check
        if (openBuysCount >= settings.max_open_buys)
            return false;
        // Limits
        // ... logic
        return true;
    }
}
exports.PolicyEngine = PolicyEngine;
