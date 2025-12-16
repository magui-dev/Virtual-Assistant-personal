const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

//환경변수 로드 추가!
require('dotenv').config();

//환경변수에서 백엔드 URL 가져오기
// 개발: localhost, 배포: 서버 URL
// 환경변수로 직접 지정하거나, 기본값 사용
const BACKEND_URL = process.env.BACKEND_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://virtualassistant.magui-dev.com'  // 배포용
    : 'http://localhost:8000');  // 로컬 개발용
    
const isDev = BACKEND_URL.includes('localhost');
console.log('백엔드 URL:', BACKEND_URL, isDev ? '(개발 모드)' : '(배포 모드)');

// 내보내기 핸들러 등록 (PDF, CSV)
require('./exportHandlers.js');

let loginWin = null;
let characterWin = null;
let backendProcess = null;
let loginWindowBounds = null; // 로그인 창의 위치 저장

/**
 * 랜딩/시작 창 생성 (첫 화면)
 */
function createLandingWindow() {
  console.log('🏠 랜딩 페이지 생성');

  loginWin = new BrowserWindow({
    width: 800,
    height: 600,
    center: true,
    resizable: false,
    frame: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      partition: 'persist:main'  // 캐릭터 창과 세션 공유
    }
  });

  // 랜딩 페이지 로드 (시작하기, 사용설명서, 로그인 버튼)
  loginWin.loadURL(`${BACKEND_URL}/landing`);

  // 백엔드 URL을 렌더러로 주입
  loginWin.webContents.on('did-finish-load', () => {
    loginWin.webContents.executeJavaScript(`window.BACKEND_URL = '${BACKEND_URL}';`);
  });

  // OAuth 페이지에서 다시 랜딩 페이지로 돌아올 때 크기 복원
  loginWin.webContents.on('did-navigate', (event, url) => {
    if (url.includes('/landing')) {
      // 랜딩 페이지로 돌아오면 원래 크기로 복원
      loginWin.setSize(800, 600);
      loginWin.center();
      console.log('🔄 랜딩 페이지 크기 복원: 800x600');
    }
  });

  // F12 단축키로 개발자 도구 열기
  loginWin.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      if (loginWin.webContents.isDevToolsOpened()) {
        loginWin.webContents.closeDevTools();
        console.log('🛠️ 개발자 도구 닫힘 (랜딩 창)');
      } else {
        loginWin.webContents.openDevTools({ mode: 'detach' });
        console.log('🛠️ 개발자 도구 열림 (랜딩 창)');
      }
    }
  });

  loginWin.on('closed', () => {
    console.log('🔐 로그인 창 닫힘');
    loginWin = null;
  });

  // 로그인 창의 위치를 저장 (캐릭터 창을 같은 위치에 띄우기 위해)
  loginWin.on('ready-to-show', () => {
    loginWindowBounds = loginWin.getBounds();
    console.log('📍 로그인 창 위치 저장:', loginWindowBounds);
  });

  // 로그인 창을 이동할 때마다 위치 업데이트
  loginWin.on('move', () => {
    loginWindowBounds = loginWin.getBounds();
  });
}

/**
 * 캐릭터 투명 창 생성
 */
function createCharacterWindow() {
  console.log('🎭 투명 전체화면 캐릭터 창 생성');

  // 로그인 창이 있던 디스플레이 찾기
  let targetDisplay = screen.getPrimaryDisplay();

  if (loginWindowBounds) {
    // 로그인 창의 중앙 위치 계산
    const loginCenterX = loginWindowBounds.x + loginWindowBounds.width / 2;
    const loginCenterY = loginWindowBounds.y + loginWindowBounds.height / 2;

    // 로그인 창이 있던 디스플레이 찾기
    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      if (loginCenterX >= x && loginCenterX < x + width &&
        loginCenterY >= y && loginCenterY < y + height) {
        targetDisplay = display;
        console.log('📍 로그인 창이 있던 디스플레이 찾음:', display.id);
        break;
      }
    }
  }

  const { x, y, width, height } = targetDisplay.workArea;
  console.log(`📐 캐릭터 창 크기: ${width}x${height}, 위치: (${x}, ${y})`);

  // 전체 화면 투명 창 (클릭-스루 가능)
  characterWin = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      partition: 'persist:main' // 세션 공유를 위한 partition 설정
    }
  });

  // 메인 페이지 로드 (캐릭터 화면)
  characterWin.loadURL(`${BACKEND_URL}/main`);

  console.log('📦 캐릭터 로딩 중...');

  // 🔥 개발자 도구 자동 열기 (detach 모드) - 배포 시 비활성화
  // characterWin.webContents.openDevTools({ mode: 'detach' });
  // console.log('🛠️ 개발자 도구 열림 (detach 모드)');

  // 단축키 (F12, Ctrl+Shift+I: 개발자 도구 토글)
  characterWin.webContents.on('before-input-event', (event, input) => {
    // F12로 개발자 도구 (별도 창으로 열기)
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      if (characterWin.webContents.isDevToolsOpened()) {
        characterWin.webContents.closeDevTools();
      } else {
        characterWin.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  characterWin.webContents.on('did-finish-load', () => {
    console.log('✅ 캐릭터 로드 완료!');

    // 백엔드 URL을 렌더러로 주입
    characterWin.webContents.executeJavaScript(`window.BACKEND_URL = '${BACKEND_URL}';`);

    // 페이지 로드 완료 후 마우스 이벤트 활성화
    // (렌더러에서 동적으로 클릭-스루 영역 제어)
    // 초기에는 마우스 이벤트를 받아서 렌더러에서 처리할 수 있도록 함
    setTimeout(() => {
      if (characterWin && !characterWin.isDestroyed()) {
        characterWin.setIgnoreMouseEvents(false);
        console.log('✅ 마우스 이벤트 활성화');
      }
    }, 1500); // 페이지 초기화 대기 (더 길게)
  });

  // 브라우저 콘솔 메시지를 터미널로 출력 (에러만)
  characterWin.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) { // 2 = warning, 3 = error
      console.log(`[Browser] ${message}`);
    }
  });

  characterWin.on('closed', () => {
    console.log('🎭 캐릭터 창 닫힘');
    characterWin = null;
  });

  // 개발자 도구 (디버깅용)
  // characterWin.webContents.openDevTools();
}

// 렌더러에서 클릭-스루 영역 정보 받기
ipcMain.on('va:set-ignore-mouse', (_e, ignore) => {
  if (characterWin && !characterWin.isDestroyed()) {
    try {
      characterWin.setIgnoreMouseEvents(ignore, { forward: true });
      // 마우스 이벤트 상태 변경: ignore
    } catch (error) {
      console.error('❌ setIgnoreMouseEvents 오류:', error);
    }
  }
});

// 보고서 패널 열릴 때 alwaysOnTop 제어
ipcMain.on('va:report-panel-toggle', (_e, isOpen) => {
  if (characterWin && !characterWin.isDestroyed()) {
    try {
      if (isOpen) {
        // 보고서 패널 열릴 때: alwaysOnTop 끄기
        characterWin.setAlwaysOnTop(false);
        console.log('📝 보고서 패널 열림 → alwaysOnTop: false');
      } else {
        // 보고서 패널 닫힐 때: alwaysOnTop 켜기
        characterWin.setAlwaysOnTop(true);
        console.log('📝 보고서 패널 닫힘 → alwaysOnTop: true');
      }
    } catch (error) {
      console.error('❌ setAlwaysOnTop 오류:', error);
    }
  }
});

// 시작하기 버튼 클릭 시 캐릭터 창 생성
ipcMain.on('va:start-character', async () => {
  console.log('✨ 캐릭터 시작!');

  // 캐릭터 창이 없으면 생성 (하지만 아직 URL 로드하지 않음)
  if (!characterWin) {
    // 캐릭터 창 생성 로직을 인라인으로 실행
    const { screen } = require('electron');

    // 로그인 창이 있던 디스플레이 찾기
    const displays = screen.getAllDisplays();
    let targetDisplay = displays[0];

    if (loginWindowBounds) {
      const loginCenterX = loginWindowBounds.x + loginWindowBounds.width / 2;
      const loginCenterY = loginWindowBounds.y + loginWindowBounds.height / 2;

      for (const display of displays) {
        const { x, y, width, height } = display.bounds;
        if (loginCenterX >= x && loginCenterX < x + width &&
          loginCenterY >= y && loginCenterY < y + height) {
          targetDisplay = display;
          console.log('📍 로그인 창이 있던 디스플레이 찾음:', displays.indexOf(display) + 1);
          break;
        }
      }
    }

    const { x, y, width, height } = targetDisplay.workArea;
    console.log(`📐 캐릭터 창 크기: ${width}x${height}, 위치: (${x}, ${y})`);

    characterWin = new BrowserWindow({
      width: width,
      height: height,
      x: x,
      y: y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        partition: 'persist:main'
      }
    });

    console.log('📦 캐릭터 창 생성 완료 (URL 로드 전)');
  }

  // 🍪 쿠키 복사: loginWin → characterWin (URL 로드 전에 실행!)
  if (loginWin && !loginWin.isDestroyed() && characterWin && !characterWin.isDestroyed()) {
    try {
      const loginSession = loginWin.webContents.session;
      const charSession = characterWin.webContents.session;

      // loginWin의 모든 쿠키 가져오기
      const cookies = await loginSession.cookies.get({});
      console.log(`🍪 쿠키 ${cookies.length}개 복사 시작...`);

      // characterWin에 쿠키 설정
      for (const cookie of cookies) {
        await charSession.cookies.set({
          url: BACKEND_URL,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false,
          sameSite: cookie.sameSite || 'unspecified'
        });
      }

      console.log('✅ 쿠키 복사 완료');
    } catch (error) {
      console.error('❌ 쿠키 복사 실패:', error);
    }
  }

  // 쿠키 복사 후 URL 로드
  if (characterWin && !characterWin.isDestroyed()) {
    characterWin.loadURL(`${BACKEND_URL}/main`);
    console.log('📦 캐릭터 로딩 중...');
  }

  // 쿠키 복사 후 로그인 창 닫기
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.close();
  }
});

// 로그아웃 시 랜딩 페이지로 돌아가기
ipcMain.on('va:logout', () => {
  console.log('👋 로그아웃');

  // 캐릭터 창 닫기
  if (characterWin && !characterWin.isDestroyed()) {
    characterWin.close();
  }

  // 랜딩 창 생성
  if (!loginWin) {
    createLandingWindow();
  }
});

// 페이지 이동 (랜딩 페이지 내에서)
ipcMain.on('va:navigate', (_e, path) => {
  console.log(`🔄 페이지 이동: ${path}`);

  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.loadURL(`${BACKEND_URL}${path}`);
  }
});

// 종료 요청 (다이얼로그에서 확인 후)
ipcMain.on('va:request-quit', () => {
  console.log('✅ 사용자가 종료를 확인함');
  app.quit();
});

// 브레인스토밍 팝업 열기
let brainstormingWin = null;

async function openBrainstormingPopup() {
  console.log('🧠 브레인스토밍 팝업 생성');

  // 이미 팝업이 열려있으면 포커스만
  if (brainstormingWin && !brainstormingWin.isDestroyed()) {
    brainstormingWin.focus();
    return;
  }

  // 브레인스토밍 팝업 창 생성
  brainstormingWin = new BrowserWindow({
    width: 700,
    height: 732, // 700 + 32 (타이틀바)
    center: true,
    resizable: true,
    frame: false, // 툴바 제거
    backgroundColor: '#f5f5f5',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      partition: 'persist:main' // 세션 공유
    },
    parent: characterWin, // 부모 창 설정
    modal: false,
    alwaysOnTop: true, // 항상 위에 표시
    titleBarStyle: 'customButtonsOnHover', // macOS 버튼 완전 숨김
    trafficLightPosition: { x: -100, y: -100 } // 버튼을 화면 밖으로
  });

  // 🍪 쿠키 복사 제거 - HTTP 프로토콜로 같은 도메인이므로 자동 공유
  // partition: 'persist:main'으로 세션 공유되므로 쿠키 복사 불필요
  
  // 브레인스토밍 전용 페이지 로드 (HTTP 프로토콜)
  brainstormingWin.loadURL(`${BACKEND_URL}/brainstorming-popup`);

  // 개발자 도구 (F12)
  brainstormingWin.webContents.on('before-input-event', (event, input) => {
    // F12 또는 Cmd+Option+I (macOS) 또는 Ctrl+Shift+I
    const isDevToolsShortcut = 
      (input.type === 'keyDown' && input.key === 'F12') ||
      (input.type === 'keyDown' && input.meta && input.alt && input.key.toLowerCase() === 'i') ||
      (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i');
    
    if (isDevToolsShortcut) {
      event.preventDefault();
      
      if (brainstormingWin.webContents.isDevToolsOpened()) {
        brainstormingWin.webContents.closeDevTools();
        console.log('🛠️ 브레인스토밍 개발자 도구 닫힘');
      } else {
        brainstormingWin.webContents.openDevTools({ mode: 'detach' });
        console.log('🛠️ 브레인스토밍 개발자 도구 열림');
      }
    }
  });

  // 팝업 로드 완료
  brainstormingWin.webContents.on('did-finish-load', () => {
    console.log('🧠 브레인스토밍 팝업 로드 완료');
  });

  // 팝업 종료 시 세션 자동 삭제 및 챗봇에 알림
  brainstormingWin.on('close', async (e) => {
    console.log('🧠 브레인스토밍 팝업 닫기 시작');

    // 렌더러에서 세션 ID 가져오기
    try {
      const sessionId = await brainstormingWin.webContents.executeJavaScript('getCurrentSessionId()');

      if (sessionId) {
        console.log('🗑️ 세션 자동 삭제 시작:', sessionId);

        // 세션 삭제 API 호출
        const http = require('http');
        const backendUrl = new URL(BACKEND_URL);
        const options = {
          hostname: backendUrl.hostname,
          port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
          path: `/api/v1/brainstorming/session/${sessionId}`,
          method: 'DELETE'
        };

        const req = http.request(options, (res) => {
          console.log('✅ 세션 삭제 완료:', sessionId);
        });

        req.on('error', (error) => {
          console.error('❌ 세션 삭제 실패:', error);
        });

        req.end();
      }
    } catch (error) {
      console.error('❌ 세션 ID 가져오기 실패:', error);
    }
  });

  brainstormingWin.on('closed', () => {
    console.log('🧠 브레인스토밍 팝업 닫힘');

    // 챗봇에 종료 이벤트 전송
    if (characterWin && !characterWin.isDestroyed()) {
      characterWin.webContents.send('brainstorming-closed', {
        // ideasCount 제거 - 단순히 종료만 알림
      });
    }

    brainstormingWin = null;
  });
}

// 보고서 팝업 열기
let reportWin = null;

async function openReportPopup() {
  console.log('📝 보고서 팝업 생성');

  // 이미 팝업이 열려있으면 포커스만
  if (reportWin && !reportWin.isDestroyed()) {
    reportWin.focus();
    return;
  }

  // 보고서 팝업 창 생성 (하지만 아직 URL 로드하지 않음)
  // 보고서 팝업 창 생성
  // Windows 11에서 둥근 모서리 방지: frame: false + transparent: false 조합 사용
  const reportWinOptions = {
    width: 700,
    height: 732, // 700 + 32 (타이틀바)
    center: true,
    resizable: true,
    frame: false, // 툴바 제거
    backgroundColor: '#f5f5f5', // HTML 배경색과 일치
    transparent: false, // 투명도 비활성화 (둥근 모서리 방지)
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      partition: 'persist:main' // 메인 창과 같은 세션 공유
    },
    parent: characterWin, // 부모 창 설정
    modal: false,
    alwaysOnTop: true, // 항상 위에 표시
  };
  
  // Windows 11 둥근 모서리 완전 제거 (DWM 레벨)
  if (process.platform === 'win32') {
    reportWinOptions.roundedCorners = false;
  }
  
  reportWin = new BrowserWindow(reportWinOptions);
  
  // 🍪 쿠키 복사: characterWin → reportWin (URL 로드 전에 실행!)
  if (characterWin && !characterWin.isDestroyed() && reportWin && !reportWin.isDestroyed()) {
    try {
      const charSession = characterWin.webContents.session;
      const reportSession = reportWin.webContents.session;

      // characterWin의 모든 쿠키 가져오기
      const cookies = await charSession.cookies.get({});
      console.log(`🍪 [Report] 쿠키 ${cookies.length}개 복사 시작...`);

      // reportWin에 쿠키 설정
      for (const cookie of cookies) {
        await reportSession.cookies.set({
          url: BACKEND_URL,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false,
          sameSite: cookie.sameSite || 'unspecified'
        });
      }

      console.log('✅ [Report] 쿠키 복사 완료');
    } catch (error) {
      console.error('❌ [Report] 쿠키 복사 실패:', error);
    }
  }

  // 쿠키 복사 후 보고서 전용 페이지 로드 (HTTP 프로토콜 사용)
  if (reportWin && !reportWin.isDestroyed()) {
    reportWin.loadURL(`${BACKEND_URL}/report`);
  }

  // 페이지 로드 완료
  reportWin.webContents.on('did-finish-load', () => {
    console.log('📝 보고서 팝업 로드 완료');
    
    // 백엔드 URL을 렌더러로 주입
    reportWin.webContents.executeJavaScript(`window.BACKEND_URL = '${BACKEND_URL}';`);
    
    if (process.platform === 'win32') {
      console.log('📝 Windows 보고서 팝업: CSS에서 border-radius 제거 시도');
      
      // Windows 11 DWM 둥근 모서리 강제 제거 (타이틀바와 큰 창만)
      reportWin.webContents.executeJavaScript(`
        const style = document.createElement('style');
        style.textContent = \`
          html, body {
            overflow: hidden !important;
            border-radius: 0 !important;
          }
          .titlebar {
            border-radius: 0 !important;
            border-top-left-radius: 0 !important;
            border-top-right-radius: 0 !important;
          }
          .titlebar-btn {
            border-radius: 50% !important;
          }
          #report-panel,
          #report-messages {
            border-radius: 0 !important;
          }
          .report-quick-actions-fixed {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
        \`;
        document.head.appendChild(style);
        console.log('✅ Windows 둥근 모서리 제거 스타일 주입 완료 (타이틀바 및 큰 창만)');
      `).catch(err => {
        console.error('❌ 스타일 주입 실패:', err);
      });
    }
  });

  // 개발자 도구 (F12)
  reportWin.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (reportWin.webContents.isDevToolsOpened()) {
        reportWin.webContents.closeDevTools();
      } else {
        reportWin.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  reportWin.on('closed', () => {
    console.log('📝 보고서 팝업 닫힘');

    // 챗봇에 종료 이벤트 전송 및 alwaysOnTop 복구
    if (characterWin && !characterWin.isDestroyed()) {
      characterWin.webContents.send('report-closed', {
        // 단순히 종료만 알림
      });
      
      // characterWin의 alwaysOnTop 복구
      characterWin.setAlwaysOnTop(true);
      console.log('✅ 캐릭터 창 alwaysOnTop 복구');
    }

    reportWin = null;
  });
}

// IPC: 챗봇에서 브레인스토밍 팝업 열기
ipcMain.on('open-brainstorming-popup', async (event) => {
  console.log('🧠 브레인스토밍 팝업 생성 요청 (챗봇)');
  
  // 이미 팝업이 열려있으면 포커스만
  if (brainstormingWin && !brainstormingWin.isDestroyed()) {
    brainstormingWin.focus();
    return;
  }

  // 브레인스토밍 팝업 창 생성
  brainstormingWin = new BrowserWindow({
    width: 700,
    height: 732,
    center: true,
    resizable: true,
    frame: false,
    backgroundColor: '#f5f5f5',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      partition: 'persist:main' // 세션 공유
    },
    parent: characterWin,
    modal: false,
    alwaysOnTop: true,
    titleBarStyle: 'customButtonsOnHover',
    trafficLightPosition: { x: -100, y: -100 }
  });

  // 🍪 쿠키 복사 제거 - HTTP 프로토콜로 같은 도메인이므로 자동 공유
  // partition: 'persist:main'으로 세션 공유되므로 쿠키 복사 불필요

  // 쿠키 복사 후 페이지 로드 (HTTP 프로토콜)
  brainstormingWin.loadURL(`${BACKEND_URL}/brainstorming-popup`);

  // 페이지 로드 완료
  brainstormingWin.webContents.on('did-finish-load', () => {
    console.log('🧠 브레인스토밍 팝업 로드 완료');
    
    // 백엔드 URL을 렌더러로 주입
    brainstormingWin.webContents.executeJavaScript(`window.BACKEND_URL = '${BACKEND_URL}';`);
  });

  // 개발자 도구 (F12)
  brainstormingWin.webContents.on('before-input-event', (event, input) => {
    // F12 또는 Cmd+Option+I (macOS) 또는 Ctrl+Shift+I
    const isDevToolsShortcut = 
      (input.type === 'keyDown' && input.key === 'F12') ||
      (input.type === 'keyDown' && input.meta && input.alt && input.key.toLowerCase() === 'i') ||
      (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i');
    
    if (isDevToolsShortcut) {
      event.preventDefault();
      
      if (brainstormingWin.webContents.isDevToolsOpened()) {
        brainstormingWin.webContents.closeDevTools();
        console.log('🛠️ 브레인스토밍 개발자 도구 닫힘');
      } else {
        brainstormingWin.webContents.openDevTools({ mode: 'detach' });
        console.log('🛠️ 브레인스토밍 개발자 도구 열림');
      }
    }
  });

  // 팝업 종료 시 세션 자동 삭제 및 챗봇에 알림
  brainstormingWin.on('close', async (e) => {
    console.log('🧠 브레인스토밍 팝업 닫기 시작');

    // 렌더러에서 세션 ID 가져오기
    try {
      const sessionId = await brainstormingWin.webContents.executeJavaScript('getCurrentSessionId()');

      if (sessionId) {
        console.log('🗑️ 세션 자동 삭제 시작:', sessionId);

        // 세션 삭제 API 호출
        const http = require('http');
        const backendUrl = new URL(BACKEND_URL);
        const options = {
          hostname: backendUrl.hostname,
          port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
          path: `/api/v1/brainstorming/session/${sessionId}`,
          method: 'DELETE'
        };

        const req = http.request(options, (res) => {
          console.log('✅ 세션 삭제 완료:', sessionId);
        });

        req.on('error', (error) => {
          console.error('❌ 세션 삭제 실패:', error);
        });

        req.end();
      }
    } catch (error) {
      console.error('❌ 세션 ID 가져오기 실패:', error);
    }
  });

  brainstormingWin.on('closed', () => {
    console.log('🧠 브레인스토밍 팝업 닫힘');

    // 챗봇에 종료 이벤트 전송
    if (characterWin && !characterWin.isDestroyed()) {
      characterWin.webContents.send('brainstorming-closed', {});
    }

    brainstormingWin = null;
  });
});

// 브레인스토밍 창 최대화 토글
ipcMain.on('toggle-brainstorming-maximize', () => {
  if (brainstormingWin && !brainstormingWin.isDestroyed()) {
    if (brainstormingWin.isMaximized()) {
      brainstormingWin.unmaximize();
    } else {
      brainstormingWin.maximize();
    }
  }
});

// 브레인스토밍 창 개발자 도구 토글
ipcMain.on('toggle-brainstorming-devtools', () => {
  if (brainstormingWin && !brainstormingWin.isDestroyed()) {
    if (brainstormingWin.webContents.isDevToolsOpened()) {
      brainstormingWin.webContents.closeDevTools();
      console.log('🛠️ 브레인스토밍 개발자 도구 닫힘');
    } else {
      brainstormingWin.webContents.openDevTools({ mode: 'detach' });
      console.log('🛠️ 브레인스토밍 개발자 도구 열림');
    }
  }
});

// 보고서 팝업 열기 요청
ipcMain.on('open-report-popup', () => {
  console.log('📨 보고서 팝업 요청 받음');
  openReportPopup();
});

// 보고서 팝업에서 메인 창의 쿠키 가져오기 요청
ipcMain.handle('get-main-cookies', async () => {
  console.log('🍪 메인 창 쿠키 요청 받음');

  if (characterWin && !characterWin.isDestroyed()) {
    try {
      const mainSession = characterWin.webContents.session;
      const cookies = await mainSession.cookies.get({ url: BACKEND_URL });
      console.log(`🍪 메인 창 쿠키 ${cookies.length}개 반환`);

      // 쿠키를 객체로 변환
      const cookieObj = {};
      cookies.forEach(cookie => {
        cookieObj[cookie.name] = cookie.value;
      });

      return cookieObj;
    } catch (error) {
      console.error('❌ 쿠키 가져오기 실패:', error);
      return {};
    }
  }

  return {};
});

// 보고서 전용 창 열기 (Electron 앱 내부)
let reportViewerWins = []; // 여러 보고서 창을 관리

ipcMain.on('open-report-window', async (event, data) => {
  const { url, title } = data;
  console.log('📄 보고서 창 열기 요청:', { url, title });

  try {
    // 새 보고서 뷰어 창 생성
    const reportViewerWin = new BrowserWindow({
      width: 1200,
      height: 900,
      center: true,
      resizable: true,
      frame: true,
      backgroundColor: '#f5f5f5',
      title: title || '보고서',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        partition: 'persist:main' // 세션 공유
      },
      parent: null, // 독립적인 창으로 설정 (부모 없음)
      modal: false, // 모달이 아님
      alwaysOnTop: false // 항상 위에 표시하지 않음
    });

    // URL 로드
    reportViewerWin.loadURL(url);

    // 개발자 도구 (F12)
    reportViewerWin.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        if (reportViewerWin.webContents.isDevToolsOpened()) {
          reportViewerWin.webContents.closeDevTools();
        } else {
          reportViewerWin.webContents.openDevTools({ mode: 'detach' });
        }
      }
    });

    // 창 닫힐 때 배열에서 제거
    reportViewerWin.on('closed', () => {
      console.log('📄 보고서 창 닫힘');
      reportViewerWins = reportViewerWins.filter(win => win !== reportViewerWin);
    });

    // 배열에 추가
    reportViewerWins.push(reportViewerWin);

    console.log('✅ 보고서 창 열기 완료');
  } catch (error) {
    console.error('❌ 보고서 창 열기 실패:', error);
  }
});

// 보고서 창 최대화 토글
ipcMain.on('toggle-report-maximize', () => {
  if (reportWin && !reportWin.isDestroyed()) {
    if (reportWin.isMaximized()) {
      reportWin.unmaximize();
    } else {
      reportWin.maximize();
    }
  }
});

// 브레인스토밍 창 닫기 (렌더러에서 요청)
ipcMain.on('close-brainstorming-window', () => {
  console.log('🧠 브레인스토밍 창 닫기 요청 (세션 삭제 완료)');
  if (brainstormingWin && !brainstormingWin.isDestroyed()) {
    brainstormingWin.close();
  }
});

// 캐릭터 창 alwaysOnTop 제어 (모달 열릴 때)
ipcMain.on('set-character-always-on-top', (event, isOnTop) => {
  if (characterWin && !characterWin.isDestroyed()) {
    characterWin.setAlwaysOnTop(isOnTop);
    console.log(`🎭 캐릭터 창 alwaysOnTop: ${isOnTop}`);
  }
});


// Notion OAuth 창 열기
let notionOAuthWin = null;

ipcMain.on('open-notion-oauth', async (event, authUrl) => {
  console.log('🔗 Notion OAuth 창 열기:', authUrl);

  // 이미 창이 열려있으면 포커스
  if (notionOAuthWin && !notionOAuthWin.isDestroyed()) {
    notionOAuthWin.focus();
    return;
  }

  // OAuth 전용 창 생성 (세션 공유)
  notionOAuthWin = new BrowserWindow({
    width: 800,
    height: 700,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
      // partition 제거 - 기본 세션 사용하여 로그인 상태 유지
    }
  });

  // Notion 쿠키만 삭제 (로그인 세션은 유지)
  const { session } = require('electron');
  try {
    console.log('🗑️ Notion 쿠키 삭제 중...');
    const cookies = await session.defaultSession.cookies.get({ domain: '.notion.so' });
    for (const cookie of cookies) {
      await session.defaultSession.cookies.remove(`https://${cookie.domain}${cookie.path}`, cookie.name);
      console.log(`   삭제: ${cookie.name}`);
    }
    console.log('✅ Notion 쿠키 삭제 완료');
  } catch (error) {
    console.error('⚠️ Notion 쿠키 삭제 실패:', error);
  }

  // OAuth URL 로드
  notionOAuthWin.loadURL(authUrl);

  // URL 변경 감지 (콜백 URL로 리디렉션되면 자동으로 처리)
  notionOAuthWin.webContents.on('will-redirect', (event, url) => {
    console.log('🔄 리디렉션 감지:', url);

    // 콜백 URL인지 확인
    if (url.startsWith(`${BACKEND_URL}/api/v1/auth/notion/callback`)) {
      console.log('✅ Notion OAuth 콜백 감지 - 창 닫기');

      // 콜백 URL을 메인 창에서 처리하도록 로드
      if (loginWin && !loginWin.isDestroyed()) {
        // 콜백을 처리하고 /landing으로 리디렉션될 것임
        loginWin.loadURL(url);
      }

      // OAuth 창 즉시 닫기
      if (notionOAuthWin && !notionOAuthWin.isDestroyed()) {
        notionOAuthWin.close();
      }
    }
  });

  // did-navigate 이벤트도 감지 (일부 경우 will-redirect가 안 잡힐 수 있음)
  notionOAuthWin.webContents.on('did-navigate', (event, url) => {
    console.log('🔄 네비게이션 감지:', url);

    // 콜백 URL이거나 /landing으로 리디렉션되면 창 닫기
    if (url.startsWith(`${BACKEND_URL}/api/v1/auth/notion/callback`) ||
      url.includes('/landing?notion_connected=true')) {
      console.log('✅ Notion OAuth 완료 - 창 닫기');

      // 메인 창에 알림
      if (loginWin && !loginWin.isDestroyed()) {
        loginWin.loadURL(`${BACKEND_URL}/landing?notion_connected=true`);
      }

      // OAuth 창 즉시 닫기
      if (notionOAuthWin && !notionOAuthWin.isDestroyed()) {
        notionOAuthWin.close();
      }
    }
  });

  // 창 닫힘 이벤트
  notionOAuthWin.on('closed', () => {
    console.log('🔗 Notion OAuth 창 닫힘');
    notionOAuthWin = null;
  });
});


// 백엔드 서버가 준비될 때까지 대기하는 함수
async function waitForBackend(maxRetries = 30) {
  const http = require('http');

  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`${BACKEND_URL}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status: ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000);
      });

      console.log('✅ 백엔드 서버 준비 완료!');
      return true;
    } catch (err) {
      console.log(`⏳ 백엔드 대기 중... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.error('❌ 백엔드 서버 시작 타임아웃');
  return false;
}

app.whenReady().then(async () => {
  console.log('🚀 일렉트론 앱 시작!');
  console.log('📝 세션 기반 - 앱 종료 시 로그인 정보 삭제됨');
  console.log('⌨️  단축키: ESC = 종료, F12 = 개발자 도구');

  // 🔥 앱 시작 시 캐시만 삭제 (Refresh Token은 유지 - 15일 자동 로그인)
  console.log('🗑️  캐시 삭제 중...');
  const { session } = require('electron');
  await session.defaultSession.clearStorageData({
    storages: ['localstorage', 'sessionstorage', 'cachestorage']
  });
  await session.defaultSession.clearCache();
  console.log('✅ 캐시 삭제 완료 - Refresh Token 유지됨');

  // 🔥 배포 모드에서는 백엔드 시작 안 함 (서버 백엔드 사용)
  if (isDev) {
    // 백엔드 서버 시작 (개발 모드만)
    console.log('🔧 백엔드 서버 시작 중...');
    const isWindows = process.platform === 'win32';
    
    // Windows: 새 콘솔 창에서 Python 실행 (백엔드 출력을 별도 콘솔로)
    // Linux/Mac: stdout을 파일로 리다이렉트하거나 기존 방식 유지
    if (isWindows) {
      // Windows에서 새 콘솔 창 생성
      // CREATE_NEW_CONSOLE 플래그를 사용하면 새 콘솔 창이 생성되고
      // Python의 stdout/stderr가 그 창에 출력됨
      // stdio를 설정하지 않으면 기본적으로 새 콘솔 창에 출력됨
      backendProcess = spawn('python', ['assistant.py'], {
        detached: false,  // Electron과 함께 종료되도록 유지
        // stdio를 설정하지 않으면 CREATE_NEW_CONSOLE로 생성된 새 콘솔 창에 출력됨
        shell: false,
        windowsVerbatimArguments: false,
        creationFlags: 0x00000010, // CREATE_NEW_CONSOLE - 새 콘솔 창 생성
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });
    } else {
      // Linux/Mac: 기존 방식 (터미널에서 직접 실행하는 경우)
      backendProcess = spawn('python3', ['assistant.py'], {
        stdio: ['ignore', 'pipe', 'pipe'], // stdout/stderr을 파이프로 받음
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });
      
      // 백엔드 출력을 파일로 리다이렉트 (선택사항)
      const fs = require('fs');
      const logDir = path.join(__dirname, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = fs.createWriteStream(path.join(logDir, 'backend.log'), { flags: 'a' });
      
      backendProcess.stdout.pipe(logFile);
      backendProcess.stderr.pipe(logFile);
      
      // 터미널에도 출력 (Electron 콘솔이 아닌 터미널)
      backendProcess.stdout.pipe(process.stdout);
      backendProcess.stderr.pipe(process.stderr);
    }

    backendProcess.on('error', (err) => {
      console.error('❌ 백엔드 서버 시작 실패:', err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`📴 백엔드 서버 종료됨 (코드: ${code})`);
    });

    // 백엔드가 준비될 때까지 대기
    const ready = await waitForBackend();

    if (ready) {
      // 백엔드 준비 완료 후 랜딩 페이지 띄움
      createLandingWindow();
    } else {
      console.error('❌ 백엔드를 시작할 수 없습니다.');
      app.quit();
    }
  } else {
    // 배포 모드: 서버 백엔드 사용
    console.log('🌐 서버 백엔드 사용 (배포 모드)');
    
    // 서버 연결 확인 (선택사항)
    const ready = await waitForBackend(10); // 10초만 대기
    
    if (ready) {
      console.log('✅ 서버 백엔드 연결 성공!');
      createLandingWindow();
    } else {
      console.error('⚠️ 서버 백엔드에 연결할 수 없습니다. 인터넷 연결을 확인하세요.');
      // 경고만 하고 계속 진행 (오프라인 상태일 수 있음)
      createLandingWindow();
    }
  }
});

app.on('window-all-closed', () => {
  console.log('👋 앱 종료 중...');

  // 백엔드 프로세스 종료
  if (backendProcess && !backendProcess.killed) {
    console.log('🛑 백엔드 서버 종료 중...');
    backendProcess.kill('SIGTERM');
  }

  // 세션 삭제 (Refresh Token은 유지 - 15일 자동 로그인)
  const { session } = require('electron');
  session.defaultSession.clearStorageData({
    storages: ['localstorage', 'sessionstorage']
  }).then(() => {
    console.log('🗑️  세션 삭제 완료 - Refresh Token 유지됨');
    app.quit();
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createLandingWindow();
  }
});

// 앱 종료 전 정리
app.on('before-quit', async (event) => {
  console.log('🧹 앱 종료 전 정리 중...');

  // 백엔드 프로세스 종료
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
  }

  // 세션 삭제 (Refresh Token은 유지 - 15일 자동 로그인)
  console.log('🗑️  세션 삭제 중...');
  const { session } = require('electron');
  try {
    await session.defaultSession.clearStorageData({
      storages: ['localstorage', 'sessionstorage', 'cachestorage']
    });
    await session.defaultSession.clearCache();
    console.log('✅ 세션 삭제 완료 - Refresh Token 유지됨');
  } catch (err) {
    console.error('⚠️ 세션 삭제 실패:', err);
  }
});
