import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Expense, ExpenseInput } from '../domain/types';
import { D, money } from '../domain/calculations';
import { duplicateExpense, expenseCategories, validateExpense } from '../domain/operations';
import { readableError } from '../data/repository';
import type { FeatureProps } from './shared';
import styles from '../styles/App.module.css';

export default function Costs({ snapshot, period, busy, execute, onDirty }: FeatureProps) {
  const { data } = snapshot;
  const categories = expenseCategories(data);
  const [form, setForm] = useState<ExpenseInput>({ date: data.meta.as_of, category: categories[0], amount: '' });
  const [editing, setEditing] = useState<Expense>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [filterCategory, setFilterCategory] = useState('전체'); const [filterDate, setFilterDate] = useState(''); const [page, setPage] = useState(1);
  const pending = useRef<string | null>(null); const submitting = useRef(false);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const rows = useMemo(() => data.expenses.filter(e => e.date >= period.start && e.date <= period.end).sort((a, b) => b.date.localeCompare(a.date) || a.category.localeCompare(b.category) || a.expense_id.localeCompare(b.expense_id)), [data, period]);
  const selected = rows.filter(e => (filterCategory === '전체' || e.category === filterCategory) && (!filterDate || e.date === filterDate));
  const pages = Math.max(1, Math.ceil(selected.length / 50));
  useEffect(() => { setPage(p => Math.min(p, pages)); }, [pages]);
  const visible = selected.slice((page - 1) * 50, page * 50);
  const sum = (items: Expense[]) => items.reduce((a, e) => a.plus(e.amount), D(0));
  function change(key: keyof ExpenseInput, value: string) { setForm(f => ({ ...f, [key]: value })); setDirty(true); pending.current = null; setError(''); setNotice(''); }
  const discard = () => !dirty || window.confirm('작성 중인 비용 변경을 버릴까요? 저장된 비용은 유지됩니다.');
  function edit(expense: Expense) {
    if (busy || !discard()) return;
    setEditing(expense); setForm({ date: expense.date, category: expense.category, amount: expense.amount }); setDirty(false); pending.current = null; setError(''); setNotice('');
    document.getElementById('expense-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cancel() { if (!discard()) return; setEditing(undefined); setForm(f => ({ ...f, amount: '' })); setDirty(false); pending.current = null; setError(''); setNotice(''); }
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy || submitting.current) return;
    setError(''); setNotice('');
    try {
      const checked = validateExpense(form, data);
      const duplicate = duplicateExpense(checked, data, editing?.expense_id);
      if (duplicate && !window.confirm('같은 날짜·항목·금액의 비용이 있습니다. 이미 기록한 월비용을 중복 입력한 것은 아닌지 확인하세요. 실제 별도 비용이면 추가할까요?')) return;
      submitting.current = true; pending.current ??= crypto.randomUUID();
      await execute(editing ? { kind: 'expense-edit', id: editing.expense_id, input: checked, confirmDuplicate: duplicate } : { kind: 'expense-add', input: checked, confirmDuplicate: duplicate }, pending.current);
      setNotice(`비용을 ${editing ? '수정' : '저장'}했습니다. 귀속일 ${checked.date}에 반영합니다.${checked.date < period.start || checked.date > period.end ? ' 현재 조회 기간 밖의 기록입니다. 조회 날짜를 바꿔 확인하세요.' : ''}`);
      setEditing(undefined); setForm(f => ({ ...f, amount: '' })); setDirty(false); pending.current = null;
    } catch (e) { setError(readableError(e)); }
    finally { submitting.current = false; }
  }
  async function remove(expense: Expense) {
    if (busy || submitting.current) return;
    if (!window.confirm(`${expense.date} · ${expense.category} · ${money(expense.amount)} 비용을 삭제할까요?`)) return;
    if (editing?.expense_id === expense.expense_id && !discard()) return;
    setError(''); setNotice(''); submitting.current = true;
    try {
      await execute({ kind: 'expense-delete', id: expense.expense_id }, crypto.randomUUID());
      if (editing?.expense_id === expense.expense_id) { setEditing(undefined); setForm(f => ({ ...f, amount: '' })); setDirty(false); pending.current = null; }
      setNotice('비용을 삭제했습니다. 해당 귀속일의 비용 합계를 다시 계산했습니다.');
    } catch (e) { setError(readableError(e)); }
    finally { submitting.current = false; }
  }
  return <>
    <section className={styles.cards} aria-label="비용 요약">
      <article className={styles.card}><h2>조회 기간 운영비</h2><strong data-testid="expense-period-total">{rows.length ? money(sum(rows)) : '기록 없음'}</strong><small>월비용계획을 다시 더하지 않습니다.</small></article>
      <article className={styles.card}><h2>조회 기간 비용 기록</h2><strong>{rows.length.toLocaleString()}건</strong><small>귀속일 기준 · 부가세 제외</small></article>
      <article className={styles.card}><h2>저장된 전체 비용</h2><strong>{data.expenses.length.toLocaleString()}건</strong><small>이 브라우저에 실제 보관</small></article>
      <article className={styles.card}><h2>입력 기준</h2><strong>운영 귀속일</strong><small>실제 납부일과 구분합니다.</small></article>
    </section>
    <section className={styles.panel}><div className={styles.panelHeading}><h2>비용 항목별 합계</h2></div><div className={styles.categoryTotals}>{categories.map(category => { const group = rows.filter(e => e.category === category); return <div key={category}><span>{category}</span><strong>{group.length ? money(sum(group)) : '기록 없음'}</strong></div>; })}</div></section>
    <div className={styles.bottom}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><h2>저장된 운영 비용</h2><span>선택 결과 {selected.length.toLocaleString()}건</span></div>
        <div className={styles.filters}><label>비용 항목 검색<select aria-label="비용 항목 검색" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}><option>전체</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>목록 귀속일<input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); }}/></label><button className={styles.secondary} onClick={() => { setFilterCategory('전체'); setFilterDate(''); setPage(1); }}>목록 필터 해제</button></div>
        <div className={styles.tableWrap}><table aria-label="운영 비용 기록"><thead><tr><th>귀속일</th><th>비용 항목</th><th>금액</th><th>기록 기준</th><th>관리</th></tr></thead><tbody>{visible.map(e => <tr key={e.expense_id} data-testid={`expense-${e.expense_id}`}><th scope="row">{e.date}</th><td>{e.category}</td><td>{money(e.amount)}</td><td>{e.recognition || '귀속일 기록'}</td><td><div className={styles.rowActions}><button className={styles.secondary} disabled={busy} onClick={() => edit(e)}>수정</button><button className={styles.dangerButton} disabled={busy} onClick={() => void remove(e)}>삭제</button></div></td></tr>)}</tbody></table></div>
        {!selected.length && <p className={styles.empty}>조회 조건에 맞는 비용 기록이 없습니다.</p>}
        <div className={styles.subtotal}>선택 결과 합계 {money(sum(selected))} · 현재 페이지 합계 {money(sum(visible))}</div>
        <div className={styles.pagination}><button className={styles.secondary} disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {pages} 페이지 · 한 페이지 최대 50건</span><button className={styles.secondary} disabled={page === pages} onClick={() => setPage(p => p + 1)}>다음</button></div>
      </section>
      <section className={styles.panel} id="expense-form"><div className={styles.panelHeading}><h2>{editing ? '운영 비용 수정' : '운영 비용 입력'}</h2></div>
        <form className={styles.saleForm} onSubmit={e => void save(e)} noValidate><fieldset disabled={busy}>
          <label>비용 귀속일<input type="date" value={form.date} onChange={e => change('date', e.target.value)}/></label>
          <label>비용 항목<select aria-label="비용 항목" value={form.category} onChange={e => change('category', e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>비용 금액 (원·부가세 제외)<input type="number" min="0" step="1" value={form.amount} onChange={e => change('amount', e.target.value)} placeholder="예: 12000"/></label>
          <p className={styles.helper}>그 비용이 해당하는 운영 날짜를 선택하세요. 이미 날짜별 배분된 월세 등을 다시 입력하면 중복입니다. 판매 원가에 포함된 재료·포장 구매와 결제수수료를 운영비로 다시 넣지 마세요.</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
          <button className={styles.fullButton} type="submit">{editing ? '비용 수정 저장' : '비용 저장'}</button><button className={styles.secondary + ' ' + styles.fullButton} type="button" onClick={cancel}>{editing ? '비용 수정 취소' : '비용 입력 지우기'}</button>
        </fieldset></form>
      </section>
    </div>
  </>;
}
