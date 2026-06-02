import { Hono } from 'hono'
import { renderer } from './renderer'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

app.use(renderer)
app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ============================================================
// API: 데이터 검증
// ============================================================
app.post('/api/validate', async (c) => {
  const body = await c.req.json()
  const { data } = body as { data: CustomerRecord[] }

  const results = data.map((record, index) => {
    const errors: string[] = []

    // 주민등록번호 검증 (하이픈(-) 허용, 450117-1344117 형식)
    if (!record.jumin || record.jumin.trim() === '') {
      errors.push('주민등록번호가 없습니다')
    } else {
      // 하이픈 제거 후 순수 숫자만 추출
      const juminRaw = record.jumin.trim()
      const juminDigits = juminRaw.replace(/[^0-9]/g, '')
      if (juminDigits.length !== 13) {
        errors.push('주민등록번호는 13자리 숫자여야 합니다 (현재 ' + juminDigits.length + '자리)')
      } else {
        const yy = parseInt(juminDigits.substring(0, 2))
        const mm = parseInt(juminDigits.substring(2, 4))
        const dd = parseInt(juminDigits.substring(4, 6))
        const genderCode = parseInt(juminDigits.substring(6, 7))

        if (mm < 1 || mm > 12) errors.push('생년월일 중 월이 유효하지 않습니다')
        if (dd < 1 || dd > 31) errors.push('생년월일 중 일이 유효하지 않습니다')
        if (genderCode < 1 || genderCode > 8) errors.push('성별구분 코드가 유효하지 않습니다')
      }
    }

    // 이름 검증
    if (!record.name || record.name.trim() === '') {
      errors.push('이름이 없습니다')
    } else if (/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(record.name.trim())) {
      errors.push('이름에 숫자나 특수문자가 포함되어 있습니다')
    }

    // 전화번호 검증
    if (!record.phone || record.phone.trim() === '') {
      errors.push('전화번호가 없습니다')
    } else {
      const phone = record.phone.trim()
      // 다양한 형식 허용 후 표준화
      const digits = phone.replace(/[^0-9]/g, '')
      if (digits.length === 11 && digits.startsWith('010')) {
        // 올바른 휴대폰 번호
      } else if (digits.length === 10 && digits.startsWith('010')) {
        // 올바른 휴대폰 번호 (구형)
      } else if (digits.length === 10 || digits.length === 11) {
        // 일반 전화번호
      } else {
        errors.push('전화번호 형식이 올바르지 않습니다')
      }
    }

    return {
      index,
      isValid: errors.length === 0,
      errors,
      normalized: errors.length === 0 ? normalizeRecord(record) : null
    }
  })

  return c.json({
    total: data.length,
    valid: results.filter(r => r.isValid).length,
    invalid: results.filter(r => !r.isValid).length,
    results
  })
})

// ============================================================
// API: 표준화된 데이터 반환
// ============================================================
app.post('/api/normalize', async (c) => {
  const body = await c.req.json()
  const { data } = body as { data: CustomerRecord[] }
  const normalized = data.map(record => normalizeRecord(record))
  return c.json({ data: normalized })
})

// ============================================================
// 메인 페이지
// ============================================================
app.get('/', (c) => {
  return c.render(<MainPage />)
})

// ============================================================
// 동의서 미리보기 페이지
// ============================================================
app.get('/consent-preview', (c) => {
  return c.render(<ConsentPreviewPage />)
})

export default app

// ============================================================
// 타입 정의
// ============================================================
interface CustomerRecord {
  jumin: string
  name: string
  phone: string
}

interface NormalizedRecord {
  jumin: string
  maskedJumin: string
  name: string
  phone: string
}

// ============================================================
// 유틸리티 함수
// ============================================================
function normalizeRecord(record: CustomerRecord): NormalizedRecord {
  // 주민등록번호에서 하이픈 등 특수문자 제거 → 순수 13자리 숫자로 정규화
  const juminDigits = record.jumin.trim().replace(/[^0-9]/g, '')
  const phone = record.phone.trim().replace(/[^0-9]/g, '')

  // 전화번호 표준화 (010-XXXX-XXXX)
  let formattedPhone = phone
  if (phone.length === 11) {
    formattedPhone = `${phone.substring(0, 3)}-${phone.substring(3, 7)}-${phone.substring(7)}`
  } else if (phone.length === 10 && phone.startsWith('010')) {
    formattedPhone = `${phone.substring(0, 3)}-${phone.substring(3, 6)}-${phone.substring(6)}`
  } else if (phone.length === 10) {
    formattedPhone = `${phone.substring(0, 3)}-${phone.substring(3, 6)}-${phone.substring(6)}`
  }

  return {
    jumin: juminDigits,
    maskedJumin: `${juminDigits.substring(0, 6)}-${'*'.repeat(7)}`,
    name: record.name.trim(),
    phone: formattedPhone
  }
}

// ============================================================
// 메인 페이지 컴포넌트
// ============================================================
function MainPage() {
  return (
    <div>
      {/* 헤더 */}
      <header class="bg-white shadow-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <i class="fas fa-file-alt text-blue-600 text-2xl"></i>
            <div>
              <h1 class="text-lg font-bold text-gray-800">고객정보 등록 및 동의서 출력 시스템</h1>
              <p class="text-xs text-gray-500">Insurance Customer Management & Consent Form Generator</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400">v1.0 MVP</span>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-6">
        {/* Step Indicator */}
        <div id="step-indicator" class="flex items-center justify-center mb-8">
          <div class="flex items-center gap-2">
            {[1, 2, 3, 4].map((step, i) => (
              <>
                <div id={`step-dot-${step}`} class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {step}
                </div>
                <span id={`step-label-${step}`} class={`text-sm font-medium transition-all ${step === 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                  {['파일업로드', '데이터확인', '전산등록', '동의서출력'][i]}
                </span>
                {i < 3 && (
                  <div id={`step-line-${step}`} class={`w-12 h-0.5 transition-all ${step === 1 ? 'bg-blue-200' : 'bg-gray-200'}`}></div>
                )}
              </>
            ))}
          </div>
        </div>

        {/* Step 1: 파일 업로드 */}
        <section id="section-upload" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i class="fas fa-upload text-blue-500"></i>
            1. 엑셀 파일 업로드
          </h2>
          <div id="drop-zone" class="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer">
            <i class="fas fa-cloud-upload-alt text-5xl text-gray-300 mb-4 block"></i>
            <p class="text-gray-600 font-medium mb-1">엑셀 파일을 여기에 드래그하세요</p>
            <p class="text-gray-400 text-sm">또는 클릭하여 파일 선택 (.xlsx 지원)</p>
            <p class="text-gray-400 text-xs mt-3">A열: 주민등록번호, B열: 이름, C열: 전화번호</p>
            <input type="file" id="file-input" accept=".xlsx" class="hidden" />
          </div>
          <div id="file-info" class="mt-4 hidden">
            <div class="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <i class="fas fa-file-excel text-green-600 text-2xl"></i>
              <div class="flex-1">
                <p class="font-medium text-gray-800" id="file-name-display"></p>
                <p class="text-sm text-gray-500" id="file-record-count"></p>
              </div>
              <button id="btn-reset" class="text-red-500 hover:text-red-700 transition-colors" title="파일 제거">
                <i class="fas fa-times-circle text-xl"></i>
              </button>
            </div>
          </div>
        </section>

        {/* Step 2: 데이터 미리보기 */}
        <section id="section-preview" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 hidden">
          <h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i class="fas fa-table text-blue-500"></i>
            2. 데이터 확인 및 검증
          </h2>

          {/* 상태 요약 */}
          <div id="validation-summary" class="grid grid-cols-4 gap-3 mb-4 hidden">
            <div class="bg-gray-50 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-gray-700" id="stat-total">0</p>
              <p class="text-xs text-gray-500">전체</p>
            </div>
            <div class="bg-green-50 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-green-600" id="stat-valid">0</p>
              <p class="text-xs text-green-500">정상</p>
            </div>
            <div class="bg-red-50 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-red-600" id="stat-invalid">0</p>
              <p class="text-xs text-red-500">오류</p>
            </div>
            <div class="bg-blue-50 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-blue-600" id="stat-selected">0</p>
              <p class="text-xs text-blue-500">선택</p>
            </div>
          </div>

          {/* 검색 및 필터 */}
          <div class="flex items-center gap-3 mb-4">
            <div class="relative flex-1">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input type="text" id="search-input" placeholder="이름 또는 연락처로 검색..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <select id="filter-status" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="all">전체보기</option>
              <option value="valid">정상만</option>
              <option value="invalid">오류만</option>
            </select>
            <button id="btn-select-all" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">전체선택</button>
          </div>

          {/* 테이블 */}
          <div class="overflow-x-auto border border-gray-200 rounded-lg">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="w-10 px-3 py-2 text-center">
                    <input type="checkbox" id="check-all" class="rounded" />
                  </th>
                  <th class="px-3 py-2 text-left text-gray-600 font-medium">#</th>
                  <th class="px-3 py-2 text-left text-gray-600 font-medium">주민등록번호</th>
                  <th class="px-3 py-2 text-left text-gray-600 font-medium">이름</th>
                  <th class="px-3 py-2 text-left text-gray-600 font-medium">전화번호</th>
                  <th class="px-3 py-2 text-center text-gray-600 font-medium">상태</th>
                  <th class="px-3 py-2 text-left text-gray-600 font-medium">오류 내용</th>
                </tr>
              </thead>
              <tbody id="table-body">
                <tr>
                  <td colspan="7" class="px-3 py-8 text-center text-gray-400">데이터가 없습니다</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between mt-3">
            <p class="text-sm text-gray-500" id="table-info"></p>
            <div class="flex gap-2" id="pagination"></div>
          </div>
        </section>

        {/* Step 3: 전산등록 매크로 (다중입력 10명 배치 복사) */}
        <section id="section-macro" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 hidden">
          <h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i class="fas fa-robot text-blue-500"></i>
            3. 전산 등록 (다중입력 배치 복사)
          </h2>

          {/* 안내 배너 */}
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div class="flex items-start gap-3">
              <i class="fas fa-info-circle text-blue-600 mt-1"></i>
              <div>
                <p class="font-medium text-blue-800 text-sm">다중입력 10명 배치 복사 방식</p>
                <p class="text-blue-700 text-sm mt-1">
                  KB손보 사이트의 <strong>「다중입력」</strong> 기능을 활용하여 최대 <strong>10명씩</strong> 배치로 복사합니다.
                  KB 사이트에서 다중입력 체크 후, 복사된 데이터를 첫 번째 칸에 <strong>붙여넣기(Ctrl+V)</strong> 하면 한 번에 입력됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* 배치 그룹 선택 */}
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="border border-gray-200 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-3">
                <i class="fas fa-layer-group text-blue-500"></i>
                <h3 class="font-bold text-gray-700 text-sm">배치 그룹</h3>
              </div>
              <div class="grid grid-cols-2 gap-2 mb-3">
                <div class="bg-gray-50 rounded p-2 text-center">
                  <p class="text-lg font-bold text-gray-700" id="batch-total">0</p>
                  <p class="text-xs text-gray-400">전체 고객</p>
                </div>
                <div class="bg-gray-50 rounded p-2 text-center">
                  <p class="text-lg font-bold text-gray-700" id="batch-count">0</p>
                  <p class="text-xs text-gray-400">총 배치 수</p>
                </div>
                <div class="bg-blue-50 rounded p-2 text-center">
                  <p class="text-lg font-bold text-blue-700" id="batch-current">-</p>
                  <p class="text-xs text-blue-500">현재 배치</p>
                </div>
                <div class="bg-blue-50 rounded p-2 text-center">
                  <p class="text-lg font-bold text-blue-700" id="batch-size">10</p>
                  <p class="text-xs text-blue-500">배치당 인원</p>
                </div>
              </div>
            </div>

            <div class="border border-gray-200 rounded-lg p-4">
              <h3 class="font-bold text-gray-700 text-sm mb-3 flex items-center gap-2">
                <i class="fas fa-clipboard-list text-green-500"></i>
                현재 배치 미리보기
              </h3>
              <div class="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="text-gray-400 border-b border-gray-200">
                      <th class="text-left py-1">#</th>
                      <th class="text-left py-1">주민등록번호</th>
                      <th class="text-left py-1">고객명</th>
                    </tr>
                  </thead>
                  <tbody id="batch-preview-body">
                    <tr><td colspan="3" class="py-2 text-gray-400 text-center">데이터 없음</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 배치 복사 액션 */}
          <div class="border border-gray-200 rounded-lg p-4 mb-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-gray-700 text-sm flex items-center gap-2">
                <i class="fas fa-copy text-blue-500"></i>
                KB 사이트에 붙여넣기 할 데이터
              </h3>
              <span id="macro-copy-badge" class="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                대기 중
              </span>
            </div>
            <div class="bg-gray-900 rounded-lg p-3 mb-3 font-mono text-green-400 text-xs overflow-x-auto whitespace-pre max-h-28 overflow-y-auto" id="batch-copy-preview">
              아직 복사된 데이터가 없습니다
            </div>
            <div class="flex gap-2">
              <button id="btn-batch-copy" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg transition-colors font-medium">
                <i class="fas fa-copy mr-1"></i> 현재 배치 복사 (Ctrl+C)
              </button>
              <button id="btn-batch-next" class="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm py-2.5 rounded-lg transition-colors" disabled>
                다음 배치 <i class="fas fa-chevron-right ml-1"></i>
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-2" id="clipboard-status">
              <i class="fas fa-lightbulb mr-1"></i> KB 사이트에서 「다중입력」 체크 → 첫 칸 클릭 → Ctrl+V 붙여넣기 → 「출력」 클릭
            </p>
          </div>

          {/* 진행률 */}
          <div class="mt-3 mb-3">
            <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span id="macro-progress">0 / 0 배치 완료</span>
              <span id="macro-progress-pct">0%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div id="macro-progress-bar" class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>

          {/* 주의사항 */}
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div class="flex items-start gap-2">
              <i class="fas fa-exclamation-triangle text-yellow-600 text-xs mt-0.5"></i>
              <div class="text-xs text-yellow-700">
                <p class="font-medium">KB 사이트 사용 방법</p>
                <ol class="list-decimal list-inside mt-1 space-y-0.5 text-yellow-600">
                  <li>KB손보 사이트 로그인 → 「동의서출력」 메뉴 진입</li>
                  <li>「고객인적사항」 옆 <strong>「다중입력」 체크</strong></li>
                  <li>「주민등록번호」 첫 칸 클릭 → <strong>Ctrl+V</strong> 붙여넣기</li>
                  <li>「출력」 버튼 클릭 → PDF 다운로드</li>
                  <li>다음 배치 복사 → 붙여넣기 반복</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Step 4: 동의서 출력 */}
        <section id="section-consent" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 hidden">
          <h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i class="fas fa-file-signature text-blue-500"></i>
            4. 동의서 출력
          </h2>

          <div class="flex items-center gap-3 mb-4">
            <button id="btn-consent-preview" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors font-medium">
              <i class="fas fa-eye mr-1"></i> 선택 고객 동의서 미리보기
            </button>
            <button id="btn-consent-print-all" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors font-medium">
              <i class="fas fa-print mr-1"></i> 선택 고객 일괄 인쇄
            </button>
            <button id="btn-consent-download-all" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors font-medium">
              <i class="fas fa-download mr-1"></i> 선택 고객 PDF 다운로드
            </button>
          </div>

          {/* 동의서 미리보기 영역 */}
          <div id="consent-preview-area" class="border border-gray-200 rounded-lg p-6 bg-white hidden">
            <div id="consent-content"></div>
            <div class="flex justify-between mt-4 pt-4 border-t border-gray-200">
              <button id="btn-consent-prev-customer" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
                <i class="fas fa-chevron-left mr-1"></i> 이전 고객
              </button>
              <span class="text-sm text-gray-500 self-center" id="consent-customer-info"></span>
              <button id="btn-consent-next-customer" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
                다음 고객 <i class="fas fa-chevron-right ml-1"></i>
              </button>
            </div>
            <div class="flex gap-2 mt-3 justify-end">
              <button id="btn-consent-print-one" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors">
                <i class="fas fa-print mr-1"></i> 현재 동의서 인쇄
              </button>
              <button id="btn-consent-download-one" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
                <i class="fas fa-download mr-1"></i> 현재 동의서 PDF
              </button>
            </div>
          </div>
        </section>

        {/* 진행률 */}
        <div id="progress-bar-container" class="hidden mb-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-gray-700">전체 진행률</span>
            <span class="text-sm text-gray-500" id="progress-text">0/0</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div id="progress-bar" class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
        </div>
      </main>

      {/* 동의서 인쇄용 히든 iframe */}
      <iframe id="print-frame" class="hidden" title="인쇄 프레임"></iframe>

      {/* 모달 */}
      <div id="modal-overlay" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center">
        <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" id="modal-content"></div>
      </div>

      {/* Toast */}
      <div id="toast" class="fixed bottom-6 right-6 z-50 hidden">
        <div class="bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <i class="fas fa-check-circle text-green-400"></i>
          <span id="toast-msg" class="text-sm"></span>
        </div>
      </div>

      <script src="/static/app.js"></script>
    </div>
  )
}

// ============================================================
// 동의서 미리보기 전용 페이지
// ============================================================
function ConsentPreviewPage() {
  return (
    <div>
      <header class="bg-white shadow-sm border-b border-gray-200 print:hidden">
        <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 class="text-lg font-bold text-gray-800">동의서 미리보기</h1>
          <button onclick="window.print()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            <i class="fas fa-print mr-1"></i> 인쇄
          </button>
        </div>
      </header>
      <main class="max-w-4xl mx-auto px-4 py-8">
        <div id="consent-render-area">
          <p class="text-center text-gray-400">데이터를 불러오는 중...</p>
        </div>
      </main>
      <script src="/static/consent.js"></script>
    </div>
  )
}
