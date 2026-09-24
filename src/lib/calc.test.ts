import { describe, expect, it } from "vitest";
import { calcAdvance, calcBalance, calcOrderTotals, lineCbm, lineSubtotal } from "./calc";

describe("CBM and capacity", () => {
  it("multiplies cbm per carton by quantity", () => {
    expect(lineCbm({ quantity: 80, cbmPerCarton: 0.03, price: 18 })).toBe(2.4);
  });

  it("computes totals, remaining capacity and utilization", () => {
    const totals = calcOrderTotals(
      [
        { quantity: 100, cbmPerCarton: 0.1, price: 18 },
        { quantity: 100, cbmPerCarton: 0.197, price: 12 },
      ],
      33,
    );
    expect(totals.totalCbm).toBe(29.7);
    expect(totals.remainingCbm).toBe(3.3);
    expect(totals.utilizationPercent).toBe(90);
    expect(totals.isOverCapacity).toBe(false);
  });

  it("flags over capacity with the exceeded amount", () => {
    const totals = calcOrderTotals([{ quantity: 400, cbmPerCarton: 0.1, price: 10 }], 33);
    expect(totals.isOverCapacity).toBe(true);
    expect(totals.exceededCbm).toBe(7);
    expect(totals.remainingCbm).toBe(0);
  });

  it("computes order value from negotiated price", () => {
    expect(lineSubtotal({ quantity: 80, cbmPerCarton: 0.03, price: 18 })).toBe(1440);
  });
});

describe("advance", () => {
  it("supports a percentage", () => {
    expect(calcAdvance({ totalValue: 30000, advancePercent: 30 })).toBe(9000);
  });
  it("supports a fixed amount that wins over percentage", () => {
    expect(calcAdvance({ totalValue: 30000, advancePercent: 30, advanceAmount: 8000 })).toBe(8000);
  });
});

describe("balance — actual payments are never recalculated", () => {
  it("uses the actual paid amount when the shipment value drops", () => {
    const result = calcBalance(28000, [{ amount: 9000 }]);
    expect(result.totalPaid).toBe(9000);
    expect(result.balanceDue).toBe(19000);
    expect(result.status).toBe("partially_paid");
  });

  it("handles multiple payments", () => {
    const result = calcBalance(28000, [{ amount: 9000 }, { amount: 19000 }]);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe("paid");
  });

  it("flags overpayment instead of inventing a policy", () => {
    const result = calcBalance(8000, [{ amount: 9000 }]);
    expect(result.balanceDue).toBe(0);
    expect(result.overpayment).toBe(1000);
    expect(result.status).toBe("overpaid");
  });
});
