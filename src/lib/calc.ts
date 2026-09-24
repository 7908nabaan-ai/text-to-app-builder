/**
 * Sky Plus shared business calculations.
 * Single source of truth for CBM, capacity, order value, advance and balance.
 * Used by both UI and server functions — never duplicate these formulas.
 */

export type CalcLine = {
  quantity: number;
  cbmPerCarton: number;
  price: number;
};

export type OrderTotals = {
  totalCbm: number;
  capacityCbm: number;
  remainingCbm: number;
  exceededCbm: number;
  utilizationPercent: number;
  totalValue: number;
  isOverCapacity: boolean;
};

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const lineCbm = (line: CalcLine) => round(line.cbmPerCarton * line.quantity, 4);

export const lineSubtotal = (line: CalcLine) => round(line.price * line.quantity, 2);

export function calcOrderTotals(lines: CalcLine[], capacityCbm: number): OrderTotals {
  const totalCbm = round(
    lines.reduce((sum, line) => sum + line.cbmPerCarton * line.quantity, 0),
    4,
  );
  const totalValue = round(
    lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    2,
  );
  const remainingCbm = round(capacityCbm - totalCbm, 4);
  const utilizationPercent = capacityCbm > 0 ? round((totalCbm / capacityCbm) * 100, 2) : 0;

  return {
    totalCbm,
    capacityCbm,
    remainingCbm: remainingCbm > 0 ? remainingCbm : 0,
    exceededCbm: remainingCbm < 0 ? round(-remainingCbm, 4) : 0,
    utilizationPercent,
    totalValue,
    isOverCapacity: remainingCbm < 0,
  };
}

/** Advance requirement: either a percentage of total value or a fixed amount. */
export function calcAdvance(input: {
  totalValue: number;
  advancePercent?: number | null;
  advanceAmount?: number | null;
}): number {
  if (input.advanceAmount != null && input.advanceAmount > 0) {
    return round(input.advanceAmount, 2);
  }
  if (input.advancePercent != null && input.advancePercent > 0) {
    return round((input.totalValue * input.advancePercent) / 100, 2);
  }
  return 0;
}

export const sumPayments = (payments: { amount: number }[]) =>
  round(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
    2,
  );

export type BalanceResult = {
  finalValue: number;
  totalPaid: number;
  balanceDue: number;
  overpayment: number;
  status: "unpaid" | "partially_paid" | "paid" | "overpaid";
};

/**
 * CRITICAL FINANCIAL RULE:
 * Actual payments are never recalculated when the shipment value changes.
 * Balance = final shipment value - actual total payments received.
 */
export function calcBalance(finalValue: number, payments: { amount: number }[]): BalanceResult {
  const totalPaid = sumPayments(payments);
  const value = round(finalValue, 2);
  const difference = round(value - totalPaid, 2);

  let status: BalanceResult["status"] = "unpaid";
  if (totalPaid === 0) status = "unpaid";
  else if (difference > 0) status = "partially_paid";
  else if (difference === 0) status = "paid";
  else status = "overpaid";

  return {
    finalValue: value,
    totalPaid,
    balanceDue: difference > 0 ? difference : 0,
    overpayment: difference < 0 ? round(-difference, 2) : 0,
    status,
  };
}

export const formatMoney = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);

export const formatCbm = (value: number) => `${value.toFixed(2)} CBM`;
