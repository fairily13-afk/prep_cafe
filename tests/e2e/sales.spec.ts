import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function daily(page: Page, date: string) {
  await page.getByLabel('조회 단위').selectOption('일'); await page.getByLabel('조회 일자').fill(date); await page.getByRole('button', { name: '조회 적용' }).click();
}
async function enter(page: Page, date = '2026-09-19') {
  await page.getByLabel('판매 날짜', { exact: true }).fill(date);
  await page.getByLabel('판매 수량', { exact: true }).fill('10');
  await page.getByLabel('실제 판매 단가').fill('4000');
  await page.getByLabel('총 할인액').fill('1000'); await page.getByLabel('총 결제 수수료').fill('600');
}
test('판매 입력 → 새로고침 → 수정 → 취소 → 삭제 및 실제 IndexedDB 보존', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  await daily(page, '2026-09-19'); await enter(page);
  await expect(page.getByLabel('저장 전 미리보기')).toContainText('순매출');
  await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click();
  await expect(page.getByRole('status')).toContainText('판매 기록을 저장');
  let record = page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody tr');
  await expect(record).toHaveCount(1); await expect(record).toContainText('39,000원');
  await expect(page.getByRole('table', { name: '메뉴 수익성', exact: true }).getByRole('row').filter({ hasText: '아메리카노' })).toContainText('33,432원');
  const id = await record.getAttribute('data-testid');
  await page.reload(); await daily(page, '2026-09-19'); record = page.getByTestId(id!);
  await expect(record).toContainText('39,000원');
  await record.getByRole('button', { name: '수정', exact: true }).click(); await page.getByLabel('판매 수량', { exact: true }).fill('8');
  await page.getByRole('button', { name: '수정 저장' }).click(); await expect(record).toContainText('31,000원');
  await expect(page.getByRole('table', { name: '메뉴 수익성', exact: true }).getByRole('row').filter({ hasText: '아메리카노' })).toContainText('26,426원');
  await record.getByRole('button', { name: '수정', exact: true }).click(); await page.getByLabel('판매 수량', { exact: true }).fill('3');
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '수정 취소' }).click(); await expect(record).toContainText('31,000원');
  page.once('dialog', d => d.dismiss()); await record.getByRole('button', { name: '삭제', exact: true }).click(); await expect(record).toHaveCount(1);
  page.once('dialog', d => d.accept()); await record.getByRole('button', { name: '삭제', exact: true }).click(); await expect(record).toHaveCount(0);
  await page.reload(); await daily(page, '2026-09-19'); await expect(page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('입력 오류·중복 차단, 빈값과 0 구분', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  await enter(page); await page.getByLabel('판매 수량', { exact: true }).fill('0'); await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click();
  await expect(page.getByRole('alert')).toContainText('수량');
  await page.getByLabel('판매 수량', { exact: true }).fill('10'); await page.getByLabel('총 할인액').fill('40001'); await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click(); await expect(page.getByRole('alert')).toContainText('할인');
  await page.getByLabel('총 할인액').fill(''); await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click(); await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('총 할인액').fill('0'); await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click(); await expect(page.getByRole('status')).toContainText('저장');
  await enter(page); await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click(); await expect(page.getByRole('alert')).toContainText('기존 기록을 수정');
  await expect(page.getByLabel('판매 수량', { exact: true })).toHaveValue('10');
});
test('기간 양 끝 포함·검색 소계·미마감·역전 날짜', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  await page.getByLabel('시작일', { exact: true }).fill('2025-07-01'); await page.getByLabel('종료일', { exact: true }).fill('2025-07-02'); await page.getByRole('button', { name: '조회 적용' }).click();
  const dates = await page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody th').allTextContents();
  expect(dates.some(x => x.includes('2025-07-01'))).toBe(true); expect(dates.some(x => x.includes('2025-07-02'))).toBe(true);
  await page.getByLabel('메뉴 검색', { exact: true }).fill('아메리카노'); await expect(page.getByRole('table', { name: '메뉴 수익성', exact: true }).locator('tbody tr')).toHaveCount(1); await expect(page.getByTestId('selected-total')).toContainText('선택 결과');
  await page.getByLabel('시작일', { exact: true }).fill('2025-07-03'); await page.getByRole('button', { name: '조회 적용' }).click(); await expect(page.getByRole('alert')).toContainText('시작일');
  await daily(page, '2026-09-19'); await expect(page.getByText('판매 기록 없음 · 실적 0으로 확정하지 않습니다.', { exact: true })).toBeVisible();
});
test('원가 누락 허용·채널 차이·수수료 초과 확인', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  await daily(page, '2025-06-30'); await enter(page, '2025-06-30');
  await expect(page.getByLabel('저장 전 미리보기')).toContainText('원가 미완성'); await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click(); await expect(page.getByRole('status')).toContainText('수익성은 미완성');
  await expect(page.getByRole('table', { name: '메뉴 수익성', exact: true }).getByRole('row').filter({ hasText: '아메리카노' })).toContainText('미완성');
  await enter(page); await page.getByLabel('판매 구분', { exact: true }).selectOption('포장'); await expect(page.getByLabel('저장 전 미리보기')).not.toContainText('원가 미완성');
  await page.getByLabel('총 결제 수수료').fill('50000'); page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click(); await expect(page.getByLabel('총 결제 수수료')).toHaveValue('50000');
});
test('다른 탭 변경 감지 및 외부 자료 전송 없음', async ({ page, context }) => {
  const requests: string[] = []; page.on('request', r => requests.push(r.url()));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto('/'); await expect(other.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  await enter(other); await other.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click();
  await expect(page.getByRole('button', { name: '최신 자료 다시 조회' })).toBeVisible();
  await page.getByRole('button', { name: '최신 자료 다시 조회' }).click(); await daily(page, '2026-09-19');
  await expect(page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody tr')).toHaveCount(1);
  expect(requests.every(u => u.startsWith('http://127.0.0.1:5173/') || u.startsWith('ws://127.0.0.1:5173/'))).toBe(true);
});
test('실제 브라우저 쓰기 실패 시 입력과 기존 자료 유지', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  await daily(page, '2026-09-19'); await enter(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restoreWrite = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) {
      if (this.name === 'calendar') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click();
  await expect(page.getByRole('alert')).toContainText('저장 공간이 부족');
  await expect(page.getByLabel('판매 수량', { exact: true })).toHaveValue('10');
  await expect(page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody tr')).toHaveCount(0);
  await page.evaluate(() => (window as any).restoreWrite());
  await page.getByRole('button', { name: '판매 기록 추가 및 장부 반영' }).click();
  await expect(page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody tr')).toHaveCount(1);
  await page.reload(); await daily(page, '2026-09-19');
  await expect(page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody tr')).toHaveCount(1);
});
test('화면 크기·초기 로딩·기간 조회 측정', async ({ page }, testInfo) => {
  const started = Date.now();
  await page.goto('/'); await expect(page.getByRole('heading', { name: '판매 기록과 메뉴 수익성', exact: true })).toBeVisible();
  const initialMs = Date.now() - started;
  await page.screenshot({ path: 'test-results/epic1-desktop.png', fullPage: true });
  const queryStart = Date.now(); await daily(page, '2025-07-01');
  await expect(page.getByRole('table', { name: '판매 기록', exact: true }).locator('tbody tr').first()).toContainText('2025-07-01');
  const queryMs = Date.now() - queryStart;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/epic1-mobile.png', fullPage: true });
  const documentFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(documentFits).toBe(true);
  console.log(JSON.stringify({ initialMs, queryFlowMs: queryMs, documentFits }));
  await testInfo.attach('performance', { body: JSON.stringify({ initialMs, queryFlowMs: queryMs, note: '브라우저 조작·대기 포함. 순수 계산 시간과 구분.' }), contentType: 'application/json' });
});
