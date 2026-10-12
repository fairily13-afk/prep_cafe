import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { InventoryInput } from '../domain/types';
import { D, inventoryAt, money } from '../domain/calculations';
import { duplicateReceipt, makeInventoryEvent, validateInventory } from '../domain/operations';
import { readableError } from '../data/repository';
import type { FeatureProps } from './shared';
import styles from '../styles/App.module.css';

export default function Inventory({ snapshot, period, busy, execute, onDirty }: FeatureProps) {
  const { data } = snapshot;
  const initialMaterial = data.materials[0];
  const [form, setForm] = useState<InventoryInput>({ date: data.meta.as_of, material_id: initialMaterial.material_id, event_type: '입고', quantity: '', unit: initialMaterial.unit, unit_cost: '', supplier_id: initialMaterial.supplier_id, reason: '' });
  const [dirty, setDirty] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1); const [filterMaterial, setFilterMaterial] = useState('전체');
  const pending = useRef<string | null>(null); const submitting = useRef(false);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const material = data.materials.find(m => m.material_id === form.material_id)!;
  const ending = useMemo(() => inventoryAt(data, form.material_id, period.end), [data, form.material_id, period.end]);
  const preview = useMemo(() => {
    try {
      validateInventory(form, data); const event = makeInventoryEvent(form, data);
      const before = inventoryAt(data, form.material_id, form.date);
      const after = inventoryAt({ ...data, inventory_events: [...data.inventory_events, event] }, form.material_id, form.date);
      return { event, before, after };
    } catch { return null; }
  }, [form, data]);
  const allRows = data.inventory_events.filter(e => e.date >= period.start && e.date <= period.end);
  const rows = allRows.filter(e => filterMaterial === '전체' || e.material_id === filterMaterial).sort((a, b) => b.date.localeCompare(a.date) || b.event_id.localeCompare(a.event_id));
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  useEffect(() => { setPage(p => Math.min(p, pages)); }, [pages]);
  const visible = rows.slice((page - 1) * 50, page * 50);
  const lastCount = ending.adjustments.at(-1);
  const lastReceipt = data.inventory_events.filter(e => e.material_id === form.material_id && e.event_type === '입고' && e.date <= period.end).sort((a, b) => b.date.localeCompare(a.date))[0];
  const quantityText = (quantity: ReturnType<typeof D> | null) => quantity === null ? '계산 불가' : `${quantity.toString()} ${material.unit}`;
  function change(key: keyof InventoryInput, value: string) {
    const m = key === 'material_id' ? data.materials.find(m => m.material_id === value) : undefined;
    setForm(f => ({ ...f, [key]: value, ...(m ? { unit: m.unit, supplier_id: m.supplier_id } : {}) })); setDirty(true); setError(''); setNotice(''); pending.current = null;
  }
  const discard = () => !dirty || window.confirm('작성 중인 재료 기록을 버릴까요? 저장된 기록은 유지됩니다.');
  function mode(event_type: '입고' | '폐기') { if (busy || form.event_type === event_type || !discard()) return; setForm(f => ({ ...f, event_type, quantity: '', unit_cost: '', reason: '' })); setDirty(false); setError(''); setNotice(''); pending.current = null; }
  function cancel() { if (!discard()) return; setForm(f => ({ ...f, quantity: '', unit_cost: '', reason: '' })); setDirty(false); setError(''); setNotice(''); pending.current = null; }
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy || submitting.current) return;
    setError(''); setNotice('');
    try {
      const checked = validateInventory(form, data); const duplicate = duplicateReceipt(checked, data);
      if (duplicate && !window.confirm('같은 날짜·재료·수량·단가의 입고가 있습니다. 실제 별도 입고가 맞으면 추가할까요?')) return;
      submitting.current = true; pending.current ??= crypto.randomUUID();
      await execute({ kind: 'inventory-add', input: checked, confirmDuplicate: duplicate }, pending.current);
      setNotice(`${checked.event_type} 기록을 저장했습니다.${checked.date < period.start || checked.date > period.end ? ' 현재 조회 기간 밖의 기록입니다. 조회 날짜를 바꿔 확인하세요.' : ''}${preview?.after.balance?.lt(0) ? ' 기록상 잔량이 음수입니다. 기록을 확인하세요.' : ''}${checked.event_type === '폐기' && preview?.event.waste_cost === null ? ' 폐기일 가격 근거가 없어 폐기 비용·손익은 미완성입니다.' : ''}`);
      setForm(f => ({ ...f, quantity: '', unit_cost: '', reason: '' })); setDirty(false); pending.current = null;
    } catch (e) { setError(readableError(e)); }
    finally { submitting.current = false; }
  }
  return <>
    <section className={styles.cards} aria-label="선택 재료 기록 요약">
      <article className={styles.card}><h2>선택 재료 · {material.name}</h2><strong data-testid="material-balance" className={ending.balance?.lt(0) ? styles.negative : ''}>{quantityText(ending.balance)}</strong><small>{period.end} 마감 기준 · 기록상 잔량{lastCount?.date === period.end ? ' (해당 날짜 실측)' : ' (추정)'}</small></article>
      <article className={styles.card}><h2>선택 재료 최근 입고</h2><strong>{lastReceipt?.date || '기록 없음'}</strong><small>{lastReceipt ? `${lastReceipt.quantity} ${material.unit} · 기준 단위당 ${lastReceipt.unit_cost || '근거 없음'}원` : '조회 종료일까지의 입고'}</small></article>
      <article className={styles.card}><h2>저장된 전체 재료 기록</h2><strong>{data.inventory_events.length.toLocaleString()}건</strong><small>입고·폐기·기존 마감 실사</small></article>
      <article className={styles.card}><h2>가격 적용 기준</h2><strong>폐기일 가격</strong><small>입고 가격은 과거 판매 원가를 바꾸지 않습니다.</small></article>
    </section>
    {ending.balance?.lt(0) && <p role="alert" className={styles.warning}>기록상 잔량이 음수입니다. 실제 재료가 음수라는 뜻은 아닙니다. 판매·입고·폐기 기록을 확인하세요.</p>}
    <div className={styles.bottom}>
      <section className={styles.panel}><div className={styles.panelHeading}><h2>저장된 재료 변동 기록</h2><span>선택 결과 {rows.length.toLocaleString()}건</span></div>
        <div className={styles.filters}><label>재료 기록 필터<select aria-label="재료 기록 필터" value={filterMaterial} onChange={e => { setFilterMaterial(e.target.value); setPage(1); }}><option value="전체">전체</option>{data.materials.map(m => <option key={m.material_id} value={m.material_id}>{m.name}</option>)}</select></label></div>
        <div className={styles.tableWrap}><table aria-label="재료 변동 기록"><thead><tr><th>날짜 / 재료</th><th>종류</th><th>증감 / 실제 수량</th><th>입고단가 / 평가액</th><th>사유 / 근거</th></tr></thead><tbody>{visible.map(e => <tr key={e.event_id} data-testid={`event-${e.event_id}`}><th scope="row">{e.date}<small>{data.materials.find(m => m.material_id === e.material_id)?.name}</small></th><td>{e.event_type}</td><td>{e.quantity} {e.unit}{e.event_type === '실사조정' && <small>실제 수량 {e.counted_quantity} {e.unit} · 원본 차이 보존</small>}</td><td>{e.event_type === '입고' ? <>{e.unit_cost !== undefined ? `${e.unit_cost}원/${e.unit}` : '단가 근거 없음'}<small>입고금액 참고 {e.unit_cost === undefined ? '계산 불가' : money(D(e.quantity).times(e.unit_cost))}</small></> : e.event_type === '폐기' ? <>{e.waste_cost == null ? '원가 미완성' : money(e.waste_cost)}<small>폐기 평가액 · {e.valuation_evidence?.effective_date || '가격 근거 없음'}</small></> : '비용 자동 반영 없음'}</td><td>{e.reason || '—'}{e.supplier_id && <small>{data.suppliers.find(s => s.supplier_id === e.supplier_id)?.name}</small>}{e.event_type === '폐기' && <small>가격이력으로 평가 · 과거 원본 확정 금액과 구분</small>}</td></tr>)}</tbody></table></div>
        {!rows.length && <p className={styles.empty}>조회 조건에 맞는 재료 기록이 없습니다.</p>}
        <div className={styles.pagination}><button className={styles.secondary} disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {pages} 페이지 · 한 페이지 최대 50건</span><button className={styles.secondary} disabled={page === pages} onClick={() => setPage(p => p + 1)}>다음</button></div>
        <p className={styles.helper + ' ' + styles.inset}>입고금액은 운영 비용에 자동으로 더하지 않습니다. 폐기는 잔량에서 한 번 차감하고 평가 비용을 보관합니다. 새 실제 재고 입력은 EPIC 3에서 구현합니다.</p>
      </section>
      <section className={styles.panel} id="inventory-form"><div className={styles.panelHeading}><h2>재료 {form.event_type} 입력</h2></div>
        <div className={styles.recordModes}><button type="button" aria-pressed={form.event_type === '입고'} className={form.event_type === '입고' ? '' : styles.secondary} disabled={busy} onClick={() => mode('입고')}>입고 등록</button><button type="button" aria-pressed={form.event_type === '폐기'} className={form.event_type === '폐기' ? '' : styles.secondary} disabled={busy} onClick={() => mode('폐기')}>폐기 등록</button></div>
        <form className={styles.saleForm} onSubmit={e => void save(e)} noValidate><fieldset disabled={busy}>
          <label>기록 날짜<input type="date" value={form.date} onChange={e => change('date', e.target.value)}/></label><label>기록할 재료<select aria-label="기록할 재료" value={form.material_id} onChange={e => change('material_id', e.target.value)}>{data.materials.map(m => <option key={m.material_id} value={m.material_id}>{m.name} ({m.unit})</option>)}</select></label>
          <label>{form.event_type} 수량 ({material.unit})<input aria-label="재료 수량" type="number" min="0" step={material.unit === '개' ? '1' : 'any'} value={form.quantity} onChange={e => change('quantity', e.target.value)} placeholder={material.unit === 'g' ? '예: 1000 (g)' : ''}/></label>
          {form.event_type === '입고' && <><label>기준 단위당 입고단가 (원/{material.unit})<input aria-label="입고단가" type="number" min="0" step="any" value={form.unit_cost} onChange={e => change('unit_cost', e.target.value)} placeholder="팩 전체 가격이 아닌 기준 단위당 가격"/></label><label>공급사<select aria-label="공급사" value={form.supplier_id} onChange={e => change('supplier_id', e.target.value)}>{data.suppliers.map(s => <option value={s.supplier_id} key={s.supplier_id}>{s.name}</option>)}</select></label></>}
          <label>{form.event_type === '폐기' ? '폐기 사유' : '입고 메모 (선택)'}<input aria-label="기록 사유" value={form.reason} onChange={e => change('reason', e.target.value)} maxLength={1000}/></label>
          <p className={styles.helper}>기준 단위는 {material.unit}입니다. 폐기 수량도 양수로 입력하세요. 저장할 때 감소량으로 한 번 반영합니다.</p>
          <div className={styles.preview} aria-label="재료 기록 미리보기">{preview ? <><strong>저장 전 미리보기</strong><dl><dt>기록 전 마감 잔량</dt><dd>{quantityText(preview.before.balance)}</dd><dt>기록 후 마감 잔량</dt><dd>{quantityText(preview.after.balance)}</dd><dt>{form.event_type === '입고' ? '입고금액 (참고)' : '폐기 평가 비용'}</dt><dd>{form.event_type === '입고' ? money(D(form.quantity).times(form.unit_cost)) : preview.event.waste_cost == null ? '원가 미완성' : money(preview.event.waste_cost)}</dd></dl>{preview.after.adjustments.some(a => a.date === form.date) && <small>이 날짜의 마감 실측 수량은 유지됩니다. 기록 변경은 실사 직전 차이에 반영됩니다.</small>}{preview.after.balance?.lt(0) && <small className={styles.negative}>기록 후 잔량이 음수입니다. 실제 기록이 맞는지 확인하세요.</small>}{preview.event.valuation_issues?.map(i => <small key={i}>{i}</small>)}</> : <span>필수값을 올바르게 입력하면 결과가 표시됩니다.</span>}</div>
          {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
          <button type="submit" className={styles.fullButton}>{form.event_type} 저장</button><button type="button" className={styles.secondary + ' ' + styles.fullButton} onClick={cancel}>재료 입력 지우기</button>
        </fieldset></form>
      </section>
    </div>
  </>;
}
