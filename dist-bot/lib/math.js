"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDecimal = toDecimal;
exports.floorToStep = floorToStep;
exports.roundToTick = roundToTick;
const decimal_js_1 = require("decimal.js");
function toDecimal(val) {
    if (val instanceof decimal_js_1.Decimal)
        return val;
    return new decimal_js_1.Decimal(val || 0);
}
function floorToStep(val, stepSize) {
    const v = new decimal_js_1.Decimal(val);
    const s = new decimal_js_1.Decimal(stepSize);
    return v.div(s).floor().mul(s);
}
function roundToTick(val, tickSize) {
    const v = new decimal_js_1.Decimal(val);
    const t = new decimal_js_1.Decimal(tickSize);
    return v.div(t).round().mul(t);
}
