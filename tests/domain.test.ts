import { describe, expect, it } from 'vitest';
import source from '../src/data/seed/sample.json';
import { prepareSeed, validateInput, validatePeriod, validDate } from '../src/domain/validation';
import { costFor, D, inventoryAt, makeSale, operatingProfit, saleAmounts, snapshotMismatch, totals } from '../src/domain/calculations';
import type { SaleInput } from '../src/domain/types';
const data = prepareSeed(source);
const input: SaleInput = { date: '2025-07-01', menu_id: 'M01', channel: '매장', quantity: '10', unit_price: '4000', discount_amount: '1000', payment_fee: '600' };
describe('판매·메뉴 수익성 계산', () => {
  it('FRD 예시 39,000 / 4,600 / 33,800 / 86.7%', () => {
    const s = makeSale(input, data); const a = saleAmounts(s);
    expect(a.net.toString()).toBe('39000'); expect(a.food?.toString()).toBe('4600');
    expect(a.profit?.toString()).toBe('33800'); expect(a.margin?.toFixed(1)).toBe('86.7');
  });
  it('총 할인·수수료를 개당으로 곱하지 않는다', () => {
    expect(saleAmounts(makeSale({ ...input, quantity: '8' }, data)).profit?.toString()).toBe('26720');
  });
  it('포장 채널만 포장비 반영', () => {
    expect(costFor(input, data).packaging).toBe('0');
    expect(D(costFor({ ...input, channel: '포장' }, data).packaging! ).gt(0)).toBe(true);
  });
  it('유효 가격 시작일 경계와 시작 전 누락', () => {
    expect(costFor({ ...input, date: '2025-06-30' }, data).food).toBeNull();
    const before = costFor({ ...input, date: '2025-12-31' }, data);
    const after = costFor({ ...input, date: '2026-01-01' }, data);
    expect(before.evidence[0].effective_date).toBe('2025-07-01'); expect(after.evidence[0].effective_date).toBe('2026-01-01');
  });
  it('같은 날짜 가격이 중복되면 임의 선택하지 않는다', () => {
    const copy = structuredClone(data); copy.price_history.push(copy.price_history[0]);
    expect(costFor(input, copy).food).toBeNull();
  });
  it('수량·금액만 수정하면 과거 단위 원가 유지', () => {
    const old = { ...makeSale(input, data), unit_food_cost_snapshot: '999' };
    expect(makeSale({ ...input, quantity: '8' }, data, old).unit_food_cost_snapshot).toBe('999');
    expect(snapshotMismatch(old, data)).toBe(true);
    expect(makeSale({ ...input, date: '2026-01-01' }, data, old).unit_food_cost_snapshot).not.toBe('999');
  });
  it('원본 순매출 불일치를 알리고 당시 값 유지', () => {
    const s = { ...makeSale(input, data), net_sales: '38000' };
    expect(saleAmounts(s).mismatch).toBe(true); expect(saleAmounts(s).net.toString()).toBe('38000');
  });
  it('전체 이익률은 비율의 평균이 아니라 합계 기준', () => {
    const a = makeSale(input, data), b = makeSale({ ...input, quantity: '1', discount_amount: '0', payment_fee: '0' }, data);
    const t = totals([a, b]); expect(t.margin?.toString()).toBe(D(37340).div(43000).times(100).toString());
  });
  it('전액 할인은 음수 이익 보존, 분모 0은 계산 불가', () => {
    const s = makeSale({ ...input, discount_amount: '40000' }, data);
    expect(saleAmounts(s).profit?.toString()).toBe('-5200'); expect(totals([s]).margin).toBeNull();
  });
  it('원가 누락을 0으로 채우지 않고 부분합 표시', () => {
    const a = makeSale(input, data), b = { ...a, unit_food_cost_snapshot: null };
    const t = totals([a, b]); expect(t.missing).toBe(1); expect(t.profit).toBeNull(); expect(t.knownProfit.toString()).toBe('33800');
  });
  it('소수 원가를 합산 후 반올림', () => {
    const s = { ...makeSale(input, data), quantity: '3', unit_food_cost_snapshot: '0.3333333333333333333333333333', unit_packaging_cost_snapshot: '0' };
    expect(totals([s]).food.toFixed(0)).toBe('1');
  });
});
describe('입력·자료 검증', () => {
  it.each(['', '0', '-1', '1.5'])('잘못된 수량 %s 차단', quantity => { expect(() => validateInput({ ...input, quantity }, data)).toThrow(); });
  it('빈 금액·음수·할인 초과·없는 메뉴 차단', () => {
    for (const patch of [{ unit_price: '' }, { payment_fee: '-1' }, { discount_amount: '40001' }, { menu_id: 'unknown' }]) expect(() => validateInput({ ...input, ...patch }, data)).toThrow();
  });
  it('날짜 유효성·양 끝 포함 기준', () => {
    expect(validDate('2026-02-30')).toBe(false); expect(validDate('2024-02-29')).toBe(true);
    expect(() => validatePeriod('2026-09-19', '2026-09-18')).toThrow(); expect(() => validatePeriod('2026-09-18', '2026-09-18')).not.toThrow();
  });
  it('샘플 전체 건수와 원본 보존', () => {
    expect(data.sales).toHaveLength(6112); expect(data.inventory_events).toHaveLength(1515); expect(data.expenses).toHaveLength(3560);
    expect(typeof source.sales[0].quantity).toBe('number'); expect(typeof data.sales[0].quantity).toBe('string');
  });
  it('샘플 중복·참조·단위 오류 차단', () => {
    const duplicate = structuredClone(source); duplicate.sales.push(duplicate.sales[0]); expect(() => prepareSeed(duplicate)).toThrow();
    const badRef = structuredClone(source); badRef.recipes[0].material_id = 'unknown'; expect(() => prepareSeed(badRef)).toThrow();
    const badUnit = structuredClone(source); badUnit.recipes[0].unit = 'ml'; expect(() => prepareSeed(badUnit)).toThrow();
  });
});
describe('판매 변경의 후속 계산 연결', () => {
  it('판매 수정·삭제가 손익과 재료 사용량에 반영되고 이후 실측은 유지', () => {
    const d = structuredClone(data);
    d.sales = [makeSale(input, data)]; d.expenses = []; d.inventory_events = [
      { event_id: 'count', date: '2025-07-03', material_id: 'I01', event_type: '실사조정', quantity: '0', unit: 'g', counted_quantity: '900' }
    ];
    expect(inventoryAt(d, 'I01', '2025-07-02').balance?.toString()).toBe('5800');
    expect(operatingProfit(d, input.date, input.date).profit?.toString()).toBe('33800');
    d.sales[0] = makeSale({ ...input, quantity: '8' }, d, d.sales[0]);
    expect(inventoryAt(d, 'I01', '2025-07-02').balance?.toString()).toBe('5840');
    expect(inventoryAt(d, 'I01', '2025-07-03').balance?.toString()).toBe('900');
    expect(operatingProfit(d, input.date, input.date).profit?.toString()).toBe('26720');
    d.sales = []; expect(inventoryAt(d, 'I01', '2025-07-02').balance?.toString()).toBe('6000');
    expect(inventoryAt(d, 'I01', '2025-07-03').balance?.toString()).toBe('900');
  });
  it('같은 날 입고·판매·폐기 후 실측을 한 번만 적용', () => {
    const d = structuredClone(data); d.sales = [makeSale(input, d)]; d.inventory_events = [
      { event_id: 'in', date: input.date, material_id: 'I01', event_type: '입고', quantity: '100', unit: 'g' },
      { event_id: 'waste', date: input.date, material_id: 'I01', event_type: '폐기', quantity: '-50', unit: 'g' },
      { event_id: 'count', date: input.date, material_id: 'I01', event_type: '실사조정', quantity: '-40', unit: 'g', counted_quantity: '5700' }
    ];
    const result = inventoryAt(d, 'I01', input.date); expect(result.balance?.toString()).toBe('5700'); expect(result.adjustments[0].difference).toBe('-150');
  });
});
