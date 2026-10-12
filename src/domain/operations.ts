import { z } from 'zod';
import type { Dataset, ExpenseInput, InventoryEvent, InventoryInput, WasteEvidence } from './types';
import { validDate } from './validation';
import { D } from './calculations';

const date = z.string().refine(validDate, '올바른 날짜를 입력해 주세요.');
const number = z.string().regex(/^\d+(\.\d+)?$/, '빈칸 없이 0 이상의 숫자를 입력해 주세요.').refine(v => {
  try { return D(v).isFinite() && D(v).lte('999999999999') && v.replace(/[.0]/g, '').length <= 24; } catch { return false; }
}, '입력한 숫자의 크기나 자릿수를 확인해 주세요.');
const expenseSchema = z.object({ date, category: z.string().min(1), amount: number.refine(v => !v.includes('.'), '비용은 0 이상의 정수 원으로 입력해 주세요.') });
export function expenseCategories(data: Dataset) { return [...new Set([...data.expenses.map(e => e.category), ...data.monthly_expense_plan.map(e => e.category)])]; }
export function validateExpense(input: ExpenseInput, data: Dataset): ExpenseInput {
  const result = expenseSchema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues.map(i => i.message).join(' '));
  if (!expenseCategories(data).includes(input.category)) throw new Error('기존 비용 항목을 선택해 주세요.');
  return { ...result.data, amount: D(result.data.amount).toString() };
}
const inventorySchema = z.object({ date, material_id: z.string().min(1), event_type: z.enum(['입고', '폐기']), quantity: number.refine(v => D(v).gt(0), '입고·폐기 수량은 0보다 커야 합니다.'), unit: z.string(), unit_cost: z.string(), supplier_id: z.string(), reason: z.string() });
export function validateInventory(input: InventoryInput, data: Dataset): InventoryInput {
  const result = inventorySchema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues.map(i => i.message).join(' '));
  const material = data.materials.find(m => m.material_id === input.material_id);
  if (!material) throw new Error('존재하는 재료를 선택해 주세요.');
  if (material.unit !== input.unit) throw new Error('재료의 기준 단위와 입력 단위가 다릅니다.');
  if (material.unit === '개' && !D(input.quantity).isInteger()) throw new Error('개 단위 수량은 정수로 입력해 주세요.');
  if (input.event_type === '입고') {
    const cost = number.safeParse(input.unit_cost);
    if (!cost.success) throw new Error('기준 단위당 입고단가를 0 이상의 숫자로 입력해 주세요.');
    if (!data.suppliers.some(s => s.supplier_id === input.supplier_id)) throw new Error('존재하는 공급사를 선택해 주세요.');
  } else if (!input.reason.trim()) throw new Error('폐기 사유를 입력해 주세요.');
  if (input.reason.length > 1000) throw new Error('사유는 1,000자 이내로 입력해 주세요.');
  return { ...result.data, quantity: D(input.quantity).toString(), ...(input.event_type === '입고' ? { unit_cost: D(input.unit_cost).toString() } : {}), reason: input.reason.trim() };
}
export function evaluateWaste(event: InventoryEvent, data: Dataset): InventoryEvent {
  const material = data.materials.find(m => m.material_id === event.material_id);
  const prices = data.price_history.filter(p => p.material_id === event.material_id && p.effective_date <= event.date).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const p = prices[0];
  if (!p || !material || material.unit !== event.unit || D(p.pack_quantity).lte(0) || prices.filter(x => x.effective_date === p.effective_date).length !== 1) return { ...event, waste_cost: null, valuation_issues: ['폐기일 가격·단위 근거 없음'], valuation_evidence: undefined };
  const unitCost = D(p.pack_price).div(p.pack_quantity);
  const evidence: WasteEvidence = { effective_date: p.effective_date, pack_price: p.pack_price, pack_quantity: p.pack_quantity, unit_cost: unitCost.toString(), calculation_version: 'FRD-C01-C04-v1', source: '가격이력 평가' };
  return { ...event, waste_cost: D(event.quantity).abs().times(unitCost).toString(), valuation_evidence: evidence, valuation_issues: [] };
}
export function makeInventoryEvent(input: InventoryInput, data: Dataset): InventoryEvent {
  const checked = validateInventory(input, data);
  const base: InventoryEvent = { event_id: crypto.randomUUID(), date: checked.date, material_id: checked.material_id, event_type: checked.event_type, quantity: checked.event_type === '폐기' ? D(checked.quantity).negated().toString() : checked.quantity, unit: checked.unit, reason: checked.reason };
  return checked.event_type === '입고' ? { ...base, unit_cost: checked.unit_cost, supplier_id: checked.supplier_id } : evaluateWaste(base, data);
}
export function duplicateExpense(input: ExpenseInput, data: Dataset, ignoreId?: string) {
  return data.expenses.some(e => e.expense_id !== ignoreId && e.date === input.date && e.category === input.category && D(e.amount).eq(input.amount));
}
export function duplicateReceipt(input: InventoryInput, data: Dataset) {
  return input.event_type === '입고' && data.inventory_events.some(e => e.event_type === '입고' && e.date === input.date && e.material_id === input.material_id && D(e.quantity).eq(input.quantity) && e.unit_cost !== undefined && D(e.unit_cost).eq(input.unit_cost));
}
