// config.js import 제거 - 함수로 직접 정의
// main.js가 window.BACKEND_URL을 주입하므로 함수 호출 시점에는 존재함
function getAPIBase() {
  const url = window.BACKEND_URL || 'https://virtualassistant.magui-dev.com';
  return `${url}/api/v1`;
}

export async function buildRequestContext() {
  const headers = { 'Content-Type': 'application/json' };
  const accessToken = getAccessToken();

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const ownerId = window.currentUserId || null;

  if (typeof window !== 'undefined' && ownerId) {
    window.currentUserId = ownerId;
  }

  return { 
    headers, 
    owner_id: ownerId
  };
}

export async function callChatModule(userText) {
  console.log('🔎 [Intent Router] message:', userText);

  const text = userText.toLowerCase().trim();

  if (isTaskRecommendationIntent(text)) {
    return await getTodayPlan();
  }

  if (isDailyReportIntent(text)) {
    return {
      type: 'daily_report_trigger',
      data: '일일 보고서를 작성할게요.'
    };
  }

  if (isWeeklyReportIntent(text)) {
    return await generateWeeklyReport();
  }

  if (isMonthlyReportIntent(text)) {
    return await generateMonthlyReport();
  }

  if (isYearlyReportIntent(text)) {
    return await generateYearlyReport();
  }

  return {
    type: 'text',
    data: `"${userText}" - 아직 학습 중입니다! 😊\n\n예시 질문\n- "오늘 뭐할지 추천해줘"\n- "일일 보고서 작성"\n- "주간 보고서"\n- "월간 보고서"\n- "연간 보고서"`
  };
}

export async function getTodayPlan() {
  try {
    console.log('📌 [API] /plan/today 호출 시작...');

    const { headers, owner_id } = await buildRequestContext();
    const requestBody = {
      target_date: new Date().toISOString().split('T')[0]
    };
    if (owner_id) {
      requestBody.owner_id = owner_id;
    }

    const response = await fetch(`${getAPIBase()}/plan/today`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [API] 추천 업무 응답:', data);

    return {
      type: 'task_recommendations',
      data: {
        tasks: data.tasks || [],
        summary: data.summary || '오늘의 추천 업무입니다.',
        owner_id: data.owner_id || owner_id || null,
        target_date: data.target_date || requestBody.target_date,
        task_sources: data.task_sources || []
      }
    };
  } catch (error) {
    console.error('❌ [API] 추천 업무 호출 실패:', error);
    return {
      type: 'error',
      data: '추천 업무를 불러오는 데 실패했습니다.'
    };
  }
}

async function generateWeeklyReport() {
  try {
    console.log('📌 [API] /weekly/generate 호출 시작...');

    const { headers, owner_id } = await buildRequestContext();
    const body = {
      target_date: getMonday(new Date())
    };
    if (owner_id) {
      body.owner_id = owner_id;
    }

    const response = await fetch(`${getAPIBase()}/weekly/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [API] 주간 보고서 생성 완료');

    return {
      type: 'text',
      data: `주간 보고서가 생성되었습니다.\n\n기간: ${data?.period?.start || body.target_date} ~ ${data?.period?.end || ''}`
    };
  } catch (error) {
    console.error('❌ [API] 주간 보고서 생성 실패:', error);
    return {
      type: 'text',
      data: '주간 보고서 생성 중 오류가 발생했습니다.'
    };
  }
}

async function generateMonthlyReport() {
  try {
    console.log('📌 [API] /monthly/generate 호출 시작...');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const { headers, owner_id } = await buildRequestContext();
    const body = { year, month };
    if (owner_id) {
      body.owner_id = owner_id;
    }

    const response = await fetch(`${getAPIBase()}/monthly/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [API] 월간 보고서 생성 완료');

    return {
      type: 'text',
      data: `월간 보고서가 생성되었습니다.\n\n기간: ${data?.period?.start || `${year}년 ${month}월`} ~ ${data?.period?.end || ''}`
    };
  } catch (error) {
    console.error('❌ [API] 월간 보고서 생성 실패:', error);
    return {
      type: 'text',
      data: '월간 보고서 생성 중 오류가 발생했습니다.'
    };
  }
}

async function generateYearlyReport() {
  try {
    console.log('📌 [API] /performance_report/generate 호출 시작...');

    const year = new Date().getFullYear();

    const { headers, owner_id } = await buildRequestContext();
    const body = { year };
    if (owner_id) {
      body.owner_id = owner_id;
    }

    const response = await fetch(`${getAPIBase()}/performance_report/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    await response.json();
    console.log('✅ [API] 연간 보고서 생성 완료');

    return {
      type: 'text',
      data: `${year}년 연간 보고서가 생성되었습니다.`
    };
  } catch (error) {
    console.error('❌ [API] 연간 보고서 생성 실패:', error);
    return {
      type: 'text',
      data: '연간 보고서 생성 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 저장된 금일 진행 업무 조회
 */
export async function getMainTasks(ownerId, targetDate) {
  try {
    console.log('📌 [API] /daily/get_main_tasks 호출 시작...', { ownerId, targetDate });

    const { headers, owner_id } = await buildRequestContext();
    const response = await fetch(`${getAPIBase()}/daily/get_main_tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner_id: ownerId || owner_id,
        target_date: targetDate
      })
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [API] 저장된 업무 조회 응답:', data);

    return {
      success: true,
      main_tasks: data.main_tasks || [],
      count: data.count || 0
    };
  } catch (error) {
    console.error('❌ [API] 저장된 업무 조회 실패:', error);
    return {
      success: false,
      main_tasks: [],
      count: 0,
      message: error.message
    };
  }
}

export async function saveSelectedTasks(ownerId, targetDate, tasks, append = false) {
  try {
    console.log('📌 [API] /daily/select_main_tasks 호출 시작...', { append, tasksCount: tasks.length });

    const { headers, owner_id } = await buildRequestContext();
    const response = await fetch(`${getAPIBase()}/daily/select_main_tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner_id: ownerId || owner_id,
        target_date: targetDate,
        main_tasks: tasks,
        append: append
      })
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [API] 업무 저장 응답:', data);

    return {
      success: true,
      saved_count: tasks.length,
      data: data
    };
  } catch (error) {
    console.error('❌ [API] 업무 저장 실패:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

export async function updateMainTasks(ownerId, targetDate, tasks) {
  try {
    console.log('📌 [API] /daily/update_main_tasks 호출 시작...');

    const { headers, owner_id } = await buildRequestContext();
    const response = await fetch(`${getAPIBase()}/daily/update_main_tasks`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        owner_id: ownerId || owner_id,
        target_date: targetDate,
        main_tasks: tasks
      })
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [API] 업무 수정 응답:', data);

    return {
      success: true,
      updated_count: tasks.length,
      data: data
    };
  } catch (error) {
    console.error('❌ [API] 업무 수정 실패:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

function isTaskRecommendationIntent(text) {
  const keywords = ['추천', '뭐할', '뭐해', '업무', '오늘', 'todo', 'task'];
  const triggerWords = ['추천', '뭐할', '계획'];

  return keywords.some(kw => text.includes(kw)) &&
         triggerWords.some(tw => text.includes(tw));
}

function isDailyReportIntent(text) {
  return (text.includes('일일') || text.includes('daily')) &&
         (text.includes('보고') || text.includes('작성') || text.includes('리포트'));
}

function isWeeklyReportIntent(text) {
  return (text.includes('주간') || text.includes('weekly')) &&
         (text.includes('보고') || text.includes('작성') || text.includes('리포트'));
}

function isMonthlyReportIntent(text) {
  return (text.includes('월간') || text.includes('monthly')) &&
         (text.includes('보고') || text.includes('작성') || text.includes('리포트'));
}

function isYearlyReportIntent(text) {
  return (text.includes('연간') || text.includes('연도') || text.includes('yearly') || text.includes('annual')) &&
         (text.includes('보고') || text.includes('작성') || text.includes('리포트'));
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function getAccessToken() {
  return sessionStorage.getItem('access_token') || getCookie('access_token');
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return decodeURIComponent(parts.pop().split(';').shift());
  }
  return null;
}
