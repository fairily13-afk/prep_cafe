import { openDB, type IDBPDatabase } from 'idb';
import type { AppMeta, Dataset, ExpenseInput, InventoryInput, SaleInput, Snapshot } from '../domain/types';
import { prepareSeed, validateInput } from '../domain/validation';
import { makeSale } from '../domain/calculations';
import { duplicateExpense, duplicateReceipt, evaluateWaste, makeInventoryEvent, validateExpense, validateInventory } from '../domain/operations';

export const DB_NAME = 'prep-cafe-operations';
const tables = {
  suppliers: 'suppliers', materials: 'materials', menus: 'menus', recipes: 'recipes',
  price_history: 'priceHistory', calendar: 'calendar', sales: 'sales',
  opening_inventory: 'openingInventory', inventory_events: 'inventoryEvents',
  expenses: 'expenses', monthly_expense_plan: 'monthlyExpensePlan'
} as const;
const stores = Object.values(tables);
function identity(name: keyof typeof tables, row: any): string {
  switch (name) {
    case 'suppliers': return row.supplier_id;
    case 'materials': case 'opening_inventory': return row.material_id;
    case 'menus': return row.menu_id;
    case 'sales': return row.sale_id;
    case 'inventory_events': return row.event_id;
    case 'expenses': return row.expense_id;
    case 'calendar': return row.date;
    case 'recipes': return `${row.menu_id}|${row.recipe_version}|${row.material_id}|${row.channel_only || ''}`;
    case 'price_history': return `${row.material_id}|${row.effective_date}`;
    case 'monthly_expense_plan': return `${row.month}|${row.category}`;
  }
}
function stored(name: keyof typeof tables, row: any, generation: string) {
  return { ...row, key: `${generation}|${identity(name, row)}`, generationId: generation,
    ...(name === 'sales' ? { saleKey: `${generation}|${row.date}|${row.menu_id}|${row.channel}` } : {}),
    ...(name === 'inventory_events' && row.event_type === '실사조정' ? { auditKey: `${generation}|${row.date}|${row.material_id}` } : {}) };
}
export async function connect(name = DB_NAME): Promise<IDBPDatabase> {
  return openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('appMeta', { keyPath: 'key' });
      db.createObjectStore('operationReceipts', { keyPath: 'key' });
      db.createObjectStore('datasetInfo', { keyPath: 'key' });
      db.createObjectStore('settings', { keyPath: 'key' });
      for (const table of stores) {
        const s = db.createObjectStore(table, { keyPath: 'key' });
        s.createIndex('generation', 'generationId');
        if (table === 'sales') s.createIndex('saleKey', 'saleKey', { unique: true });
        if (table === 'inventoryEvents') s.createIndex('auditKey', 'auditKey', { unique: true });
      }
    },
    blocking() { void connection?.then(db => db.close()); window.dispatchEvent(new Event('database-blocked')); }
  });
}
let connection: Promise<IDBPDatabase> | undefined;
export function database() { return connection ??= connect(); }
export async function initialize(db: IDBPDatabase, source: unknown): Promise<void> {
  const current = await db.get('appMeta', 'active');
  if (current) return;
  // Read failure is propagated. Nonempty data without metadata is never replaced by seed.
  for (const store of [...stores, 'datasetInfo', 'settings', 'operationReceipts']) if (await db.count(store)) throw new Error('기존 자료 상태를 확인할 수 없습니다. 샘플로 교체하지 않습니다.');
  const data = prepareSeed(source); const generation = crypto.randomUUID();
  const tx = db.transaction(['appMeta', ...stores, 'datasetInfo', 'settings'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    if (await tx.objectStore('appMeta').get('active')) { await tx.done; return; }
    for (const name of Object.keys(tables) as (keyof typeof tables)[]) {
      const store = tx.objectStore(tables[name]);
      for (const row of data[name]) await store.put(stored(name, row, generation));
    }
    await tx.objectStore('datasetInfo').put({ key: generation, value: data.meta });
    await tx.objectStore('settings').put({ key: generation, value: data.settings });
    await tx.objectStore('appMeta').put({ key: 'active', generationId: generation, revision: 0, schemaVersion: 1, calculationVersion: 'FRD-C01-C04-v1', initialized: true, datasetMeta: data.meta, settings: data.settings } satisfies AppMeta);
    await tx.done;
  } catch (e) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw e; }
}
export async function load(db: IDBPDatabase): Promise<Snapshot> {
  const tx = db.transaction(['appMeta', ...stores, 'datasetInfo', 'settings'], 'readonly');
  const meta = await tx.objectStore('appMeta').get('active') as AppMeta | undefined;
  if (!meta?.initialized || meta.schemaVersion !== 1) throw new Error('저장 자료를 읽을 수 없습니다. 기존 자료는 보존됩니다.');
  const data = { meta: meta.datasetMeta, settings: meta.settings } as Dataset;
  for (const name of Object.keys(tables) as (keyof typeof tables)[]) {
    const rows = await tx.objectStore(tables[name]).index('generation').getAll(meta.generationId);
    (data as any)[name] = rows.map(({ key: _key, generationId: _generation, saleKey: _sale, auditKey: _audit, ...row }) => row);
  }
  await tx.done;
  if (!data.menus.length || !data.materials.length) throw new Error('기준 자료가 누락되었습니다. 샘플로 교체하지 않습니다.');
  return { data, meta };
}
export type SaleCommand = { kind: 'add' | 'edit'; input: SaleInput; id?: string } | { kind: 'delete'; id: string };
export async function mutateSale(db: IDBPDatabase, snapshot: Snapshot, command: SaleCommand, requestId: string): Promise<void> {
  const { data, meta } = snapshot;
  const old = command.kind === 'add' ? undefined : data.sales.find(s => s.sale_id === command.id);
  if (command.kind !== 'add' && !old) throw new Error('대상 기록이 없습니다. 다시 조회해 주세요.');
  const sale = command.kind === 'delete' ? undefined : makeSale(validateInput(command.input, data), data, old);
  const tx = db.transaction(['appMeta', 'sales', 'calendar', 'operationReceipts'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    const current = await tx.objectStore('appMeta').get('active') as AppMeta;
    const receipt = `${meta.generationId}|${requestId}`;
    if (await tx.objectStore('operationReceipts').get(receipt)) { await tx.done; return; }
    if (!current || current.generationId !== meta.generationId || current.revision !== meta.revision) throw new Error('다른 탭에서 자료가 변경되었습니다. 다시 조회한 뒤 저장해 주세요.');
    const store = tx.objectStore('sales');
    if (old && !await store.get(`${meta.generationId}|${old.sale_id}`)) throw new Error('대상 기록이 없습니다. 다시 조회해 주세요.');
    if (sale) {
      const key = `${meta.generationId}|${sale.date}|${sale.menu_id}|${sale.channel}`;
      const duplicate = await store.index('saleKey').get(key);
      if (duplicate && duplicate.sale_id !== old?.sale_id) throw new Error('같은 날짜·메뉴·판매 구분의 기록이 있습니다. 기존 기록을 수정해 주세요.');
      await store.put(stored('sales', sale, meta.generationId));
    } else await store.delete(`${meta.generationId}|${old!.sale_id}`);
    for (const date of new Set([old?.date, sale?.date].filter(Boolean) as string[])) {
      const calendar = tx.objectStore('calendar'); const key = `${meta.generationId}|${date}`;
      const existing = await calendar.get(key);
      await calendar.put({ ...existing, key, generationId: meta.generationId, date, is_open: existing?.is_open ?? true, record_complete: false, confirmation_needed: true });
    }
    await tx.objectStore('appMeta').put({ ...current, revision: current.revision + 1 });
    await tx.objectStore('operationReceipts').put({ key: receipt, revision: current.revision + 1 });
    await tx.done;
  } catch (e) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw e; }
}
export function readableError(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '브라우저 저장 공간이 부족합니다. 기존 기록과 입력은 보존됩니다. 공간을 확보한 뒤 다시 시도해 주세요.';
  if (error instanceof DOMException && error.name === 'ConstraintError') return '중복 기록이 있어 저장하지 않았습니다. 기존 기록을 확인해 주세요.';
  return error instanceof Error ? error.message : '처리하지 못했습니다. 기존 자료를 유지합니다. 다시 시도해 주세요.';
}

// Existing database upgrades in place. No seed replacement and no schema reset.
export async function ensureWasteEvaluation(db: IDBPDatabase): Promise<boolean> {
  const snapshot = await load(db);
  if (snapshot.meta.wasteEvaluationReady) return false;
  const changes = snapshot.data.inventory_events.filter(e => e.event_type === '폐기' && e.waste_cost === undefined).map(e => evaluateWaste(e, snapshot.data));
  const tx = db.transaction(['appMeta', 'inventoryEvents'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    const current = await tx.objectStore('appMeta').get('active') as AppMeta;
    if (current.wasteEvaluationReady) { await tx.done; return false; }
    if (current.revision !== snapshot.meta.revision || current.generationId !== snapshot.meta.generationId) throw new Error('자료 준비 중 다른 탭에서 변경했습니다. 다시 시도해 주세요. 기존 자료는 유지됩니다.');
    for (const event of changes) await tx.objectStore('inventoryEvents').put(stored('inventory_events', event, current.generationId));
    await tx.objectStore('appMeta').put({ ...current, wasteEvaluationReady: true, revision: current.revision + 1 });
    await tx.done;
    return true;
  } catch (e) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw e; }
}
export type OperationsCommand =
  | { kind: 'expense-add' | 'expense-edit'; input: ExpenseInput; id?: string; confirmDuplicate?: boolean }
  | { kind: 'expense-delete'; id: string }
  | { kind: 'inventory-add'; input: InventoryInput; confirmDuplicate?: boolean };
export async function mutateOperations(db: IDBPDatabase, snapshot: Snapshot, command: OperationsCommand, requestId: string): Promise<void> {
  const { meta, data } = snapshot;
  const checked = command.kind === 'inventory-add' ? validateInventory(command.input, data) : command.kind === 'expense-delete' ? undefined : validateExpense(command.input, data);
  const tx = db.transaction(['appMeta', 'expenses', 'inventoryEvents', 'calendar', 'operationReceipts'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    const current = await tx.objectStore('appMeta').get('active') as AppMeta;
    const receipt = `${meta.generationId}|${requestId}`;
    if (await tx.objectStore('operationReceipts').get(receipt)) { await tx.done; return; }
    if (!current || current.generationId !== meta.generationId || current.revision !== meta.revision) throw new Error('다른 탭에서 자료가 변경되었습니다. 다시 조회한 뒤 저장해 주세요.');
    const dates = new Set<string>();
    if (command.kind === 'inventory-add') {
      const input = checked as InventoryInput;
      if (duplicateReceipt(input, data) && !command.confirmDuplicate) throw new Error('같은 입고 기록이 있습니다. 중복 가능성을 확인해 주세요.');
      const event = makeInventoryEvent(input, data);
      await tx.objectStore('inventoryEvents').put(stored('inventory_events', event, meta.generationId)); dates.add(event.date);
    } else {
      const old = command.kind === 'expense-add' ? undefined : data.expenses.find(e => e.expense_id === command.id);
      if (command.kind !== 'expense-add' && (!old || !await tx.objectStore('expenses').get(`${meta.generationId}|${old.expense_id}`))) throw new Error('대상 비용이 없습니다. 다시 조회해 주세요.');
      if (old) dates.add(old.date);
      if (command.kind === 'expense-delete') await tx.objectStore('expenses').delete(`${meta.generationId}|${old!.expense_id}`);
      else {
        const input = checked as ExpenseInput;
        if (duplicateExpense(input, data, old?.expense_id) && !command.confirmDuplicate) throw new Error('같은 날짜·항목·금액의 비용이 있습니다. 중복 가능성을 확인해 주세요.');
        const expense = { ...old, ...input, expense_id: old?.expense_id || crypto.randomUUID(), recognition: '귀속일 직접 기록' };
        await tx.objectStore('expenses').put(stored('expenses', expense, meta.generationId)); dates.add(input.date);
      }
    }
    for (const date of dates) {
      const store = tx.objectStore('calendar'); const key = `${meta.generationId}|${date}`; const old = await store.get(key);
      await store.put({ ...old, key, generationId: meta.generationId, date, is_open: old?.is_open ?? true, record_complete: false, confirmation_needed: true });
    }
    await tx.objectStore('appMeta').put({ ...current, revision: current.revision + 1 });
    await tx.objectStore('operationReceipts').put({ key: receipt, revision: current.revision + 1 });
    await tx.done;
  } catch (e) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw e; }
}
