import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Sale, SaleInput, Snapshot } from './domain/types';
import { D, makeSale, money, percent, saleAmounts, snapshotMismatch, totals } from './domain/calculations';
import { validateInput, validatePeriod } from './domain/validation';
import { database, ensureWasteEvaluation, initialize, load, mutateOperations, mutateSale, readableError } from './data/repository';
import type { OperationsCommand } from './data/repository';
import Costs from './features/Costs';
import Inventory from './features/Inventory';
import styles from './styles/App.module.css';

type Period = { start: string; end: string };
type Screen = 'sales' | 'costs' | 'inventory';
const route = (): Screen => location.hash === '#costs' ? 'costs' : location.hash === '#inventory' ? 'inventory' : 'sales';
const emptyForm = (date = '2026-09-18'): SaleInput => ({ date, menu_id: 'M01', channel: '매장', quantity: '', unit_price: '4000', discount_amount: '0', payment_fee: '0' });
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false); const writing = useRef(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const [form, setForm] = useState<SaleInput>(emptyForm());
  const [editing, setEditing] = useState<Sale>();
  const [dirty, setDirty] = useState(false);
  const [otherDirty, setOtherDirty] = useState(false);
  const [screen, setScreen] = useState<Screen>(route);
  const pendingRequest = useRef<string | null>(null);
  const [period, setPeriod] = useState<Period>({ start: '2026-09-01', end: '2026-09-18' });
  const [draft, setDraft] = useState<Period>(period);
  const [mode, setMode] = useState('기간'); const [day, setDay] = useState('2026-09-18'); const [month, setMonth] = useState('2026-09');
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('전체'); const [sort, setSort] = useState('quantity');
  const [page, setPage] = useState(1);
  const broadcast = useRef<BroadcastChannel | null>(null);
  async function start() {
    setFatal('');
    try {
      const db = await database();
      const existing = await db.get('appMeta', 'active');
      if (!existing) { const source = await import('./data/seed/sample.json'); await initialize(db, source.default); }
      if (await ensureWasteEvaluation(db)) broadcast.current?.postMessage('waste-evaluation');
      setSnapshot(await load(db));
    } catch (e) { setFatal(readableError(e)); }
  }
  useEffect(() => {
    void start();
    const channel = new BroadcastChannel('prep-cafe-changes'); broadcast.current = channel;
    channel.onmessage = () => { setStale(true); setNotice('다른 탭에서 자료가 변경되었습니다. 다시 조회해 주세요.'); };
    const blocked = () => { setStale(true); setError('자료 보관함이 다른 탭에서 변경되었습니다. 이 탭을 새로고침해 주세요.'); };
    window.addEventListener('database-blocked', blocked);
    if (!location.hash) history.replaceState(null, '', '#sales');
    return () => { channel.close(); broadcast.current = null; window.removeEventListener('database-blocked', blocked); };
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty || otherDirty || busy) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before);
  }, [dirty, otherDirty, busy]);
  function navigate(next: Screen) {
    if (next === screen) return;
    if (busy || ((dirty || otherDirty) && !window.confirm('저장하지 않은 입력을 버리고 화면을 이동할까요? 저장된 기록은 유지됩니다.'))) { history.replaceState(null, '', '#' + screen); return; }
    setDirty(false); setOtherDirty(false); setEditing(undefined); setForm(emptyForm(form.date));
    setScreen(next); setError(''); setNotice(''); history.replaceState(null, '', '#' + next);
  }
  useEffect(() => {
    const changed = () => navigate(route());
    window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed);
  }, [screen, dirty, otherDirty, busy]);
  async function execute(command: OperationsCommand, requestId: string) {
    if (!snapshot || writing.current) throw new Error('다른 기록을 저장 중입니다. 완료 후 다시 시도해 주세요.');
    if (stale) throw new Error('다른 탭에서 변경되었습니다. 최신 자료를 다시 조회한 뒤 저장해 주세요.');
    writing.current = true; setBusy(true);
    try {
      const db = await database(); await mutateOperations(db, snapshot, command, requestId);
      const updated = await load(db); setSnapshot(updated); broadcast.current?.postMessage(updated.meta.revision);
    } finally { writing.current = false; setBusy(false); }
  }
  const rows = useMemo(() => snapshot?.data.sales.filter(s => s.date >= period.start && s.date <= period.end) || [], [snapshot, period]);
  const all = useMemo(() => totals(rows), [rows]);
  const menuRows = useMemo(() => {
    const items = (snapshot?.data.menus || []).filter(m => (category === '전체' || m.category === category) && m.name.toLowerCase().includes(search.trim().toLowerCase())).map(m => ({ menu: m, result: totals(rows.filter(s => s.menu_id === m.menu_id)) }));
    items.sort((a, b) => {
      const x = sort === 'profit' ? a.result.profit : sort === 'margin' ? a.result.margin : a.result.qty;
      const y = sort === 'profit' ? b.result.profit : sort === 'margin' ? b.result.margin : b.result.qty;
      return x === null ? (y === null ? 0 : 1) : y === null ? -1 : y.comparedTo(x);
    });
    return items;
  }, [snapshot, rows, category, search, sort]);
  const selectedIds = new Set(menuRows.map(m => m.menu.menu_id));
  const selected = totals(rows.filter(s => selectedIds.has(s.menu_id)));
  const sortedSales = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.menu_id.localeCompare(b.menu_id) || a.channel.localeCompare(b.channel)), [rows]);
  const pageCount = Math.max(1, Math.ceil(sortedSales.length / 50));
  useEffect(() => { setPage(p => Math.min(p, pageCount)); }, [pageCount]);
  const preview = useMemo(() => {
    if (!snapshot) return null;
    try { validateInput(form, snapshot.data); return makeSale(form, snapshot.data, editing); } catch { return null; }
  }, [form, snapshot, editing]);
  const previewAmounts = preview ? saleAmounts(preview) : null;
  function change(key: keyof SaleInput, value: string) {
    pendingRequest.current = null;
    setForm(f => ({ ...f, [key]: value, ...(key === 'menu_id' && !editing ? { unit_price: snapshot?.data.menus.find(m => m.menu_id === value)?.price || '' } : {}) }));
    setDirty(true); setError(''); setNotice('');
  }
  function discard() { return !dirty || window.confirm('작성 중인 변경을 버릴까요? 저장된 기록은 유지됩니다.'); }
  function reset() { if (!discard()) return; pendingRequest.current = null; setForm(emptyForm(form.date)); setEditing(undefined); setDirty(false); setError(''); setNotice(''); }
  function edit(sale: Sale) {
    if (busy || !discard()) return;
    pendingRequest.current = null;
    setEditing(sale); setForm({ date: sale.date, menu_id: sale.menu_id, channel: sale.channel, quantity: sale.quantity, unit_price: sale.unit_price, discount_amount: sale.discount_amount, payment_fee: sale.payment_fee });
    setDirty(false); setError(''); setNotice('');
    document.getElementById('sale-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function refresh() {
    if (writing.current) return;
    writing.current = true; setBusy(true);
    try { setSnapshot(await load(await database())); setStale(false); setNotice('저장된 최신 자료를 다시 읽었습니다. 작성 중인 입력은 유지했습니다.'); }
    catch (e) { setError(readableError(e)); }
    finally { writing.current = false; setBusy(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (!snapshot || writing.current) return;
    setError(''); setNotice('');
    try {
      validateInput(form, snapshot.data);
      if (stale) throw new Error('다른 탭에서 변경되었습니다. 다시 조회한 뒤 저장해 주세요.');
      const duplicate = snapshot.data.sales.some(s => s.sale_id !== editing?.sale_id && s.date === form.date && s.menu_id === form.menu_id && s.channel === form.channel);
      if (duplicate) throw new Error('같은 날짜·메뉴·판매 구분의 기록이 있습니다. 기존 기록을 수정해 주세요.');
      if (D(form.payment_fee).gt(D(form.quantity).times(form.unit_price).minus(form.discount_amount)) && !window.confirm('수수료가 순매출보다 큽니다. 실제 금액이 맞으면 저장할까요?')) return;
      const calendar = snapshot.data.calendar.find(c => c.date === form.date);
      if (calendar && !calendar.is_open && !window.confirm('휴무일로 기록된 날짜입니다. 실제 판매 날짜가 맞으면 저장할까요?')) return;
      writing.current = true; setBusy(true);
      const db = await database();
      pendingRequest.current ??= crypto.randomUUID();
      await mutateSale(db, snapshot, editing ? { kind: 'edit', input: form, id: editing.sale_id } : { kind: 'add', input: form }, pendingRequest.current);
      const updated = await load(db); setSnapshot(updated); broadcast.current?.postMessage(updated.meta.revision);
      setNotice(`${editing ? '판매 기록을 수정' : '판매 기록을 저장'}했습니다. ${form.date}의 마감 확인이 필요합니다.${form.date < period.start || form.date > period.end ? ' 현재 조회 기간 밖의 기록입니다. 조회 날짜를 바꿔 확인하세요.' : ''}${preview?.cost_issues?.length ? ' 원가 근거가 없어 수익성은 미완성입니다.' : ''}`);
      setEditing(undefined); setDirty(false); setForm(emptyForm(form.date));
      pendingRequest.current = null;
    } catch (e) { setError(readableError(e)); }
    finally { writing.current = false; setBusy(false); }
  }
  async function remove(sale: Sale) {
    if (!snapshot || writing.current) return;
    if (stale) { setError('다른 탭에서 변경되었습니다. 다시 조회해 주세요.'); return; }
    const name = snapshot.data.menus.find(m => m.menu_id === sale.menu_id)?.name;
    if (!window.confirm(`${sale.date} · ${name} · ${sale.channel} · ${sale.quantity}개 판매를 삭제할까요?`)) return;
    if (editing?.sale_id === sale.sale_id && !discard()) return;
    writing.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const db = await database(); await mutateSale(db, snapshot, { kind: 'delete', id: sale.sale_id }, crypto.randomUUID());
      const updated = await load(db); setSnapshot(updated); broadcast.current?.postMessage(updated.meta.revision);
      if (editing?.sale_id === sale.sale_id) { setEditing(undefined); setForm(emptyForm(form.date)); setDirty(false); }
      setNotice('판매 기록을 삭제했습니다. 관련 메뉴 수익성과 재료 사용량을 다시 계산합니다. 해당 날짜의 마감 확인이 필요합니다.');
    } catch (e) { setError(readableError(e)); }
    finally { writing.current = false; setBusy(false); }
  }
  function apply(e: FormEvent) {
    e.preventDefault();
    try {
      let next = draft;
      if (mode === '일') next = { start: day, end: day };
      if (mode === '월') {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('조회 월을 입력해 주세요.');
        const [y, m] = month.split('-').map(Number);
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); next = { start: month + '-01', end: month + '-' + String(last).padStart(2, '0') };
      }
      validatePeriod(next.start, next.end); setPeriod(next); setPage(1); setError(''); setNotice('');
    } catch (e) { setError(readableError(e)); }
  }
  if (!snapshot) return <main className={styles.loading}><h1>프렙 카페</h1>{fatal ? <><p role="alert">자료를 준비하지 못했습니다. {fatal}</p><p>기존 자료를 자동 삭제하거나 샘플로 교체하지 않습니다.</p><button onClick={() => void start()}>다시 시도</button></> : <p role="status">보관한 기록을 확인하고 있습니다…</p>}</main>;
  const data = snapshot.data;
  const completed = data.calendar.filter(c => c.date >= period.start && c.date <= period.end && c.record_complete && !c.confirmation_needed).length;
  const days = (Date.parse(period.end + 'T00:00:00Z') - Date.parse(period.start + 'T00:00:00Z')) / 86400000 + 1;
  const periodState = completed === days ? '마감 기록 확인됨' : '미마감·마감 확인 필요 구간 포함';
  const noConfirmedSales = !rows.length && completed !== days;
  const shownSales = sortedSales.slice((page - 1) * 50, page * 50);
  const recentComplete = data.calendar.filter(c => c.record_complete && !c.confirmation_needed).map(c => c.date).sort().at(-1);
  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><span className={styles.logo}>B</span><div>BrewMetrics<small>프렙 카페 운영 기록</small></div></div>
      <div className={styles.store}><small>매장</small><strong>{data.meta.store_name}</strong><span>한 매장 · 한 기기</span></div>
      <nav aria-label="주요 화면">{([{ id: "sales", label: "▤ 판매 기록 & 메뉴 수익성" }, { id: "costs", label: "▣ 운영 비용" }, { id: "inventory", label: "▦ 재료 입고·폐기" }] as const).map(item => <a key={item.id} href={"#" + item.id} aria-current={screen === item.id ? "page" : undefined} onClick={e => { e.preventDefault(); navigate(item.id); }}>{item.label}</a>)}</nav>
      <p className={styles.scope}>EPIC 2 · 비용과 재료 변동 기록<br/>실제 재고 입력·종합 손익 화면·백업·복원은 EPIC 3에서 구현합니다.</p>
      <div className={styles.storage}><span className={styles.dot}/> {busy ? '저장 중…' : stale ? '최신 자료 확인 필요' : '이 브라우저에 보관 중'}<small>가상 샘플 · 부가세 제외<br/>다른 주소·브라우저의 자료는 별도입니다.</small></div>
    </aside>
    <main className={styles.main}>
      <header className={styles.topbar}><span>{data.meta.store_name}</span><div><span className={styles.pill}>단위: 원 · 부가세 제외</span><span className={styles.pill}>가상 매장 샘플</span></div></header>
      <section className={styles.title}><p className={styles.eyebrow}>SALES LEDGER & MENU PROFITABILITY</p><h1>{screen === "sales" ? "판매 기록과 메뉴 수익성" : screen === "costs" ? "운영 비용 관리" : "재료 입고·폐기 기록"}</h1><p>{screen === "sales" ? "판매에서 재료비·포장비·실제 결제 수수료를 뺀 금액을 확인하세요." : screen === "costs" ? "비용이 해당하는 운영 날짜로 기록하고, 기간별 합계를 확인하세요." : "기준 단위로 입고·폐기를 기록하고 잔량 변화와 평가 비용을 확인하세요."}</p></section>
      <div className={styles.messages} aria-live="polite">{error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}{stale && <button onClick={() => void refresh()} disabled={busy}>최신 자료 다시 조회</button>}</div>
      <form className={styles.period} onSubmit={apply}>
        <label>조회 단위<select value={mode} onChange={e => setMode(e.target.value)}><option>일</option><option>월</option><option>기간</option></select></label>
        {mode === '일' ? <label>조회 일자<input type="date" value={day} onChange={e => setDay(e.target.value)}/></label> : mode === '월' ? <label>조회 월<input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label> : <><label>시작일<input type="date" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })}/></label><label>종료일<input type="date" value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })}/></label></>}
        <button type="submit">조회 적용</button>
      </form>
      <div className={styles.coverage}><strong>{period.start} ~ {period.end}</strong><span>{periodState} · 마지막 마감 기록: {recentComplete || '없음'}</span><span>초기 제공 실적 범위: {data.meta.start_date} ~ {data.meta.as_of} · 저장된 판매 {data.sales.length.toLocaleString()}건</span>{!rows.length && <strong>{completed === days ? '확인된 판매 없음 · 판매수량 0' : '판매 기록 없음 · 실적 0으로 확정하지 않습니다.'}</strong>}</div>
      {screen === "sales" ? <><section className={styles.cards} aria-label="전체 기간 합계">
        <Metric title="전체 판매수량" value={noConfirmedSales ? '기록 없음' : all.qty.toNumber().toLocaleString() + '개'} caption={`${rows.length.toLocaleString()}개 집계 기록`}/>
        <Metric title="전체 순매출" value={noConfirmedSales ? '미마감' : money(all.net)} caption="할인 후 매출"/>
        <Metric title="전체 메뉴 이익" value={noConfirmedSales ? '미마감' : all.profit === null ? '미완성' : money(all.profit)} caption={all.missing ? `원가 미완성 ${all.missing}건 · 확인 가능 소계 ${money(all.knownProfit)}` : '운영비 차감 전'}/>
        <Metric title="전체 메뉴 이익률" value={noConfirmedSales ? '계산 불가' : percent(all.margin)} caption="전체 이익 ÷ 전체 순매출"/>
      </section>
      {all.mismatches > 0 && <p className={styles.warning}>당시 순매출과 입력으로 다시 계산한 매출이 다른 기록 {all.mismatches}건입니다. 당시 순매출을 유지했습니다.</p>}
      <section className={styles.panel}>
        <div className={styles.panelHeading}><h2>메뉴별 수익성</h2><span className={styles.pill}>{menuRows.length}개 메뉴</span></div>
        <div className={styles.filters}><label>메뉴 검색<input type="search" placeholder="메뉴명 검색" value={search} onChange={e => setSearch(e.target.value)}/></label><label>분류<select value={category} onChange={e => setCategory(e.target.value)}><option>전체</option><option>음료</option><option>디저트</option></select></label><label>정렬<select value={sort} onChange={e => setSort(e.target.value)}><option value="quantity">판매수량 많은 순</option><option value="profit">메뉴 이익 높은 순</option><option value="margin">이익률 높은 순</option></select></label></div>
        <div className={styles.tableWrap}>{noConfirmedSales ? <p className={styles.empty}>판매 기록이 없는 미마감 기간입니다. 메뉴 실적을 0으로 확정하지 않습니다.</p> : <table aria-label="메뉴 수익성"><thead><tr><th>메뉴</th><th>판매수량</th><th>순매출</th><th>재료비</th><th>포장비</th><th>수수료</th><th>메뉴 이익</th><th>이익률</th><th>기간 평균 판매액/개</th><th>기간 평균 원가/개</th><th>기간 평균 이익/개</th></tr></thead><tbody>{menuRows.map(({ menu, result: t }) => <tr key={menu.menu_id}><th scope="row">{menu.name}<small>{menu.category}{t.qty.isZero() ? ' · 판매 없음' : ''}</small></th><td>{t.qty.toString()}</td><td>{money(t.net)}</td><td>{money(t.food)}{t.missingFood > 0 && <small>확인 가능 소계 · 누락 {t.missingFood}건</small>}</td><td>{money(t.pack)}{t.missingPack > 0 && <small>확인 가능 소계 · 누락 {t.missingPack}건</small>}</td><td>{money(t.fees)}</td><td className={t.profit?.lt(0) ? styles.negative : styles.profit}>{t.profit === null ? `미완성 (${t.missing}건)` : money(t.profit)}</td><td>{percent(t.margin)}</td><td>{t.qty.isZero() ? '판매 없음' : money(t.avgNet)}</td><td>{t.qty.isZero() ? '판매 없음' : money(t.avgCost)}</td><td>{t.qty.isZero() ? '판매 없음' : money(t.avgProfit)}</td></tr>)}</tbody></table>}</div>
        {!menuRows.length && <p className={styles.empty}>검색에 맞는 메뉴가 없습니다.</p>}
        <div className={styles.subtotal} data-testid="selected-total">{noConfirmedSales ? "선택 결과 · 기록 없음 / 미마감" : <>선택 결과 소계 · 판매수량 {selected.qty.toString()}개 · 순매출 {money(selected.net)} · 메뉴 이익 {selected.profit === null ? '미완성' : money(selected.profit)} · 이익률 {percent(selected.margin)}</>}</div>
      </section>
      <div className={styles.bottom}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><h2>저장된 판매 기록</h2><span>{rows.length.toLocaleString()}건 · 날짜별 메뉴·매장/포장 집계</span></div>
          <div className={styles.tableWrap}><table aria-label="판매 기록"><thead><tr><th>날짜 / 메뉴</th><th>구분</th><th>수량</th><th>단가</th><th>총 할인</th><th>총 수수료</th><th>순매출</th><th>관리</th></tr></thead><tbody>{shownSales.map(s => <tr key={s.sale_id} data-testid={`sale-${s.sale_id}`}><th scope="row">{s.date}<small>{data.menus.find(m => m.menu_id === s.menu_id)?.name}</small>{saleAmounts(s).mismatch && <small className={styles.negative}>당시 순매출 불일치</small>}{snapshotMismatch(s, data) && <small className={styles.negative}>당시 원가와 재평가 값 다름 · 당시 값 보존</small>}{(s.unit_food_cost_snapshot === null || s.unit_packaging_cost_snapshot === null) && <small className={styles.negative}>원가 미완성</small>}</th><td>{s.channel}</td><td>{s.quantity}</td><td>{money(s.unit_price)}</td><td>{money(s.discount_amount)}</td><td>{money(s.payment_fee)}</td><td>{money(s.net_sales)}</td><td><div className={styles.rowActions}><button className={styles.secondary} onClick={() => edit(s)} disabled={busy}>수정</button><button className={styles.dangerButton} onClick={() => void remove(s)} disabled={busy}>삭제</button></div></td></tr>)}</tbody></table></div>
          {!rows.length && <p className={styles.empty}>선택 기간에 저장된 판매 기록이 없습니다.</p>}
          <div className={styles.pagination}><button className={styles.secondary} disabled={page === 1} onClick={() => setPage(page - 1)}>이전</button><span>{page} / {pageCount} 페이지 · 한 페이지 최대 50건</span><button className={styles.secondary} disabled={page === pageCount} onClick={() => setPage(page + 1)}>다음</button></div>
        </section>
        <section className={styles.panel} id="sale-form">
          <div className={styles.panelHeading}><h2>{editing ? '판매 기록 수정' : '판매 기록 입력'}</h2></div>
          <form onSubmit={e => void save(e)} noValidate className={styles.saleForm}>
            <fieldset disabled={busy}><label>판매 날짜<input type="date" value={form.date} onChange={e => change('date', e.target.value)} required/></label><label>메뉴<select aria-label="메뉴" value={form.menu_id} onChange={e => change('menu_id', e.target.value)}>{data.menus.map(m => <option value={m.menu_id} key={m.menu_id}>{m.name}</option>)}</select></label><label>판매 구분<select aria-label="판매 구분" value={form.channel} onChange={e => change('channel', e.target.value)}><option>매장</option><option>포장</option></select></label>
              <div className={styles.formGrid}><label>판매 수량<input type="number" min="1" step="1" value={form.quantity} onChange={e => change('quantity', e.target.value)} required placeholder="예: 10"/></label><label>실제 판매 단가 (원/개)<input type="number" min="0" step="1" value={form.unit_price} onChange={e => change('unit_price', e.target.value)} required/></label><label>총 할인액 (원)<input type="number" min="0" step="1" value={form.discount_amount} onChange={e => change('discount_amount', e.target.value)} required/></label><label>총 결제 수수료 (원)<input type="number" min="0" step="1" value={form.payment_fee} onChange={e => change('payment_fee', e.target.value)} required/></label></div>
              <p className={styles.helper}>할인·수수료는 이 기록 전체 금액입니다. 기준 판매가는 참고값이며 실제 단가를 확인하세요.</p>
              <div className={styles.preview} aria-label="저장 전 미리보기">{previewAmounts && preview ? <><strong>저장 전 미리보기</strong><dl><dt>순매출</dt><dd>{money(previewAmounts.net)}</dd><dt>재료비</dt><dd>{money(previewAmounts.food)}</dd><dt>포장비</dt><dd>{money(previewAmounts.packaging)}</dd><dt>수수료</dt><dd>{money(previewAmounts.fees)}</dd><dt>메뉴 이익</dt><dd>{previewAmounts.profit === null ? '원가 미완성' : money(previewAmounts.profit)}</dd><dt>이익률</dt><dd>{percent(previewAmounts.margin)}</dd></dl>{preview.cost_issues?.map(issue => <small key={issue}>{issue}</small>)}</> : <span>필수값을 올바르게 입력하면 계산 결과가 표시됩니다.</span>}</div>
              <button className={styles.fullButton} type="submit">{busy ? '저장 중…' : editing ? '수정 저장' : '판매 기록 추가 및 장부 반영'}</button><button type="button" className={styles.secondary + ' ' + styles.fullButton} onClick={reset}>{editing ? '수정 취소' : '입력 지우기'}</button>
            </fieldset>
          </form>
        </section>
      </div>
      </> : screen === "costs" ? <Costs snapshot={snapshot} period={period} busy={busy} execute={execute} onDirty={setOtherDirty} /> : <Inventory snapshot={snapshot} period={period} busy={busy} execute={execute} onDirty={setOtherDirty} />}
      <footer className={styles.footer}>판매 이익은 매장 운영 손익과 다릅니다. 운영비·폐기 비용을 포함한 손익과 재료 잔량 화면은 후속 EPIC에서 연결합니다.<br/>이 주소와 브라우저를 유지해 사용하세요. 브라우저 자료를 삭제하면 기록이 사라질 수 있습니다.</footer>
    </main>
  </div>;
}
function Metric({ title, value, caption }: { title: string; value: string; caption: string }) {
  return <article className={styles.card}><h2>{title}</h2><strong>{value}</strong><small>{caption}</small></article>;
}
