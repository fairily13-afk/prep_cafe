import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDBPDatabase } from 'idb';
import source from '../src/data/seed/sample.json';
import type { InventoryInput } from '../src/domain/types';
import { prepareSeed } from '../src/domain/validation';
import { D, inventoryAt, operatingProfit } from '../src/domain/calculations';
import { evaluateWaste, makeInventoryEvent, validateExpense, validateInventory } from '../src/domain/operations';
import { connect, ensureWasteEvaluation, initialize, load, mutateOperations, mutateSale } from '../src/data/repository';
const data = prepareSeed(source);
const receipt: InventoryInput = { date: '2026-09-19', material_id: 'I01', event_type: '입고', quantity: '1000', unit: 'g', unit_cost: '24.84', supplier_id: 'V01', reason: '' };
const waste = { ...receipt, event_type: '폐기' as const, quantity: '100', unit_cost: '', supplier_id: '', reason: '유통기한 경과' };
describe('비용·재료 입력과 평가', () => {
  it('귀속 비용은 정수·0 허용, 빈칸·음수·소수·없는 항목·날짜 거절', () => {
    expect(validateExpense({ date: receipt.date, category: '광고비', amount: '0' }, data).amount).toBe('0');
    for (const amount of ['', '-1', '1.5']) expect(() => validateExpense({ date: receipt.date, category: '광고비', amount }, data)).toThrow();
    expect(() => validateExpense({ date: '2026-02-30', category: '광고비', amount: '1' }, data)).toThrow();
    expect(() => validateExpense({ date: receipt.date, category: '원두 구매', amount: '1' }, data)).toThrow();
  });
  it('입고 기준 단위·참조 검사, 단가 0 허용', () => {
    expect(makeInventoryEvent({ ...receipt, unit_cost: '0' }, data).unit_cost).toBe('0');
    for (const patch of [{ quantity: '0' }, { quantity: '-1' }, { unit: 'kg' }, { material_id: 'unknown' }, { supplier_id: 'unknown' }, { unit_cost: '' }, { unit_cost: '-1' }]) expect(() => validateInventory({ ...receipt, ...patch }, data)).toThrow();
    expect(() => validateInventory({ ...receipt, material_id: 'I10', unit: '개', quantity: '1.5' }, data)).toThrow();
  });
  it('폐기 양수 입력을 한 번만 음수로 저장, 사유 필수', () => {
    const e = makeInventoryEvent(waste, data); expect(e.quantity).toBe('-100'); expect(e.waste_cost).toBe('2484'); expect(e.valuation_evidence?.unit_cost).toBe('24.84');
    expect(() => makeInventoryEvent({ ...waste, reason: '' }, data)).toThrow('사유');
    expect(() => makeInventoryEvent({ ...waste, quantity: '-100' }, data)).toThrow();
  });
  it('폐기 가격 시점 경계·적용 전 누락·중복 가격', () => {
    expect(makeInventoryEvent({ ...waste, date: '2026-08-31' }, data).waste_cost).toBe('2392');
    expect(makeInventoryEvent({ ...waste, date: '2026-09-01' }, data).waste_cost).toBe('2484');
    expect(makeInventoryEvent({ ...waste, date: '2025-06-30' }, data).waste_cost).toBeNull();
    const d = structuredClone(data); d.price_history.push(d.price_history.filter(p => p.material_id === 'I01').at(-1)!);
    expect(makeInventoryEvent(waste, d).waste_cost).toBeNull();
  });
  it('폐기 평가 후 가격이 달라져도 보관 평가값으로 손익 반영', () => {
    const d = structuredClone(data); d.sales = []; d.expenses = []; d.inventory_events = [makeInventoryEvent(waste, d)];
    d.price_history = d.price_history.map(p => ({ ...p, pack_price: '999999' }));
    expect(operatingProfit(d, receipt.date, receipt.date).profit?.toString()).toBe('-2484');
  });
  it('초기 폐기는 가격이력 평가로 표시하고 원본 증감 유지', () => {
    const original = data.inventory_events.find(e => e.event_type === '폐기')!; const result = evaluateWaste(original, data);
    expect(result.quantity).toBe(original.quantity); expect(result.waste_cost).not.toBeNull(); expect(result.valuation_evidence?.source).toBe('가격이력 평가'); expect(original.waste_cost).toBeUndefined();
  });
  it('입고·폐기·판매 사용 뒤 실측 기준은 유지, 음수 숨기지 않음', () => {
    const d = structuredClone(data); d.sales = []; d.inventory_events = [];
    const baseline = inventoryAt(d, 'I01', receipt.date).balance!;
    d.inventory_events.push(makeInventoryEvent(receipt, d), makeInventoryEvent(waste, d));
    expect(inventoryAt(d, 'I01', receipt.date).balance?.toString()).toBe(baseline.plus(900).toString());
    d.inventory_events.push({ event_id: 'count', date: receipt.date, material_id: 'I01', event_type: '실사조정', quantity: '0', counted_quantity: '500', unit: 'g' });
    const result = inventoryAt(d, 'I01', receipt.date); expect(result.balance?.toString()).toBe('500'); expect(result.adjustments[0].difference).toBe(D(500).minus(baseline.plus(900)).toString());
    d.inventory_events.push(makeInventoryEvent({ ...waste, date: '2026-09-20', quantity: '1000' }, d)); expect(inventoryAt(d, 'I01', '2026-09-20').balance?.toString()).toBe('-500');
  });
  it('입고단가와 매입액을 손익 비용·과거 판매 원가에 넣지 않음', () => {
    const d = structuredClone(data); const old = operatingProfit(d, receipt.date, receipt.date).profit?.toString(); const sales = structuredClone(d.sales);
    d.inventory_events.push(makeInventoryEvent({ ...receipt, unit_cost: '999' }, d));
    expect(operatingProfit(d, receipt.date, receipt.date).profit?.toString()).toBe(old); expect(d.sales).toEqual(sales);
  });
});
describe('비용·재료 실제 저장 명령', () => {
  let db: IDBPDatabase;
  beforeEach(async () => { db = await connect('operations-' + crypto.randomUUID()); await initialize(db, source); });
  afterEach(() => db.close());
  it('기존 판매를 유지하면서 폐기 평가를 한 번만 준비', async () => {
    await mutateSale(db, await load(db), { kind: 'add', input: { date: receipt.date, menu_id: 'M01', channel: '매장', quantity: '8', unit_price: '4000', discount_amount: '1000', payment_fee: '600' } }, 'sale');
    const before = await load(db); expect(await ensureWasteEvaluation(db)).toBe(true);
    const after = await load(db); expect(after.data.sales).toEqual(before.data.sales); expect(after.meta.generationId).toBe(before.meta.generationId);
    expect(after.data.inventory_events.filter(e => e.waste_cost !== undefined)).toHaveLength(189); expect(await ensureWasteEvaluation(db)).toBe(false);
    expect((await load(db)).meta.revision).toBe(after.meta.revision);
  });
  it('비용 추가→수정→삭제, 이전·새 기간 반영, 계획·판매·재고 유지', async () => {
    const before = await load(db); const input = { date: receipt.date, category: '광고비', amount: '12000' };
    await mutateOperations(db, before, { kind: 'expense-add', input }, 'add');
    let s = await load(db); const added = s.data.expenses.find(e => e.date === receipt.date)!;
    expect(operatingProfit(s.data, receipt.date, receipt.date).profit?.toString()).toBe('-12000');
    await mutateOperations(db, s, { kind: 'expense-edit', id: added.expense_id, input: { ...input, date: '2026-10-01', amount: '15000' } }, 'edit');
    s = await load(db); expect(s.data.expenses.filter(e => e.date === receipt.date)).toHaveLength(0); expect(operatingProfit(s.data, '2026-10-01', '2026-10-01').profit?.toString()).toBe('-15000');
    expect(s.data.sales).toEqual(before.data.sales); expect(s.data.inventory_events).toEqual(before.data.inventory_events); expect(s.data.monthly_expense_plan).toEqual(before.data.monthly_expense_plan);
    await mutateOperations(db, s, { kind: 'expense-delete', id: added.expense_id }, 'delete'); expect((await load(db)).data.expenses).toHaveLength(3560);
  });
  it('동일 비용은 확인 후 별도 기록 허용, 중복 요청은 한 번', async () => {
    const input = { date: receipt.date, category: '광고비', amount: '12000' }; const before = await load(db);
    await mutateOperations(db, before, { kind: 'expense-add', input }, 'same'); await mutateOperations(db, before, { kind: 'expense-add', input }, 'same');
    expect((await load(db)).data.expenses).toHaveLength(3561);
    await expect(mutateOperations(db, await load(db), { kind: 'expense-add', input }, 'unconfirmed')).rejects.toThrow('중복');
    await mutateOperations(db, await load(db), { kind: 'expense-add', input, confirmDuplicate: true }, 'confirmed'); expect((await load(db)).data.expenses).toHaveLength(3562);
  });
  it('입고·폐기 한 번 반영, 새로 연결 후 평가값·근거 유지', async () => {
    await ensureWasteEvaluation(db); let s = await load(db); const base = inventoryAt(s.data, 'I01', receipt.date).balance!;
    await mutateOperations(db, s, { kind: 'inventory-add', input: receipt }, 'in');
    s = await load(db); expect(inventoryAt(s.data, 'I01', receipt.date).balance?.toString()).toBe(base.plus(1000).toString());
    await expect(mutateOperations(db, s, { kind: 'inventory-add', input: receipt }, 'unconfirmed')).rejects.toThrow('중복');
    await mutateOperations(db, s, { kind: 'inventory-add', input: waste }, 'waste');
    const name = db.name; db.close(); db = await connect(name); s = await load(db);
    expect(s.data.inventory_events).toHaveLength(1517); expect(inventoryAt(s.data, 'I01', receipt.date).balance?.toString()).toBe(base.plus(900).toString());
    expect(s.data.inventory_events.find(e => e.date === receipt.date && e.event_type === '폐기')?.waste_cost).toBe('2484');
  });
  it('오래된 탭은 비용·입고 저장을 덮어쓰지 않는다', async () => {
    const old = await load(db); await mutateOperations(db, old, { kind: 'inventory-add', input: receipt }, 'one');
    await expect(mutateOperations(db, old, { kind: 'expense-add', input: { date: receipt.date, category: '광고비', amount: '1' } }, 'two')).rejects.toThrow('다른 탭');
    expect((await load(db)).data.expenses).toHaveLength(3560);
  });
  it('비용·재료 쓰기 실패 시 거래 전체 취소', async () => {
    const before = await load(db); const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: any, key?: IDBValidKey) { if (this.name === 'calendar') throw new DOMException('full', 'QuotaExceededError'); return original.call(this, value, key); });
    try {
      await expect(mutateOperations(db, before, { kind: 'expense-add', input: { date: receipt.date, category: '광고비', amount: '100' } }, 'cost-full')).rejects.toThrow('full');
      await expect(mutateOperations(db, before, { kind: 'inventory-add', input: receipt }, 'stock-full')).rejects.toThrow('full');
    } finally { spy.mockRestore(); }
    const after = await load(db); expect(after.data.expenses).toEqual(before.data.expenses); expect(after.data.inventory_events).toEqual(before.data.inventory_events); expect(after.meta.revision).toBe(before.meta.revision);
  });
  it('평가 자료 준비 실패 시 기존 기록·메타 보존', async () => {
    const before = await load(db); const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: any, key?: IDBValidKey) { if (this.name === 'appMeta') throw new DOMException('full', 'QuotaExceededError'); return original.call(this, value, key); });
    try { await expect(ensureWasteEvaluation(db)).rejects.toThrow('full'); } finally { spy.mockRestore(); }
    const after = await load(db); expect(after.data.inventory_events).toEqual(before.data.inventory_events); expect(after.meta).toEqual(before.meta);
  });
});
