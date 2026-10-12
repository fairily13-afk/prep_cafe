import { z } from 'zod';
import Decimal from 'decimal.js';
import type { Dataset, SaleInput } from './types';

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > '9999-12-31') return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const decimal = z.string().regex(/^\d+(\.\d+)?$/, '0 이상의 숫자를 입력해 주세요.').refine(v => {
  try { return new Decimal(v).isFinite() && new Decimal(v).lte('999999999999'); } catch { return false; }
}, '입력 가능한 금액 범위를 넘었습니다.');
const amount = decimal.refine(v => !v.includes('.'), '금액은 정수 원으로 입력해 주세요.');
const inputSchema = z.object({
  date: z.string().refine(validDate, '올바른 판매 날짜를 입력해 주세요.'),
  menu_id: z.string().min(1, '메뉴를 선택해 주세요.'),
  channel: z.enum(['매장', '포장']),
  quantity: decimal.refine(v => new Decimal(v).isInteger() && new Decimal(v).gte(1) && new Decimal(v).lte(1000000000), '판매 수량은 1 이상의 정수로 입력해 주세요.'),
  unit_price: amount, discount_amount: amount, payment_fee: amount
});
export function validateInput(input: SaleInput, data: Dataset): SaleInput {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues.map(i => i.message).join(' '));
  if (!data.menus.some(m => m.menu_id === input.menu_id)) throw new Error('존재하는 메뉴를 선택해 주세요.');
  const menu = data.menus.find(m => m.menu_id === input.menu_id)!;
  for (const recipe of data.recipes.filter(r => r.menu_id === input.menu_id && r.recipe_version === menu.recipe_version && (!r.channel_only || r.channel_only === input.channel))) {
    const material = data.materials.find(m => m.material_id === recipe.material_id);
    if (!material || material.unit !== recipe.unit) throw new Error('레시피의 재료 참조·단위가 잘못되어 저장할 수 없습니다.');
  }
  if (new Decimal(input.discount_amount).gt(new Decimal(input.quantity).times(input.unit_price))) throw new Error('총 할인액은 할인 전 판매금액보다 클 수 없습니다.');
  return result.data;
}
export function validatePeriod(start: string, end: string) {
  if (!validDate(start) || !validDate(end)) throw new Error('조회 날짜를 올바르게 입력해 주세요.');
  if (start > end) throw new Error('시작일은 종료일보다 뒤일 수 없습니다.');
}
function numericStrings(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('샘플에 잘못된 숫자가 있습니다.');
    return new Decimal(value).toString();
  }
  if (Array.isArray(value)) return value.map(numericStrings);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, numericStrings(v)]));
  return value;
}
export function prepareSeed(source: unknown): Dataset {
  const d = numericStrings(source) as Dataset;
  if (!d?.meta || !d.settings || !validDate(d.meta.start_date) || !validDate(d.meta.as_of)) throw new Error('초기 자료의 기본 정보가 잘못되었습니다.');
  const arrays = ['suppliers', 'materials', 'menus', 'recipes', 'price_history', 'calendar', 'sales', 'opening_inventory', 'inventory_events', 'expenses', 'monthly_expense_plan'] as const;
  for (const key of arrays) if (!Array.isArray(d[key])) throw new Error(`초기 자료 ${key}가 없습니다.`);
  function unique(rows: unknown[], key: (r: any) => string) {
    const keys = rows.map(key);
    if (keys.some(k => !k || k.includes('undefined')) || new Set(keys).size !== keys.length) throw new Error('초기 자료에 중복 또는 누락된 번호가 있습니다.');
  }
  unique(d.suppliers, r => r.supplier_id); unique(d.materials, r => r.material_id); unique(d.menus, r => r.menu_id);
  unique(d.sales, r => r.sale_id); unique(d.sales, r => `${r.date}|${r.menu_id}|${r.channel}`);
  unique(d.expenses, r => r.expense_id); unique(d.inventory_events, r => r.event_id);
  unique(d.calendar, r => r.date); unique(d.opening_inventory, r => r.material_id);
  unique(d.price_history, r => `${r.material_id}|${r.effective_date}`);
  unique(d.recipes, r => `${r.menu_id}|${r.recipe_version}|${r.material_id}|${r.channel_only || ''}`);
  unique(d.inventory_events.filter(r => r.event_type === '실사조정'), r => `${r.date}|${r.material_id}`);
  const mat = new Map(d.materials.map(m => [m.material_id, m]));
  const menus = new Set(d.menus.map(m => m.menu_id));
  const suppliers = new Set(d.suppliers.map(s => s.supplier_id));
  const num = (v: unknown, nonnegative = true) => {
    if (typeof v !== 'string' || !/^-?\d+(\.\d+)?$/.test(v) || (nonnegative && new Decimal(v).lt(0))) throw new Error('초기 자료의 수량·금액이 잘못되었습니다.');
  };
  for (const m of d.materials) if (!suppliers.has(m.supplier_id) || !['g', 'ml', '개'].includes(m.unit)) throw new Error('초기 재료의 공급사·단위가 잘못되었습니다.');
  for (const m of d.menus) num(m.price);
  for (const r of d.recipes) {
    if (!menus.has(r.menu_id) || !mat.has(r.material_id) || mat.get(r.material_id)?.unit !== r.unit || (r.channel_only && !['매장', '포장'].includes(r.channel_only))) throw new Error('레시피 참조·단위가 잘못되었습니다.');
    num(r.quantity); if (new Decimal(r.quantity).lte(0) || (r.unit === '개' && !new Decimal(r.quantity).isInteger())) throw new Error('레시피 수량이 잘못되었습니다.');
  }
  for (const p of d.price_history) {
    if (!mat.has(p.material_id) || !validDate(p.effective_date)) throw new Error('가격이력 참조·날짜가 잘못되었습니다.');
    num(p.pack_price); num(p.pack_quantity); if (new Decimal(p.pack_quantity).lte(0)) throw new Error('구매용량은 양수여야 합니다.');
  }
  for (const s of d.sales) {
    validateInput(s, d); num(s.net_sales);
    if (!s.recipe_version || !d.recipes.some(r => r.menu_id === s.menu_id && r.recipe_version === s.recipe_version)) throw new Error('판매 레시피 참조가 잘못되었습니다.');
    if (s.unit_food_cost_snapshot !== null) num(s.unit_food_cost_snapshot);
    if (s.unit_packaging_cost_snapshot !== null) num(s.unit_packaging_cost_snapshot);
  }
  for (const r of [...d.opening_inventory, ...d.inventory_events]) {
    if (!mat.has(r.material_id) || mat.get(r.material_id)?.unit !== r.unit || !validDate(r.date)) throw new Error('재고 참조·날짜·단위가 잘못되었습니다.');
    num(r.quantity, false);
    if (r.unit === '개' && !new Decimal(r.quantity).isInteger()) throw new Error('개 단위 재고 수량이 정수가 아닙니다.');
  }
  for (const e of d.inventory_events) {
    if (!['입고', '폐기', '실사조정'].includes(e.event_type)) throw new Error('재고 기록 종류가 잘못되었습니다.');
    if (e.event_type === '입고' && new Decimal(e.quantity).lte(0)) throw new Error('입고 수량이 잘못되었습니다.');
    if (e.event_type === '폐기' && new Decimal(e.quantity).gte(0)) throw new Error('폐기 수량이 잘못되었습니다.');
    if (e.event_type === '실사조정') { num(e.counted_quantity); if (e.unit === '개' && !new Decimal(e.counted_quantity!).isInteger()) throw new Error('실사 수량이 정수가 아닙니다.'); }
    if ('supplier_id' in e && !suppliers.has(e.supplier_id as string)) throw new Error('재고 기록의 공급사 참조가 잘못되었습니다.');
    if (e.unit_cost !== undefined) num(e.unit_cost);
  }
  for (const c of d.calendar) if (!validDate(c.date) || typeof c.is_open !== 'boolean' || typeof c.record_complete !== 'boolean') throw new Error('영업달력이 잘못되었습니다.');
  for (const e of d.expenses) { if (!validDate(e.date) || !e.category) throw new Error('비용 날짜·항목이 잘못되었습니다.'); num(e.amount); }
  for (const e of d.monthly_expense_plan) { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.month) || !e.category) throw new Error('월 계획이 잘못되었습니다.'); num(e.amount); }
  return d;
}
