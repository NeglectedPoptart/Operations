// Sales price = purchase price + commission (a % of the purchase price) +
// cost per case (what it costs, per case, to land the product at the
// warehouse). Cost per case only depends on freight/pallets/cases, never on
// the purchase price, which is what makes the reverse direction solvable:
//   salesPrice = purchase * (1 + rate) + costPerCase
//   purchase   = (salesPrice - costPerCase) / (1 + rate)
//
// Total freight is a single shared cost for the whole truck, not per
// product - when multiple products ride the same trailer, each one's share
// of that freight is proportional to its share of the truck's total
// pallets, so adding another product spreads the same freight cost over
// more pallets/cases and lowers everyone's cost per case. A single-product
// truck is just this same math with one line (its share is 100%).
export interface ProductLine {
  palletCount: number;
  inOutPerPallet: number;
  totalCases: number;
}

export function freightShares(totalFreight: number, lines: ProductLine[]): number[] {
  const totalPallets = lines.reduce((sum, l) => sum + l.palletCount, 0);
  if (totalPallets <= 0) return lines.map(() => 0);
  return lines.map((l) => totalFreight * (l.palletCount / totalPallets));
}

export interface ProductLineResult {
  freightShare: number;
  inOutTotal: number;
  warehouseCost: number;
  costPerCase: number;
  commission: number;
  purchasePrice: number;
  salesPrice: number;
}

function buildResult(purchasePrice: number, commissionRate: number, line: ProductLine, freightShare: number): ProductLineResult {
  const inOutTotal = line.palletCount * line.inOutPerPallet;
  const warehouseCost = freightShare + inOutTotal;
  const costPerCase = line.totalCases > 0 ? warehouseCost / line.totalCases : 0;
  const commission = purchasePrice * commissionRate;
  return {
    freightShare,
    inOutTotal,
    warehouseCost,
    costPerCase,
    commission,
    purchasePrice,
    salesPrice: purchasePrice + commission + costPerCase,
  };
}

// purchasePrices[i] corresponds to lines[i].
export function calcSalesPrices(
  purchasePrices: number[],
  commissionRate: number,
  totalFreight: number,
  lines: ProductLine[],
): ProductLineResult[] {
  const shares = freightShares(totalFreight, lines);
  return lines.map((line, i) => buildResult(purchasePrices[i] ?? 0, commissionRate, line, shares[i]));
}

// salesPrices[i] corresponds to lines[i].
export function calcPurchasePrices(
  salesPrices: number[],
  commissionRate: number,
  totalFreight: number,
  lines: ProductLine[],
): ProductLineResult[] {
  const shares = freightShares(totalFreight, lines);
  return lines.map((line, i) => {
    const inOutTotal = line.palletCount * line.inOutPerPallet;
    const warehouseCost = shares[i] + inOutTotal;
    const costPerCase = line.totalCases > 0 ? warehouseCost / line.totalCases : 0;
    const purchasePrice = ((salesPrices[i] ?? 0) - costPerCase) / (1 + commissionRate);
    return buildResult(purchasePrice, commissionRate, line, shares[i]);
  });
}
