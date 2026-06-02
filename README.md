# 고객정보 등록 및 동의서 출력 시스템

> 보험 영업용 엑셀 기반 고객정보 등록 자동화 & 동의서 출력 웹앱

---

## 📊 현재 완료된 기능 (MVP)

| 기능 | 상태 |
|------|:----:|
| 엑셀(.xlsx) 파일 드래그 앤 드롭 업로드 | ✅ |
| A열(주민번호)/B열(이름)/C열(연락처) 자동 파싱 | ✅ |
| 주민번호 검증 (하이픈 포함 14자리 → 13자리 숫자) | ✅ |
| 연락처 형식 검증 및 표준화 (010-XXXX-XXXX) | ✅ |
| 이름 특수문자 검증 | ✅ |
| 데이터 미리보기 테이블 (페이지네이션, 검색, 필터링) | ✅ |
| 오류 데이터 빨간색 하이라이트 | ✅ |
| 처리 대상 선택/해제 (체크박스) | ✅ |
| 클립보드 매크로 (고객별 순차 복사 → 전산시스템 붙여넣기) | ✅ |
| 동의서 HTML 자동 생성 (개인정보 수집·이용 동의서) | ✅ |
| 동의서 인쇄 (브라우저 print) | ✅ |
| 동의서 PDF 다운로드 (jsPDF) | ✅ |
| 선택 고객 일괄 인쇄 | ✅ |

---

## 🔗 접속 URL

| 환경 | URL |
|------|-----|
| 개발 | `https://3000-i49twtcbb9b1wdqfeqacf-c81df28e.sandbox.novita.ai` |

---

## 🚀 사용 방법

1. **파일 업로드** → .xlsx 파일 드래그 앤 드롭
2. **데이터 확인** → 검증 결과 확인 후 처리할 고객 선택
3. **전산 등록** → "다음 고객 복사" 클릭 → 보험사 전산에 붙여넣기 (`Ctrl+V`)
4. **동의서 출력** → 미리보기 확인 후 인쇄 또는 PDF 다운로드

---

## 🛠 기술 스택

| 계층 | 기술 |
|------|------|
| Frontend | HTML5 + Tailwind CSS + Vanilla JS |
| Backend | Hono (TypeScript) on Cloudflare Workers |
| Excel | SheetJS (xlsx) CDN |
| PDF | jsPDF + html2canvas CDN |
| Deploy | Cloudflare Pages |

---

## 📁 프로젝트 구조

```
webapp/
├── src/index.tsx          # Hono 메인 (API + 페이지)
├── src/renderer.tsx       # JSX 렌더러
├── public/static/
│   ├── app.js             # 메인 프론트엔드 로직
│   ├── consent.js         # 동의서 페이지 스크립트
│   └── style.css          # 스타일시트
├── PRD.md                 # 제품 요구사항 문서 (GDPR 포함)
├── ecosystem.config.cjs   # PM2 설정
└── wrangler.jsonc         # Cloudflare 설정
```

---

## 🔧 개발 명령어

```bash
npm run build    # 빌드
npm run dev      # 로컬 개발 서버 (Vite)
npm run deploy   # Cloudflare Pages 배포
```
