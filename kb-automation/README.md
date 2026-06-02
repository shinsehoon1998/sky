# KB손해보험 전산등록 완전 자동화 가이드

> Playwright 기반 브라우저 자동화로 로그인 → 다중입력 → 데이터 입력 → 출력까지 **완전 자동** 처리

---

## 준비물

| 항목 | 설명 |
|------|------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) 에서 다운로드 |
| **Chrome 브라우저** | PC에 설치된 Chrome 사용 (MiAgent 호환) |
| **MiAgent** | KB손보 보안 프로그램 (사전 설치 필수) |
| **JSON 데이터 파일** | 웹앱에서 "자동화 데이터 다운로드" 버튼으로 생성 |

---

## 설치 방법 (최초 1회)

```bash
# 1. kb-automation 폴더로 이동
cd kb-automation

# 2. 의존성 설치
npm install

# 3. Playwright Chromium 브라우저 설치
npx playwright install chromium
```

---

## 환경변수 설정

`.env` 파일을 `kb-automation/` 폴더에 생성:

```env
KB_ID=r4585414
KB_PW=zxcv100*
KB_BIRTH=950924
```

또는 명령어로:

```bash
echo KB_ID=r4585414 > .env
echo KB_PW=zxcv100* >> .env
echo KB_BIRTH=950924 >> .env
```

---

## 실행 방법

### 1단계: 웹앱에서 데이터 다운로드

1. 웹앱에 접속하여 엑셀 파일 업로드
2. 데이터 검증 완료 후 Step 3(전산 등록)로 이동
3. **"자동화 데이터 다운로드 (JSON)"** 버튼 클릭
4. 다운로드된 `kb-data.json` 파일을 `kb-automation/` 폴더로 이동

### 2단계: 자동화 스크립트 실행

```bash
cd kb-automation

# 화면 보면서 실행 (기본)
node kb-automation.js

# 백그라운드에서 실행 (화면 표시 없이)
HEADLESS=true node kb-automation.js
```

### 3단계: 결과 확인

- PDF 파일은 `~/Downloads/KB_consents/` 폴더에 저장됨
- `KB_consent_batch_001_xxxxx.pdf` 형식으로 배치별 저장

---

## 자동화 흐름

```
[웹앱] 엑셀 업로드 → 검증 → JSON 다운로드
         ↓
[Playwright] Chrome 실행 (기존 프로필)
         ↓
KB 사이트 로그인 (ID/PW/생년월일 자동 입력)
         ↓
동의서출력 메뉴 자동 이동
         ↓
┌──── 10명씩 배치 처리 ────┐
│ 다중입력 체크           │
│ 주민등록번호 + 고객명 입력 │
│ 출력 버튼 클릭          │
│ PDF 다운로드            │
└──────────────────────────┘
         ↓
완료! (총 N명 처리 완료)
```

---

## 문제 해결

| 문제 | 해결 방법 |
|------|----------|
| **"로그인 실패"** | `.env` 파일의 ID/PW 확인 |
| **"입력 필드를 찾을 수 없음"** | KB 사이트가 동의서출력 페이지인지 확인 |
| **"PDF가 다운로드되지 않음"** | `~/Downloads/KB_consents/` 폴더 확인 |
| **"MiAgent 오류"** | MiAgent 재설치 후 재시도 |
| **오류 발생 시** | `kb-automation/error-screenshot.png` 확인 |

---

## 고급 설정

### 다운로드 폴더 변경

```bash
KB_DOWNLOAD_DIR=/원하는/경로 node kb-automation.js
```

### 배치 크기 조정 (기본 10명)

`kb-automation.js` 파일에서 `CONFIG.batchSize` 값 변경 (최대 10)

### 타이밍 조정

KB 사이트 응답이 느린 경우 `CONFIG.timing` 값 증가:

```javascript
timing: {
  pageLoad: 5000,    // 페이지 로딩 대기
  afterLogin: 3000,  // 로그인 후 대기
  afterPrint: 8000,  // PDF 생성 대기
}
```
