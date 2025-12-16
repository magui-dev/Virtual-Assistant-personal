/**
 * 보고서 & 업무 플래닝 통합 패널
 * 팝업 전용 버전
 */

import { addTaskRecommendations, showCustomTaskInput } from './taskUI.js';
import { buildRequestContext } from './taskService.js';

// 전역 폰트 설정 (모든 동적 생성 요소에 적용)
const DEFAULT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// 백엔드 URL을 함수로 가져오기 (지연 평가)
function getBackendURL() {
  // window.BACKEND_URL이 없으면 기본값 사용
  return window.BACKEND_URL || 'https://virtualassistant.magui-dev.com';
}

// API Base URL도 함수로
function getAPIBase() {
  return `${getBackendURL()}/api/v1`;
}

const MULTI_AGENT_SESSION_KEY = 'multi_agent_session_id';

let messages = [];
let reportPanel = null;
let messagesContainer = null;
let reportInput = null;
let sendBtn = null;
let isInitialized = false;
let isProcessingCommand = false; // 명령 실행 중 플래그 (중복 실행 방지)

// FSM 상태
let chatMode = 'normal'; // 'normal' 또는 'daily_fsm'
let dailySessionId = null;
let dailyOwnerId = null;

// 업무 플래닝 선택 상태
let selectedTasks = new Set();
let currentRecommendation = null;

// 특이사항 입력 모드
let isNotesInputMode = false;
let currentNotesReportId = null;
let currentNotesReportDate = null;

// 날짜 설정
let dateSettingsPanel = null;
let currentReportType = null;
let customDates = {
  daily: null,
  weekly: null,
  monthly: { year: null, month: null }
};

function syncOwnerId(ownerId) {
  if (ownerId) {
    window.currentUserId = window.currentUserId || ownerId;
    dailyOwnerId = dailyOwnerId || ownerId;
  }
}

/**
 * 보고서 패널 초기화
 */
export async function initReportPanel() {
  if (isInitialized) return;
  
  reportPanel = document.getElementById('report-panel');
  messagesContainer = document.getElementById('report-messages');
  reportInput = document.getElementById('report-input');
  sendBtn = document.getElementById('report-send-btn');
  dateSettingsPanel = document.getElementById('date-settings-panel');
  
  if (!reportPanel || !messagesContainer || !reportInput || !sendBtn) {
    console.error('보고서 패널 요소를 찾을 수 없습니다.');
    return;
  }
  
  // 초기 화면: 빠른 실행 버튼을 상단에 고정
  addQuickActionButtonsFixed();
  
  // 이벤트 리스너
  sendBtn.addEventListener('click', handleSendMessage);
  reportInput.addEventListener('keydown', handleInputKeydown);
  
  // 날짜 설정 버튼
  const applyDateBtn = document.getElementById('apply-date-btn');
  const closeDateBtn = document.getElementById('close-date-btn');
  
  if (applyDateBtn) applyDateBtn.addEventListener('click', handleApplyDate);
  if (closeDateBtn) closeDateBtn.addEventListener('click', () => {
    dateSettingsPanel.style.display = 'none';
  });
  
  isInitialized = true;
  console.log('✅ 보고서 패널 초기화 완료');
}

// addFixedHeaderMenu 함수 제거됨 (배너 제거 요청)
// 이 함수는 더 이상 사용되지 않습니다.

/**
 * 빠른 실행 버튼을 상단에 고정 (한 번만 생성)
 */
function addQuickActionButtonsFixed() {
  // 기존 고정 버튼이 있으면 제거하지 않고 유지 (한 번만 생성)
  const existingFixed = document.getElementById('report-quick-actions-fixed');
  if (existingFixed) {
    return; // 이미 있으면 재생성하지 않음
  }
  
  // 컨테이너 생성 (배경 투명, 테두리 제거 - 버튼들만 보이게)
  const fixedContainer = document.createElement('div');
  fixedContainer.id = 'report-quick-actions-fixed';
  fixedContainer.className = 'report-quick-actions-fixed';
  fixedContainer.style.cssText = `
    position: relative;
    z-index: 100;
    background: transparent;
    padding: 16px;
    margin-bottom: 24px;
    border: none;
    box-shadow: none;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  
  // 메인 컨테이너 생성
  const mainContainer = document.createElement('div');
  mainContainer.className = 'report-main-container';
  mainContainer.style.cssText = `
    max-width: 760px;
    margin: 0 auto;
    padding: 0;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  
  // 2x2 그리드 컨테이너
  const gridContainer = document.createElement('div');
  gridContainer.className = 'report-quick-grid';
  gridContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  `;
  
  // 4개 버튼 정의
  const quickActions = [
    { key: 'today_plan', label: '오늘 업무 플래닝', command: '오늘 업무 추천해줘', icon: '📋', needsDate: false },
    { key: 'daily', label: '일일 보고서 작성', icon: '📝', needsDate: false, isDailyInput: true },
    { key: 'weekly', label: '주간 보고서 생성', icon: '📊', needsDate: true, dateMode: 'weekly' },
    { key: 'monthly', label: '월간 보고서 생성', icon: '📈', needsDate: true, dateMode: 'monthly' }
  ];
  
  quickActions.forEach(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'report-quick-button';
    button.style.fontFamily = DEFAULT_FONT_FAMILY;
    button.innerHTML = `
      <span class="report-quick-button-icon">${action.icon}</span>
      <span class="report-quick-button-label">${action.label}</span>
    `;
    
    // 클릭 이벤트
    button.addEventListener('click', () => {
      if (action.isDailyInput) {
        // 일일보고서 입력 UI 표시
        showDailyInputUI();
      } else if (action.needsDate) {
        // 날짜 선택 모달 표시
        showDatePickerModal(action.dateMode);
      } else {
        // 즉시 명령 실행
        triggerAgentCommand(action.command);
      }
    });
    
    gridContainer.appendChild(button);
  });
  
  mainContainer.appendChild(gridContainer);
  fixedContainer.appendChild(mainContainer);
  
  // messagesContainer의 첫 번째 자식으로 추가 (상단 고정)
  if (messagesContainer.firstChild) {
    messagesContainer.insertBefore(fixedContainer, messagesContainer.firstChild);
  } else {
    messagesContainer.appendChild(fixedContainer);
  }
}

/**
 * 빠른 실행 버튼 추가 (하위 호환성 - 사용하지 않음)
 * @deprecated 상단 고정 버튼 사용
 */
function addQuickActionButtons() {
  // 더 이상 사용하지 않음 (상단 고정 버튼으로 대체)
  // 이 함수는 호출되어도 아무것도 하지 않음
}

/**
 * 에이전트 명령 트리거 (빠른 실행 버튼용)
 * 기존 handleSendMessage와 동일한 로직 사용
 */
async function triggerAgentCommand(command) {
  // 중복 실행 방지
  if (isProcessingCommand) {
    console.log('⚠️ [ReportPopup] 명령이 이미 실행 중입니다. 중복 실행을 방지합니다.');
    return;
  }
  
  isProcessingCommand = true;
  
  // 사용자 메시지로 추가
  addMessage('user', command);
  
  // 기존 전송 로직과 동일하게 처리
  sendBtn.disabled = true;
  sendBtn.textContent = '...';
  
  try {
    if (chatMode === 'daily_fsm') {
      await handleDailyAnswer(command);
    } else {
      await handleReportIntent(command);
    }
  } catch (error) {
    console.error('빠른 실행 오류:', error);
    addMessage('assistant', '오류가 발생했습니다. 😢');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '전송';
    isProcessingCommand = false;
  }
}

/**
 * 메시지 추가
 */
function addMessage(role, content, isMarkdown = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  messageDiv.style.fontFamily = DEFAULT_FONT_FAMILY;
  
  // 구조화된 메시지 처리 (보고서 링크)
  if (typeof content === 'object' && content.type) {
    // 구조화된 메시지는 bubble 래퍼 없이 직접 추가
    messageDiv.innerHTML = formatStructuredMessage(content);
  } else {
    // 일반 텍스트 메시지는 bubble 래퍼 추가
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.fontFamily = DEFAULT_FONT_FAMILY;
    
    if (isMarkdown) {
      // 마크다운 렌더링 (간단한 처리)
      const marked = window.marked || ((text) => text);
      // marked.js 버전 호환성 처리
      if (typeof marked.parse === 'function') {
        bubble.innerHTML = marked.parse(content);
      } else if (typeof marked === 'function') {
        bubble.innerHTML = marked(content);
      } else {
        bubble.textContent = content;
      }
    } else {
      bubble.textContent = content;
    }
    
    messageDiv.appendChild(bubble);
  }
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  messages.push({ role, content });
  
  // assistant 메시지 추가 시 빠른 실행 버튼 자동 추가 제거
  // 사용자가 상단 고정 버튼을 직접 사용하도록 변경
}

/**
 * 구조화된 메시지 포맷팅 (보고서 링크)
 */
function formatStructuredMessage(data) {
  const { type, message, period, report_data } = data;
  
  let html = `<div class="report-message" style="font-family: ${DEFAULT_FONT_FAMILY}">`;
  html += `<div class="report-text" style="font-family: ${DEFAULT_FONT_FAMILY}">${message}</div>`;
  
  if (period) {
    html += `<div class="report-period" style="font-family: ${DEFAULT_FONT_FAMILY}">📅 ${period.start || ''} ~ ${period.end || ''}</div>`;
  }
  
  // report_data.url 또는 report_data.html_url 지원
  const reportUrl = report_data?.url || report_data?.html_url;
  const fileName = report_data?.file_name || '보고서 보기';
  
  if (reportUrl) {
    html += `<div class="report-link" style="font-family: ${DEFAULT_FONT_FAMILY}">`;
    // Electron 환경에서 링크 열기
    const fullUrl = reportUrl.startsWith('http') ? reportUrl : `${BACKEND_URL}${reportUrl}`;
    html += `<a href="#" onclick="openReportLink('${fullUrl}'); return false;" class="report-btn" style="font-family: ${DEFAULT_FONT_FAMILY}">`;
    html += `📄 ${fileName}`;
    html += `</a>`;
    html += `</div>`;
  }
  
  html += `</div>`;
  return html;
}

/**
 * 보고서 링크 열기 (Electron 환경)
 * 전역 함수로 노출되어 HTML에서 호출 가능
 */
window.openReportLink = function(url) {
  try {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      
      // URL에서 보고서 타입 추출
      let title = '보고서';
      if (url.includes('/daily/')) {
        title = '일일보고서';
      } else if (url.includes('/weekly/')) {
        title = '주간보고서';
      } else if (url.includes('/monthly/')) {
        title = '월간보고서';
      }
      
      // Electron 앱 내부에서 새 창으로 열기
      ipcRenderer.send('open-report-window', {
        url: url,
        title: title
      });
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    console.error('보고서 링크 열기 실패:', e);
    window.open(url, '_blank');
  }
};

/**
 * 입력 키 이벤트
 */
function handleInputKeydown(e) {
  if (e.isComposing || e.keyCode === 229) return;
  
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
}

/**
 * 메시지 전송
 */
async function handleSendMessage() {
  const text = reportInput.value.trim();
  if (!text || sendBtn.disabled) return;
  
  // 특이사항 입력 모드인지 확인
  if (isNotesInputMode && currentNotesReportId) {
    await handleNotesInput(text, currentNotesReportId);
    return;
  }
  
  addMessage('user', text);
  reportInput.value = '';
  
  sendBtn.disabled = true;
  sendBtn.textContent = '...';
  
  try {
    if (chatMode === 'daily_fsm') {
      await handleDailyAnswer(text);
    } else {
      await handleReportIntent(text);
    }
  } catch (error) {
    console.error('메시지 처리 오류:', error);
    addMessage('assistant', '오류가 발생했습니다. 😢');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '전송';
  }
}

/**
 * 자연어 명령어에서 날짜 추출 (YYYY-MM-DD 형식)
 */
function extractDateFromCommand(text) {
  // YYYY-MM-DD 형식 날짜 추출
  const dateRegex = /(\d{4}-\d{2}-\d{2})/;
  const match = text.match(dateRegex);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Intent 처리
 * 멀티에이전트 시스템 사용 (메인 챗봇과 동일)
 */
async function handleReportIntent(text) {
  const lower = text.toLowerCase().trim();
  
  // 날짜 설정은 직접 처리
  if (lower.includes('날짜') && lower.includes('설정')) {
    showDateSettings();
    return;
  }
  
  // 보고서 생성 요청 감지 (설정된 날짜 사용)
  if (lower.includes('일일보고서') && (lower.includes('만들') || lower.includes('생성') || lower.includes('작성'))) {
    // 명령어에서 날짜 추출 시도
    const extractedDate = extractDateFromCommand(text);
    if (extractedDate) {
      customDates.daily = extractedDate;
    }
    
    if (customDates.daily) {
      addMessage('assistant', `📅 설정된 날짜(${customDates.daily})로 일일보고서를 생성합니다.`);
      await startDailyReport();
    } else {
      addMessage('assistant', '일일보고서를 생성합니다. (오늘 날짜 사용)');
      await startDailyReport();
    }
    return;
  }
  
  if (lower.includes('주간보고서') && (lower.includes('만들') || lower.includes('생성') || lower.includes('작성'))) {
    // 명령어에서 날짜 추출 시도
    const extractedDate = extractDateFromCommand(text);
    if (extractedDate) {
      customDates.weekly = extractedDate;
      console.log(`[ReportPopup] 주간보고서 날짜 추출: ${extractedDate}`);
    }
    
    if (customDates.weekly) {
      addMessage('assistant', `📅 설정된 날짜(${customDates.weekly})로 주간보고서를 생성합니다.`);
      await generateWeeklyReport();
    } else {
      addMessage('assistant', '주간보고서를 생성합니다. (오늘 날짜 기준)');
      await generateWeeklyReport();
    }
    return;
  }
  
  if (lower.includes('월간보고서') && (lower.includes('만들') || lower.includes('생성') || lower.includes('작성'))) {
    // 명령어에서 날짜 추출 시도
    const extractedDate = extractDateFromCommand(text);
    if (extractedDate) {
      // 날짜에서 년월 추출
      const dateObj = new Date(extractedDate);
      customDates.monthly = {
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1
      };
      console.log(`[ReportPopup] 월간보고서 날짜 추출: ${extractedDate} → ${customDates.monthly.year}년 ${customDates.monthly.month}월`);
    }
    
    const year = customDates.monthly?.year;
    const month = customDates.monthly?.month;
    if (year && month) {
      addMessage('assistant', `📅 설정된 기간(${year}년 ${month}월)으로 월간보고서를 생성합니다.`);
      await generateMonthlyReport();
    } else {
      addMessage('assistant', '월간보고서를 생성합니다. (이번 달 기준)');
      await generateMonthlyReport();
    }
    return;
  }
  
  // 일일 보고서 작성 요청 → 태그 입력 UI 표시
  if (lower.includes('일일') && lower.includes('보고서') && 
      (lower.includes('작성') || lower.includes('시작') || lower.includes('입력'))) {
    showDailyInputUI();
    return;
  }
  
  // 나머지는 보고서 에이전트 시스템 사용
  try {
    console.log(`[ReportPopup] 보고서 에이전트로 요청 전송: "${text}"`);
    
    const result = await sendMultiAgentMessage(text);
    console.log(`[ReportPopup] 보고서 에이전트 응답:`, result);
    
    // 사용된 에이전트 로그
    if (result.agent_used) {
      console.log(`[ReportPopup] 사용된 에이전트: ${result.agent_used}`);
    }
    
    // 업무 플래닝 요청인 경우 업무 카드 UI 표시
    if (result.intent === 'planning' || result.agent_used === 'planning') {
      console.log(`[ReportPopup] 업무 플래닝 요청으로 감지, 업무 카드 UI 표시`);
      await loadAndDisplayTaskCards();
      return;
    }
    
    // 보고서 생성 요청 감지 (에이전트 응답에서)
    const answerLower = result.answer.toLowerCase();
    if ((result.intent === 'report' || result.agent_used === 'report') && 
        (answerLower.includes('일일보고서') || answerLower.includes('일일 보고서'))) {
      // 일일보고서 생성 요청
      if (customDates.daily) {
        addMessage('assistant', `📅 설정된 날짜(${customDates.daily})로 일일보고서를 생성합니다.`);
      } else {
        addMessage('assistant', '일일보고서를 생성합니다. (오늘 날짜 사용)');
      }
      await startDailyReport();
      return;
    }
    
    if ((result.intent === 'report' || result.agent_used === 'report') && 
        (answerLower.includes('주간보고서') || answerLower.includes('주간 보고서'))) {
      // 주간보고서 생성 요청
      // 원본 사용자 메시지에서 날짜 추출 시도
      const extractedDate = extractDateFromCommand(text);
      if (extractedDate) {
        customDates.weekly = extractedDate;
        console.log(`[ReportPopup] 주간보고서 날짜 추출 (에이전트 경로): ${extractedDate}`);
      }
      
      if (customDates.weekly) {
        addMessage('assistant', `📅 설정된 날짜(${customDates.weekly})로 주간보고서를 생성합니다.`);
      } else {
        addMessage('assistant', '주간보고서를 생성합니다. (오늘 날짜 기준)');
      }
      await generateWeeklyReport();
      return;
    }
    
    if ((result.intent === 'report' || result.agent_used === 'report') && 
        (answerLower.includes('월간보고서') || answerLower.includes('월간 보고서'))) {
      // 월간보고서 생성 요청
      // 원본 사용자 메시지에서 날짜 추출 시도
      const extractedDate = extractDateFromCommand(text);
      if (extractedDate) {
        // 날짜에서 년월 추출
        const dateObj = new Date(extractedDate);
        customDates.monthly = {
          year: dateObj.getFullYear(),
          month: dateObj.getMonth() + 1
        };
        console.log(`[ReportPopup] 월간보고서 날짜 추출 (에이전트 경로): ${extractedDate} → ${customDates.monthly.year}년 ${customDates.monthly.month}월`);
      }
      
      const year = customDates.monthly?.year;
      const month = customDates.monthly?.month;
      if (year && month) {
        addMessage('assistant', `📅 설정된 기간(${year}년 ${month}월)으로 월간보고서를 생성합니다.`);
      } else {
        addMessage('assistant', '월간보고서를 생성합니다. (이번 달 기준)');
      }
      await generateMonthlyReport();
      return;
    }
    
    // HR(RAG), Insurance 에이전트인 경우 마크다운 렌더링 적용
    const isMarkdown = (result.agent_used === 'rag' || result.intent === 'rag' || result.agent_used === 'insurance' || result.agent_used === 'insurance_tool');
    
    // 일반 응답 표시
    addMessage('assistant', result.answer, isMarkdown);
    
  } catch (error) {
    console.error('[ReportPopup] 보고서 에이전트 오류:', error);
    addMessage('assistant', `오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * 업무 카드 UI 로드 및 표시
 */
async function loadAndDisplayTaskCards() {
  const requestId = `load_tasks_${Date.now()}`;
  console.log(`[${requestId}] 📋 업무 카드 로드 시작`);
  
  try {
    const { headers, owner_id } = await buildRequestContext();
    syncOwnerId(owner_id);
    
    const targetDate = new Date().toISOString().split('T')[0];
    const effectiveOwnerId = owner_id || dailyOwnerId;
    
    // 먼저 저장된 금일 업무 확인
    const { getMainTasks } = await import('./taskService.js');
    const savedTasksResult = await getMainTasks(effectiveOwnerId, targetDate);
    
    if (savedTasksResult.success && savedTasksResult.count > 0) {
      console.log(`[${requestId}] ✅ 저장된 금일 업무 발견: ${savedTasksResult.count}개`);
      
      // 저장된 업무를 보여주고 수정 여부 확인
      const taskList = savedTasksResult.main_tasks.map((task, idx) => 
        `${idx + 1}. ${task.title || task.task || '제목 없음'}`
      ).join('\n');
      
      addMessage('assistant', `이미 저장된 금일 업무가 있습니다:\n\n${taskList}\n\n수정하시겠습니까?`);
      
      // 수정하기 버튼과 새로 추천받기 버튼
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'message assistant';
      buttonDiv.style.display = 'flex';
      buttonDiv.style.gap = '10px';
      buttonDiv.style.marginTop = '10px';
      
      const modifyButton = document.createElement('button');
      modifyButton.textContent = '✏️ 수정하기';
      modifyButton.style.cssText = `
        background: #9CAF88;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        font-family: ${DEFAULT_FONT_FAMILY};
      `;
      modifyButton.addEventListener('click', async () => {
        // 저장된 업무를 업무 카드 형식으로 표시 (수정 모드)
        addTaskRecommendations({
          tasks: savedTasksResult.main_tasks.map(task => ({
            title: task.title || task.task || '제목 없음',
            description: task.description || '',
            priority: task.priority || 'medium',
            expected_time: task.expected_time || '1시간',
            category: task.category || '기타'
          })),
          summary: '저장된 금일 업무입니다. 수정하거나 추가할 수 있습니다.',
          owner_id: effectiveOwnerId,
          target_date: targetDate,
          task_sources: []
        }, addMessage, messagesContainer);
      });
      
      const newRecommendButton = document.createElement('button');
      newRecommendButton.textContent = '🔄 새로 추천받기';
      newRecommendButton.style.cssText = `
        background: #fdbc66;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        font-family: ${DEFAULT_FONT_FAMILY};
      `;
      newRecommendButton.addEventListener('click', async () => {
        // 새로 추천받기
        await loadNewTaskRecommendations(effectiveOwnerId, targetDate, headers);
      });
      
      buttonDiv.appendChild(modifyButton);
      buttonDiv.appendChild(newRecommendButton);
      messagesContainer.appendChild(buttonDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      return;
    }
    
    // 저장된 업무가 없으면 새로 추천받기
    await loadNewTaskRecommendations(effectiveOwnerId, targetDate, headers);
    
  } catch (error) {
    console.error(`[${requestId}] ❌ 업무 카드 로드 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    
    addMessage('assistant', `업무 카드를 불러오는 중 오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * 새로운 업무 추천 로드 및 표시
 */
async function loadNewTaskRecommendations(ownerId, targetDate, headers) {
  const requestId = `load_new_tasks_${Date.now()}`;
  console.log(`[${requestId}] 📋 새로운 업무 추천 로드 시작`);
  
  try {
    const requestBody = {
      target_date: targetDate
    };
    if (ownerId) {
      requestBody.owner_id = ownerId;
    }
    
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/plan/today`,
      method: 'POST',
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/plan/today`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { detail: errorText || `API 오류: ${response.status}` };
      }
      throw new Error(errorData.detail || `API 오류: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[${requestId}] ✅ 업무 데이터 로드 성공:`, {
      summary: data.summary,
      tasksCount: data.tasks?.length || 0
    });
    
    // 업무 카드 UI 표시 (taskUI.js 사용 - summary는 addTaskRecommendations에서 표시)
    if (data.tasks && data.tasks.length > 0) {
      console.log(`[${requestId}] 📋 업무 카드 UI 표시: ${data.tasks.length}개`);
      const effectiveOwnerId = data.owner_id || ownerId || dailyOwnerId;
      addTaskRecommendations({
        tasks: data.tasks,
        summary: data.summary || '오늘의 추천 업무입니다!',
        owner_id: effectiveOwnerId,
        target_date: data.target_date || targetDate,
        task_sources: data.task_sources || []
      }, addMessage, messagesContainer);
    } else {
      console.warn(`[${requestId}] ⚠️ 추천할 업무가 없습니다.`);
      addMessage('assistant', '추천할 업무가 없습니다. 직접 작성해주세요! 😊');
      
      // 직접 작성하기 버튼 표시
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'message assistant';
      
      const button = document.createElement('button');
      button.textContent = '✏️ 직접 작성하기';
      button.style.cssText = `
        background: #fdbc66;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        margin-top: 10px;
        font-family: ${DEFAULT_FONT_FAMILY};
      `;
      
      button.addEventListener('click', () => {
        const effectiveOwnerId = ownerId || dailyOwnerId || null;
        showCustomTaskInput(effectiveOwnerId, targetDate, addMessage);
      });
      
      buttonDiv.appendChild(button);
      messagesContainer.appendChild(buttonDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    console.log(`[${requestId}] ✅ 업무 카드 로드 완료`);
  } catch (error) {
    console.error(`[${requestId}] ❌ 업무 카드 로드 오류:`, error);
    addMessage('assistant', `업무 카드를 불러오는 중 오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * 멀티에이전트 메시지 전송 (메인 챗봇과 동일한 로직)
 */
async function sendMultiAgentMessage(userMessage) {
  const requestId = `report_agent_${Date.now()}`;
  console.log(`[${requestId}] 🤖 보고서 에이전트 메시지 전송:`, userMessage);
  
  try {
    // 세션 ID 가져오기 (실패해도 계속 진행)
    let sessionId = null;
    try {
      sessionId = await getOrCreateMultiAgentSession();
      console.log(`[${requestId}] ✅ 세션 ID:`, sessionId);
    } catch (error) {
      console.warn(`[${requestId}] ⚠️ 세션 생성 실패, 세션 없이 진행:`, error);
    }
    
    const { headers, owner_id } = await buildRequestContext();
    syncOwnerId(owner_id);
    
    const requestBody = {
      query: userMessage,
      context: {}
    };
    
    if (owner_id) {
      requestBody.user_id = owner_id;
      requestBody.context.owner_id = owner_id;
    }
    
    if (sessionId) {
      requestBody.session_id = sessionId;
    }
    
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/agent/report`,
      method: 'POST',
      headers: { ...headers, Authorization: headers.Authorization ? 'Bearer ***' : '없음' },
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/agent/report`, {
      method: 'POST',
      headers: headers,
      credentials: 'include',
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      throw new Error(`Report Agent API 호출 실패: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`[${requestId}] ✅ 보고서 에이전트 응답:`, result);
    
    // 멀티에이전트 응답 형식과 호환되도록 변환
    return {
      query: result.query,
      answer: result.answer,
      agent_used: result.agent_used,
      intent: result.intent,
      processing_time: result.processing_time,
      session_id: result.session_id
    };
    
  } catch (error) {
    console.error(`[${requestId}] ❌ 보고서 에이전트 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    throw error;
  }
}

/**
 * 멀티에이전트 세션 생성
 */
async function getOrCreateMultiAgentSession() {
  let sessionId = localStorage.getItem(MULTI_AGENT_SESSION_KEY);
  
  if (sessionId) {
    console.log('✅ 기존 멀티에이전트 세션 사용:', sessionId);
    return sessionId;
  }
  
  try {
    const response = await fetch(`${getAPIBase()}/multi-agent/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`세션 생성 실패: ${response.status}`);
    }
    
    const data = await response.json();
    sessionId = data.session_id;
    localStorage.setItem(MULTI_AGENT_SESSION_KEY, sessionId);
    console.log('✅ 멀티에이전트 세션 생성:', sessionId);
    return sessionId;
  } catch (error) {
    console.error('❌ 멀티에이전트 세션 생성 오류:', error);
    // 세션 없이도 진행 가능
    return null;
  }
}

/**
 * 업무 플래닝
 */
async function getTodayPlan() {
  const requestId = `plan_${Date.now()}`;
  console.log(`[${requestId}] 📋 업무 플래닝 요청 시작`);
  
  try {
    addMessage('assistant', '📋 오늘의 업무 플래닝을 생성 중입니다...');
    
    const { headers, owner_id } = await buildRequestContext();
    
    const requestBody = {
      target_date: new Date().toISOString().split('T')[0]
    };
    if (owner_id) {
      requestBody.owner_id = owner_id;
    }
    
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/plan/today`,
      method: 'POST',
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/plan/today`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { detail: errorText || `API 오류: ${response.status}` };
      }
      
      console.error(`[${requestId}] ❌ 파싱된 오류 데이터:`, errorData);
      throw new Error(errorData.detail || `API 오류: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[${requestId}] ✅ 성공 응답:`, {
      summary: data.summary,
      tasksCount: data.tasks?.length || 0,
      owner_id: data.owner_id,
      target_date: data.target_date
    });
    
    // 마지막 메시지 제거 (생성 중...)
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    // 요약 메시지
    addMessage('assistant', data.summary || '오늘의 업무 플래닝입니다!');
    
    // 업무 카드 표시 (addTaskRecommendations 사용 - 직접 작성 기능 포함)
    if (data.tasks && data.tasks.length > 0) {
      console.log(`[${requestId}] 📋 업무 카드 표시: ${data.tasks.length}개`);
      // addTaskRecommendations를 사용하여 직접 작성 기능 포함
      const effectiveOwnerId = data.owner_id || owner_id || dailyOwnerId;
      addTaskRecommendations({
        tasks: data.tasks,
        summary: data.summary || '오늘의 추천 업무입니다!',
        owner_id: effectiveOwnerId,
        target_date: data.target_date || requestBody.target_date,
        task_sources: data.task_sources || []
      }, addMessage, messagesContainer);
    } else {
      console.warn(`[${requestId}] ⚠️ 추천할 업무가 없습니다.`);
      addMessage('assistant', '추천할 업무가 없습니다. 직접 작성해주세요! 😊');
      
      // 직접 작성하기 버튼 표시
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'message assistant';
      
      const button = document.createElement('button');
      button.textContent = '✏️ 직접 작성하기';
      button.style.cssText = `
        background: #fdbc66;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 10px;
      `;
      button.addEventListener('click', () => {
        const targetDate = data.target_date || new Date().toISOString().split('T')[0];
        showCustomTaskInput(data.owner_id || dailyOwnerId, targetDate, addMessage);
      });
      buttonDiv.appendChild(button);
      messagesContainer.appendChild(buttonDiv);
    }
    
    console.log(`[${requestId}] ✅ 업무 플래닝 완료`);
  } catch (error) {
    console.error(`[${requestId}] ❌ 업무 플래닝 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    
    // 마지막 메시지 제거 (생성 중...)
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    const errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
    console.error(`[${requestId}] 💬 사용자에게 표시할 오류 메시지:`, errorMessage);
    addMessage('assistant', `업무 플래닝 생성 중 오류가 발생했습니다. 😢\n${errorMessage}`);
  }
}

/**
 * 업무 카드 표시
 */
function displayTaskCards(tasks, ownerId, targetDate) {
  currentRecommendation = { owner_id: ownerId, target_date: targetDate, tasks };
  
  const container = document.createElement('div');
  container.className = 'task-recommendations-container';
  
  tasks.forEach((task, index) => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <div class="task-header">
        <span class="priority-badge priority-${task.priority}">${getPriorityText(task.priority)}</span>
        <span class="task-category">${task.category || '기타'}</span>
      </div>
      <div class="task-title">${task.title}</div>
      <div class="task-desc">${task.description}</div>
      <div class="task-time">${task.expected_time}</div>
      <button class="task-select-btn" data-index="${index}">선택</button>
    `;
    
    const selectBtn = card.querySelector('.task-select-btn');
    selectBtn.addEventListener('click', () => toggleTaskSelection(index, selectBtn));
    
    container.appendChild(card);
  });
  
  // 완료 버튼
  const saveBtn = document.createElement('button');
  saveBtn.className = 'task-save-button';
  saveBtn.textContent = '선택 완료';
  saveBtn.disabled = true;
  saveBtn.addEventListener('click', handleSaveTasks);
  container.appendChild(saveBtn);
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant no-bubble';
  messageDiv.appendChild(container);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getPriorityText(priority) {
  return { high: '높음', medium: '보통', low: '낮음' }[priority] || '보통';
}

function toggleTaskSelection(index, btn) {
  if (selectedTasks.has(index)) {
    selectedTasks.delete(index);
    btn.classList.remove('selected');
    btn.textContent = '선택';
  } else {
    selectedTasks.add(index);
    btn.classList.add('selected');
    btn.textContent = '✓ 선택됨';
  }
  
  // 완료 버튼 활성화
  const saveBtn = btn.closest('.task-recommendations-container').querySelector('.task-save-button');
  if (saveBtn) {
    saveBtn.disabled = selectedTasks.size === 0;
  }
}

async function handleSaveTasks() {
  if (!currentRecommendation) {
    console.error('[handleSaveTasks] ❌ currentRecommendation이 없습니다.');
    return;
  }
  
  const requestId = `save_tasks_${Date.now()}`;
  console.log(`[${requestId}] 💾 업무 저장 시작`);
  
  const selected = Array.from(selectedTasks).map(i => currentRecommendation.tasks[i]);
  console.log(`[${requestId}] 📋 선택된 업무:`, selected);
  
  try {
    const { headers, owner_id } = await buildRequestContext();
    const requestBody = {
        owner_id: currentRecommendation.owner_id || owner_id,
        target_date: currentRecommendation.target_date,
        selected_tasks: selected
    };
    
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/daily/select_main_tasks`,
      method: 'POST',
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/daily/select_main_tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { detail: errorText || '저장 실패' };
      }
      throw new Error(errorData.detail || '저장 실패');
    }
    
    const data = await response.json();
    console.log(`[${requestId}] ✅ 저장 성공:`, data);
    
    addMessage('assistant', `✅ ${selected.length}개 업무가 금일 계획으로 저장되었습니다!`);
    selectedTasks.clear();
  } catch (error) {
    console.error(`[${requestId}] ❌ 업무 저장 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    addMessage('assistant', `업무 저장 중 오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * 일일 보고서 시작
 */
async function startDailyReport() {
  const requestId = `daily_start_${Date.now()}`;
  console.log(`[${requestId}] 📝 일일 보고서 시작 요청`);
  
  try {
    const targetDate = customDates.daily || new Date().toISOString().split('T')[0];
    console.log(`[${requestId}] 📅 대상 날짜:`, targetDate);
    
    const { headers, owner_id } = await buildRequestContext();
    const requestBody = { target_date: targetDate };
    if (owner_id) {
      requestBody.owner_id = owner_id;
    }
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/daily/start`,
      method: 'POST',
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/daily/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e) {
        error = { detail: errorText || 'API 오류' };
      }
      
      if (error.detail && error.detail.includes('금일 업무 계획')) {
        console.warn(`[${requestId}] ⚠️ 금일 업무 계획이 없습니다.`);
        addMessage('assistant', '⚠️ 금일 업무 계획이 없습니다. 먼저 "오늘 업무 플래닝"을 해주세요!');
        return;
      }
      throw new Error(error.detail || 'API 오류');
    }
    
    const result = await response.json();
    console.log(`[${requestId}] ✅ 일일 보고서 시작 성공:`, {
      session_id: result.session_id,
      question: result.question?.substring(0, 50) + '...'
    });
    
    chatMode = 'daily_fsm';
    dailySessionId = result.session_id;
    reportInput.placeholder = '업무 내용을 입력하세요...';
    addMessage('assistant', result.question);
  } catch (error) {
    console.error(`[${requestId}] ❌ 일일 보고서 시작 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    addMessage('assistant', `일일 보고서 시작 중 오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * 일일 보고서 답변
 */
async function handleDailyAnswer(answer) {
  const requestId = `daily_answer_${Date.now()}`;
  console.log(`[${requestId}] 💬 일일 보고서 답변 처리:`, {
    session_id: dailySessionId,
    answer_length: answer.length
  });
  
  try {
    const requestBody = { session_id: dailySessionId, answer };
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/daily/answer`,
      method: 'POST',
      body: { ...requestBody, answer: answer.substring(0, 50) + '...' }
    });
    
    const response = await fetch(`${getAPIBase()}/daily/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      throw new Error(errorText || 'API 오류');
    }
    
    const result = await response.json();
    console.log(`[${requestId}] ✅ 답변 처리 성공:`, {
      status: result.status,
      has_message: !!result.message,
      has_report_data: !!result.report_data
    });
    
    if (result.status === 'finished') {
      addMessage('assistant', result.message || '일일 보고서가 완료되었습니다! 🙌');
      
      // 보고서 링크 표시
      if (result.report_data) {
        addMessage('assistant', {
          type: 'daily_report',
          message: '보고서가 생성되었습니다!',
          period: result.period,
          report_data: result.report_data
        });
      }
      
      chatMode = 'normal';
      dailySessionId = null;
      reportInput.placeholder = '메시지를 입력하세요...';
    } else {
      addMessage('assistant', result.question);
    }
  } catch (error) {
    console.error(`[${requestId}] ❌ 답변 처리 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    addMessage('assistant', `답변 처리 중 오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * 주간 보고서 생성
 */
async function generateWeeklyReport() {
  const requestId = `weekly_${Date.now()}`;
  console.log(`[${requestId}] 📊 주간 보고서 생성 요청`);
  
  try {
    addMessage('assistant', '📊 주간 보고서를 생성 중입니다...');
    
    const targetDate = customDates.weekly || new Date().toISOString().split('T')[0];
    console.log(`[${requestId}] 📅 대상 날짜:`, targetDate);
    
    const { headers, owner_id } = await buildRequestContext();
    const requestBody = { target_date: targetDate };
    if (owner_id) {
      requestBody.owner_id = owner_id;
    }
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/weekly/generate`,
      method: 'POST',
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/weekly/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      throw new Error(errorText || 'API 오류');
    }
    
    const data = await response.json();
    console.log(`[${requestId}] ✅ 주간 보고서 생성 성공:`, {
      message: data.message,
      has_period: !!data.period,
      has_report_data: !!data.report_data
    });
    
    // 마지막 메시지 제거
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    addMessage('assistant', {
      type: 'weekly_report',
      message: data.message || '주간 보고서가 생성되었습니다!',
      period: data.period,
      report_data: data.report_data
    });
  } catch (error) {
    console.error(`[${requestId}] ❌ 주간 보고서 생성 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    
    // 마지막 메시지 제거
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    addMessage('assistant', `주간 보고서 생성 중 오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * 월간 보고서 생성
 */
async function generateMonthlyReport() {
  const requestId = `monthly_${Date.now()}`;
  console.log(`[${requestId}] 📈 월간 보고서 생성 요청`);
  
  try {
    addMessage('assistant', '📈 월간 보고서를 생성 중입니다...');
    
    const now = new Date();
    const year = customDates.monthly?.year || now.getFullYear();
    const month = customDates.monthly?.month || (now.getMonth() + 1);
    console.log(`[${requestId}] 📅 대상 기간: ${year}년 ${month}월`);
    
    const { headers, owner_id } = await buildRequestContext();
    const requestBody = { year, month };
    if (owner_id) {
      requestBody.owner_id = owner_id;
    }
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/monthly/generate`,
      method: 'POST',
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/monthly/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      throw new Error(errorText || 'API 오류');
    }
    
    const data = await response.json();
    console.log(`[${requestId}] ✅ 월간 보고서 생성 성공:`, {
      message: data.message,
      has_period: !!data.period,
      has_report_data: !!data.report_data
    });
    
    // 마지막 메시지 제거
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    addMessage('assistant', {
      type: 'monthly_report',
      message: data.message || '월간 보고서가 생성되었습니다!',
      period: data.period,
      report_data: data.report_data
    });
  } catch (error) {
    console.error(`[${requestId}] ❌ 월간 보고서 생성 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    
    // 마지막 메시지 제거
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    addMessage('assistant', `월간 보고서 생성 중 오류가 발생했습니다. 😢\n${error.message || ''}`);
  }
}

/**
 * RAG 챗봇
 */
async function handleRAGChat(query) {
  const requestId = `rag_chat_${Date.now()}`;
  console.log(`[${requestId}] 🔍 RAG 챗봇 요청:`, query);
  
  try {
    addMessage('assistant', '🔍 일일보고서를 검색 중입니다...');
    
    const { headers, owner_id } = await buildRequestContext();
    console.log(`[${requestId}] 🔑 토큰 확인:`, headers.Authorization ? '있음' : '없음');
    
    const requestBody = { query };
    if (owner_id) {
      requestBody.owner_id = owner_id;
    }
    console.log(`[${requestId}] 📤 API 요청:`, {
      url: `${getAPIBase()}/report-chat/chat`,
      method: 'POST',
      headers: { ...headers, Authorization: headers.Authorization ? 'Bearer ***' : '없음' },
      body: requestBody
    });
    
    const response = await fetch(`${getAPIBase()}/report-chat/chat`, {
      method: 'POST',
      headers: headers,
      credentials: 'include', // 쿠키도 함께 전송
      body: JSON.stringify(requestBody)
    });
    
    console.log(`[${requestId}] 📥 API 응답:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] ❌ API 오류 응답:`, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { detail: errorText || `API 오류: ${response.status}` };
      }
      
      console.error(`[${requestId}] ❌ 파싱된 오류 데이터:`, errorData);
      throw new Error(errorData.detail || `API 오류: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[${requestId}] ✅ 검색 성공:`, {
      answer_length: data.answer?.length || 0,
      has_sources: !!data.sources,
      sources_count: data.sources?.length || 0,
      has_results: data.has_results
    });
    
    // 마지막 메시지 제거 (검색 중...)
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    addMessage('assistant', data.answer);
    console.log(`[${requestId}] ✅ RAG 챗봇 완료`);
  } catch (error) {
    console.error(`[${requestId}] ❌ 검색 오류:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });
    
    // 마지막 메시지 제거 (검색 중...)
    if (messagesContainer.lastChild) {
      messagesContainer.removeChild(messagesContainer.lastChild);
      messages.pop();
    }
    
    const errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
    console.error(`[${requestId}] 💬 사용자에게 표시할 오류 메시지:`, errorMessage);
    addMessage('assistant', `검색 중 오류가 발생했습니다. 😢\n${errorMessage}`);
  }
}

/**
 * 쿠키에서 값 가져오기
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return decodeURIComponent(parts.pop().split(';').shift());
  }
  return null;
}

/**
 * 날짜 설정 패널 표시
 */
function showDateSettings() {
  if (!dateSettingsPanel) return;
  
  // 모든 날짜 입력 표시
  const dailyInput = document.getElementById('daily-date-input');
  const weeklyInput = document.getElementById('weekly-date-input');
  const monthlyInput = document.getElementById('monthly-date-input');
  
  if (dailyInput) dailyInput.style.display = 'block';
  if (weeklyInput) weeklyInput.style.display = 'block';
  if (monthlyInput) monthlyInput.style.display = 'block';
  
  // 현재 설정된 날짜 표시
  const dailyDateInput = document.getElementById('daily-target-date');
  const weeklyDateInput = document.getElementById('weekly-target-date');
  const monthlyYearInput = document.getElementById('monthly-year');
  const monthlyMonthInput = document.getElementById('monthly-month');
  
  if (dailyDateInput && customDates.daily) {
    dailyDateInput.value = customDates.daily;
  }
  if (weeklyDateInput && customDates.weekly) {
    weeklyDateInput.value = customDates.weekly;
  }
  if (monthlyYearInput && customDates.monthly?.year) {
    monthlyYearInput.value = customDates.monthly.year;
  }
  if (monthlyMonthInput && customDates.monthly?.month) {
    monthlyMonthInput.value = customDates.monthly.month;
  }
  
  dateSettingsPanel.style.display = 'block';
  addMessage('assistant', '📅 보고서 날짜를 설정해주세요.\n\n• 일일 보고서: 날짜 선택\n• 주간 보고서: 기준 날짜 선택\n• 월간 보고서: 년도와 월 입력\n\n설정 후 "적용" 버튼을 눌러주세요.');
}

function handleApplyDate() {
  const dailyDate = document.getElementById('daily-target-date')?.value;
  const weeklyDate = document.getElementById('weekly-target-date')?.value;
  const monthlyYear = document.getElementById('monthly-year')?.value;
  const monthlyMonth = document.getElementById('monthly-month')?.value;
  
  const dateMessages = [];
  
  if (dailyDate) {
    customDates.daily = dailyDate;
    dateMessages.push(`일일보고서: ${dailyDate}`);
  }
  if (weeklyDate) {
    customDates.weekly = weeklyDate;
    dateMessages.push(`주간보고서: ${weeklyDate}`);
  }
  if (monthlyYear && monthlyMonth) {
    customDates.monthly = { year: parseInt(monthlyYear), month: parseInt(monthlyMonth) };
    dateMessages.push(`월간보고서: ${monthlyYear}년 ${monthlyMonth}월`);
  }
  
  dateSettingsPanel.style.display = 'none';
  
  if (dateMessages.length > 0) {
    addMessage('assistant', `✅ 날짜가 설정되었습니다!\n\n${dateMessages.join('\n')}\n\n이제 "일일보고서 만들어줘", "주간보고서 만들어줘", "월간보고서 만들어줘"라고 요청하시면 설정된 날짜로 자동 생성됩니다.`);
  } else {
    addMessage('assistant', '⚠️ 날짜를 입력해주세요.');
  }
}

/**
 * 날짜 선택 모달 표시
 */
function showDatePickerModal(dateMode) {
  // 기존 모달이 있으면 제거
  const existingModal = document.getElementById('date-picker-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 모달 생성
  const modal = document.createElement('div');
  modal.id = 'date-picker-modal';
  modal.className = 'date-picker-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  `;
  
  // 모달 콘텐츠
  const modalContent = document.createElement('div');
  modalContent.className = 'date-picker-modal-content';
  modalContent.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  
  // 제목
  const title = document.createElement('div');
  title.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  title.textContent = dateMode === 'weekly' 
    ? '주간보고서 기준 날짜 선택' 
    : '월간보고서 기준 날짜 선택';
  modalContent.appendChild(title);
  
  // 설명
  const description = document.createElement('div');
  description.style.cssText = `
    font-size: 14px;
    color: #666;
    margin-bottom: 20px;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  description.textContent = dateMode === 'weekly'
    ? '기준 날짜가 포함된 주간 보고서를 생성합니다.'
    : '기준 날짜가 포함된 월간 보고서를 생성합니다.';
  modalContent.appendChild(description);
  
  // 날짜 입력
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = new Date().toISOString().split('T')[0]; // 오늘 날짜 기본값
  dateInput.style.cssText = `
    width: 100%;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 20px;
    box-sizing: border-box;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  modalContent.appendChild(dateInput);
  
  // 버튼 컨테이너
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 12px;
  `;
  
  // 취소 버튼
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '취소';
  cancelBtn.style.cssText = `
    flex: 1;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    background: white;
    color: #333;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  cancelBtn.addEventListener('click', () => {
    modal.remove();
  });
  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.borderColor = '#ccc';
    cancelBtn.style.background = '#f5f5f5';
  });
  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.borderColor = '#e0e0e0';
    cancelBtn.style.background = 'white';
  });
  buttonContainer.appendChild(cancelBtn);
  
  // 생성하기 버튼
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '생성하기';
  confirmBtn.style.cssText = `
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 8px;
    background: #fdbc66;
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  confirmBtn.addEventListener('click', () => {
    const selectedDate = dateInput.value;
    if (!selectedDate) {
      alert('날짜를 선택해주세요.');
      return;
    }
    
    // 명령어 생성
    let command = '';
    if (dateMode === 'weekly') {
      command = `${selectedDate} 기준으로 이번주 주간보고서 작성해줘`;
    } else if (dateMode === 'monthly') {
      command = `${selectedDate}가 포함된 달의 월간보고서를 작성해줘`;
    }
    
    // 모달 닫기
    modal.remove();
    
    // 명령 실행
    if (command) {
      triggerAgentCommand(command);
    }
  });
  confirmBtn.addEventListener('mouseenter', () => {
    confirmBtn.style.background = '#f0a850';
    confirmBtn.style.transform = 'translateY(-1px)';
    confirmBtn.style.boxShadow = '0 2px 8px rgba(253, 188, 102, 0.3)';
  });
  confirmBtn.addEventListener('mouseleave', () => {
    confirmBtn.style.background = '#fdbc66';
    confirmBtn.style.transform = 'translateY(0)';
    confirmBtn.style.boxShadow = 'none';
  });
  buttonContainer.appendChild(confirmBtn);
  
  modalContent.appendChild(buttonContainer);
  modal.appendChild(modalContent);
  
  // 모달 배경 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // body에 추가
  document.body.appendChild(modal);
}

/**
 * 일일보고서 입력 UI 표시
 */
async function showDailyInputUI() {
  // 기존 메시지 컨테이너 초기화 (빠른 실행 버튼은 보존)
  const quickActionsFixed = document.getElementById('report-quick-actions-fixed');
  messagesContainer.innerHTML = '';
  messages = [];
  
  // 빠른 실행 버튼 다시 추가 (보존)
  if (quickActionsFixed) {
    messagesContainer.appendChild(quickActionsFixed);
  } else {
    // 없으면 새로 생성
    addQuickActionButtonsFixed();
  }
  
  // 저장된 오늘 업무 플래닝 가져오기
  try {
    const { headers, owner_id } = await buildRequestContext();
    const targetDate = new Date().toISOString().split('T')[0];
    const { getMainTasks } = await import('./taskService.js');
    const savedTasksResult = await getMainTasks(owner_id, targetDate);
    
    // 저장된 업무가 있으면 상단에 표시 (가운데 정렬, 주황색 테마)
    if (savedTasksResult.success && savedTasksResult.count > 0) {
      const planMessage = document.createElement('div');
      planMessage.style.cssText = `
        margin-bottom: 24px;
        display: flex;
        justify-content: center;
        font-family: ${DEFAULT_FONT_FAMILY};
      `;
      
      const planBubble = document.createElement('div');
      planBubble.style.cssText = `
        background: #fff4e6;
        border: 2px solid #fdbc66;
        border-radius: 12px;
        padding: 20px;
        max-width: 600px;
        box-shadow: 0 2px 8px rgba(253, 188, 102, 0.15);
        font-family: ${DEFAULT_FONT_FAMILY};
      `;
      
      const planTitle = document.createElement('div');
      planTitle.textContent = '📋 금일 당신이 계획한 업무입니다!';
      planTitle.style.cssText = `
        font-weight: 600;
        margin-bottom: 16px;
        color: #d4a574;
        font-size: 16px;
        text-align: center;
        font-family: ${DEFAULT_FONT_FAMILY};
      `;
      planBubble.appendChild(planTitle);
      
      const planList = document.createElement('ol');
      planList.style.cssText = `
        margin: 0;
        padding-left: 24px;
        color: #555;
        font-size: 14px;
        line-height: 1.8;
        font-family: ${DEFAULT_FONT_FAMILY};
      `;
      
      savedTasksResult.main_tasks.forEach((task, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = task.title || task.task || '제목 없음';
        listItem.style.fontFamily = DEFAULT_FONT_FAMILY;
        planList.appendChild(listItem);
      });
      
      planBubble.appendChild(planList);
      planMessage.appendChild(planBubble);
      messagesContainer.appendChild(planMessage);
    }
  } catch (error) {
    console.error('[DailyInput] 저장된 업무 조회 실패:', error);
    // 실패해도 계속 진행
  }
  
  // 일일보고서 입력 컨테이너 생성
  const inputContainer = document.createElement('div');
  inputContainer.id = 'daily-input-container';
  inputContainer.className = 'daily-input-container';
  inputContainer.style.cssText = `
    max-width: 760px;
    margin: 32px auto;
    padding: 24px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  
  // 제목
  const title = document.createElement('div');
  title.className = 'daily-input-title';
  title.textContent = '📝 일일 보고서 작성';
  title.style.cssText = `
    font-size: 20px;
    font-weight: 600;
    color: #333;
    margin-bottom: 20px;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  inputContainer.appendChild(title);
  
  // 입력 영역
  const inputArea = document.createElement('div');
  inputArea.className = 'daily-input-area';
  inputArea.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  `;
  
  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.id = 'daily-task-input';
  taskInput.placeholder = '업무를 입력하세요...';
  taskInput.style.cssText = `
    flex: 1;
    padding: 12px 16px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  taskInput.addEventListener('focus', () => {
    taskInput.style.borderColor = '#fdbc66';
  });
  taskInput.addEventListener('blur', () => {
    taskInput.style.borderColor = '#e0e0e0';
  });
  taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addTaskTag();
    }
  });
  
  const addBtn = document.createElement('button');
  addBtn.textContent = '추가';
  addBtn.className = 'daily-input-add-btn';
  addBtn.style.cssText = `
    padding: 12px 24px;
    background: #fdbc66;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  addBtn.addEventListener('click', addTaskTag);
  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.background = '#f0a850';
  });
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.background = '#fdbc66';
  });
  
  inputArea.appendChild(taskInput);
  inputArea.appendChild(addBtn);
  inputContainer.appendChild(inputArea);
  
  // 태그 컨테이너
  const tagsContainer = document.createElement('div');
  tagsContainer.id = 'daily-tags-container';
  tagsContainer.className = 'daily-tags-container';
  tagsContainer.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
    min-height: 40px;
  `;
  inputContainer.appendChild(tagsContainer);
  
  // 완료 버튼
  const completeBtn = document.createElement('button');
  completeBtn.textContent = '완료';
  completeBtn.id = 'daily-complete-btn';
  completeBtn.className = 'daily-complete-btn';
  completeBtn.style.cssText = `
    width: 100%;
    padding: 14px;
    background: linear-gradient(135deg, #fdbc66 0%, #f8d8ae 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 2px 8px rgba(253, 188, 102, 0.3);
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  completeBtn.addEventListener('click', handleDailyInputComplete);
  completeBtn.addEventListener('mouseenter', () => {
    completeBtn.style.transform = 'translateY(-2px)';
    completeBtn.style.boxShadow = '0 4px 12px rgba(253, 188, 102, 0.4)';
  });
  completeBtn.addEventListener('mouseleave', () => {
    completeBtn.style.transform = 'translateY(0)';
    completeBtn.style.boxShadow = '0 2px 8px rgba(253, 188, 102, 0.3)';
  });
  inputContainer.appendChild(completeBtn);
  
  messagesContainer.appendChild(inputContainer);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  // 입력창에 포커스
  setTimeout(() => {
    taskInput.focus();
  }, 100);
}

// 태그 목록 저장
let dailyTaskTags = [];

/**
 * 태그 추가
 */
function addTaskTag() {
  const taskInput = document.getElementById('daily-task-input');
  const tagsContainer = document.getElementById('daily-tags-container');
  
  if (!taskInput || !tagsContainer) return;
  
  const taskText = taskInput.value.trim();
  if (!taskText) return;
  
  // 중복 체크
  if (dailyTaskTags.includes(taskText)) {
    taskInput.value = '';
    return;
  }
  
  // 태그 추가
  dailyTaskTags.push(taskText);
  
  // 태그 UI 생성
  const tag = document.createElement('div');
  tag.className = 'daily-task-tag';
  tag.dataset.task = taskText;
  tag.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #ffe3b8;
    color: #333;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  
  const tagText = document.createElement('span');
  tagText.textContent = taskText;
  tagText.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  tag.appendChild(tagText);
  
  const removeBtn = document.createElement('button');
  removeBtn.textContent = '×';
  removeBtn.style.cssText = `
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.2s;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  removeBtn.addEventListener('click', () => {
    dailyTaskTags = dailyTaskTags.filter(t => t !== taskText);
    tag.remove();
  });
  removeBtn.addEventListener('mouseenter', () => {
    removeBtn.style.background = 'rgba(0,0,0,0.1)';
  });
  removeBtn.addEventListener('mouseleave', () => {
    removeBtn.style.background = 'none';
  });
  
  tag.appendChild(removeBtn);
  tagsContainer.appendChild(tag);
  
  // 입력창 초기화
  taskInput.value = '';
  taskInput.focus();
}

/**
 * 일일보고서 입력 완료 처리
 */
async function handleDailyInputComplete() {
  const completeBtn = document.getElementById('daily-complete-btn');
  
  if (dailyTaskTags.length === 0) {
    alert('업무를 최소 1개 이상 입력해주세요.');
    return;
  }
  
  // 버튼 비활성화
  if (completeBtn) {
    completeBtn.disabled = true;
    completeBtn.textContent = '저장 중...';
  }
  
  try {
    const { headers, owner_id } = await buildRequestContext();
    const targetDate = new Date().toISOString().split('T')[0];
    
    const requestBody = {
      date: targetDate,
      owner_id: owner_id || 0,
      tasks: dailyTaskTags
    };
    
    console.log('[DailyInput] 저장 요청:', requestBody);
    
    const response = await fetch(`${getAPIBase()}/reports/daily/input`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `API 오류: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[DailyInput] 저장 완료:', data);
    
    // 성공 메시지 표시 (빠른 실행 버튼은 보존)
    const quickActionsFixed = document.getElementById('report-quick-actions-fixed');
    messagesContainer.innerHTML = '';
    messages = [];
    
    // 빠른 실행 버튼 다시 추가 (보존)
    if (quickActionsFixed) {
      messagesContainer.appendChild(quickActionsFixed);
    } else {
      addQuickActionButtonsFixed();
    }
    
    // 상세 업무 리스트 생성
    const taskListText = dailyTaskTags.map((task, index) => `${index + 1}. ${task}`).join('\n');
    
    addMessage('assistant', `✅ 일일 상세 업무가 저장되었습니다!\n\n상세 업무 ${dailyTaskTags.length}개\n${taskListText}`);
    
    // 태그 목록 초기화
    dailyTaskTags = [];
    
    // 특이사항 입력 여부 확인 (보고서 보기 버튼은 특이사항 입력 완료 후 표시)
    // report_id가 없으면 빈 문자열이므로 확인
    const reportId = data.report_id && data.report_id.trim() !== '' ? data.report_id : null;
    console.log('[DailyInput] report_id 확인:', reportId);
    askForNotes(reportId, targetDate);
    
  } catch (error) {
    console.error('[DailyInput] 저장 실패:', error);
    alert(`저장 중 오류가 발생했습니다.\n${error.message || ''}`);
    
    // 버튼 다시 활성화
    if (completeBtn) {
      completeBtn.disabled = false;
      completeBtn.textContent = '완료';
    }
  }
}

/**
 * 특이사항 입력 여부 확인
 */
function askForNotes(reportId, reportDate) {
  setTimeout(() => {
    addMessage('assistant', '특이사항이 있으신가요? (있으면 입력해주세요, 없으면 "없음" 또는 "없어"라고 답해주세요)');
    
    // 특이사항 입력 모드 활성화
    isNotesInputMode = true;
    currentNotesReportId = reportId;
    currentNotesReportDate = reportDate; // 보고서 보기 버튼을 위해 날짜 저장
    
    console.log('[Notes] 특이사항 입력 모드 활성화:', { reportId, reportDate });
  }, 1000);
}

/**
 * 특이사항 입력 처리
 */
async function handleNotesInput(inputText, reportId) {
  // "없음" 또는 "없어"로 답하면 스킵
  const skipKeywords = ['없음', '없어', '없습니다', '없다', 'no', 'none'];
  const shouldSkip = skipKeywords.some(keyword => 
    inputText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  addMessage('user', inputText);
  reportInput.value = '';
  
  if (shouldSkip) {
    addMessage('assistant', '알겠습니다. 특이사항 없음으로 저장하겠습니다.');
    
    // 특이사항 입력 모드 비활성화
    isNotesInputMode = false;
    const savedReportId = currentNotesReportId;
    const savedReportDate = currentNotesReportDate;
    currentNotesReportId = null;
    currentNotesReportDate = null;
    
    // 보고서 보기 버튼 표시
    showReportViewButton(savedReportDate);
    
    // 빠른 실행 버튼 다시 표시
    setTimeout(() => {
      // 상단 고정 버튼 사용으로 자동 추가 제거
    }, 500);
    return;
  }
  
  // 특이사항이 있으면 업데이트
  try {
    addMessage('assistant', '특이사항을 저장하는 중...');
    
    // 보고서 업데이트 API 호출
    const { headers } = await buildRequestContext();
    const apiUrl = `${getAPIBase()}/reports/daily/${reportId}/notes`;
    console.log('[Notes] 저장 요청:', { reportId, url: apiUrl, notes: inputText });
    
    const updateResponse = await fetch(apiUrl, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ notes: inputText })
    });
    
    if (updateResponse.ok) {
      const updateData = await updateResponse.json();
      addMessage('assistant', '✅ 특이사항이 저장되었습니다!');
      
      // 특이사항 입력 모드 비활성화
      isNotesInputMode = false;
      const savedReportDate = currentNotesReportDate;
      currentNotesReportId = null;
      currentNotesReportDate = null;
      
      // 보고서 보기 버튼 표시 (말풍선 밑에 따로)
      showReportViewButton(savedReportDate);
    } else {
      const errorText = await updateResponse.text();
      console.error('[Notes] 저장 실패:', {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        errorText: errorText,
        url: apiUrl,
        reportId: reportId
      });
      addMessage('assistant', `⚠️ 특이사항 저장에 실패했습니다: ${updateResponse.status} ${updateResponse.statusText}`);
      
      // 특이사항 입력 모드 비활성화
      isNotesInputMode = false;
      const savedReportDate = currentNotesReportDate;
      currentNotesReportId = null;
      currentNotesReportDate = null;
      
      // 실패해도 보고서 보기 버튼은 표시
      showReportViewButton(savedReportDate);
    }
  } catch (error) {
    console.error('[Notes] 저장 실패:', error);
    addMessage('assistant', `⚠️ 특이사항 저장 중 오류가 발생했습니다: ${error.message}`);
    
    // 특이사항 입력 모드 비활성화
    isNotesInputMode = false;
    const savedReportDate = currentNotesReportDate;
    currentNotesReportId = null;
    currentNotesReportDate = null;
    
    // 에러가 발생해도 보고서 보기 버튼은 표시
    showReportViewButton(savedReportDate);
  }
  
  // 빠른 실행 버튼 다시 표시 (이미 보존되어 있으므로 불필요)
}

/**
 * 보고서 보기 버튼 표시 (말풍선 밑에 따로 표시)
 */
function showReportViewButton(reportDate) {
  if (!reportDate) return;
  
  const reportUrl = `${BACKEND_URL}/static/reports/daily/일일보고서_default_workspace_${reportDate}.html`;
  
  // 새로운 메시지로 버튼 표시
  const buttonMessage = document.createElement('div');
  buttonMessage.className = 'message assistant';
  buttonMessage.style.cssText = `
    margin-top: 8px;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  
  const linkButton = document.createElement('button');
  linkButton.textContent = '📄 보고서 보기';
  linkButton.style.cssText = `
    padding: 10px 20px;
    background: #fdbc66;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    font-family: ${DEFAULT_FONT_FAMILY};
  `;
  linkButton.addEventListener('click', () => {
    // Electron 앱 내부에서 보고서 창 열기
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('open-report-window', {
          url: reportUrl,
          title: `일일보고서 - ${reportDate}`
        });
      } catch (e) {
        console.error('보고서 창 열기 실패:', e);
        window.open(reportUrl, '_blank');
      }
    } else {
      window.open(reportUrl, '_blank');
    }
  });
  linkButton.addEventListener('mouseenter', () => {
    linkButton.style.background = '#f0a850';
  });
  linkButton.addEventListener('mouseleave', () => {
    linkButton.style.background = '#fdbc66';
  });
  
  buttonMessage.appendChild(linkButton);
  messagesContainer.appendChild(buttonMessage);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * 세션 데이터 가져오기 (Electron에서 호출)
 */
export function getReportSessionData() {
  return {
    chatMode,
    dailySessionId,
    dailyOwnerId,
    messages: messages.slice(-10) // 최근 10개만
  };
}

