import { Decimal } from 'decimal.js';

export function toDecimal(val: any): Decimal {
    if (val instanceof Decimal) return val;
    return new Decimal(val || 0);
}

export function floorToStep(val: Decimal | number, stepSize: Decimal | number): Decimal {
    const v = new Decimal(val);
    const s = new Decimal(stepSize);
    return v.div(s).floor().mul(s);
}

export function roundToTick(val: Decimal | number, tickSize: Decimal | number): Decimal {
    const v = new Decimal(val);
    const t = new Decimal(tickSize);
    return v.div(t).round().mul(t);
}
