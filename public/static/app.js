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
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (rows.length < 2) {
        showToast('error', '데이터가 없거나 형식이 올바르지 않습니다');
        return;
      }

      // 헤더 행 감지 (주민등록번호, 이름, 전화번호)
      const headerRow = rows[0];
      const juminIdx = 0; // A열
      const nameIdx = 1;  // B열
      const phoneIdx = 2; // C열

      state.rawData = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || (!row[juminIdx] && !row[nameIdx] && !row[phoneIdx])) continue;
        const jumin = String(row[juminIdx] || '').trim();
        const name = String(row[nameIdx] || '').trim();
        const phone = String(row[phoneIdx] || '').trim();
        if (!jumin && !name && !phone) continue;
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
// Step 3: 전산등록 매크로
// ============================================================
let macroQueue = [];

function initMacro() {
  macroQueue = state.validatedData
    .filter(r => r.isValid && state.selectedIndices.has(r.index))
    .map(r => state.rawData[r.index]);

  state.currentMacroIdx = 0;
  document.getElementById('section-macro').classList.remove('hidden');

  if (macroQueue.length > 0) {
    document.getElementById('current-customer').classList.remove('hidden');
    showMacroCustomer(0);
  }
  navigateToStep(3);
}

function showMacroCustomer(idx) {
  if (idx < 0 || idx >= macroQueue.length) return;
  state.currentMacroIdx = idx;
  const cust = macroQueue[idx];

  document.getElementById('macro-name').textContent = cust.name;
  document.getElementById('macro-jumin').textContent = `${cust.jumin.substring(0, 6)}-${'*'.repeat(7)}`;
  document.getElementById('macro-phone').textContent = cust.phone;
  document.getElementById('macro-progress').textContent = `${idx + 1} / ${macroQueue.length}`;

  // 자동 클립보드 복사
  const copyText = `${cust.name}\t${cust.jumin}\t${cust.phone}`;
  navigator.clipboard.writeText(copyText).then(() => {
    document.getElementById('clipboard-status').innerHTML = `
      <p class="text-xs text-green-600 font-medium"><i class="fas fa-check-circle mr-1"></i> 클립보드 복사 완료</p>
      <p class="text-xs text-gray-400 mt-1">이름 / 주민번호 / 연락처가 복사되었습니다. 전산 시스템에 붙여넣기 하세요.</p>
    `;
    document.getElementById('btn-copy-next').innerHTML = '<i class="fas fa-arrow-right mr-1"></i> 다음 고객 복사';
  }).catch(() => {
    document.getElementById('clipboard-status').innerHTML = `
      <p class="text-xs text-red-600 font-medium">클립보드 복사 실패</p>
      <p class="text-xs text-gray-400 mt-1">수동으로 복사해 주세요</p>
    `;
  });

  updateProgressBar();
}

document.getElementById('btn-copy-next').addEventListener('click', () => {
  if (macroQueue.length === 0) return;
  if (state.currentMacroIdx < macroQueue.length - 1) {
    showMacroCustomer(state.currentMacroIdx + 1);
  } else {
    showToast('success', '모든 고객 처리가 완료되었습니다');
    document.getElementById('btn-copy-next').innerHTML = '<i class="fas fa-check mr-1"></i> 완료';
    updateProgressBar(true);
  }
});

document.getElementById('btn-copy-all').addEventListener('click', () => {
  if (macroQueue.length === 0) return;
  const allText = macroQueue.map(c => `${c.name}\t${c.jumin}\t${c.phone}`).join('\n');
  navigator.clipboard.writeText(allText).then(() => {
    showToast('success', `전체 ${macroQueue.length}건이 클립보드에 복사되었습니다`);
  }).catch(() => {
    showToast('error', '전체 복사에 실패했습니다');
  });
});

document.getElementById('btn-macro-prev').addEventListener('click', () => {
  if (state.currentMacroIdx > 0) showMacroCustomer(state.currentMacroIdx - 1);
});

document.getElementById('btn-macro-next').addEventListener('click', () => {
  if (state.currentMacroIdx < macroQueue.length - 1) showMacroCustomer(state.currentMacroIdx + 1);
  else showToast('success', '마지막 고객입니다');
});

// 자동 다음 단계 버튼
document.getElementById('btn-copy-next').addEventListener('dblclick', () => {
  // 더블클릭 시 4단계로 이동
  if (state.currentMacroIdx >= macroQueue.length - 1) {
    initConsent();
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
