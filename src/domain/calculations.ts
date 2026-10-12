import Decimal from 'decimal.js';
import type { Dataset, Evidence, Sale, SaleInput } from './types';
Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export const D = (v: string | number) => new Decimal(v);
export function money(v: string | Decimal | null) { return v === null ? '계산 불가' : new Decimal(v).toDecimalPlaces(0).toNumber().toLocaleString('ko-KR') + '원'; }
export function percent(v: string | Decimal | null) { return v === null ? '계산 불가' : new Decimal(v).toFixed(1) + '%'; }
export function costFor(input: SaleInput, data: Dataset) {
  const menu = data.menus.find(m => m.menu_id === input.menu_id);
  const issues: string[] = []; const evidence: Evidence[] = [];
  let food = D(0), packaging = D(0), foodMissing = false, packMissing = false;
  const recipes = data.recipes.filter(r => r.menu_id === input.menu_id && r.recipe_version === menu?.recipe_version && (!r.channel_only || r.channel_only === input.channel));
  if (!recipes.length) { issues.push('적용 레시피 없음'); foodMissing = true; packMissing = true; }
  for (const r of recipes) {
    const material = data.materials.find(m => m.material_id === r.material_id);
    const prices = data.price_history.filter(p => p.material_id === r.material_id && p.effective_date <= input.date).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    const p = prices[0];
    if (!material || material.unit !== r.unit || !p || D(p.pack_quantity).lte(0) || prices.filter(x => x.effective_date === p.effective_date).length !== 1) {
      issues.push(`${material?.name || r.material_id}: 가격·단위 근거 없음`);
      if (r.channel_only) packMissing = true; else foodMissing = true;
      continue;
    }
    const unitCost = D(p.pack_price).div(p.pack_quantity);
    const value = unitCost.times(r.quantity);
    if (r.channel_only) packaging = packaging.plus(value); else food = food.plus(value);
    evidence.push({ material_id: r.material_id, effective_date: p.effective_date, unit_cost: unitCost.toString(), quantity: r.quantity, ...(r.channel_only ? { channel_only: r.channel_only } : {}) });
  }
  return { food: foodMissing ? null : food.toString(), packaging: packMissing ? null : packaging.toString(), issues, evidence, version: menu?.recipe_version || '' };
}
export function makeSale(input: SaleInput, data: Dataset, old?: Sale): Sale {
  const sameContext = old && old.date === input.date && old.menu_id === input.menu_id && old.channel === input.channel && old.recipe_version === data.menus.find(m => m.menu_id === input.menu_id)?.recipe_version;
  const cost = sameContext ? { food: old.unit_food_cost_snapshot, packaging: old.unit_packaging_cost_snapshot, issues: old.cost_issues, evidence: old.cost_evidence, version: old.recipe_version } : costFor(input, data);
  return { ...old, ...input, sale_id: old?.sale_id || crypto.randomUUID(),
    net_sales: D(input.quantity).times(input.unit_price).minus(input.discount_amount).toString(),
    recipe_version: cost.version, unit_food_cost_snapshot: cost.food, unit_packaging_cost_snapshot: cost.packaging,
    cost_issues: cost.issues, cost_evidence: cost.evidence, calculation_version: 'FRD-C01-C04-v1' };
}
export function saleAmounts(s: Sale) {
  const net = D(s.net_sales), fees = D(s.payment_fee);
  const food = s.unit_food_cost_snapshot == null ? null : D(s.quantity).times(s.unit_food_cost_snapshot);
  const packaging = s.unit_packaging_cost_snapshot == null ? null : D(s.quantity).times(s.unit_packaging_cost_snapshot);
  const profit = food === null || packaging === null ? null : net.minus(food).minus(packaging).minus(fees);
  const mismatch = !D(s.quantity).times(s.unit_price).minus(s.discount_amount).eq(net);
  return { net, food, packaging, fees, profit, mismatch, margin: profit === null || net.isZero() ? null : profit.div(net).times(100) };
}
export function snapshotMismatch(s: Sale, data: Dataset) {
  const cost = costFor(s, data);
  return (cost.food !== null && s.unit_food_cost_snapshot !== null && !D(cost.food).eq(s.unit_food_cost_snapshot)) ||
    (cost.packaging !== null && s.unit_packaging_cost_snapshot !== null && !D(cost.packaging).eq(s.unit_packaging_cost_snapshot));
}
export function totals(sales: Sale[]) {
  let qty = D(0), net = D(0), food = D(0), pack = D(0), fees = D(0), knownProfit = D(0), missing = 0, mismatches = 0;
  let missingFood = 0, missingPack = 0;
  for (const s of sales) {
    const a = saleAmounts(s); qty = qty.plus(s.quantity); net = net.plus(a.net); fees = fees.plus(a.fees);
    if (a.food === null) missingFood++; else food = food.plus(a.food);
    if (a.packaging === null) missingPack++; else pack = pack.plus(a.packaging);
    if (a.profit === null) missing++; else knownProfit = knownProfit.plus(a.profit);
    if (a.mismatch) mismatches++;
  }
  return { qty, net, food, pack, fees, knownProfit, missing, missingFood, missingPack, mismatches,
    profit: missing ? null : knownProfit,
    margin: missing || net.isZero() ? null : knownProfit.div(net).times(100),
    avgNet: qty.isZero() ? null : net.div(qty), avgCost: missing || qty.isZero() ? null : food.plus(pack).div(qty), avgProfit: missing || qty.isZero() ? null : knownProfit.div(qty) };
}
// EPIC 1의 판매 변경을 후속 손익·잔량에 연결하는 공통 계산. 화면은 후속 EPIC에서 구현한다.
export function operatingProfit(data: Dataset, start: string, end: string) {
  const t = totals(data.sales.filter(s => s.date >= start && s.date <= end));
  const expenses = data.expenses.filter(e => e.date >= start && e.date <= end).reduce((a, e) => a.plus(e.amount), D(0));
  let waste = D(0), missingWaste = 0;
  for (const e of data.inventory_events.filter(e => e.event_type === '폐기' && e.date >= start && e.date <= end)) {
    if (e.waste_cost !== undefined) {
      if (e.waste_cost === null) missingWaste++; else waste = waste.plus(e.waste_cost);
      continue;
    }
    const prices = data.price_history.filter(p => p.material_id === e.material_id && p.effective_date <= e.date).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    const p = prices[0];
    if (!p || D(p.pack_quantity).lte(0) || prices.filter(x => x.effective_date === p.effective_date).length !== 1) { missingWaste++; continue; }
    waste = waste.plus(D(e.quantity).abs().times(D(p.pack_price).div(p.pack_quantity)));
  }
  return { expenses, waste, profit: t.profit === null || missingWaste ? null : t.profit.minus(expenses).minus(waste) };
}
export function inventoryAt(data: Dataset, materialId: string, end: string) {
  const material = data.materials.find(m => m.material_id === materialId);
  const opening = data.opening_inventory.find(o => o.material_id === materialId);
  const adjustments: { date: string; before: string | null; counted: string; difference: string | null; original: string }[] = [];
  if (opening && end < opening.date) return { balance: null, adjustments };
  let balance = opening && opening.unit === material?.unit ? D(opening.quantity) : null;
  type Day = { delta: Decimal; invalid: boolean; counts: typeof data.inventory_events };
  const days = new Map<string, Day>();
  const getDay = (date: string) => { let day = days.get(date); if (!day) { day = { delta: D(0), invalid: false, counts: [] }; days.set(date, day); } return day; };
  const relevant = (date: string) => date <= end && (!opening || date >= opening.date);
  for (const e of data.inventory_events) {
    if (e.material_id !== materialId || !relevant(e.date)) continue;
    const day = getDay(e.date);
    if (e.unit !== material?.unit) day.invalid = true;
    else if (e.event_type === '실사조정') day.counts.push(e);
    else day.delta = day.delta.plus(e.quantity);
  }
  const recipeIndex = new Map<string, typeof data.recipes>();
  for (const r of data.recipes) { const key = r.menu_id + '|' + r.recipe_version; const list = recipeIndex.get(key) || []; list.push(r); recipeIndex.set(key, list); }
  for (const s of data.sales) {
    if (!relevant(s.date)) continue;
    const recipes = (recipeIndex.get(s.menu_id + '|' + s.recipe_version) || []).filter(r => !r.channel_only || r.channel_only === s.channel);
    const day = getDay(s.date);
    if (!recipes.length) { day.invalid = true; continue; }
    for (const r of recipes) if (r.material_id === materialId) {
      if (r.unit !== material?.unit) day.invalid = true;
      else day.delta = day.delta.minus(D(s.quantity).times(r.quantity));
    }
  }
  for (const date of [...days.keys()].sort()) {
    const day = days.get(date)!;
    if (day.invalid) balance = null;
    else if (balance !== null) balance = balance.plus(day.delta);
    if (day.counts.length > 1) balance = null;
    else if (day.counts.length) {
      const c = day.counts[0];
      if (c.counted_quantity == null) balance = null;
      else {
        adjustments.push({ date, before: balance?.toString() ?? null, counted: c.counted_quantity, difference: balance === null ? null : D(c.counted_quantity).minus(balance).toString(), original: c.quantity });
        balance = D(c.counted_quantity);
      }
    }
  }
  return { balance, adjustments };
}
