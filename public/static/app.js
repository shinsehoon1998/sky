// ============================================================
// 고객정보 등록 및 동의서 출력 시스템 - 메인 앱
// ============================================================

// 전역 상태
const state = {
  rawData: [],           // 원본 엑셀 데이터
  validatedData: [],     // 검증 결과 (index, isValid, errors, normalized)
  selectedIndices: new Set(),
  currentStep: 1,
  currentMacroIdx: 0,
  currentConsentIdx: 0,
  consentCustomerIndices: [],
  pageSize: 20,
  currentPage: 1
};

// ============================================================
// Step 관리
// ============================================================
function navigateToStep(step) {
  state.currentStep = step;
  [1, 2, 3, 4].forEach(s => {
    const dot = document.getElementById(`step-dot-${s}`);
    const label = document.getElementById(`step-label-${s}`);
    if (s <= step) {
      dot.className = 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all bg-blue-600 text-white';
      label.className = 'text-sm font-medium transition-all text-blue-600';
    } else {
      dot.className = 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all bg-gray-200 text-gray-500';
      label.className = 'text-sm font-medium transition-all text-gray-400';
    }
  });
  // step 연결선
  [1, 2, 3].forEach(s => {
    const line = document.getElementById(`step-line-${s}`);
    if (s < step) {
      line.className = 'w-12 h-0.5 transition-all bg-blue-400';
    } else {
      line.className = 'w-12 h-0.5 transition-all bg-gray-200';
    }
  });

  document.getElementById('section-upload').classList.toggle('hidden', step !== 1);
  document.getElementById('section-preview').classList.toggle('hidden', step < 2);
  document.getElementById('section-macro').classList.toggle('hidden', step < 3);
  document.getElementById('section-consent').classList.toggle('hidden', step < 4);
}

// ============================================================
// Step 1: 파일 업로드
// ============================================================
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = document.getElementById('file-name-display');
const fileRecordCount = document.getElementById('file-record-count');

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-blue-400', 'bg-blue-50');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-blue-400', 'bg-blue-50');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-blue-400', 'bg-blue-50');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

document.getElementById('btn-reset').addEventListener('click', resetAll);

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  if (!file.name.endsWith('.xlsx')) {
    showToast('error', '.xlsx 파일만 지원됩니다');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellText: true, cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      // 셀 데이터를 안전하게 문자열로 변환하는 함수
      function safeCellValue(cell) {
        if (!cell) return '';
        // cell.w: formatted text (엑셀에 표시되는 그대로의 값) - 가장 우선
        if (cell.w !== undefined && cell.w !== null && String(cell.w).trim() !== '') {
          return String(cell.w).trim();
        }
        // cell.v: raw value
        if (cell.v !== undefined && cell.v !== null) {
          const val = cell.v;
          // 숫자 타입이고 지수 표기법으로 표시될 가능성이 있는 경우
          if (typeof val === 'number') {
            // 정수인 경우 소수점 없이 전체 자릿수 출력
            if (Number.isInteger(val) && val < 1e15) {
              return String(Math.floor(val));
            }
            // 큰 정수 (주민번호 등): toFixed로 정확한 자릿수 확보
            if (val > 1000000000000) {
              return String(Math.floor(val));
            }
            return String(val);
          }
          return String(val).trim();
        }
        // cell.r 또는 t 참조
        if (cell.t === 's') return ''; // shared string이면 빈 값
        return '';
      }

      // ref 기반으로 모든 셀 순회
      const ref = firstSheet['!ref'];
      if (!ref) {
        showToast('error', '엑셀 파일에 데이터가 없습니다');
        return;
      }

      const range = XLSX.utils.decode_range(ref);
      const rows = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddr = XLSX.utils.encode_cell({ r, c });
          const cell = firstSheet[cellAddr];
          row.push(safeCellValue(cell));
        }
        rows.push(row);
      }

      if (rows.length < 2) {
        showToast('error', '데이터가 없거나 형식이 올바르지 않습니다');
        return;
      }

      // A열(주민등록번호), B열(이름), C열(전화번호)
      const juminIdx = 0;
      const nameIdx = 1;
      const phoneIdx = 2;

      state.rawData = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const jumin = (row[juminIdx] || '').trim();
        const name = (row[nameIdx] || '').trim();
        const phone = (row[phoneIdx] || '').trim();
        if (!jumin && !name && !phone) continue;

        // 전화번호에서 하이픈(-)이 소수점으로 변환된 경우 보정
        // 예: - 가 엑셀 내부에서 처리되면서 소수점으로 해석될 수 있음
        // phone이 순수 숫자로 변환된 경우 010-XXXX-XXXX → 10-XXXX-XXXX 형태
        // 그대로 사용 (어차피 검증 단계에서 표준화)

        state.rawData.push({ jumin, name, phone });
      }

      if (state.rawData.length === 0) {
        showToast('error', '추출된 데이터가 없습니다');
        return;
      }

      fileNameDisplay.textContent = file.name;
      fileRecordCount.textContent = `${state.rawData.length}건의 고객 데이터 감지됨`;
      fileInfo.classList.remove('hidden');
      dropZone.querySelector('i').className = 'fas fa-check-circle text-5xl text-green-400 mb-4 block';
      dropZone.querySelector('p:first-of-type').textContent = '파일 업로드 완료!';

      showToast('success', `${state.rawData.length}건의 데이터를 불러왔습니다`);

      // 자동으로 검증 실행
      validateData();
    } catch (err) {
      console.error('File processing error:', err);
      showToast('error', '파일 처리 중 오류가 발생했습니다');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ============================================================
// Step 2: 데이터 검증 및 미리보기
// ============================================================
async function validateData() {
  if (state.rawData.length === 0) return;

  try {
    const resp = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: state.rawData })
    });
    const result = await resp.json();
    state.validatedData = result.results;
    state.selectedIndices = new Set(state.validatedData.map(r => r.index));

    // 통계 업데이트
    document.getElementById('stat-total').textContent = result.total;
    document.getElementById('stat-valid').textContent = result.valid;
    document.getElementById('stat-invalid').textContent = result.invalid;
    document.getElementById('stat-selected').textContent = state.selectedIndices.size;
    document.getElementById('validation-summary').classList.remove('hidden');

    // Step 2 표시
    document.getElementById('section-preview').classList.remove('hidden');
    navigateToStep(2);

    renderTable();
  } catch (err) {
    console.error('Validation error:', err);
    showToast('error', '데이터 검증 중 오류가 발생했습니다');
  }
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const filterStatus = document.getElementById('filter-status').value;

  let filtered = state.validatedData;

  // 검색 필터
  if (searchTerm) {
    filtered = filtered.filter(r => {
      const rec = state.rawData[r.index];
      return rec.name.toLowerCase().includes(searchTerm)
        || rec.phone.includes(searchTerm)
        || rec.jumin.includes(searchTerm);
    });
  }

  // 상태 필터
  if (filterStatus === 'valid') {
    filtered = filtered.filter(r => r.isValid);
  } else if (filterStatus === 'invalid') {
    filtered = filtered.filter(r => !r.isValid);
  }

  // 페이지네이션
  const totalPages = Math.ceil(filtered.length / state.pageSize) || 1;
  const startIdx = (state.currentPage - 1) * state.pageSize;
  const pageData = filtered.slice(startIdx, startIdx + state.pageSize);

  document.getElementById('table-info').textContent = `총 ${filtered.length}건 (${state.currentPage}/${totalPages} 페이지)`;

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-3 py-8 text-center text-gray-400">검색 결과가 없습니다</td></tr>';
  } else {
    tbody.innerHTML = pageData.map(result => {
      const rec = state.rawData[result.index];
      const isChecked = state.selectedIndices.has(result.index);
      const statusHtml = result.isValid
        ? '<span class="inline-flex items-center gap-1 text-green-600"><i class="fas fa-check-circle text-xs"></i> 정상</span>'
        : '<span class="inline-flex items-center gap-1 text-red-600"><i class="fas fa-exclamation-circle text-xs"></i> 오류</span>';
      const errorsHtml = result.errors.length > 0
        ? `<span class="text-red-500 text-xs">${result.errors.join(', ')}</span>`
        : '<span class="text-gray-400 text-xs">-</span>';

      // 주민번호 마스킹 표시
      const juminDisplay = rec.jumin.length === 13
        ? `${rec.jumin.substring(0, 6)}-${'*'.repeat(7)}`
        : rec.jumin;

      return `
        <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors ${!result.isValid ? 'bg-red-50' : ''}">
          <td class="px-3 py-2 text-center">
            <input type="checkbox" class="row-checkbox rounded" data-index="${result.index}" ${isChecked ? 'checked' : ''} />
          </td>
          <td class="px-3 py-2 text-gray-500 text-xs">${result.index + 1}</td>
          <td class="px-3 py-2 font-mono text-sm text-gray-700">${juminDisplay}</td>
          <td class="px-3 py-2 font-medium text-gray-800">${rec.name}</td>
          <td class="px-3 py-2 text-gray-600">${rec.phone}</td>
          <td class="px-3 py-2 text-center">${statusHtml}</td>
          <td class="px-3 py-2">${errorsHtml}</td>
        </tr>
      `;
    }).join('');

    // 체크박스 이벤트
    tbody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', function() {
        const idx = parseInt(this.dataset.index);
        if (this.checked) state.selectedIndices.add(idx);
        else state.selectedIndices.delete(idx);
        updateSelectionCount();
      });
    });
  }

  updateSelectionCount();
  renderPagination(totalPages);
}

function updateSelectionCount() {
  document.getElementById('stat-selected').textContent = state.selectedIndices.size;
  document.getElementById('check-all').checked =
    state.validatedData.length > 0 && state.selectedIndices.size === state.validatedData.length;
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  let html = '';
  html += `<button class="px-3 py-1 text-sm rounded ${state.currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}" ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="px-3 py-1 text-sm rounded ${i === state.currentPage ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}" onclick="goToPage(${i})">${i}</button>`;
  }
  html += `<button class="px-3 py-1 text-sm rounded ${state.currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}" ${state.currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
  container.innerHTML = html;
}

function goToPage(page) {
  const totalPages = Math.ceil(state.validatedData.length / state.pageSize) || 1;
  if (page < 1 || page > totalPages) return;
  state.currentPage = page;
  renderTable();
}

document.getElementById('search-input').addEventListener('input', () => {
  state.currentPage = 1;
  renderTable();
});

document.getElementById('filter-status').addEventListener('change', () => {
  state.currentPage = 1;
  renderTable();
});

document.getElementById('check-all').addEventListener('change', function() {
  if (this.checked) {
    state.validatedData.forEach(r => state.selectedIndices.add(r.index));
  } else {
    state.selectedIndices.clear();
  }
  renderTable();
});

document.getElementById('btn-select-all').addEventListener('click', function() {
  const allSelected = state.selectedIndices.size === state.validatedData.length;
  if (allSelected) {
    state.selectedIndices.clear();
    this.textContent = '전체선택';
  } else {
    state.validatedData.forEach(r => state.selectedIndices.add(r.index));
    this.textContent = '전체해제';
  }
  renderTable();
});

// ============================================================
// Step 3: 전산등록 매크로 (다중입력 10명 배치 복사)
// ============================================================
const BATCH_SIZE = 10;  // KB 다중입력 최대 인원
let macroQueue = [];     // 전체 고객 데이터
let batches = [];        // 10명씩 나눈 배치 배열
let currentBatchIdx = 0; // 현재 배치 인덱스

/** 포맷된 주민등록번호 (하이픈 포함) */
function fmtJumin(raw) {
  const d = raw.replace(/[^0-9]/g, '');
  if (d.length !== 13) return raw;
  return d.substring(0, 6) + '-' + d.substring(6);
}

/** 배치 데이터를 KB 다중입력용 탭 구분 텍스트로 변환 */
function buildBatchText(batchData) {
  // KB 다중입력: 각 행이 "주민등록번호[TAB]고객명" 형식
  // 첫 번째 행은 "주민등록번호", 두 번째부터 "주민등록번호2", "주민등록번호3"...
  // 하지만 붙여넣기는 탭으로 구분된 데이터를 순서대로 채워넣음
  return batchData.map(c => {
    const jd = c.jumin ? c.jumin.replace(/[^0-9]/g, '') : '';
    return `${jd.length === 13 ? jd.substring(0, 6) + '-' + jd.substring(6) : c.jumin}\t${c.name}`;
  }).join('\n');
}

/** 배치 미리보기 테이블 업데이트 */
function renderBatchPreview(batchData) {
  const tbody = document.getElementById('batch-preview-body');
  if (!batchData || batchData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-2 text-gray-400 text-center">데이터 없음</td></tr>';
    return;
  }
  tbody.innerHTML = batchData.map((c, i) => {
    const jd = c.jumin ? c.jumin.replace(/[^0-9]/g, '') : '';
    const jdDisplay = jd.length === 13 ? jd.substring(0, 6) + '-' + jd.substring(6) : c.jumin;
    return `<tr class="border-b border-gray-100">
      <td class="py-1 text-gray-400">${i + 1}</td>
      <td class="py-1 font-mono text-gray-700">${jdDisplay}</td>
      <td class="py-1 font-medium text-gray-800">${c.name}</td>
    </tr>`;
  }).join('');
}

/** 배치 데이터 표시 및 복사 */
function showCurrentBatch() {
  const batch = batches[currentBatchIdx];
  if (!batch) return;

  const batchText = buildBatchText(batch);

  // 복사 미리보기
  document.getElementById('batch-copy-preview').textContent = batchText;
  document.getElementById('batch-current').textContent = `${currentBatchIdx + 1} / ${batches.length}`;

  // 배치 미리보기 테이블
  renderBatchPreview(batch);

  // 복사 실행
  copyBatchToClipboard(batch, batchText);
}

/** 클립보드 복사 */
function copyBatchToClipboard(batch, text) {
  const badge = document.getElementById('macro-copy-badge');
  const status = document.getElementById('clipboard-status');

  navigator.clipboard.writeText(text).then(() => {
    badge.className = 'px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full';
    badge.textContent = '복사 완료';
    status.innerHTML = `<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i> 클립보드 복사 완료!</span> <span class="text-gray-400">→ KB 사이트 첫 칸에 <kbd class="px-1 bg-gray-200 rounded text-xs">Ctrl+V</kbd> 붙여넣기 → 「출력」 클릭</span>`;

    // 배치 버튼 활성화
    const nextBtn = document.getElementById('btn-batch-next');
    if (currentBatchIdx < batches.length - 1) {
      nextBtn.disabled = false;
      nextBtn.className = 'px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg transition-colors font-medium';
      nextBtn.innerHTML = '다음 배치 <i class="fas fa-chevron-right ml-1"></i>';
    } else {
      nextBtn.disabled = false;
      nextBtn.className = 'px-4 bg-green-600 hover:bg-green-700 text-white text-sm py-2.5 rounded-lg transition-colors font-medium';
      nextBtn.innerHTML = '<i class="fas fa-check mr-1"></i> 마지막 배치 완료';
    }

    updateProgressBar();
  }).catch(() => {
    badge.className = 'px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full';
    badge.textContent = '복사 실패';
    status.innerHTML = '<span class="text-red-600"><i class="fas fa-times-circle mr-1"></i> 클립보드 복사 실패. 텍스트를 직접 복사해 주세요.</span>';
  });
}

/** 진행률 업데이트 */
function updateProgressBar(complete = false) {
  const container = document.getElementById('progress-bar-container');
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');

  const totalBatches = batches.length;
  if (totalBatches === 0) return;
  if (container) container.classList.remove('hidden');

  const done = complete ? totalBatches : currentBatchIdx;
  const pct = complete ? 100 : Math.round((done / totalBatches) * 100);
  if (bar) bar.style.width = `${pct}%`;
  if (text) text.textContent = complete ? `${totalBatches}/${totalBatches} (완료)` : `${done}/${totalBatches}`;

  // Step 3 내부 진행률 업데이트
  const macroBar = document.getElementById('macro-progress-bar');
  const macroPct = document.getElementById('macro-progress-pct');
  const macroProg = document.getElementById('macro-progress');
  if (macroBar) macroBar.style.width = `${pct}%`;
  if (macroPct) macroPct.textContent = `${pct}%`;
  if (macroProg) macroProg.textContent = `${done} / ${totalBatches} 배치 완료`;
}

/** 매크로 초기화 */
function initMacro() {
  macroQueue = state.validatedData
    .filter(r => r.isValid && state.selectedIndices.has(r.index))
    .map(r => state.rawData[r.index]);

  if (macroQueue.length === 0) {
    showToast('error', '선택된 고객이 없습니다');
    return;
  }

  // 10명씩 배치로 분할
  batches = [];
  for (let i = 0; i < macroQueue.length; i += BATCH_SIZE) {
    batches.push(macroQueue.slice(i, i + BATCH_SIZE));
  }

  currentBatchIdx = 0;
  state.currentMacroIdx = 0;

  document.getElementById('section-macro').classList.remove('hidden');
  navigateToStep(3);

  // 배치 통계 업데이트
  document.getElementById('batch-total').textContent = macroQueue.length;
  document.getElementById('batch-count').textContent = batches.length;
  document.getElementById('batch-size').textContent = BATCH_SIZE;

  // 첫 배치 표시 및 복사
  showCurrentBatch();
}

// ============================================================
// 버튼 이벤트 핸들러
// ============================================================

/** 현재 배치 복사 (재복사) */
document.getElementById('btn-batch-copy').addEventListener('click', () => {
  if (batches.length === 0) return;
  const batch = batches[currentBatchIdx];
  const text = buildBatchText(batch);
  copyBatchToClipboard(batch, text);
});

/** 다음 배치로 이동 */
document.getElementById('btn-batch-next').addEventListener('click', () => {
  if (currentBatchIdx >= batches.length - 1) {
    showToast('success', '모든 배치 처리가 완료되었습니다. Step 4에서 동의서를 출력하세요.');
    updateProgressBar(true);
    return;
  }
  currentBatchIdx++;
  state.currentMacroIdx = currentBatchIdx * BATCH_SIZE;
  showCurrentBatch();

  if (currentBatchIdx >= batches.length - 1) {
    showToast('success', `마지막 배치입니다. (총 ${batches.length}개 배치)`);
  }
});

// ============================================================
// Step 4: 동의서 출력
// ============================================================
function initConsent() {
  state.consentCustomerIndices = state.validatedData
    .filter(r => r.isValid && state.selectedIndices.has(r.index))
    .map(r => r.index);

  state.currentConsentIdx = 0;
  document.getElementById('section-consent').classList.remove('hidden');
  navigateToStep(4);

  if (state.consentCustomerIndices.length > 0) {
    showConsentPreview(state.currentConsentIdx);
  }
}

function showConsentPreview(idx) {
  if (idx < 0 || idx >= state.consentCustomerIndices.length) return;
  state.currentConsentIdx = idx;
  const dataIdx = state.consentCustomerIndices[idx];
  const record = state.rawData[dataIdx];
  const normalized = normalizeLocal(record);

  const consentArea = document.getElementById('consent-preview-area');
  consentArea.classList.remove('hidden');

  document.getElementById('consent-content').innerHTML = generateConsentHTML(normalized);
  document.getElementById('consent-customer-info').textContent =
    `${idx + 1} / ${state.consentCustomerIndices.length} - ${record.name}`;
}

function normalizeLocal(record) {
  const jumin = record.jumin.trim();
  const phone = record.phone.trim().replace(/[^0-9]/g, '');
  let formattedPhone = phone;
  if (phone.length === 11) formattedPhone = `${phone.substring(0, 3)}-${phone.substring(3, 7)}-${phone.substring(7)}`;
  else if (phone.length === 10) formattedPhone = `${phone.substring(0, 3)}-${phone.substring(3, 6)}-${phone.substring(6)}`;

  return {
    name: record.name.trim(),
    jumin: jumin,
    maskedJumin: `${jumin.substring(0, 6)}-${'*'.repeat(7)}`,
    phone: formattedPhone
  };
}

function generateConsentHTML(record) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  return `
    <div id="consent-doc" class="max-w-2xl mx-auto font-sans text-gray-800 text-sm leading-relaxed">
      <!-- 헤더 -->
      <div class="text-center border-b-2 border-gray-800 pb-4 mb-6">
        <h1 class="text-2xl font-bold tracking-wider mb-1">개인정보 수집·이용 동의서</h1>
        <p class="text-xs text-gray-500">(보험계약 관련)</p>
      </div>

      <!-- 고객 정보 -->
      <div class="border border-gray-300 rounded-lg p-4 mb-6 bg-gray-50">
        <h2 class="font-bold text-base mb-3 border-b border-gray-300 pb-2">고객 정보</h2>
        <table class="w-full text-sm">
          <tr>
            <td class="py-2 w-24 font-medium text-gray-600">성명</td>
            <td class="py-2 font-bold text-base">${record.name}</td>
          </tr>
          <tr>
            <td class="py-2 w-24 font-medium text-gray-600">주민등록번호</td>
            <td class="py-2 font-mono">${record.maskedJumin}</td>
          </tr>
          <tr>
            <td class="py-2 w-24 font-medium text-gray-600">연락처</td>
            <td class="py-2">${record.phone}</td>
          </tr>
        </table>
      </div>

      <!-- 수집·이용 목적 -->
      <div class="mb-6">
        <h2 class="font-bold text-base mb-2">1. 개인정보 수집·이용 목적</h2>
        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>보험계약 상담, 보험료 산출 및 계약 체결</li>
          <li>보험계약 유지·관리 및 보험금 지급 심사</li>
          <li>보험상품 안내 및 마케팅 활용</li>
          <li>민원처리 및 분쟁 해결</li>
        </ul>
      </div>

      <!-- 수집 항목 -->
      <div class="mb-6">
        <h2 class="font-bold text-base mb-2">2. 수집하는 개인정보 항목</h2>
        <table class="w-full text-sm border border-gray-300">
          <thead class="bg-gray-50">
            <tr>
              <th class="border border-gray-300 px-3 py-2 text-left font-medium">수집 항목</th>
              <th class="border border-gray-300 px-3 py-2 text-left font-medium">수집 내용</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="border border-gray-300 px-3 py-2">필수 항목</td>
              <td class="border border-gray-300 px-3 py-2">성명, 주민등록번호, 연락처(휴대전화), 주소</td>
            </tr>
            <tr>
              <td class="border border-gray-300 px-3 py-2">선택 항목</td>
              <td class="border border-gray-300 px-3 py-2">이메일, 직업, 결혼 여부, 운전 여부 등</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 보유·이용 기간 -->
      <div class="mb-6">
        <h2 class="font-bold text-base mb-2">3. 개인정보의 보유 및 이용 기간</h2>
        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>보험계약 종료일로부터 5년간 (단, 관련 법령에 따라 보존이 필요한 경우 해당 기간까지)</li>
          <li>민원처리 및 분쟁 해결을 위한 경우: 민원 종료 후 3년간</li>
          <li>금융거래 관련: 「전자금융거래법」에 따라 5년간</li>
        </ul>
      </div>

      <!-- 동의 거부 권리 -->
      <div class="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h2 class="font-bold text-base mb-2">4. 동의 거부 권리 및 불이익</h2>
        <p class="text-sm text-gray-700">
          귀하는 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다. 다만, 필수 항목에 대한 동의를 거부할 경우 보험계약 상담, 체결 및 유지·관리가 불가능할 수 있습니다. 선택 항목에 대한 동의를 거부하더라도 보험계약 체결에는 영향을 미치지 않습니다.
        </p>
      </div>

      <!-- 동의 체크 -->
      <div class="border border-gray-400 rounded-lg p-4 mb-6">
        <div class="flex items-start gap-4 mb-3">
          <div class="w-5 h-5 border-2 border-gray-500 rounded mt-0.5 flex-shrink-0 flex items-center justify-center">
            <span class="text-xs">□</span>
          </div>
          <p class="text-sm"><strong>개인정보 수집·이용에 동의합니다.</strong> (필수)</p>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-5 h-5 border-2 border-gray-500 rounded mt-0.5 flex-shrink-0 flex items-center justify-center">
            <span class="text-xs">□</span>
          </div>
          <p class="text-sm"><strong>민감정보 및 고유식별정보 처리에 동의합니다.</strong> (필수)</p>
        </div>
      </div>

      <!-- 서명란 -->
      <div class="flex justify-between items-end mt-10 pt-6 border-t border-gray-300">
        <div>
          <p class="text-xs text-gray-500 mb-4">${dateStr}</p>
          <p class="font-bold text-base">성명: ${record.name}</p>
          <p class="text-sm text-gray-600 mt-1">(서명)</p>
          <div class="mt-2 w-32 h-12 border-b border-gray-400"></div>
        </div>
        <div class="text-right">
          <p class="font-bold text-base mb-1">○○보험㈜ 귀중</p>
          <p class="text-xs text-gray-400">담당자: ________________</p>
        </div>
      </div>
    </div>
  `;
}

document.getElementById('btn-consent-preview').addEventListener('click', () => {
  initConsent();
  navigateToStep(4);
});

document.getElementById('btn-consent-prev-customer').addEventListener('click', () => {
  if (state.currentConsentIdx > 0) showConsentPreview(state.currentConsentIdx - 1);
});

document.getElementById('btn-consent-next-customer').addEventListener('click', () => {
  if (state.currentConsentIdx < state.consentCustomerIndices.length - 1) {
    showConsentPreview(state.currentConsentIdx + 1);
  } else {
    showToast('success', '마지막 고객입니다');
  }
});

// 동의서 인쇄
document.getElementById('btn-consent-print-one').addEventListener('click', () => {
  const doc = document.getElementById('consent-doc');
  if (!doc) return;
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>개인정보 수집·이용 동의서</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>
        @media print {
          body { margin: 0; padding: 20px; }
          .print-hidden { display: none; }
        }
        @page { size: A4; margin: 15mm; }
      </style>
    </head>
    <body>${doc.outerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
});

// PDF 다운로드
document.getElementById('btn-consent-download-one').addEventListener('click', async () => {
  const doc = document.getElementById('consent-doc');
  if (!doc) return;
  try {
    const canvas = await html2canvas(doc, { scale: 2, useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10;

    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= pdf.internal.pageSize.getHeight() - 20;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight() - 20;
    }

    const record = state.rawData[state.consentCustomerIndices[state.currentConsentIdx]];
    pdf.save(`동의서_${record.name}.pdf`);
    showToast('success', 'PDF 다운로드가 시작되었습니다');
  } catch (err) {
    console.error('PDF generation error:', err);
    showToast('error', 'PDF 생성 중 오류가 발생했습니다. 인쇄 기능을 이용해 주세요.');
  }
});

// 일괄 인쇄
document.getElementById('btn-consent-print-all').addEventListener('click', () => {
  if (state.consentCustomerIndices.length === 0) {
    initConsent();
    if (state.consentCustomerIndices.length === 0) {
      showToast('error', '선택된 고객이 없습니다');
      return;
    }
  }

  const allHTML = state.consentCustomerIndices.map(idx => {
    const record = state.rawData[idx];
    const normalized = normalizeLocal(record);
    return generateConsentHTML(normalized);
  }).join('<div style="page-break-after: always;"></div>');

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(`
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>동의서 일괄 인쇄</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <style>
      @media print {
        body { margin: 0; padding: 20px; }
        .page-break { page-break-after: always; }
      }
      @page { size: A4; margin: 15mm; }
    </style></head>
    <body>${allHTML}</body></html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 800);
  showToast('success', '일괄 인쇄가 시작되었습니다');
});

// 일괄 PDF 다운로드
document.getElementById('btn-consent-download-all').addEventListener('click', () => {
  showToast('info', '일괄 PDF 다운로드는 브라우저 제한으로 개별 다운로드가 필요합니다. 인쇄 기능을 이용해 주세요.');
});

// ============================================================
// 진행률 업데이트
// ============================================================
function updateProgressBar(complete = false) {
  const container = document.getElementById('progress-bar-container');
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');

  if (macroQueue.length === 0) return;
  container.classList.remove('hidden');

  const current = state.currentMacroIdx + 1;
  const total = macroQueue.length;
  const pct = complete ? 100 : Math.round((current / total) * 100);

  bar.style.width = `${pct}%`;
  text.textContent = complete ? `${total}/${total} (완료)` : `${current}/${total}`;

  // Step 3 매크로 섹션 내부 진행률 표시줄도 동시에 업데이트
  const macroBar = document.getElementById('macro-progress-bar');
  const macroPct = document.getElementById('macro-progress-pct');
  if (macroBar) macroBar.style.width = `${pct}%`;
  if (macroPct) macroPct.textContent = `${pct}%`;
}

// ============================================================
// 공통 유틸리티
// ============================================================
function resetAll() {
  state.rawData = [];
  state.validatedData = [];
  state.selectedIndices.clear();
  state.currentStep = 1;
  state.currentMacroIdx = 0;
  state.currentConsentIdx = 0;
  state.consentCustomerIndices = [];
  state.currentPage = 1;

  fileInput.value = '';
  fileInfo.classList.add('hidden');
  dropZone.querySelector('i').className = 'fas fa-cloud-upload-alt text-5xl text-gray-300 mb-4 block';
  dropZone.querySelector('p:first-of-type').textContent = '엑셀 파일을 여기에 드래그하세요';

  document.getElementById('section-preview').classList.add('hidden');
  document.getElementById('section-macro').classList.add('hidden');
  document.getElementById('section-consent').classList.add('hidden');
  document.getElementById('consent-preview-area').classList.add('hidden');
  document.getElementById('validation-summary').classList.add('hidden');
  document.getElementById('progress-bar-container').classList.add('hidden');
  document.getElementById('current-customer').classList.add('hidden');

  navigateToStep(1);
}

function showToast(type, message) {
  const toast = document.getElementById('toast');
  const icon = toast.querySelector('i');
  const msg = document.getElementById('toast-msg');

  icon.className = type === 'success' ? 'fas fa-check-circle text-green-400'
    : type === 'error' ? 'fas fa-exclamation-circle text-red-400'
    : 'fas fa-info-circle text-blue-400';

  msg.textContent = message;
  toast.classList.remove('hidden');

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ============================================================
// Step 2 → Step 3 자동 이동 (데이터 미리보기 후 버튼)
// ============================================================
// 하단에 다음 단계 버튼 추가
const previewSection = document.getElementById('section-preview');
const nextBtnHTML = `
  <div class="flex justify-between mt-4">
    <button onclick="resetAll()" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
      <i class="fas fa-arrow-left mr-1"></i> 처음으로
    </button>
    <button id="btn-go-macro" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors font-medium">
      다음: 전산등록 매크로 <i class="fas fa-arrow-right ml-1"></i>
    </button>
  </div>
`;
previewSection.insertAdjacentHTML('beforeend', nextBtnHTML);

document.getElementById('btn-go-macro').addEventListener('click', () => {
  if (state.selectedIndices.size === 0) {
    showToast('error', '선택된 고객이 없습니다. 처리할 고객을 선택해 주세요.');
    return;
  }
  initMacro();
});

// 전산등록 후 동의서 단계로 이동 버튼
const macroSection = document.getElementById('section-macro');
const consentNavHTML = `
  <div class="flex justify-between mt-4">
    <button id="btn-back-preview" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
      <i class="fas fa-arrow-left mr-1"></i> 데이터 확인
    </button>
    <button id="btn-go-consent" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors font-medium">
      다음: 동의서 출력 <i class="fas fa-arrow-right ml-1"></i>
    </button>
  </div>
`;
macroSection.insertAdjacentHTML('beforeend', consentNavHTML);

document.getElementById('btn-go-consent').addEventListener('click', initConsent);
document.getElementById('btn-back-preview').addEventListener('click', () => navigateToStep(2));

// ============================================================
// 키보드 단축키
// ============================================================
document.addEventListener('keydown', (e) => {
  // Ctrl+Right: 다음 고객
  if (e.ctrlKey && e.key === 'ArrowRight' && state.currentStep === 3) {
    e.preventDefault();
    document.getElementById('btn-copy-next').click();
  }
  // Ctrl+Left: 이전 고객
  if (e.ctrlKey && e.key === 'ArrowLeft' && state.currentStep === 3) {
    e.preventDefault();
    document.getElementById('btn-macro-prev').click();
  }
});
