/**
 * KB손해보험 전산등록 완전 자동화 스크립트 (Playwright)
 *
 * 기능:
 *   - 엑셀(.xlsx) 파일 직접 읽기 → 데이터 파싱
 *   - KB 전산 시스템 로그인 (ID/PW/생년월일)
 *   - 동의서출력 메뉴 자동 네비게이션
 *   - 다중입력 모드 → 고객 데이터 자동 입력
 *   - 출력 버튼 클릭 → PDF 자동 다운로드 / 로컬 저장
 *
 * 사용법:
 *   1. npm install (playwright + xlsx)
 *   2. .env 파일에 KB 계정 정보 설정
 *   3. 데이터 폴더에 .xlsx 파일 복사
 *   4. node kb-automation.js 실행
 *
 * 전제 조건:
 *   - PC에 Chrome 브라우저 설치
 *   - MiAgent (KB손보 보안 프로그램) 설치 완료
 *   - Node.js 18+
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import XLSX from 'xlsx';

// ─────────────────────────────────────────────
// 환경 설정
// ─────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * .env 파일에서 환경변수 로드 (간단한 파서)
 */
function loadEnvFile() {
  const envPath = join(__dirname, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}
loadEnvFile();

const CONFIG = {
  // ===== KB 계정 정보 =====
  id: process.env.KB_ID || 'r4585414',
  pw: process.env.KB_PW || '',
  birth: process.env.KB_BIRTH || '',

  // ===== KB 사이트 URL =====
  loginUrl: 'https://nsales.kbinsure.co.kr/eus/ch/ch_index.jsp',
  // 로그인 후 이동할 동의서출력 메뉴 URL (알고 있다면 직접 지정)
  consentMenuUrl: process.env.KB_CONSENT_URL || '',

  // ===== 데이터 파일 (엑셀 직접 읽기) =====
  dataDir: process.env.KB_DATA_DIR || join(__dirname, 'data'),
  dataFile: process.env.KB_DATA_FILE || '',

  // ===== 다운로드 폴더 =====
  downloadDir: process.env.KB_DOWNLOAD_DIR || join(homedir(), 'Downloads', 'KB_consents'),

  // ===== 실행 모드 =====
  headless: process.env.HEADLESS === 'true',        // true: 백그라운드
  slowMo: parseInt(process.env.SLOW_MO || '0'),     // 디버깅용 슬로우 모션 (ms)
  debug: process.env.DEBUG === 'true',               // 디버그 모드

  // ===== 배치 크기 =====
  batchSize: parseInt(process.env.BATCH_SIZE || '4'),  // KB 다중입력 제한에 맞춰 조정

  // ===== 타이밍 (ms) =====
  timing: {
    pageLoad: parseInt(process.env.TIMING_PAGE_LOAD || '3000'),
    afterLogin: parseInt(process.env.TIMING_AFTER_LOGIN || '3000'),
    afterMenuClick: parseInt(process.env.TIMING_AFTER_MENU || '2000'),
    afterCheck: parseInt(process.env.TIMING_AFTER_CHECK || '500'),
    afterInput: parseInt(process.env.TIMING_AFTER_INPUT || '300'),
    afterPrint: parseInt(process.env.TIMING_AFTER_PRINT || '6000'),
    retryDelay: parseInt(process.env.TIMING_RETRY || '2000'),
  },

  // ===== 최대 재시도 횟수 =====
  maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
};

// ─────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────
function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleTimeString();
  const prefix =
    level === 'OK'    ? '✅' :
    level === 'WARN'  ? '⚠️' :
    level === 'ERROR' ? '❌' :
    level === 'STEP'  ? '🚀' :
    level === 'DEBUG' ? '🔍' : '📋';
  const line = `[${ts}] ${prefix} ${msg}`;
  console.log(line);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 주민등록번호 포맷 (숫자만 → 하이픈 포함) */
function fmtJumin(raw) {
  const d = String(raw).replace(/[^0-9]/g, '');
  if (d.length !== 13) return d;
  return d.substring(0, 6) + '-' + d.substring(6);
}

/** 전화번호 포맷 (010-XXXX-XXXX) */
function fmtPhone(raw) {
  const d = String(raw).replace(/[^0-9]/g, '');
  if (d.length === 11) return d.substring(0,3) + '-' + d.substring(3,7) + '-' + d.substring(7);
  if (d.length === 10) return d.substring(0,3) + '-' + d.substring(3,6) + '-' + d.substring(6);
  return raw;
}

/** 타임스탬프 (YYYYMMDD-HHmmss) */
function timestamp() {
  const now = new Date();
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${Y}${M}${D}-${h}${m}${s}`;
}

// ─────────────────────────────────────────────
// 엑셀 파일 읽기
// ─────────────────────────────────────────────
function findExcelFile() {
  // 1. 명시적 파일 경로가 있으면 사용
  if (CONFIG.dataFile && existsSync(CONFIG.dataFile)) {
    return CONFIG.dataFile;
  }

  // 2. data 디렉토리에서 .xlsx 파일 찾기
  if (existsSync(CONFIG.dataDir)) {
    const { readdirSync } = await_import('fs');
    // 동적 import 는 이미 top-level 에서 import 했으므로 필요 없음
  }
  return null;
}

function loadExcelData(filePath) {
  log(`엑셀 파일 읽기: ${filePath}`);

  if (!existsSync(filePath)) {
    log(`파일을 찾을 수 없습니다: ${filePath}`, 'ERROR');
    return null;
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    log('엑셀 파일에 시트가 없습니다.', 'ERROR');
    return null;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  log(`총 ${rows.length}행 발견 (헤더 포함)`);

  // 헤더 감지 및 데이터 추출
  const customers = [];
  let headerDetected = false;

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    const colA = String(row[0] || '').trim();
    const colB = String(row[1] || '').trim();
    const colC = String(row[2] || '').trim();

    // 주민등록번호 패턴 (13자리 숫자 또는 하이픈 포함)
    const juminPattern = /^[\d]{6}-?[\d]{7}$/;

    if (juminPattern.test(colA.replace(/-/g, '')) || juminPattern.test(colA)) {
      headerDetected = true;
      // colB = 이름, colC = 연락처
      const jumin = colA.replace(/-/g, '');
      const name = colB;
      const phone = fmtPhone(colC);

      if (jumin.length === 13) {
        customers.push({ jumin, name, phone, row: customers.length + 1 });
      }
    } else if (!headerDetected) {
      // 헤더 행으로 간주하고 건너뜀
      log(`헤더 행 감지: ${colA}, ${colB}, ${colC}`, 'DEBUG');
    }
  }

  log(`유효한 고객 데이터 ${customers.length}건 추출 완료`);
  return customers;
}

/** 데이터 디렉토리에서 모든 .xlsx 파일 찾기 */
function findAllExcelFiles() {
  const { readdirSync } = await_import2();
  if (!existsSync(CONFIG.dataDir)) return [];
  try {
    return readdirSync(CONFIG.dataDir)
      .filter(f => extname(f).toLowerCase() === '.xlsx')
      .map(f => join(CONFIG.dataDir, f));
  } catch (e) {
    return [];
  }
}

// fs.readdirSync 를 위한 헬퍼 (top-level import 대체)
function await_import2() {
  // 이미 fs를 top-level에서 import 했으므로 그대로 사용
  return { readdirSync: (await import('fs')).readdirSync };
}


/** 배치 분할 */
function splitToBatches(customers, size = CONFIG.batchSize) {
  const batches = [];
  for (let i = 0; i < customers.length; i += size) {
    batches.push(customers.slice(i, i + size));
  }
  return batches;
}

// ─────────────────────────────────────────────
// 메인 자동화 실행
// ─────────────────────────────────────────────
async function runAutomation() {
  log('══════════════════════════════════════════', 'STEP');
  log('  KB손해보험 전산등록 완전 자동화 시작', 'STEP');
  log('══════════════════════════════════════════', 'STEP');

  // 1. 엑셀 데이터 로드
  let filePath = CONFIG.dataFile;
  if (!filePath || !existsSync(filePath)) {
    // data 폴더에서 자동 검색
    const excelFiles = findAllExcelFiles();
    if (excelFiles.length === 0) {
      log('엑셀(.xlsx) 파일을 찾을 수 없습니다.', 'ERROR');
      log(`data 폴더(${CONFIG.dataDir})에 .xlsx 파일을 넣어주세요.`, 'WARN');
      log('또는 KB_DATA_FILE 환경변수로 파일 경로를 지정하세요.', 'WARN');
      process.exit(1);
    }
    filePath = excelFiles[0];
    if (excelFiles.length > 1) {
      log(`여러 엑셀 파일 발견. 첫 번째 파일 사용: ${basename(filePath)}`, 'WARN');
      excelFiles.slice(1).forEach(f => log(`  무시됨: ${basename(f)}`, 'WARN'));
    }
  }

  const customers = loadExcelData(filePath);
  if (!customers || customers.length === 0) {
    log('처리할 고객 데이터가 없습니다.', 'ERROR');
    process.exit(1);
  }

  // 2. 배치 분할
  const batches = splitToBatches(customers);
  log(`총 ${customers.length}명 → ${batches.length}개 배치 (배치당 최대 ${CONFIG.batchSize}명)`);

  // 3. 다운로드 폴더 생성
  if (!existsSync(CONFIG.downloadDir)) {
    mkdirSync(CONFIG.downloadDir, { recursive: true });
  }
  log(`다운로드 폴더: ${CONFIG.downloadDir}`);

  // 4. 브라우저 실행
  log('Chrome 브라우저 실행 중...');
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    channel: 'chrome',
    slowMo: CONFIG.slowMo,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      // 다운로드 팝업 없이 바로 저장
      '--disable-popup-blocking',
    ],
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    // 추가 권한
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  const page = await context.newPage();

  // 디버그 모드: 콘솔 로그 캡처
  if (CONFIG.debug) {
    page.on('console', msg => log(`[BROWSER] ${msg.type()}: ${msg.text()}`, 'DEBUG'));
    page.on('pageerror', err => log(`[PAGE ERROR] ${err.message}`, 'ERROR'));
  }

  // 다운로드 이벤트 전역 리스너
  page.on('download', async (download) => {
    const suggestedName = download.suggestedFilename();
    const batchLabel = currentBatchLabel || 'unknown';
    const ext = extname(suggestedName) || '.pdf';
    const filename = `KB_${batchLabel}_${timestamp()}${ext}`;
    const savePath = join(CONFIG.downloadDir, filename);
    await download.saveAs(savePath);
    log(`PDF 저장됨: ${filename}`, 'OK');
    downloadedFiles.push(savePath);
  });

  let currentBatchLabel = '';
  const downloadedFiles = [];

  try {
    // 5. KB 로그인
    await loginKBSite(page);

    // 6. 동의서출력 메뉴로 이동
    await navigateToConsentMenu(page);

    // 7. 배치 처리
    let totalProcessed = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      currentBatchLabel = `batch${String(i + 1).padStart(3, '0')}`;
      log(`\n────────────────────────────────────────`, 'STEP');
      log(`배치 ${i + 1}/${batches.length} 처리 (${batch.length}명)`, 'STEP');
      log(`────────────────────────────────────────`, 'STEP');

      const success = await processBatchWithRetry(page, batch, i + 1, batches.length);

      if (success) {
        totalProcessed += batch.length;
      } else {
        totalFailed += batch.length;
        log(`배치 ${i + 1} 처리 실패. 다음 배치로 진행합니다.`, 'WARN');
      }

      log(`진행률: ${totalProcessed}/${customers.length} 완료, ${totalFailed} 실패 (${Math.round((totalProcessed + totalFailed) / customers.length * 100)}%)`);

      // 배치 간 대기
      if (i < batches.length - 1) {
        await sleep(CONFIG.timing.afterPrint);
      }
    }

    // 8. 결과 요약
    log('\n══════════════════════════════════════════', 'STEP');
    log(`  처리 완료!`, 'OK');
    log(`  총 ${customers.length}명 중 ${totalProcessed}명 성공, ${totalFailed}명 실패`, totalFailed === 0 ? 'OK' : 'WARN');
    log(`  PDF 저장 위치: ${CONFIG.downloadDir}`, 'INFO');
    if (downloadedFiles.length > 0) {
      log(`  저장된 파일 ${downloadedFiles.length}개:`, 'OK');
      downloadedFiles.forEach(f => log(`    ${basename(f)}`));
    }
    log('══════════════════════════════════════════', 'STEP');

    // 처리 결과 리포트 저장
    saveReport(customers.length, totalProcessed, totalFailed, downloadedFiles);

  } catch (err) {
    log(`자동화 중 치명적 오류: ${err.message}`, 'ERROR');
    console.error(err);
    const screenshotPath = join(__dirname, `error-${timestamp()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    log(`오류 스크린샷: ${screenshotPath}`, 'WARN');
  } finally {
    await browser.close();
    log('브라우저 종료됨');
  }
}

// ─────────────────────────────────────────────
// 재시도 로직이 포함된 배치 처리
// ─────────────────────────────────────────────
async function processBatchWithRetry(page, batch, batchNum, totalBatches) {
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        log(`재시도 ${attempt}/${CONFIG.maxRetries}...`, 'WARN');
        await sleep(CONFIG.timing.retryDelay);
        // 페이지 새로고침 후 메뉴 다시 이동
        await page.reload({ waitUntil: 'networkidle' });
        await sleep(CONFIG.timing.pageLoad);
        await navigateToConsentMenu(page);
      }

      await processBatch(page, batch, batchNum, totalBatches);
      return true;
    } catch (err) {
      log(`배치 ${batchNum} 처리 오류 (시도 ${attempt + 1}): ${err.message}`, 'ERROR');
      if (CONFIG.debug) console.error(err);

      const screenshotPath = join(__dirname, `error-batch${batchNum}-attempt${attempt}-${timestamp()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      log(`오류 스크린샷: ${screenshotPath}`, 'DEBUG');
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// KB 사이트 로그인
// ─────────────────────────────────────────────
async function loginKBSite(page) {
  log('KB손해보험 사이트 로그인 시도...', 'STEP');

  // 로그인 페이지 접속
  await page.goto(CONFIG.loginUrl, {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  await sleep(CONFIG.timing.pageLoad);

  // 현재 페이지 정보 로깅
  log(`페이지 URL: ${page.url()}`);
  log(`페이지 타이틀: ${await page.title()}`);

  // iframe 체크 - KB 사이트는 iframe을 통해 로그인 폼을 제공할 수 있음
  let loginFrame = page;
  const frames = page.frames();
  log(`총 ${frames.length}개 프레임 발견`, 'DEBUG');

  for (const frame of frames) {
    const frameUrl = frame.url();
    log(`  프레임: ${frameUrl}`, 'DEBUG');

    // 로그인 관련 프레임 찾기
    if (frameUrl.includes('login') || frameUrl.includes('Login') || frameUrl.includes('auth')) {
      loginFrame = frame;
      log(`로그인 프레임 감지: ${frameUrl}`, 'OK');
      break;
    }
  }

  // 로그인 폼이 메인 페이지에 있는지, iframe 안에 있는지 확인
  const checkInFrame = async (targetFrame) => {
    const idEl = await targetFrame.$('input[name="userId"], input[id="userId"], input[name="id"]').catch(() => null);
    return !!idEl;
  };

  let foundFrame = await checkInFrame(page);
  if (!foundFrame) {
    for (const frame of frames) {
      if (await checkInFrame(frame)) {
        loginFrame = frame;
        foundFrame = true;
        break;
      }
    }
  }

  if (foundFrame) {
    log('로그인 폼 발견. 자격 증명 입력 중...');
    await fillLoginForm(loginFrame);
  } else {
    // 로그인 폼을 찾지 못한 경우 → 이미 로그인되어 있거나 다른 구조
    log('로그인 폼을 찾지 못했습니다. 이미 로그인된 상태일 수 있습니다.', 'WARN');

    // 혹시 팝업 형태의 로그인 창인지 확인
    const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    const popup = await popupPromise;
    if (popup) {
      log('팝업 로그인 창 감지');
      await fillLoginForm(popup);
    }
  }

  // 로그인 완료 대기
  await sleep(CONFIG.timing.afterLogin);

  // 추가 인증(생년월일) 처리
  await handlePostLoginAuth(page);

  log('로그인 프로세스 완료', 'OK');
}

/** 로그인 폼 채우기 */
async function fillLoginForm(targetPage) {
  // 아이디 입력
  const idSelectors = [
    'input[name="userId"]', 'input[id="userId"]',
    'input[name="id"]', 'input[id="id"]',
    'input[name="username"]', 'input[id="username"]',
    'input[placeholder*="아이디"]', 'input[placeholder*="ID"]',
    'input[type="text"]',
  ];

  let idInput = null;
  for (const sel of idSelectors) {
    idInput = await targetPage.$(sel).catch(() => null);
    if (idInput) {
      const visible = await idInput.isVisible().catch(() => false);
      if (visible) {
        log(`아이디 필드: ${sel}`);
        break;
      }
      idInput = null;
    }
  }

  if (idInput) {
    await idInput.click();
    await idInput.fill('');
    await idInput.type(CONFIG.id, { delay: 50 });
    log(`아이디 입력: ${CONFIG.id}`);
  }

  // 비밀번호 입력
  const pwSelectors = [
    'input[type="password"]',
    'input[name="password"]', 'input[id="password"]',
    'input[name="pw"]', 'input[id="pw"]',
    'input[placeholder*="비밀번호"]', 'input[placeholder*="PW"]',
  ];

  let pwInput = null;
  for (const sel of pwSelectors) {
    pwInput = await targetPage.$(sel).catch(() => null);
    if (pwInput) {
      const visible = await pwInput.isVisible().catch(() => false);
      if (visible) {
        log(`비밀번호 필드: ${sel}`);
        break;
      }
      pwInput = null;
    }
  }

  if (pwInput) {
    await pwInput.click();
    await pwInput.fill('');
    await pwInput.type(CONFIG.pw, { delay: 50 });
    log('비밀번호 입력 완료');
  }

  // 로그인 버튼 클릭
  const loginBtnSelectors = [
    'button:has-text("로그인")',
    'input[type="submit"][value*="로그인"]',
    'a:has-text("로그인")',
    'button[type="submit"]',
    '.btn_login', '#btnLogin',
    'button.btn_primary',
    'input[type="image"]',
  ];

  let loginBtn = null;
  for (const sel of loginBtnSelectors) {
    loginBtn = await targetPage.$(sel).catch(() => null);
    if (loginBtn) {
      const visible = await loginBtn.isVisible().catch(() => false);
      if (visible) {
        log(`로그인 버튼: ${sel}`);
        break;
      }
      loginBtn = null;
    }
  }

  if (loginBtn) {
    await loginBtn.click();
  } else if (pwInput) {
    await pwInput.press('Enter');
    log('Enter 키로 로그인 시도');
  }
}

/** 로그인 후 추가 인증 처리 (생년월일, 보안카드 등) */
async function handlePostLoginAuth(page) {
  await sleep(2000);

  // 생년월일 / 주민번호 추가 인증 확인
  const birthSelectors = [
    'input[name="birth"]', 'input[id="birth"]',
    'input[placeholder*="생년월일"]',
    'input[placeholder*="주민번호"]',
    'input[name="rrn"]', 'input[id="rrn"]',
    'input[name*="jumin"]',
  ];

  for (const sel of birthSelectors) {
    const input = await page.$(sel).catch(() => null);
    if (input) {
      const visible = await input.isVisible().catch(() => false);
      if (visible) {
        log(`추가 인증 필드 발견: ${sel}`);
        await input.click();
        await input.fill(CONFIG.birth);
        log(`생년월일 입력: ${CONFIG.birth}`);

        // 확인 버튼 클릭
        const confirmBtn = await page.$('button:has-text("확인"), input[value*="확인"], .btn_confirm').catch(() => null);
        if (confirmBtn && await confirmBtn.isVisible().catch(() => false)) {
          await confirmBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }
        await sleep(CONFIG.timing.afterLogin);
        break;
      }
    }
  }

  // 보안 프로그램(MiAgent) 경고창 대기
  // alert/dialog 처리
  page.on('dialog', async (dialog) => {
    log(`대화상자 감지: ${dialog.message()}`, 'WARN');
    await dialog.accept();
  });
}

// ─────────────────────────────────────────────
// 동의서출력 메뉴로 이동
// ─────────────────────────────────────────────
async function navigateToConsentMenu(page) {
  log('동의서출력 메뉴 탐색...', 'STEP');

  // 직접 URL이 지정된 경우 먼저 시도
  if (CONFIG.consentMenuUrl) {
    log(`지정된 URL로 직접 이동: ${CONFIG.consentMenuUrl}`);
    await page.goto(CONFIG.consentMenuUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(CONFIG.timing.afterMenuClick);
    log(`현재 URL: ${page.url()}`);
    return;
  }

  await sleep(1000);

  // 메뉴 검색 전략: 다양한 방식으로 "동의서출력" 메뉴 찾기
  const menuSearchStrategies = [
    // 전략 1: 좌측 메뉴 트리에서 찾기
    async () => {
      log('전략 1: 좌측 메뉴에서 "동의서출력" 검색...');
      const selectors = [
        'a:has-text("동의서출력")',
        'a:has-text("동의서")',
        'span:has-text("동의서출력")',
        'span:has-text("동의서")',
        'li:has-text("동의서출력")',
        'li:has-text("동의서")',
      ];
      for (const sel of selectors) {
        const el = await page.$(sel).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) {
          await el.click();
          log(`메뉴 클릭: ${sel}`, 'OK');
          return true;
        }
      }
      return false;
    },
    // 전략 2: iframe 내부 메뉴 검색
    async () => {
      log('전략 2: iframe 내부 메뉴 검색...');
      const frames = page.frames();
      for (const frame of frames) {
        const selectors = [
          'a:has-text("동의서출력")', 'a:has-text("동의서")',
          'span:has-text("동의서출력")', 'li:has-text("동의서출력")',
        ];
        for (const sel of selectors) {
          const el = await frame.$(sel).catch(() => null);
          if (el) {
            try {
              await el.click();
              log(`iframe 메뉴 클릭: ${sel}`, 'OK');
              return true;
            } catch (e) { /* 계속 */ }
          }
        }
      }
      return false;
    },
    // 전략 3: 텍스트 노드로 직접 찾기 (Playwright text selector)
    async () => {
      log('전략 3: 텍스트 기반 검색...');
      try {
        const el = await page.getByText('동의서출력').first();
        if (el) {
          await el.click();
          log('텍스트 "동의서출력" 클릭', 'OK');
          return true;
        }
      } catch (e) { /* 계속 */ }
      try {
        const el = await page.getByText('동의서', { exact: false }).first();
        if (el) {
          await el.click();
          log('텍스트 "동의서" 클릭', 'OK');
          return true;
        }
      } catch (e) { /* 계속 */ }
      return false;
    },
    // 전략 4: role 기반 검색
    async () => {
      log('전략 4: role 기반 검색...');
      try {
        const link = await page.getByRole('link', { name: /동의서/ }).first();
        if (link) {
          await link.click();
          log('role link "동의서" 클릭', 'OK');
          return true;
        }
      } catch (e) { /* 계속 */ }
      try {
        const menuitem = await page.getByRole('menuitem', { name: /동의서/ }).first();
        if (menuitem) {
          await menuitem.click();
          log('role menuitem "동의서" 클릭', 'OK');
          return true;
        }
      } catch (e) { /* 계속 */ }
      return false;
    },
  ];

  let menuFound = false;
  for (const strategy of menuSearchStrategies) {
    menuFound = await strategy();
    if (menuFound) break;
  }

  if (menuFound) {
    await sleep(CONFIG.timing.afterMenuClick);
    log(`이동 후 URL: ${page.url()}`);
  } else {
    log('동의서출력 메뉴를 자동으로 찾지 못했습니다.', 'WARN');
    log('수동으로 동의서출력 페이지로 이동 후 진행합니다.', 'WARN');
    log('60초 대기 중... (수동 이동 시간)', 'WARN');
    await sleep(60000);
  }

  // 이동 후 페이지 상태 확인
  await page.screenshot({
    path: join(__dirname, `screenshot-after-menu-${timestamp()}.png`),
    fullPage: true
  }).catch(() => {});
  log(`현재 페이지: ${page.url()} / 타이틀: ${await page.title()}`);
}

// ─────────────────────────────────────────────
// 배치 처리
// ─────────────────────────────────────────────
async function processBatch(page, batch, batchNum, totalBatches) {
  const names = batch.map(c => c.name).join(', ');
  log(`처리 대상 (${batch.length}명): ${names}`);

  // 1. 다중입력 모드 체크
  await checkMultiInput(page);

  // 2. 데이터 입력
  await fillBatchData(page, batch);

  // 3. 출력 버튼 클릭
  await clickPrintButton(page);

  // 4. PDF 다운로드 대기
  await waitForPdfDownload(page, batchNum);

  log(`배치 ${batchNum}/${totalBatches} 완료`, 'OK');
}

// ─────────────────────────────────────────────
// 다중입력 체크
// ─────────────────────────────────────────────
async function checkMultiInput(page) {
  log('다중입력 모드 확인...');

  const multiStrategies = [
    // 라디오 버튼
    async () => {
      const radios = [
        'input[type="radio"][value*="multi"]',
        'input[type="radio"][value*="다중"]',
        'input[type="radio"]:near(:text("다중입력"))',
      ];
      for (const sel of radios) {
        const el = await page.$(sel).catch(() => null);
        if (el) {
          await el.check();
          log(`다중입력 라디오 체크: ${sel}`, 'OK');
          return true;
        }
      }
      return false;
    },
    // 체크박스
    async () => {
      const checkboxes = [
        'input[type="checkbox"][name*="multi"]',
        'input[type="checkbox"][id*="multi"]',
        'input[type="checkbox"]:near(:text("다중"))',
      ];
      for (const sel of checkboxes) {
        const el = await page.$(sel).catch(() => null);
        if (el) {
          await el.check();
          log(`다중입력 체크박스: ${sel}`, 'OK');
          return true;
        }
      }
      return false;
    },
    // 라벨 클릭
    async () => {
      try {
        const label = await page.getByText('다중입력').first();
        if (label) {
          await label.click();
          log('다중입력 레이블 클릭', 'OK');
          return true;
        }
      } catch (e) { /* 계속 */ }
      return false;
    },
    // iframe 내 검색
    async () => {
      for (const frame of page.frames()) {
        const el = await frame.$('input[type="radio"]:near(:text("다중입력")), input[type="checkbox"]:near(:text("다중입력"))').catch(() => null);
        if (el) {
          await el.check();
          log('iframe 다중입력 체크', 'OK');
          return true;
        }
      }
      return false;
    },
  ];

  let checked = false;
  for (const strategy of multiStrategies) {
    checked = await strategy();
    if (checked) break;
  }

  if (!checked) {
    log('다중입력 체크 요소를 찾지 못했습니다. 이미 다중입력 모드이거나, 다른 구조일 수 있습니다.', 'WARN');
  }

  await sleep(CONFIG.timing.afterCheck);
}

// ─────────────────────────────────────────────
// 배치 데이터 입력
// ─────────────────────────────────────────────
async function fillBatchData(page, batch) {
  log(`${batch.length}명 데이터 입력 시작...`);

  // 현재 페이지의 모든 프레임 수집
  const allFrames = [page, ...page.frames()];

  // === 입력 필드 찾기 ===
  let firstField = null;
  let targetFrame = page;

  const fieldPatterns = [
    // 주민등록번호 관련
    'input[name*="rrn"]', 'input[id*="rrn"]',
    'input[name*="jumin"]', 'input[id*="jumin"]',
    'input[name*="ssn"]', 'input[id*="ssn"]',
    'input[placeholder*="주민"]',
    'input[name*="resno"]', 'input[id*="resno"]',
    // 일반 텍스트 필드 (첫 번째 것)
  ];

  for (const frame of allFrames) {
    for (const selector of fieldPatterns) {
      try {
        const el = await frame.$(selector);
        if (el && await el.isVisible().catch(() => false)) {
          firstField = el;
          targetFrame = frame;
          log(`입력 필드 발견 (${frame === page ? '메인' : 'iframe'}): ${selector}`, 'OK');
          break;
        }
      } catch (e) { /* 계속 */ }
    }
    if (firstField) break;
  }

  if (!firstField) {
    // 마지막 시도: 첫 번째 보이는 text input 찾기
    for (const frame of allFrames) {
      try {
        const inputs = await frame.$$('input[type="text"]:visible, input:not([type])');
        if (inputs.length > 0) {
          for (const inp of inputs) {
            if (await inp.isVisible().catch(() => false) && await inp.isEnabled().catch(() => false)) {
              firstField = inp;
              targetFrame = frame;
              log(`첫 번째 visible text input 발견`, 'OK');
              break;
            }
          }
        }
      } catch (e) { /* 계속 */ }
      if (firstField) break;
    }
  }

  if (!firstField) {
    // 현재 페이지 스크린샷 저장
    await page.screenshot({
      path: join(__dirname, `no-field-${timestamp()}.png`),
      fullPage: true
    });
    throw new Error('입력 필드를 찾을 수 없습니다. 동의서출력 페이지가 맞는지 확인하세요.');
  }

  // 첫 번째 필드 클릭 및 초기화
  await firstField.click();
  await sleep(200);

  // === 데이터 입력 (Tab 키로 필드 간 이동) ===
  for (let i = 0; i < batch.length; i++) {
    const cust = batch[i];
    const juminFormatted = fmtJumin(cust.jumin);

    // 주민등록번호 입력 (숫자만)
    const juminNumeric = cust.jumin.replace(/[^0-9]/g, '');
    await targetFrame.keyboard.type(juminNumeric, { delay: 15 });
    await sleep(CONFIG.timing.afterInput);

    // Tab → 고객명 필드
    await targetFrame.keyboard.press('Tab');
    await sleep(100);
    await targetFrame.keyboard.type(cust.name, { delay: 20 });
    await sleep(CONFIG.timing.afterInput);

    // 전화번호 필드가 있는 경우 (3번째 컬럼)
    // Tab 한번 더 → 전화번호
    if (cust.phone && cust.phone.length > 5) {
      await targetFrame.keyboard.press('Tab');
      await sleep(100);

      // 이미 내용이 있으면 초기화
      await targetFrame.keyboard.press('Control+a');
      await targetFrame.keyboard.press('Backspace');
      await targetFrame.keyboard.type(cust.phone.replace(/[^0-9]/g, ''), { delay: 15 });
      await sleep(CONFIG.timing.afterInput);
    }

    // 다음 행으로 이동 (Tab)
    if (i < batch.length - 1) {
      await targetFrame.keyboard.press('Tab');
      await sleep(150);
    }

    const displayJumin = juminFormatted.length === 14
      ? juminFormatted.substring(0, 8) + '******'
      : juminNumeric.substring(0, 6) + '-*******';
    log(`  [${i + 1}/${batch.length}] ${cust.name} (${displayJumin})`);
  }

  log('데이터 입력 완료', 'OK');
}

// ─────────────────────────────────────────────
// 출력 버튼 클릭
// ─────────────────────────────────────────────
async function clickPrintButton(page) {
  log('출력 버튼 검색...');

  const printSelectors = [
    'button:has-text("출력")',
    'input[type="button"][value*="출력"]',
    'input[type="submit"][value*="출력"]',
    'a:has-text("출력")',
    'button:has-text("인쇄")',
    'input[value="출력"]',
    '.btn_print', '#btnPrint', '#btn_print',
    'button.btn_primary:has-text("출력")',
    'img[alt*="출력"]',
    'input[type="image"][alt*="출력"]',
  ];

  for (const frame of [page, ...page.frames()]) {
    for (const sel of printSelectors) {
      try {
        const btn = await frame.$(sel);
        if (btn && await btn.isVisible().catch(() => false)) {
          log(`출력 버튼 발견: ${sel}`, 'OK');
          await btn.click();
          log('출력 버튼 클릭 완료', 'OK');
          await sleep(2000);
          return true;
        }
      } catch (e) { /* 계속 */ }
    }
  }

  // Playwright의 text/getByRole 로 재시도
  try {
    const btn = await page.getByRole('button', { name: /출력/ }).first();
    if (btn) {
      await btn.click();
      log('role button "출력" 클릭', 'OK');
      await sleep(2000);
      return true;
    }
  } catch (e) { /* 계속 */ }

  try {
    const btn = await page.getByText('출력').first();
    if (btn) {
      await btn.click();
      log('text "출력" 클릭', 'OK');
      await sleep(2000);
      return true;
    }
  } catch (e) { /* 계속 */ }

  log('출력 버튼을 찾지 못했습니다.', 'WARN');
  return false;
}

// ─────────────────────────────────────────────
// PDF 다운로드 대기
// ─────────────────────────────────────────────
async function waitForPdfDownload(page, batchNum) {
  log('PDF 다운로드 대기 중...');
  await sleep(CONFIG.timing.afterPrint);

  // 다운로드는 page.on('download') 이벤트에서 전역적으로 처리됨
  // 추가로 팝업 확인
  try {
    const popup = await page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    if (popup) {
      log('PDF 팝업 창 감지됨');
      const popupUrl = popup.url();
      log(`팝업 URL: ${popupUrl}`);

      if (popupUrl.endsWith('.pdf') || popupUrl.includes('.pdf')) {
        // PDF URL 직접 다운로드
        log('PDF URL 직접 다운로드 시도...');
        const response = await popup.evaluate(() => document.body.innerText).catch(() => '');
        // 팝업에서 PDF 뷰어 사용 중이면 페이지 저장 시도
        const pdfPath = join(CONFIG.downloadDir, `KB_batch${String(batchNum).padStart(3, '0')}_popup_${timestamp()}.pdf`);

        // fetch로 다운로드 시도
        try {
          const pdfResponse = await page.evaluate(async (url) => {
            const res = await fetch(url);
            const blob = await res.blob();
            const reader = new FileReader();
            return new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          }, popupUrl);

          if (pdfResponse) {
            const base64Data = pdfResponse.split(',')[1];
            writeFileSync(pdfPath, Buffer.from(base64Data, 'base64'));
            log(`PDF 팝업에서 저장: ${basename(pdfPath)}`, 'OK');
          }
        } catch (e) {
          log(`PDF fetch 실패: ${e.message}`, 'WARN');
        }
      }
      await popup.close().catch(() => {});
    }
  } catch (e) {
    // 팝업 없음 - download 이벤트에서 처리됨
  }
}

// ─────────────────────────────────────────────
// 처리 결과 리포트 저장
// ─────────────────────────────────────────────
function saveReport(total, success, failed, files) {
  const report = {
    timestamp: new Date().toISOString(),
    config: {
      batchSize: CONFIG.batchSize,
      id: CONFIG.id,
      downloadDir: CONFIG.downloadDir,
    },
    summary: {
      total,
      success,
      failed,
      successRate: total > 0 ? Math.round(success / total * 100) : 0,
    },
    files: files.map(f => basename(f)),
  };

  const reportPath = join(CONFIG.downloadDir, `report-${timestamp()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  log(`처리 리포트 저장: ${reportPath}`, 'OK');
}

// ─────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────
runAutomation().catch(err => {
  console.error('자동화 실행 중 치명적 오류:', err);
  process.exit(1);
});
