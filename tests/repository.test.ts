import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { IDBPDatabase } from 'idb';
import source from '../src/data/seed/sample.json';
import { connect, initialize, load, mutateSale } from '../src/data/repository';
import type { SaleInput } from '../src/domain/types';
const input: SaleInput = { date: '2026-09-19', menu_id: 'M01', channel: '매장', quantity: '10', unit_price: '4000', discount_amount: '1000', payment_fee: '600' };
let db: IDBPDatabase;
beforeEach(async () => { db = await connect('test-' + crypto.randomUUID()); await initialize(db, source); });
afterEach(() => db.close());
describe('실제 저장소 명령 계약', () => {
  it('초기 준비는 한 번, 재연결 뒤 판매 유지', async () => {
    const s = await load(db); await mutateSale(db, s, { kind: 'add', input }, 'request-1');
    const name = db.name; db.close(); db = await connect(name); await initialize(db, source);
    const reopened = await load(db); expect(reopened.data.sales).toHaveLength(6113); expect(reopened.meta.revision).toBe(1);
  });
  it('중복 저장 요청 번호는 한 번만 적용', async () => {
    const s = await load(db); await mutateSale(db, s, { kind: 'add', input }, 'same');
    await mutateSale(db, s, { kind: 'add', input }, 'same'); expect((await load(db)).data.sales).toHaveLength(6113);
  });
  it('같은 날짜·메뉴·채널 중복 차단', async () => {
    await mutateSale(db, await load(db), { kind: 'add', input }, 'one');
    await expect(mutateSale(db, await load(db), { kind: 'add', input }, 'two')).rejects.toThrow('같은 날짜');
    expect((await load(db)).meta.revision).toBe(1);
  });
  it('오래된 화면은 다른 탭의 기록을 덮어쓰지 않는다', async () => {
    const old = await load(db); await mutateSale(db, old, { kind: 'add', input }, 'one');
    await expect(mutateSale(db, old, { kind: 'add', input: { ...input, channel: '포장' } }, 'two')).rejects.toThrow('다른 탭');
    expect((await load(db)).data.sales).toHaveLength(6113);
  });
  it('수정·삭제는 기록 번호로 반영하고 마감 상태 변경', async () => {
    await mutateSale(db, await load(db), { kind: 'add', input }, 'one');
    let s = await load(db); const sale = s.data.sales.find(x => x.date === input.date)!;
    await mutateSale(db, s, { kind: 'edit', id: sale.sale_id, input: { ...input, quantity: '8', date: '2026-09-20' } }, 'two');
    s = await load(db); expect(s.data.sales.find(x => x.sale_id === sale.sale_id)?.quantity).toBe('8');
    expect(s.data.calendar.find(x => x.date === input.date)?.confirmation_needed).toBe(true);
    expect(s.data.calendar.find(x => x.date === '2026-09-20')?.record_complete).toBe(false);
    await mutateSale(db, s, { kind: 'delete', id: sale.sale_id }, 'three'); expect((await load(db)).data.sales).toHaveLength(6112);
  });
  it('중복으로 수정 실패하면 기존 기록 유지', async () => {
    const s = await load(db), old = s.data.sales[0], target = s.data.sales.find(x => x.date === old.date && x.menu_id === old.menu_id && x.channel !== old.channel)!;
    const patch = { ...old, channel: target.channel };
    await expect(mutateSale(db, s, { kind: 'edit', id: old.sale_id, input: patch }, 'bad')).rejects.toThrow('같은 날짜');
    expect((await load(db)).data.sales.find(x => x.sale_id === old.sale_id)).toEqual(old);
  });
  it('없는 대상 삭제는 기존 자료 유지', async () => {
    await expect(mutateSale(db, await load(db), { kind: 'delete', id: 'missing' }, 'bad')).rejects.toThrow('대상');
    expect((await load(db)).meta.revision).toBe(0);
  });
  it('저장 중 용량 오류는 거래 전체 취소', async () => {
    const s = await load(db); const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: any, key?: IDBValidKey) {
      if (this.name === 'calendar') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(mutateSale(db, s, { kind: 'add', input }, 'full')).rejects.toThrow('full'); spy.mockRestore();
    const after = await load(db); expect(after.data.sales).toHaveLength(6112); expect(after.meta.revision).toBe(0);
  });
  it('메타 정보가 없는 기존 자료를 샘플로 교체하지 않는다', async () => {
    const tx = db.transaction('appMeta', 'readwrite'); await tx.store.delete('active'); await tx.done;
    await expect(initialize(db, source)).rejects.toThrow('샘플로 교체하지'); expect(await db.count('sales')).toBe(6112);
  });
});
