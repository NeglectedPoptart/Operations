// Sales price = purchase price + commission (a % of the purchase price) +
// cost per case (what it costs, per case, to land the product at the
// warehouse). Cost per case only depends on freight/pallets/cases, never on
// the purchase price, which is what makes the reverse direction solvable:
//   salesPrice = purchase * (1 + rate) + costPerCase
//   purchase   = (salesPrice - costPerCase) / (1 + rate)
export interface WarehouseCostInputs {
  totalFreight: number;
  palletCount: number;
  inOutPerPallet: number;
  totalCases: number;
}

export function costPerCase(inputs: WarehouseCostInputs): number {
  if (inputs.totalCases <= 0) return 0;
  const inOutTotal = inputs.palletCount * inputs.inOutPerPallet;
  const warehouseCost = inputs.totalFreight + inOutTotal;
  return warehouseCost / inputs.totalCases;
}

export interface SalesCalcResult {
  commission: number;
  inOutTotal: number;
  warehouseCost: number;
  costPerCase: number;
  costAddition: number;
  purchasePrice: number;
  salesPrice: number;
}

function buildResult(purchasePrice: number, commissionRate: number, inputs: WarehouseCostInputs): SalesCalcResult {
  const inOutTotal = inputs.palletCount * inputs.inOutPerPallet;
  const warehouseCost = inputs.totalFreight + inOutTotal;
  const cpc = costPerCase(inputs);
  const commission = purchasePrice * commissionRate;
  const costAddition = commission + cpc;
  return {
    commission,
    inOutTotal,
    warehouseCost,
    costPerCase: cpc,
    costAddition,
    purchasePrice,
    salesPrice: purchasePrice + costAddition,
  };
}

export function calcSalesPrice(purchasePrice: number, commissionRate: number, inputs: WarehouseCostInputs): SalesCalcResult {
  return buildResult(purchasePrice, commissionRate, inputs);
}

export function calcPurchasePrice(salesPrice: number, commissionRate: number, inputs: WarehouseCostInputs): SalesCalcResult {
  const cpc = costPerCase(inputs);
  const purchasePrice = (salesPrice - cpc) / (1 + commissionRate);
  return buildResult(purchasePrice, commissionRate, inputs);
}
