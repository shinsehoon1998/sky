// 동의서 미리보기 페이지 스크립트
// URL 파라미터에서 데이터를 읽어 동의서를 렌더링합니다.

(function() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('name') || '홍길동';
  const jumin = params.get('jumin') || '000000-0000000';
  const phone = params.get('phone') || '010-0000-0000';

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  const html = `
    <div id="consent-doc" class="max-w-2xl mx-auto font-sans text-gray-800 text-sm leading-relaxed">
      <div class="text-center border-b-2 border-gray-800 pb-4 mb-6">
        <h1 class="text-2xl font-bold tracking-wider mb-1">개인정보 수집·이용 동의서</h1>
        <p class="text-xs text-gray-500">(보험계약 관련)</p>
      </div>

      <div class="border border-gray-300 rounded-lg p-4 mb-6 bg-gray-50">
        <h2 class="font-bold text-base mb-3 border-b border-gray-300 pb-2">고객 정보</h2>
        <table class="w-full text-sm">
          <tr>
            <td class="py-2 w-24 font-medium text-gray-600">성명</td>
            <td class="py-2 font-bold text-base">${name}</td>
          </tr>
          <tr>
            <td class="py-2 w-24 font-medium text-gray-600">주민등록번호</td>
            <td class="py-2 font-mono">${jumin}</td>
          </tr>
          <tr>
            <td class="py-2 w-24 font-medium text-gray-600">연락처</td>
            <td class="py-2">${phone}</td>
          </tr>
        </table>
      </div>

      <div class="mb-6">
        <h2 class="font-bold text-base mb-2">1. 개인정보 수집·이용 목적</h2>
        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>보험계약 상담, 보험료 산출 및 계약 체결</li>
          <li>보험계약 유지·관리 및 보험금 지급 심사</li>
          <li>보험상품 안내 및 마케팅 활용</li>
          <li>민원처리 및 분쟁 해결</li>
        </ul>
      </div>

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

      <div class="mb-6">
        <h2 class="font-bold text-base mb-2">3. 개인정보의 보유 및 이용 기간</h2>
        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>보험계약 종료일로부터 5년간 (단, 관련 법령에 따라 보존이 필요한 경우 해당 기간까지)</li>
          <li>민원처리 및 분쟁 해결을 위한 경우: 민원 종료 후 3년간</li>
          <li>금융거래 관련: 「전자금융거래법」에 따라 5년간</li>
        </ul>
      </div>

      <div class="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h2 class="font-bold text-base mb-2">4. 동의 거부 권리 및 불이익</h2>
        <p class="text-sm text-gray-700">
          귀하는 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다. 다만, 필수 항목에 대한 동의를 거부할 경우 보험계약 상담, 체결 및 유지·관리가 불가능할 수 있습니다.
        </p>
      </div>

      <div class="border border-gray-400 rounded-lg p-4 mb-6">
        <div class="flex items-start gap-4 mb-3">
          <div class="w-5 h-5 border-2 border-gray-500 rounded mt-0.5 flex-shrink-0"></div>
          <p class="text-sm"><strong>개인정보 수집·이용에 동의합니다.</strong> (필수)</p>
        </div>
        <div class="flex items-start gap-4">
          <div class="w-5 h-5 border-2 border-gray-500 rounded mt-0.5 flex-shrink-0"></div>
          <p class="text-sm"><strong>민감정보 및 고유식별정보 처리에 동의합니다.</strong> (필수)</p>
        </div>
      </div>

      <div class="flex justify-between items-end mt-10 pt-6 border-t border-gray-300">
        <div>
          <p class="text-xs text-gray-500 mb-4">${dateStr}</p>
          <p class="font-bold text-base">성명: ${name}</p>
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

  document.getElementById('consent-render-area').innerHTML = html;
})();
