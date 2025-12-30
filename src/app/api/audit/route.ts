import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const limit = parseInt(searchParams.get('limit') || '50');
    const env = searchParams.get('env');
    const actorType = searchParams.get('actor_type');
    const action = searchParams.get('action');

    const where: Prisma.AuditLogWhereInput = {};

    if (env) where.env = env;
    if (actorType) where.actor_type = actorType;
    if (action) where.action = action;

    try {
        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { ts_utc: 'desc' },
            take: limit,
        });

        return NextResponse.json({ data: logs });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
    }
}
