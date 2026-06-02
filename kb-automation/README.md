# KB손해보험 전산등록 완전 자동화 가이드

> Playwright 기반 브라우저 자동화로 **엑셀 파일 → 로그인 → 다중입력 → 데이터 입력 → 출력 → PDF 저장**까지 **완전 자동** 처리

---

## 🎯 자동화 흐름

```
[엑셀 파일] → 데이터 파싱 (xlsx 모듈)
         ↓
[Playwright] Chrome 실행 (기존 프로필)
         ↓
KB 사이트 로그인 (ID/PW/생년월일 자동 입력)
         ↓
동의서출력 메뉴 자동 이동 (4가지 전략으로 탐색)
         ↓
┌──── N명씩 배치 처리 ────┐
│ 다중입력 체크           │
│ 주민등록번호 + 고객명 입력 │
│ 출력 버튼 클릭          │
│ PDF 자동 다운로드        │
└──────────────────────────┘
         ↓
완료! (처리 결과 리포트 생성)
```

---

## 준비물

| 항목 | 설명 |
|------|------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) 에서 다운로드 |
| **Chrome 브라우저** | PC에 설치된 Chrome 사용 (MiAgent 호환) |
| **MiAgent** | KB손보 보안 프로그램 (사전 설치 필수) |
| **엑셀(.xlsx) 파일** | A열: 주민등록번호, B열: 이름, C열: 연락처 |

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

`.env` 파일을 `kb-automation/` 폴더에 생성 (`.env.example` 참고):

```env
KB_ID=r4585414
KB_PW=your_password_here
KB_BIRTH=950924
```

또는 명령어로:

```bash
cp .env.example .env
# .env 파일을 편집하여 실제 계정 정보 입력
```

---

## 데이터 준비

엑셀 파일을 `kb-automation/data/` 폴더에 넣어주세요.

**엑셀 파일 형식:**

| A열 | B열 | C열 |
|------|------|------|
| 주민등록번호 | 이름 | 연락처 |
| 500105-2543511 | 문검주 | 010-2090-5768 |
| 500210-2123456 | 권광덕 | 010-9686-1234 |

> **참고:** 첫 행은 헤더로 자동 감지됩니다. 주민등록번호는 하이픈 포함/미포함 모두 지원합니다.

> **샘플 파일:** `data/sample-customers.xlsx` 를 참고하세요.

---

## 실행 방법

### 기본 실행 (화면 보면서)

```bash
cd kb-automation
node kb-automation.js
```

### 백그라운드 실행

```bash
HEADLESS=true node kb-automation.js
```

### 디버그 모드 (느리게 + 상세 로그)

```bash
DEBUG=true SLOW_MO=300 node kb-automation.js
```

---

## 고급 설정

### 환경변수 목록

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `KB_ID` | KB 전산 아이디 | `r4585414` |
| `KB_PW` | KB 전산 비밀번호 | (필수 입력) |
| `KB_BIRTH` | 생년월일 (YYMMDD) | (필수 입력) |
| `HEADLESS` | 백그라운드 실행 | `false` |
| `DEBUG` | 디버그 모드 | `false` |
| `SLOW_MO` | 슬로우 모션 (ms) | `0` |
| `BATCH_SIZE` | 배치 크기 (기본 4) | `4` |
| `KB_DATA_FILE` | 특정 엑셀 파일 경로 | (data/ 폴더 자동 검색) |
| `KB_DOWNLOAD_DIR` | PDF 다운로드 폴더 | `~/Downloads/KB_consents` |
| `KB_CONSENT_URL` | 동의서출력 페이지 URL | (자동 탐색) |
| `MAX_RETRIES` | 최대 재시도 횟수 | `2` |

### 타이밍 조정

KB 사이트 응답이 느린 경우 환경변수로 타이밍 증가:

```bash
TIMING_PAGE_LOAD=5000 TIMING_AFTER_LOGIN=5000 TIMING_AFTER_PRINT=10000 node kb-automation.js
```

---

## 문제 해결

| 문제 | 해결 방법 |
|------|----------|
| **"입력 필드를 찾을 수 없음"** | 동의서출력 페이지가 맞는지 확인. `KB_CONSENT_URL` 환경변수로 직접 URL 지정 |
| **"로그인 실패"** | `.env` 파일의 ID/PW/BIRTH 확인 |
| **"PDF가 다운로드되지 않음"** | `~/Downloads/KB_consents/` 폴더 확인. `KB_DOWNLOAD_DIR` 변경 가능 |
| **"MiAgent 오류"** | MiAgent 재설치 후 재시도 |
| **오류 발생 시** | `kb-automation/error-*.png` 스크린샷 확인 |

---

## 결과물

- **PDF 파일**: `~/Downloads/KB_consents/KB_batch001_YYYYMMDD-HHmmss.pdf`
- **처리 리포트**: `~/Downloads/KB_consents/report-YYYYMMDD-HHmmss.json`
- **오류 스크린샷**: `kb-automation/error-*.png`
