import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function daily(page: Page, date = '2026-09-19') { await page.getByLabel('조회 단위').selectOption('일'); await page.getByLabel('조회 일자').fill(date); await page.getByRole('button', { name: '조회 적용' }).click(); }
async function costs(page: Page) { await page.goto('/#costs'); await expect(page.getByRole('heading', { name: '운영 비용 관리', exact: true })).toBeVisible(); await daily(page); }
async function costInput(page: Page, amount = '12000') { await page.getByLabel('비용 귀속일', { exact: true }).fill('2026-09-19'); await page.getByLabel('비용 항목', { exact: true }).selectOption('광고비'); await page.getByLabel('비용 금액').fill(amount); }
async function inventory(page: Page) { await page.goto('/#inventory'); await expect(page.getByRole('heading', { name: '재료 입고·폐기 기록', exact: true })).toBeVisible(); await daily(page); }
async function receiptInput(page: Page, quantity = '1000', date = '2026-09-19') { await page.getByLabel('기록 날짜').fill(date); await page.getByLabel('기록할 재료', { exact: true }).selectOption('I01'); await page.getByLabel('재료 수량', { exact: true }).fill(quantity); await page.getByLabel('입고단가', { exact: true }).fill('24.84'); }
const costTable = (page: Page) => page.getByRole('table', { name: '운영 비용 기록', exact: true });
const eventTable = (page: Page) => page.getByRole('table', { name: '재료 변동 기록', exact: true });

test('비용 입력·수정·기간 이동·취소·삭제·새로고침', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await costs(page); await costInput(page); await page.getByRole('button', { name: '비용 저장', exact: true }).click();
  let row = costTable(page).locator('tbody tr'); await expect(row).toHaveCount(1); await expect(row).toContainText('12,000원'); await expect(page.getByTestId('expense-period-total')).toHaveText('12,000원');
  await row.getByRole('button', { name: '수정', exact: true }).click(); await page.getByLabel('비용 금액').fill('15000'); await page.getByRole('button', { name: '비용 수정 저장' }).click(); await expect(row).toContainText('15,000원');
  await page.reload(); await daily(page); row = costTable(page).locator('tbody tr'); await expect(row).toHaveCount(1); await expect(row).toContainText('15,000원');
  await row.getByRole('button', { name: '수정', exact: true }).click(); await page.getByLabel('비용 귀속일').fill('2026-10-01'); await page.getByRole('button', { name: '비용 수정 저장' }).click(); await expect(row).toHaveCount(0);
  await daily(page, '2026-10-01'); await expect(row).toHaveCount(1); await expect(row).toContainText('15,000원');
  await row.getByRole('button', { name: '수정', exact: true }).click(); await page.getByLabel('비용 금액').fill('999'); page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '비용 수정 취소' }).click(); await expect(row).toContainText('15,000원');
  page.once('dialog', d => d.dismiss()); await row.getByRole('button', { name: '삭제', exact: true }).click(); await expect(row).toHaveCount(1);
  page.once('dialog', d => d.accept()); await row.getByRole('button', { name: '삭제', exact: true }).click(); await expect(row).toHaveCount(0);
  await page.reload(); await daily(page, '2026-10-01'); await expect(row).toHaveCount(0); expect(errors).toEqual([]);
});
test('비용 동일 기록 확인·0 허용·오류 차단·페이지와 필터', async ({ page }) => {
  await costs(page); await costInput(page); await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(1);
  await costInput(page); page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(1);
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(2); await expect(page.getByTestId('expense-period-total')).toHaveText('24,000원');
  for (const amount of ['', '-1', '1.5']) { await page.getByLabel('비용 금액').fill(amount); await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(costTable(page).locator('tbody tr')).toHaveCount(2); }
  await page.getByLabel('비용 금액').fill('0'); await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('조회 단위').selectOption('기간'); await page.getByLabel('시작일', { exact: true }).fill('2025-07-01'); await page.getByLabel('종료일', { exact: true }).fill('2025-07-07'); await page.getByRole('button', { name: '조회 적용' }).click();
  await expect(costTable(page).locator('tbody tr')).toHaveCount(50); await page.getByRole('button', { name: '다음', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(6);
  await page.getByLabel('비용 항목 검색', { exact: true }).selectOption('광고비'); await expect(costTable(page).locator('tbody tr')).toHaveCount(7);
  await page.getByLabel('목록 귀속일', { exact: true }).fill('2025-07-01'); await expect(costTable(page).locator('tbody tr')).toHaveCount(1);
});
test('입고·폐기 실제 저장, 잔량 +1000 -100, 평가 2484원, 구매비 중복 없음', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await inventory(page); const base = parseFloat((await page.getByTestId('material-balance').textContent())!);
  await receiptInput(page); await expect(page.getByLabel('재료 기록 미리보기')).toContainText('24,840원');
  await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(eventTable(page).locator('tbody tr')).toHaveCount(1); await expect(page.getByTestId('material-balance')).toHaveText(`${base + 1000} g`);
  await page.getByRole('button', { name: '폐기 등록', exact: true }).click(); await page.getByLabel('재료 수량', { exact: true }).fill('100'); await page.getByLabel('기록 사유', { exact: true }).fill('유통기한 경과');
  await expect(page.getByLabel('재료 기록 미리보기')).toContainText('2,484원'); await page.getByRole('button', { name: '폐기 저장', exact: true }).click();
  await expect(eventTable(page).locator('tbody tr')).toHaveCount(2); await expect(eventTable(page).locator('tbody tr').filter({ hasText: '폐기' })).toContainText('-100 g'); await expect(eventTable(page).locator('tbody tr').filter({ hasText: '폐기' })).toContainText('2,484원'); await expect(page.getByTestId('material-balance')).toHaveText(`${base + 900} g`);
  await page.reload(); await daily(page); await expect(eventTable(page).locator('tbody tr')).toHaveCount(2); await expect(page.getByTestId('material-balance')).toHaveText(`${base + 900} g`);
  await page.getByRole('link', { name: '▣ 운영 비용', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(0); await expect(page.getByTestId('expense-period-total')).toHaveText('기록 없음'); expect(errors).toEqual([]);
});
test('재료 중복 확인·입력 오류·누락 가격·음수 잔량', async ({ page }) => {
  await inventory(page); await receiptInput(page, '0'); await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('수량');
  await receiptInput(page); await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(eventTable(page).locator('tbody tr')).toHaveCount(1);
  await receiptInput(page); page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(eventTable(page).locator('tbody tr')).toHaveCount(1);
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(eventTable(page).locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: '폐기 등록', exact: true }).click(); await page.getByLabel('재료 수량', { exact: true }).fill('100'); await page.getByRole('button', { name: '폐기 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('사유');
  await page.getByLabel('기록 사유', { exact: true }).fill('확인'); await page.getByLabel('기록 날짜').fill('2025-06-30'); await expect(page.getByLabel('재료 기록 미리보기')).toContainText('원가 미완성'); await page.getByRole('button', { name: '폐기 저장', exact: true }).click(); await expect(page.getByRole('status')).toContainText('손익은 미완성');
  await daily(page, '2025-06-30'); await expect(eventTable(page).locator('tbody tr')).toContainText('원가 미완성'); await expect(page.getByTestId('material-balance')).toHaveText('계산 불가');
  await daily(page); await page.getByLabel('기록 날짜').fill('2026-09-19'); await page.getByLabel('재료 수량', { exact: true }).fill('1000000'); await page.getByLabel('기록 사유', { exact: true }).fill('실제 폐기 확인'); await page.getByRole('button', { name: '폐기 저장', exact: true }).click(); await expect(page.getByTestId('material-balance')).toContainText('-'); await expect(page.getByRole('alert')).toContainText('음수');
});
test('비용·재료 저장 실패 보존, 재시도, 화면 이동 취소와 다른 탭 충돌', async ({ page, context }) => {
  await costs(page); await costInput(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).restoreWrite = () => { IDBObjectStore.prototype.put = original; }; IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) { if (this.name === 'calendar') throw new DOMException('full', 'QuotaExceededError'); return original.call(this, value, key); }; });
  await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('저장 공간'); await expect(page.getByLabel('비용 금액')).toHaveValue('12000'); await expect(costTable(page).locator('tbody tr')).toHaveCount(0);
  page.once('dialog', d => d.dismiss()); await page.getByRole('link', { name: '▦ 재료 입고·폐기', exact: true }).click(); await expect(page.getByRole('heading', { name: '운영 비용 관리', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).restoreWrite()); await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: '▦ 재료 입고·폐기', exact: true }).click(); await receiptInput(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).restoreWrite = () => { IDBObjectStore.prototype.put = original; }; IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) { if (this.name === 'calendar') throw new DOMException('full', 'QuotaExceededError'); return original.call(this, value, key); }; });
  await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('저장 공간'); await expect(page.getByLabel('재료 수량', { exact: true })).toHaveValue('1000'); await expect(eventTable(page).locator('tbody tr')).toHaveCount(0); await page.evaluate(() => (window as any).restoreWrite());
  const other = await context.newPage(); await costs(other); await costInput(other, '500'); await other.getByRole('button', { name: '비용 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '최신 자료 다시 조회' })).toBeVisible(); await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('다른 탭'); await expect(page.getByLabel('재료 수량', { exact: true })).toHaveValue('1000');
  await page.getByRole('button', { name: '최신 자료 다시 조회' }).click(); await page.getByRole('button', { name: '입고 저장', exact: true }).click(); await expect(eventTable(page).locator('tbody tr')).toHaveCount(1);
});
test('EPIC 2 화면·속도와 외부 전송 없음', async ({ page }, testInfo) => {
  const requests: string[] = []; page.on('request', r => requests.push(r.url())); const started = Date.now(); await costs(page); const initialMs = Date.now() - started;
  await costInput(page); const saveStarted = Date.now(); await page.getByRole('button', { name: '비용 저장', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(1); const saveFlowMs = Date.now() - saveStarted;
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/epic2-costs-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '▦ 재료 입고·폐기', exact: true }).click(); await receiptInput(page); await expect(page.getByLabel('재료 기록 미리보기')).toContainText('24,840원');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/epic2-inventory-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/epic2-inventory-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(requests.every(r => r.startsWith('http://127.0.0.1:5173/'))).toBe(true);
  console.log(JSON.stringify({ epic: 2, initialMs, saveFlowMs })); await testInfo.attach('epic2-performance', { body: JSON.stringify({ initialMs, saveFlowMs, note: '브라우저 조작·대기 포함' }), contentType: 'application/json' });
});
test('비용 목록 마지막 페이지의 마지막 기록 삭제 후 유효한 페이지로 이동', async ({ page }) => {
  await costs(page); await page.getByLabel('조회 단위').selectOption('기간'); await page.getByLabel('시작일', { exact: true }).fill('2025-07-01'); await page.getByLabel('종료일', { exact: true }).fill('2025-07-07'); await page.getByRole('button', { name: '조회 적용' }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click(); await expect(costTable(page).locator('tbody tr')).toHaveCount(6);
  for (let remaining = 6; remaining > 0; remaining--) {
    page.once('dialog', d => d.accept()); await costTable(page).locator('tbody tr').last().getByRole('button', { name: '삭제', exact: true }).click();
    await expect(costTable(page).locator('tbody tr')).toHaveCount(remaining === 1 ? 50 : remaining - 1);
  }
  await expect(page.getByRole('button', { name: '이전', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
});
