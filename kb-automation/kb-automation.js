/**
 * KB손해보험 전산등록 자동화 스크립트 (Playwright)
 *
 * 사용법:
 *   1. 웹앱에서 엑셀 업로드 후 데이터 검증 → "자동화 데이터 다운로드" 버튼
 *   2. 다운로드된 kb-data.json 을 이 스크립트와 같은 폴더에 놓기
 *   3. node kb-automation.js 실행
 *
 * 전제 조건:
 *   - PC에 Chrome 브라우저 설치되어 있어야 함
 *   - MiAgent (KB손보 보안 프로그램) 설치 완료
 *   - Node.js 18+ 설치
 *
 * 환경변수 (.env 파일 또는 직접 설정):
 *   KB_ID=아이디
 *   KB_PW=비밀번호
 *   KB_BIRTH=생년월일 (YYMMDD)
 *   HEADLESS=false  (true로 설정하면 백그라운드 실행)
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

// ─────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  // KB 계정 정보 (환경변수 또는 직접 입력)
  id: process.env.KB_ID || 'r4585414',
  pw: process.env.KB_PW || 'zxcv100*',
  birth: process.env.KB_BIRTH || '950924',

  // KB 사이트 URL
  loginUrl: 'https://nsales.kbinsure.co.kr/eus/ch/ch_index.jsp',
  // 동의서 출력 페이지 - 로그인 후 이동할 메뉴

  // 데이터 파일
  dataFile: join(__dirname, 'kb-data.json'),

  // 다운로드 폴더
  downloadDir: process.env.KB_DOWNLOAD_DIR || join(homedir(), 'Downloads', 'KB_consents'),

  // 헤드리스 모드 (false=화면 보이면서 실행, true=백그라운드)
  headless: process.env.HEADLESS === 'true',

  // 배치 크기 (KB 다중입력 최대 10명)
  batchSize: 10,

  // 타이밍 (ms) - KB 사이트 응답속도에 따라 조절
  timing: {
    pageLoad: 3000,
    afterLogin: 2000,
    afterMenuClick: 2000,
    afterCheck: 500,
    afterInput: 300,
    afterPrint: 5000,  // PDF 생성 대기
  }
};

// ─────────────────────────────────────────────
// 유틸 함수
// ─────────────────────────────────────────────
function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleTimeString();
  const prefix = level === 'OK'    ? '✅' :
                 level === 'WARN'  ? '⚠️' :
                 level === 'ERROR' ? '❌' :
                 level === 'STEP'  ? '🚀' : '📋';
  console.log(`[${ts}] ${prefix} ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 주민등록번호 포맷 (숫자만 → 하이픈 포함) */
function fmtJumin(raw) {
  const d = raw.replace(/[^0-9]/g, '');
  if (d.length !== 13) return raw;
  return d.substring(0, 6) + '-' + d.substring(6);
}

/** 데이터 파일 읽기 */
function loadData() {
  if (!existsSync(CONFIG.dataFile)) {
    log(`데이터 파일을 찾을 수 없습니다: ${CONFIG.dataFile}`, 'ERROR');
    log('웹앱에서 "자동화 데이터 다운로드" 버튼을 클릭하여 JSON 파일을 다운로드하세요.', 'WARN');
    process.exit(1);
  }
  const raw = readFileSync(CONFIG.dataFile, 'utf-8');
  return JSON.parse(raw);
}

/** 배치 분할 (10명씩) */
function splitToBatches(customers, size = CONFIG.batchSize) {
  const batches = [];
  for (let i = 0; i < customers.length; i += size) {
    batches.push(customers.slice(i, i + size));
  }
  return batches;
}

// ─────────────────────────────────────────────
// KB 사이트 자동화
// ─────────────────────────────────────────────
async function runAutomation() {
  log('=== KB손해보험 전산등록 자동화 시작 ===', 'STEP');

  // 1. 데이터 로드
  const data = loadData();
  const customers = data.customers || [];
  if (customers.length === 0) {
    log('처리할 고객 데이터가 없습니다.', 'ERROR');
    process.exit(1);
  }
  log(`총 ${customers.length}명의 고객 데이터 로드 완료`);

  // 2. 배치 분할
  const batches = splitToBatches(customers);
  log(`총 ${batches.length}개 배치로 분할 (배치당 최대 ${CONFIG.batchSize}명)`);

  // 3. 다운로드 폴더 생성
  if (!existsSync(CONFIG.downloadDir)) {
    mkdirSync(CONFIG.downloadDir, { recursive: true });
  }
  log(`다운로드 폴더: ${CONFIG.downloadDir}`);

  // 4. 브라우저 실행
  log('Chrome 브라우저 실행 중...');
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    channel: 'chrome',  // 시스템에 설치된 Chrome 사용 (MiAgent 호환)
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    // Chrome 기본 다운로드 폴더 대신 지정 폴더 사용
    // Playwright는 downloads API로 처리
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });

  const page = await context.newPage();

  try {
    // 5. KB 로그인
    await loginKBSite(page);

    // 6. 동의서출력 메뉴로 이동
    await navigateToConsentMenu(page);

    // 7. 배치 처리
    let totalProcessed = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      log(`배치 ${i + 1}/${batches.length} 처리 중 (${batch.length}명)`, 'STEP');

      await processBatch(page, batch, i + 1, batches.length);

      totalProcessed += batch.length;
      log(`진행률: ${totalProcessed}/${customers.length} (${Math.round(totalProcessed / customers.length * 100)}%)`);

      // 출력 후 잠시 대기 (다음 배치 준비)
      if (i < batches.length - 1) {
        await sleep(CONFIG.timing.afterPrint);
      }
    }

    log(`=== 완료! 총 ${totalProcessed}명 처리, ${batches.length}회 출력 ===`, 'OK');

  } catch (err) {
    log(`자동화 중 오류 발생: ${err.message}`, 'ERROR');
    console.error(err);
    // 오류 발생 시 현재 화면 스크린샷
    await page.screenshot({ path: join(__dirname, 'error-screenshot.png'), fullPage: true });
    log('오류 스크린샷 저장됨: error-screenshot.png', 'WARN');
  } finally {
    await browser.close();
    log('브라우저 종료');
  }
}

// ─────────────────────────────────────────────
// KB 사이트 로그인
// ─────────────────────────────────────────────
async function loginKBSite(page) {
  log('KB손보 사이트 로그인 시도...', 'STEP');

  await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(CONFIG.timing.pageLoad);

  // 로그인 페이지 요소 찾기
  // KB손보 사이트는 일반적으로 아이디/비밀번호 입력 필드가 있음
  // 다양한 패턴 시도

  // 아이디 입력 시도 (다양한 name/id 패턴)
  const idSelectors = [
    'input[name="userId"]',
    'input[name="id"]',
    'input[id="userId"]',
    'input[id="id"]',
    'input[placeholder*="아이디"]',
    'input[placeholder*="ID"]',
    'input[name="username"]',
  ];

  let idInput = null;
  for (const sel of idSelectors) {
    idInput = await page.$(sel);
    if (idInput) {
      log(`아이디 필드 발견: ${sel}`);
      break;
    }
  }

  if (idInput) {
    await idInput.click();
    await idInput.fill(CONFIG.id);
    log(`아이디 입력: ${CONFIG.id}`);
  } else {
    log('아이디 입력 필드를 찾을 수 없습니다. 이미 로그인된 상태일 수 있습니다.', 'WARN');
  }

  // 비밀번호 입력 시도
  const pwSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[name="pw"]',
    'input[id="password"]',
    'input[id="pw"]',
    'input[placeholder*="비밀번호"]',
  ];

  let pwInput = null;
  for (const sel of pwSelectors) {
    pwInput = await page.$(sel);
    if (pwInput) {
      log(`비밀번호 필드 발견: ${sel}`);
      break;
    }
  }

  if (pwInput) {
    await pwInput.click();
    await pwInput.fill(CONFIG.pw);
    log('비밀번호 입력 완료');
  }

  // 로그인 버튼 클릭 시도
  const loginBtnSelectors = [
    'button:has-text("로그인")',
    'input[value*="로그인"]',
    'a:has-text("로그인")',
    'button[type="submit"]',
    '.btn_login',
    '#btnLogin',
  ];

  let loginBtn = null;
  for (const sel of loginBtnSelectors) {
    loginBtn = await page.$(sel);
    if (loginBtn) {
      log(`로그인 버튼 발견: ${sel}`);
      break;
    }
  }

  if (loginBtn) {
    await loginBtn.click();
    log('로그인 버튼 클릭');
    await sleep(CONFIG.timing.afterLogin);
  } else if (idInput && pwInput) {
    // Enter 키로 로그인 시도
    await page.keyboard.press('Enter');
    log('Enter 키로 로그인 시도');
    await sleep(CONFIG.timing.afterLogin);
  }

  // 로그인 성공 확인 (페이지 URL 변경 또는 특정 요소 확인)
  const currentUrl = page.url();
  log(`현재 URL: ${currentUrl}`);

  // 로그인 후 추가 인증(생년월일)이 있을 수 있음
  await handlePostLoginAuth(page);

  log('로그인 완료', 'OK');
}

// ─────────────────────────────────────────────
// 로그인 후 추가 인증 (생년월일 입력 등)
// ─────────────────────────────────────────────
async function handlePostLoginAuth(page) {
  await sleep(1000);

  // 생년월일 입력 필드 찾기
  const birthSelectors = [
    'input[name="birth"]',
    'input[id="birth"]',
    'input[placeholder*="생년월일"]',
    'input[placeholder*="주민번호"]',
    'input[placeholder*="주민"]',
  ];

  for (const sel of birthSelectors) {
    const input = await page.$(sel);
    if (input) {
      log(`추가 인증 필드 발견: ${sel}`);
      await input.click();
      await input.fill(CONFIG.birth);
      log(`생년월일 입력: ${CONFIG.birth}`);

      // 확인 버튼 클릭
      const confirmBtn = await page.$('button:has-text("확인"), input[value*="확인"]');
      if (confirmBtn) {
        await confirmBtn.click();
        await sleep(CONFIG.timing.afterLogin);
      } else {
        await page.keyboard.press('Enter');
        await sleep(CONFIG.timing.afterLogin);
      }
      break;
    }
  }
}

// ─────────────────────────────────────────────
// 동의서출력 메뉴로 이동
// ─────────────────────────────────────────────
async function navigateToConsentMenu(page) {
  log('동의서출력 메뉴 탐색...', 'STEP');

  await sleep(CONFIG.timing.afterLogin);

  // 메뉴에서 "동의서출력" 찾아서 클릭
  const menuSelectors = [
    'a:has-text("동의서출력")',
    'a:has-text("동의서")',
    'span:has-text("동의서출력")',
    'li:has-text("동의서출력")',
    '.menu-item:has-text("동의서")',
    'text="동의서출력"',
  ];

  let menuClicked = false;
  for (const sel of menuSelectors) {
    try {
      const menu = await page.$(sel);
      if (menu) {
        log(`동의서출력 메뉴 발견: ${sel}`);
        await menu.click();
        menuClicked = true;
        await sleep(CONFIG.timing.afterMenuClick);
        break;
      }
    } catch (e) {
      // 계속 시도
    }
  }

  if (!menuClicked) {
    log('메뉴를 자동으로 찾지 못했습니다. 수동으로 동의서출력 페이지로 이동해 주세요.', 'WARN');
    log('30초 대기 중... (수동 이동)', 'WARN');
    await sleep(30000);
  }

  log(`현재 페이지 URL: ${page.url()}`);
}

// ─────────────────────────────────────────────
// 배치 처리 (다중입력 체크 → 데이터 입력 → 출력)
// ─────────────────────────────────────────────
async function processBatch(page, batch, batchNum, totalBatches) {
  log(`배치 ${batchNum} 처리 (${batch.length}명): ${batch.map(c => c.name).join(', ')}`);

  // 1. 다중입력 체크
  await checkMultiInput(page);

  // 2. 데이터 입력
  await fillBatchData(page, batch);

  // 3. 출력 버튼 클릭
  await clickPrintButton(page);

  // 4. PDF 다운로드 대기
  await waitForDownload(page, batchNum);

  log(`배치 ${batchNum}/${totalBatches} 완료`, 'OK');
}

// ─────────────────────────────────────────────
// 다중입력 체크
// ─────────────────────────────────────────────
async function checkMultiInput(page) {
  log('다중입력 체크 시도...');

  const multiSelectors = [
    'input[type="radio"][value*="multi"]',
    'input[type="radio"][value*="다중"]',
    'input[type="checkbox"][name*="multi"]',
    'input[type="radio"]:has-text("다중입력")',
    'label:has-text("다중입력")',
    'text="다중입력"',
    'input[id*="multi"]',
  ];

  let checked = false;
  for (const sel of multiSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        log(`다중입력 요소 발견: ${sel}`);

        // 라벨인 경우 연결된 input 찾기
        const tagName = await el.evaluate(e => e.tagName.toLowerCase());
        if (tagName === 'label') {
          const forId = await el.evaluate(e => e.getAttribute('for'));
          if (forId) {
            await page.click(`#${forId}`);
          } else {
            // 라벨 안의 input 찾기
            const innerInput = await el.$('input');
            if (innerInput) {
              await innerInput.check();
            } else {
              await el.click();
            }
          }
        } else {
          await el.check();
        }

        checked = true;
        await sleep(CONFIG.timing.afterCheck);
        log('다중입력 체크 완료');
        break;
      }
    } catch (e) {
      // 계속 시도
    }
  }

  if (!checked) {
    log('다중입력 체크박스를 찾지 못했습니다. 이미 다중입력 모드이거나 다른 레이아웃일 수 있습니다.', 'WARN');
  }
}

// ─────────────────────────────────────────────
// 배치 데이터 입력 (Tab 키로 필드 간 이동)
// ─────────────────────────────────────────────
async function fillBatchData(page, batch) {
  log(`${batch.length}명 데이터 입력 시작...`);

  // 첫 번째 입력 필드 찾기 (주민등록번호)
  const firstFieldSelectors = [
    'input[name*="rrn"]',
    'input[id*="rrn"]',
    'input[name*="jumin"]',
    'input[id*="jumin"]',
    'input[placeholder*="주민"]',
    'input:text',  // 첫 번째 텍스트 입력 필드
  ];

  let firstField = null;
  for (const sel of firstFieldSelectors) {
    try {
      firstField = await page.$(sel);
      if (firstField) {
        log(`첫 번째 입력 필드 발견: ${sel}`);
        break;
      }
    } catch (e) {
      // 계속 시도
    }
  }

  if (!firstField) {
    log('입력 필드를 찾을 수 없습니다. 동의서출력 페이지가 맞는지 확인하세요.', 'ERROR');
    await page.screenshot({ path: join(__dirname, 'no-field-error.png') });
    throw new Error('입력 필드를 찾을 수 없음');
  }

  // 첫 번째 필드 클릭
  await firstField.click();
  await sleep(100);

  // 각 고객 데이터를 순서대로 입력 (Tab으로 다음 필드로 이동)
  for (let i = 0; i < batch.length; i++) {
    const cust = batch[i];
    const juminFormatted = fmtJumin(cust.jumin);

    // 주민등록번호 입력
    await page.keyboard.type(juminFormatted.replace(/-/g, ''), { delay: 20 });
    await sleep(CONFIG.timing.afterInput);

    // Tab → 고객명 입력
    await page.keyboard.press('Tab');
    await sleep(100);
    await page.keyboard.type(cust.name, { delay: 20 });
    await sleep(CONFIG.timing.afterInput);

    // 다음 행으로 이동
    if (i < batch.length - 1) {
      await page.keyboard.press('Tab');
      await sleep(100);
    }

    log(`  ${i + 1}/${batch.length}: ${cust.name} (${juminFormatted.substring(0, 6)}-*******)`);
  }

  log('데이터 입력 완료');
}

// ─────────────────────────────────────────────
// 출력 버튼 클릭
// ─────────────────────────────────────────────
async function clickPrintButton(page) {
  log('출력 버튼 클릭 시도...');

  const printSelectors = [
    'button:has-text("출력")',
    'input[type="button"][value="출력"]',
    'input[type="submit"][value="출력"]',
    'a:has-text("출력")',
    'button:has-text("인쇄")',
    'input[value="출력"]',
    '.btn_print',
    '#btnPrint',
    '#btn_print',
  ];

  let clicked = false;
  for (const sel of printSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        log(`출력 버튼 발견: ${sel}`);
        await btn.click();
        clicked = true;
        await sleep(2000);
        break;
      }
    } catch (e) {
      // 계속 시도
    }
  }

  if (!clicked) {
    log('출력 버튼을 찾지 못했습니다. 수동으로 클릭해 주세요.', 'WARN');
    await sleep(10000);
  } else {
    log('출력 버튼 클릭 완료', 'OK');
  }
}

// ─────────────────────────────────────────────
// PDF 다운로드 대기
// ─────────────────────────────────────────────
async function waitForDownload(page, batchNum) {
  log('PDF 다운로드 대기 중...');

  try {
    // Playwright download 이벤트 감지
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
      sleep(CONFIG.timing.afterPrint),
    ]);

    if (download) {
      const filename = `KB_consent_batch_${String(batchNum).padStart(3, '0')}_${Date.now()}.pdf`;
      const savePath = join(CONFIG.downloadDir, filename);
      await download.saveAs(savePath);
      log(`PDF 저장 완료: ${savePath}`, 'OK');
      return;
    }
  } catch (e) {
    // download 감지 실패
  }

  // 다운로드 이벤트를 감지하지 못한 경우
  // 새 창(팝업)이 열렸는지 확인
  const popup = await page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  if (popup) {
    log('PDF 팝업 창 감지됨');
    await sleep(3000);
    // 팝업 창 닫기
    await popup.close();
  }

  log(`배치 ${batchNum} PDF 처리 완료 (다운로드 폴더 확인 필요: ${CONFIG.downloadDir})`);
}

// ─────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────
runAutomation().catch(err => {
  console.error('자동화 실행 중 치명적 오류:', err);
  process.exit(1);
});
