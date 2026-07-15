// ==UserScript==
// @name         Flex 근무시간 체크 - 밥자격 + 실제 퇴근시간 완벽판
// @version      9.1.0
// @description  Neo Tokyo 싸펑 애니 HUD + 강한 네온 모션 + 근무·운세·안전한 익명 채팅
// @match        https://flex.team/time-tracking/my-work-record*
// @updateURL    https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @downloadURL  https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      monkeychatting-default-rtdb.firebaseio.com
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    /* ==========================================================================
       설정 상수
       ========================================================================== */
    const DAILY_GOAL = 9.0;
    const MEAL_QUALIFY_HOURS = 2.5;
    const BASE_WEEKLY = 45;
    const EXTRA_HOURS = 8;
    const WEEKLY_GOAL = BASE_WEEKLY + EXTRA_HOURS;

    const FIREBASE_BASE_URL = "https://monkeychatting-default-rtdb.firebaseio.com/chat";
    const FIREBASE_URL = `${FIREBASE_BASE_URL}.json`;
    const FIREBASE_FORTUNE_URL = FIREBASE_BASE_URL.replace('/chat', '/fortune');
    const NICKNAME = "루팡_" + Math.floor(Math.random() * 9999).toString().padStart(4, '0');

    // 고유 사용자 키 — localStorage 에 영구 저장, 새로고침해도 유지
    const USER_KEY = (() => {
        let k = localStorage.getItem('gpun7_uid');
        if (!k) {
            k = Date.now().toString(36) + Math.random().toString(36).slice(2);
            localStorage.setItem('gpun7_uid', k);
        }
        return k;
    })();

    const P = "gpun7";

    function firebaseRequest(method, url, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
                data: data === undefined ? undefined : JSON.stringify(data),
                responseType: 'json',
                timeout: 10000,
                onload: (response) => resolve({
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    data: response.response
                }),
                onerror: () => reject(new Error('Firebase request failed')),
                ontimeout: () => reject(new Error('Firebase request timed out'))
            });
        });
    }

    /* ==========================================================================
       외부 콘텐츠 데이터
       ========================================================================== */
    const DATA_URLS = {
        messages: 'https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/data/flex-messages.json',
        fortunes: 'https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/data/flex-fortunes.json'
    };
    const DATA_CACHE_KEYS = {
        messages: 'gpun7_messages_v1',
        fortunes: 'gpun7_fortunes_v1'
    };
    const SYSTEM_COPY_KEYS = [
        'tenMinutesRemaining', 'workComplete', 'mealUnlocked', 'fortuneLoading',
        'chatEmpty', 'chatLoading', 'chatError', 'chatPlaceholder', 'chatSending', 'chatSent'
    ];
    const FALLBACK_MESSAGES = {
        alarms: {},
        status: {
            level1: Array(20).fill('업무 엔진 예열 중. 아직 소음만 정상입니다.'),
            level2: Array(20).fill('업무가 굴러갑니다. 방향은 다음 회의에서 정할 예정입니다.'),
            level3: Array(20).fill('절반을 넘겼습니다. 이제 하루가 우리 편인 척합니다.'),
            level4: Array(20).fill('퇴근권이 가시권입니다. 새 안건 접근 금지.'),
            level5: Array(20).fill('오늘치 노동력 납품 완료. 이제 사람 모드로 복귀하세요.')
        },
        system: {
            tenMinutesRemaining: '퇴근 10분 전. 이제 새 일 잡으면 그 일이 상사입니다.',
            workComplete: '오늘치 노동력 납품 완료. 퇴근 버튼과 상봉하세요.',
            mealUnlocked: '야근 식대 해금. 오늘만큼은 사이드 추가도 업무입니다.',
            fortuneLoading: '오늘의 운을 사내망에서 몰래 반입 중입니다.',
            chatEmpty: '아직 조용합니다. 첫 월급루팡 선언문을 남겨보세요.',
            chatLoading: '익명 동료들의 속마음을 불러오는 중입니다.',
            chatError: '채팅 서버가 잠깐 커피 사러 갔습니다.',
            chatPlaceholder: '업무 말고 아무 말 27자',
            chatSending: '전송 중',
            chatSent: '익명으로 무사히 흘려보냈습니다.'
        }
    };
    const FALLBACK_FORTUNES = [{
        score: 58,
        title: '평 ★★★☆☆',
        body: '운세 서버가 지각해도 하루는 정시 출근했습니다.',
        advice: '기본 루틴만 지켜도 오늘은 충분히 선방입니다.'
    }];

    let ALARM_MENT = FALLBACK_MESSAGES.alarms;
    let STATUS_MENT = FALLBACK_MESSAGES.status;
    let SYSTEM_COPY = FALLBACK_MESSAGES.system;
    let FORTUNE_DATA = FALLBACK_FORTUNES;

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function validateMessages(value) {
        if (!value || typeof value !== 'object' || !value.alarms || !value.status || !value.system) return false;
        const alarmsValid = Object.entries(value.alarms).length === 3 &&
            Object.entries(value.alarms).every(([time, alarm]) =>
                /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) &&
                alarm && isNonEmptyString(alarm.title) &&
                Array.isArray(alarm.bodies) && alarm.bodies.length === 20 &&
                alarm.bodies.every(isNonEmptyString)
            );
        const statusValid = ['level1', 'level2', 'level3', 'level4', 'level5'].every((level) =>
            Array.isArray(value.status[level]) && value.status[level].length === 20 &&
            value.status[level].every(isNonEmptyString)
        );
        const systemValid = SYSTEM_COPY_KEYS.every((key) => isNonEmptyString(value.system[key]));
        return alarmsValid && statusValid && systemValid;
    }

    function validateFortunes(value) {
        return Array.isArray(value) && value.length === 150 && value.every((item) =>
            item && Number.isInteger(item.score) && item.score >= 10 && item.score <= 99 &&
            isNonEmptyString(item.title) && isNonEmptyString(item.body) &&
            isNonEmptyString(item.advice)
        );
    }

    function loadDataset({ url, cacheKey, fallback, validate }) {
        let current = fallback;
        try {
            const cached = GM_getValue(cacheKey, null);
            if (validate(cached)) current = cached;
        } catch (error) {
            console.warn(`[GPUN] ${cacheKey} 캐시 읽기 실패`, error);
        }

        const refreshed = new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'json',
                timeout: 3000,
                onload: (response) => {
                    const value = response.response;
                    if (response.status < 200 || response.status >= 300 || !validate(value)) {
                        console.warn(`[GPUN] ${cacheKey} 원격 데이터 검증 실패`);
                        resolve(current);
                        return;
                    }
                    current = value;
                    try {
                        GM_setValue(cacheKey, value);
                    } catch (error) {
                        console.warn(`[GPUN] ${cacheKey} 캐시 저장 실패`, error);
                    }
                    resolve(value);
                },
                onerror: () => {
                    console.warn(`[GPUN] ${cacheKey} 원격 요청 실패`);
                    resolve(current);
                },
                ontimeout: () => {
                    console.warn(`[GPUN] ${cacheKey} 원격 요청 시간 초과`);
                    resolve(current);
                }
            });
        });

        return { current, refreshed };
    }

    function initializeExternalData() {
        const messages = loadDataset({
            url: DATA_URLS.messages,
            cacheKey: DATA_CACHE_KEYS.messages,
            fallback: FALLBACK_MESSAGES,
            validate: validateMessages
        });
        ALARM_MENT = messages.current.alarms;
        STATUS_MENT = messages.current.status;
        SYSTEM_COPY = messages.current.system;
        const messagesReady = messages.refreshed.then((value) => {
            ALARM_MENT = value.alarms;
            STATUS_MENT = value.status;
            SYSTEM_COPY = value.system;
            return value;
        });

        const fortunes = loadDataset({
            url: DATA_URLS.fortunes,
            cacheKey: DATA_CACHE_KEYS.fortunes,
            fallback: FALLBACK_FORTUNES,
            validate: validateFortunes
        });
        FORTUNE_DATA = fortunes.current;
        const fortunesReady = fortunes.refreshed.then((value) => {
            FORTUNE_DATA = value;
            return value;
        });

        return { messagesReady, fortunesReady };
    }

    /* ==========================================================================
       운세 상태 & 함수
       ========================================================================== */
    let cachedFortune = null;

    function getDailyFortuneSeed() {
        const today = new Date().toISOString().slice(0, 10);
        const raw = today + '|' + USER_KEY;
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            hash = (hash * 31 + raw.charCodeAt(i)) | 0;
        }
        return Math.abs(hash) % FORTUNE_DATA.length;
    }

    async function loadFortune() {
        const today = new Date().toISOString().slice(0, 10);
        const nodeUrl = `${FIREBASE_FORTUNE_URL}/${USER_KEY}.json`;
        try {
            const res = await firebaseRequest('GET', nodeUrl);
            const data = res.data;
            if (data && data.date === today) {
                cachedFortune = data;
                return;
            }
            const idx = getDailyFortuneSeed();
            const fortune = { date: today, ...FORTUNE_DATA[idx] };

            // ★ 히스토리 배열 유지 (최근 10개)
            const history = (data && data.history) ? data.history : [];
            if (data && data.date && data.score !== undefined) {
                history.push({ date: data.date, score: data.score });
            }
            if (history.length > 10) history.splice(0, history.length - 10);
            fortune.history = history;

            await firebaseRequest('PUT', nodeUrl, fortune);
            cachedFortune = fortune;
        } catch (_) {
            const idx = getDailyFortuneSeed();
            cachedFortune = { date: today, ...FORTUNE_DATA[idx] };
        }
    }

    /* ==========================================================================
       상태 변수
       ========================================================================== */
    let triggeredFixed = new Set();
    let triggered9Hour10Min = false;
    let triggered9HourDone = false;
    let triggeredMeal = false;
    let lastCheckedMinute = -1;
    let isFetching = false;
    let lastChatCount = 0;
    let lastResetDate = null;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    /* ==========================================================================
       네트워크 로직
       ========================================================================== */
    function escapeHTML(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function setChatState(kind, detail = '') {
        const chatBox = document.getElementById(`${P}-chat-display`);
        if (!chatBox) return;
        const copy = {
            loading: SYSTEM_COPY.chatLoading,
            empty: SYSTEM_COPY.chatEmpty,
            error: SYSTEM_COPY.chatError
        }[kind] || SYSTEM_COPY.chatError;
        const retry = kind === 'error'
            ? `<button class="${P}-retry" id="${P}-chat-retry" type="button">다시 연결</button>`
            : '';
        chatBox.innerHTML = `
            <div class="${P}-chat-state ${P}-chat-state-${kind}">
                <span>${escapeHTML(copy)}</span>
                ${detail ? `<small>${escapeHTML(detail)}</small>` : ''}
                ${retry}
            </div>`;
        document.getElementById(`${P}-chat-retry`)?.addEventListener('click', fetchChat);
    }

    async function fetchChat() {
        if (isFetching || !document.getElementById(`${P}-root`)) return;
        isFetching = true;
        try {
            const response = await firebaseRequest('GET', FIREBASE_URL);
            if (!response.ok) {
                setChatState('error', `응답 코드 ${response.status}`);
                return;
            }
            const data = response.data;
            const chatBox = document.getElementById(`${P}-chat-display`);
            if (!chatBox) return;
            if (data !== null) {
                renderChat(data);
                pruneChat(data);
            } else {
                setChatState('empty');
            }
        } catch (_) {
            setChatState('error');
        }
        finally { isFetching = false; }
    }

    async function sendChat(message) {
        message = message.trim().substring(0, 27);
        if (!message) return false;
        const payload = {
            name: NICKNAME,
            msg: message,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };
        try {
            const r = await firebaseRequest('POST', FIREBASE_URL, payload);
            if (!r.ok) return false;
            fetchChat();
            return true;
        } catch (_) {
            return false;
        }
    }

    function pruneChat(data) {
        const keys = Object.keys(data);
        if (keys.length > 30) {
            keys.slice(0, keys.length - 30).forEach(key => {
                firebaseRequest('DELETE', `${FIREBASE_BASE_URL}/${key}.json`).catch(() => {});
            });
        }
    }

    function renderChat(data) {
        const chatBox = document.getElementById(`${P}-chat-display`);
        if (!chatBox) return;
        const keys = Object.keys(data);
        let html = "";
        keys.slice(-30).forEach(key => {
            const item = data[key];
            const isMe = item.name === NICKNAME;
            html += `<div class="${P}-chat-msg${isMe ? ` ${P}-chat-msg-me` : ''}">
                <span class="${P}-chat-name">${escapeHTML(item.name)}</span>
                <span class="${P}-chat-text">${escapeHTML(item.msg)}</span>
                <span class="${P}-chat-time">${escapeHTML(item.time)}</span>
            </div>`;
        });
        chatBox.innerHTML = html;
        if (keys.length !== lastChatCount) {
            chatBox.scrollTop = chatBox.scrollHeight;
            lastChatCount = keys.length;
        }
    }

    /* ==========================================================================
       시간 계산 & 알람
       ========================================================================== */
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function getStatusMent(todayDone) {
        const seed = new Date().getMinutes();
        let arr;
        if (todayDone >= 9.0) arr = STATUS_MENT.level5;
        else if (todayDone >= 8.5) arr = STATUS_MENT.level4;
        else if (todayDone >= 6.0) arr = STATUS_MENT.level3;
        else if (todayDone >= 3.0) arr = STATUS_MENT.level2;
        else arr = STATUS_MENT.level1;
        return arr[seed % arr.length];
    }

    function triggerAlarm(title, body = "") {
        const displayTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        let count = 0;
        const orig = document.title;
        const iv = setInterval(() => {
            document.title = count++ % 2 ? `>>> ${title} <<<` : orig;
            if (count > 20) { clearInterval(iv); document.title = orig; }
        }, 500);
        if (Notification.permission === "granted") {
            new Notification(`[GPUN] ${title}`, {
                body: `${body}\n(${displayTime})`,
                requireInteraction: true
            });
        }
    }

    function checkFixedTimeAlarms() {
        const now = new Date();
        const cm = now.getHours() * 60 + now.getMinutes();
        if (cm === lastCheckedMinute) return;
        lastCheckedMinute = cm;
        const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        const todayKey = now.toDateString();
        if (ALARM_MENT[timeStr]) {
            const key = `${todayKey}|${timeStr}`;
            if (!triggeredFixed.has(key)) {
                triggeredFixed.add(key);
                const info = ALARM_MENT[timeStr];
                triggerAlarm(info.title, pick(info.bodies));
            }
        }
    }

    function check9HourAlarms(todayDone) {
        const m = Math.round(todayDone * 60);
        if (m >= 530 && m <= 535 && !triggered9Hour10Min) {
            triggered9Hour10Min = true;
            triggerAlarm("퇴근선 10분 전", SYSTEM_COPY.tenMinutesRemaining);
        }
        if (m >= 540 && m <= 545 && !triggered9HourDone) {
            triggered9HourDone = true;
            triggerAlarm("근무 계약 이행 완료", SYSTEM_COPY.workComplete);
        }
    }

    function checkMealQualify(todayDone) {
        if (todayDone >= DAILY_GOAL + MEAL_QUALIFY_HOURS && !triggeredMeal) {
            triggeredMeal = true;
            triggerAlarm("식대 퀘스트 해금", SYSTEM_COPY.mealUnlocked);
        }
    }

    function parseHM(str) {
        if (!str) return 0;
        str = str.trim().replace(/\s/g, '');
        let m;
        if ((m = str.match(/^(\d+)시간$/))) return +m[1];
        if ((m = str.match(/^(\d+)시간(\d+)분?$/))) return +m[1] + (+m[2] || 0) / 60;
        if ((m = str.match(/^(\d+):(\d+)$/))) return +m[1] + +m[2] / 60;
        if ((m = str.match(/^(\d+)분$/))) return +m[1] / 60;
        return 0;
    }

    function fmt(h) {
        if (h < 0) h = 0;
        const hh = Math.floor(h);
        const mm = Math.floor((h - hh) * 60);
        return `${hh}:${mm.toString().padStart(2, "0")}`;
    }

    function getRealEndTime(todayDone) {
        const remain = (9 - todayDone) * 3600000;
        if (remain <= 0) return "지금, 가방 집기";
        return new Date(Date.now() + remain).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function getRemainDays() {
        const d = new Date().getDay();
        return (d >= 1 && d <= 5) ? 5 - d : 0;
    }

    /* ==========================================================================
       스타일
       ========================================================================== */
    function injectStyles() {
        if (document.getElementById(`${P}-cyber-styles`)) return;
        const style = document.createElement('style');
        style.id = `${P}-cyber-styles`;
        style.textContent = `
#${P}-root, #${P}-root *, #${P}-root *::before, #${P}-root *::after { box-sizing:border-box; }
#${P}-root {
    --void:#05060B; --panel:#0B1020; --panel-hi:#11182A;
    --cyan:#35F2FF; --lime:#DFFF00; --magenta:#FF3CAC;
    --coral:#FF4D5A; --text:#F8FAFC; --muted:#B9C5D8;
    all:initial; box-sizing:border-box; position:fixed; right:12px; bottom:12px; display:block;
    width: min(392px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
    overflow:hidden; isolation:isolate; color:var(--text); color-scheme:dark;
    background:linear-gradient(155deg,rgba(17,24,42,.98),rgba(5,6,11,.985) 72%);
    border:1px solid rgba(53,242,255,.32); border-radius:14px;
    clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px));
    box-shadow:0 28px 84px rgba(0,0,0,.7),0 0 42px rgba(53,242,255,.14),inset 0 0 28px rgba(255,60,172,.035);
    backdrop-filter:blur(22px) saturate(1.25); -webkit-backdrop-filter:blur(22px) saturate(1.25);
    font-family:"Segoe UI", "Malgun Gothic", sans-serif;
    font-size:13px; line-height:1.5; z-index:2147483647 !important;
    user-select:none; direction:ltr;
}
#${P}-root::before, #${P}-root::after { content:""; position:absolute; inset:0; pointer-events:none; z-index:0; }
#${P}-root::before { background:repeating-linear-gradient(180deg,rgba(53,242,255,.045) 0,rgba(53,242,255,.045) 1px,transparent 1px,transparent 5px); opacity:.72; animation:${P}-scan-drift 6s linear infinite; }
#${P}-root::after { top:38%; left:-10%; right:-10%; bottom:-22%; transform-origin:center bottom; background:linear-gradient(rgba(53,242,255,.075) 1px,transparent 1px),linear-gradient(90deg,rgba(255,60,172,.07) 1px,transparent 1px); background-size:28px 20px; transform:perspective(180px) rotateX(54deg) scale(1.18); mask-image:linear-gradient(to bottom,transparent,black 30%); opacity:.48; animation:${P}-grid-drift 10s ease-in-out infinite; }
@keyframes ${P}-scan-drift { to { transform:translateY(8px); } }
@keyframes ${P}-grid-drift { 50% { transform:perspective(180px) rotateX(54deg) translate3d(0,6px,0) scale(1.2); } }
@keyframes ${P}-signal-glitch { 0%,92%,100%{transform:none;filter:none} 94%{transform:translateX(1px);filter:drop-shadow(2px 0 #FF3CAC)} 96%{transform:translateX(-1px);filter:drop-shadow(-2px 0 #35F2FF)} }
@keyframes ${P}-live-pulse { 50% { opacity:.45; box-shadow:0 0 20px #35F2FF; } }
@keyframes ${P}-ring-pulse { 50% { filter:drop-shadow(0 0 12px rgba(53,242,255,.75)); } }
@keyframes ${P}-tab-sweep { from { transform:translateX(-115%); } to { transform:translateX(115%); } }
@keyframes ${P}-panel-in { from { opacity:0; transform:translateX(8px); } to { opacity:1; transform:none; } }
@keyframes ${P}-card-boot { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:none; } }
@keyframes ${P}-alert-flash { 30% { box-shadow:inset 3px 0 #FF4D5A,0 0 16px rgba(255,77,90,.45); } }
@keyframes ${P}-shimmer { 50% { transform:scaleX(1.35); opacity:.35; } }
#${P}-root button, #${P}-root input { font:inherit; }
#${P}-root button { min-width:44px; min-height:44px; }
#${P}-root :focus-visible { outline:3px solid var(--cyan); outline-offset:2px; box-shadow:0 0 0 5px var(--void),0 0 24px rgba(53,242,255,.72); }
#${P}-root [hidden] { display:none !important; }
#${P}-root svg { width:18px; height:18px; display:block; }
#${P}-root .${P}-hd { position:relative; z-index:2; display:flex; align-items:center; justify-content:space-between; min-height:62px; padding:8px 10px 8px 14px; cursor:move; border-bottom:1px solid rgba(53,242,255,.22); background:linear-gradient(90deg,rgba(53,242,255,.075),rgba(255,60,172,.025)); }
#${P}-root .${P}-hd::before { content:""; position:absolute; top:0; left:0; width:68%; height:2px; background:linear-gradient(90deg,var(--cyan),transparent); box-shadow:0 0 14px var(--cyan); }
#${P}-root .${P}-hd::after { content:""; position:absolute; right:0; bottom:-1px; width:54px; height:3px; background:var(--magenta); box-shadow:0 0 16px rgba(255,60,172,.8); clip-path:polygon(12px 0,100% 0,100% 100%,0 100%); }
#${P}-root .${P}-brand { display:flex; align-items:center; gap:10px; min-width:0; pointer-events:none; }
#${P}-root .${P}-brand-mark { width:34px; height:34px; display:grid; place-items:center; color:var(--void); background:linear-gradient(135deg,var(--lime),var(--cyan) 62%,var(--magenta)); border:1px solid var(--cyan); border-radius:3px; clip-path:polygon(0 0,25px 0,100% 9px,100% 100%,9px 100%,0 25px); box-shadow:0 0 22px rgba(53,242,255,.42); }
#${P}-root .${P}-brand-mark svg { width:17px; height:17px; }
#${P}-root .${P}-eyebrow { position:relative; display:block; color:var(--cyan); font-size:9px; font-weight:900; letter-spacing:1.25px; text-transform:uppercase; }
#${P}-root .${P}-brand-copy .${P}-eyebrow::after { content:attr(data-text); position:absolute; inset:0; color:var(--magenta); opacity:.34; pointer-events:none; animation:${P}-signal-glitch 7s steps(1,end) infinite; }
#${P}-root .${P}-title { display:block; color:var(--text); font-size:14px; font-weight:900; letter-spacing:.3px; text-shadow:0 0 14px rgba(53,242,255,.24); }
#${P}-root .${P}-controls { position:relative; z-index:3; display:flex; gap:4px; }
#${P}-root .${P}-icon-btn { all:unset; min-width:44px; min-height:44px; display:grid; place-items:center; cursor:pointer; border:1px solid transparent; border-radius:3px; clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px)); color:var(--muted); transition:transform 180ms ease,background 180ms ease,color 180ms ease,border-color 180ms ease; }
#${P}-root .${P}-icon-btn:hover { color:var(--void); border-color:var(--cyan); background:var(--cyan); transform:translateY(-1px); }
#${P}-root .${P}-mini { display:none; align-items:center; gap:10px; min-width:0; }
#${P}-root .${P}-mini strong { color:var(--lime); font-size:15px; font-variant-numeric:tabular-nums; }
#${P}-root .${P}-mini span { color:var(--muted); font-size:11px; white-space:nowrap; }
#${P}-root.${P}-min { width:min(310px,calc(100vw - 24px)); }
#${P}-root.${P}-min #${P}-body, #${P}-root.${P}-min .${P}-brand-copy { display:none; }
#${P}-root.${P}-min .${P}-mini { display:flex; }
#${P}-body { position:relative; z-index:1; display:block; padding:0; max-height:calc(100vh - 88px); overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; scrollbar-color:rgba(53,242,255,.34) transparent; }
#${P}-body::after { content:""; position:absolute; right:0; bottom:0; width:72px; height:3px; background:linear-gradient(90deg,transparent,var(--magenta)); pointer-events:none; }
#${P}-root .${P}-hero { display:grid; grid-template-columns:104px 1fr; gap:14px; align-items:center; padding:16px 16px 12px; }
#${P}-root .${P}-ring { --daily-progress:0deg; width:96px; aspect-ratio:1; position:relative; display:grid; place-items:center; border-radius:50%; background:conic-gradient(var(--lime) 0deg,var(--cyan) var(--daily-progress),rgba(185,197,216,.1) var(--daily-progress)); box-shadow:0 0 34px rgba(53,242,255,.16); animation:${P}-ring-pulse 2.4s ease-in-out infinite; }
#${P}-root .${P}-ring::before { content:""; position:absolute; inset:-5px; border:1px dashed rgba(223,255,0,.42); border-radius:50%; }
#${P}-root .${P}-ring::after { content:""; position:absolute; inset:8px; border-radius:50%; background:radial-gradient(circle at 50% 36%,#162039,var(--void) 76%); box-shadow:inset 0 0 0 1px rgba(53,242,255,.16); }
#${P}-root .${P}-ring-copy { position:relative; z-index:1; text-align:center; }
#${P}-root .${P}-ring-copy strong { display:block; color:var(--text); font-size:22px; line-height:1.05; font-weight:950; letter-spacing:-1px; font-variant-numeric:tabular-nums; }
#${P}-root .${P}-ring-mode { display:block; margin-top:3px; color:var(--cyan); font-size:8px; font-weight:900; letter-spacing:1px; }
#${P}-root .${P}-hero-info { min-width:0; }
#${P}-root .${P}-hero-kicker { display:flex; align-items:center; gap:7px; color:var(--cyan); font-size:9px; font-weight:900; letter-spacing:.75px; }
#${P}-root .${P}-hero-kicker::before { content:""; flex:0 0 auto; width:6px; height:6px; border-radius:50%; background:var(--cyan); box-shadow:0 0 12px var(--cyan); animation:${P}-live-pulse 1.2s ease-in-out infinite; }
#${P}-root .${P}-telemetry { margin-left:auto; color:var(--magenta); font-size:8px; letter-spacing:.55px; white-space:nowrap; }
#${P}-root .${P}-hero-head { display:flex; align-items:flex-end; justify-content:space-between; gap:8px; margin-top:5px; }
#${P}-root .${P}-hero-head strong { color:var(--text); font-size:25px; line-height:1.1; font-weight:950; letter-spacing:-1px; font-variant-numeric:tabular-nums; }
#${P}-root .${P}-hero-head span { color:var(--muted); font-size:11px; padding-bottom:2px; }
#${P}-root .${P}-hero-meta { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:10px; }
#${P}-root .${P}-hero-meta div { min-width:0; padding:7px 9px; border:1px solid rgba(53,242,255,.16); border-radius:3px; background:rgba(17,24,42,.76); clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%); }
#${P}-root .${P}-hero-meta span { display:block; color:var(--muted); font-size:9px; }
#${P}-root .${P}-hero-meta strong { display:block; margin-top:1px; color:var(--text); font-size:12px; font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#${P}-root .${P}-status { position:relative; margin:0 16px 12px; padding:9px 11px 9px 82px; border:1px solid rgba(53,242,255,.18); border-left:3px solid var(--magenta); border-radius:3px; color:#DDE8F7; background:linear-gradient(90deg,rgba(255,60,172,.11),rgba(53,242,255,.04)); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#${P}-root .${P}-status::before { content:"SYSTEM //"; position:absolute; left:10px; color:var(--lime); font-size:9px; font-weight:950; letter-spacing:.8px; animation:${P}-signal-glitch 7s steps(1,end) infinite reverse; }
#${P}-root .${P}-tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin:0 12px; padding:5px; border:1px solid rgba(53,242,255,.16); border-radius:4px; background:rgba(5,6,11,.78); clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 100%); }
#${P}-root .${P}-tab { all:unset; position:relative; min-height:44px; overflow:hidden; display:flex; align-items:center; justify-content:center; gap:7px; border:1px solid transparent; border-radius:2px; cursor:pointer; color:var(--muted); font-size:12px; font-weight:850; transition:transform 180ms ease,background 180ms ease,color 180ms ease,border-color 180ms ease; }
#${P}-root .${P}-tab > * { position:relative; z-index:1; }
#${P}-root .${P}-tab:hover { color:var(--cyan); border-color:rgba(53,242,255,.24); background:rgba(53,242,255,.055); }
#${P}-root .${P}-tab[aria-selected="true"] { color:var(--void); border-color:var(--lime); background:var(--lime); box-shadow:0 0 18px rgba(223,255,0,.2); }
#${P}-root .${P}-tab[aria-selected="true"]::after { content:""; position:absolute; inset:0; background:linear-gradient(100deg,transparent 28%,rgba(255,255,255,.65),transparent 72%); animation:${P}-tab-sweep 240ms ease-out both; }
#${P}-root .${P}-panel { padding:12px; animation:${P}-panel-in 220ms ease-out; }
#${P}-root .${P}-bento { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
#${P}-root .${P}-card, #${P}-root .${P}-chat-card { min-width:0; padding:13px; border:1px solid rgba(53,242,255,.17); border-radius:4px; background:linear-gradient(145deg,rgba(17,24,42,.94),rgba(11,16,32,.82)); clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px)); box-shadow:inset 2px 0 rgba(255,60,172,.16),inset 0 1px rgba(53,242,255,.08); }
#${P}-root:not(.${P}-ready) .${P}-card { animation:${P}-card-boot 360ms ease-out both; }
#${P}-root:not(.${P}-ready) .${P}-card:nth-child(2) { animation-delay:35ms; }
#${P}-root:not(.${P}-ready) .${P}-card:nth-child(3) { animation-delay:70ms; }
#${P}-root:not(.${P}-ready) .${P}-card:nth-child(4) { animation-delay:105ms; }
#${P}-root .${P}-card-wide { grid-column:1/-1; }
#${P}-root .${P}-card-label { display:flex; align-items:center; justify-content:space-between; gap:6px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.35px; }
#${P}-root .${P}-value { display:block; margin-top:7px; color:var(--text); font-size:19px; font-weight:950; letter-spacing:-.5px; font-variant-numeric:tabular-nums; }
#${P}-root .${P}-sub { display:block; margin-top:3px; color:var(--muted); font-size:10px; }
#${P}-root .${P}-bar { height:7px; margin-top:9px; overflow:hidden; border-radius:1px; background:rgba(185,197,216,.1); }
#${P}-root .${P}-bar > i { display:block; height:100%; background:linear-gradient(90deg,var(--cyan),var(--lime)); transform-origin:left; box-shadow:0 0 12px rgba(53,242,255,.45); }
#${P}-root .${P}-bar-amber > i { background:linear-gradient(90deg,var(--magenta),var(--lime)); }
#${P}-root .${P}-bar-coral > i { background:linear-gradient(90deg,var(--coral),var(--magenta)); }
#${P}-root .${P}-badge { display:inline-flex; align-items:center; min-height:23px; padding:2px 8px; border-radius:99px; color:var(--lime); background:rgba(223,255,0,.08); border:1px solid rgba(223,255,0,.26); font-size:9px; font-weight:900; }
#${P}-root .${P}-fortune-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
#${P}-root .${P}-fortune-title { display:block; color:var(--magenta); font-size:14px; font-weight:900; }
#${P}-root .${P}-fortune-score { color:var(--lime); font-size:34px; line-height:1; font-weight:950; letter-spacing:-1px; font-variant-numeric:tabular-nums; text-shadow:0 0 18px rgba(223,255,0,.24); }
#${P}-root .${P}-fortune-body { margin:12px 0 0; color:var(--text); font-size:13px; line-height:1.75; }
#${P}-root .${P}-fortune-advice { margin-top:12px; padding:10px 11px; border-left:2px solid var(--cyan); border-radius:2px; color:#DDE8F7; background:rgba(53,242,255,.06); font-size:11px; line-height:1.65; }
#${P}-root .${P}-ft-hist { margin-top:16px; }
#${P}-root .${P}-ft-hist-title { color:var(--muted); font-size:10px; font-weight:900; letter-spacing:.4px; }
#${P}-root .${P}-ft-chart { display:flex; align-items:flex-end; gap:4px; height:76px; margin-top:8px; }
#${P}-root .${P}-ft-bar-wrap { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:3px; }
#${P}-root .${P}-ft-bar-col { width:100%; min-height:3px; border-radius:1px; }
#${P}-root .${P}-ft-bar-lbl, #${P}-root .${P}-ft-bar-score { width:100%; overflow:hidden; color:var(--muted); font-size:8px; text-align:center; text-overflow:ellipsis; white-space:nowrap; font-variant-numeric:tabular-nums; }
#${P}-root .${P}-ft-bar-today .${P}-ft-bar-lbl, #${P}-root .${P}-ft-bar-today .${P}-ft-bar-score { color:var(--lime); font-weight:900; }
#${P}-root .${P}-skeleton { position:relative; min-height:220px; display:grid; place-items:center; color:var(--muted); text-align:center; }
#${P}-root .${P}-skeleton::before { content:""; position:absolute; top:78px; width:110px; height:8px; border-radius:1px; background:linear-gradient(90deg,rgba(53,242,255,.05),rgba(53,242,255,.34),rgba(255,60,172,.08)); animation:${P}-shimmer 1.2s ease-in-out infinite; }
#${P}-root .${P}-chat-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
#${P}-root .${P}-chat-top strong { display:block; color:var(--text); font-size:13px; }
#${P}-root .${P}-chat-top span { display:block; margin-top:2px; color:var(--muted); font-size:10px; }
#${P}-root .${P}-online { color:var(--cyan); font-size:9px; font-weight:900; letter-spacing:.5px; }
#${P}-root .${P}-cht { height:178px; overflow-y:auto; padding:10px; border:1px solid rgba(53,242,255,.16); border-radius:2px; background:rgba(5,6,11,.7); user-select:text; scrollbar-width:thin; scrollbar-color:rgba(53,242,255,.3) transparent; }
#${P}-root .${P}-chat-msg { display:grid; grid-template-columns:auto 1fr auto; gap:6px; align-items:baseline; margin-bottom:8px; font-size:11px; }
#${P}-root .${P}-chat-name { color:var(--muted); font-weight:900; }
#${P}-root .${P}-chat-msg-me .${P}-chat-name { color:var(--magenta); }
#${P}-root .${P}-chat-text { min-width:0; color:var(--text); word-break:break-word; }
#${P}-root .${P}-chat-time { color:#7887A2; font-size:8px; }
#${P}-root .${P}-chat-state { min-height:154px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; padding:18px; color:var(--muted); text-align:center; }
#${P}-root .${P}-chat-state small { color:#7887A2; }
#${P}-root .${P}-chat-state-error, #${P}-root .${P}-live-error { color:var(--coral); animation:${P}-alert-flash 520ms ease-out 1; }
#${P}-root .${P}-retry { border:1px solid rgba(53,242,255,.34); border-radius:2px; color:var(--cyan); background:rgba(53,242,255,.07); cursor:pointer; }
#${P}-root .${P}-field-head { display:flex; justify-content:space-between; align-items:center; margin-top:11px; }
#${P}-root .${P}-field-head label { color:#DDE8F7; font-size:10px; font-weight:850; }
#${P}-root .${P}-count { color:var(--muted); font-size:9px; font-variant-numeric:tabular-nums; }
#${P}-root .${P}-compose { display:grid; grid-template-columns:1fr auto; gap:7px; margin-top:5px; }
#${P}-root .${P}-input { min-width:0; min-height:44px; padding:0 12px; border:1px solid rgba(53,242,255,.22); border-radius:2px; outline:0; color:var(--text); background:rgba(5,6,11,.82); }
#${P}-root .${P}-input::placeholder { color:#7887A2; }
#${P}-root .${P}-send { min-width:76px; padding:0 13px; border:1px solid var(--lime); border-radius:2px; color:var(--void); background:var(--lime); box-shadow:0 0 18px rgba(223,255,0,.18); cursor:pointer; font-weight:900; transition:transform 180ms ease,opacity 180ms ease,box-shadow 180ms ease; }
#${P}-root .${P}-send:hover { transform:translateY(-1px); box-shadow:0 0 24px rgba(223,255,0,.34); }
#${P}-root .${P}-send:disabled { opacity:.52; cursor:wait; transform:none; }
#${P}-root .${P}-live { min-height:17px; margin-top:5px; color:var(--muted); font-size:9px; }
@media (max-width:420px) { #${P}-root .${P}-hero { grid-template-columns:92px 1fr; padding-inline:12px; } #${P}-root .${P}-ring { width:86px; } #${P}-root .${P}-telemetry { display:none; } }
@media (prefers-reduced-motion: reduce) {
    #${P}-root, #${P}-root::before, #${P}-root::after, #${P}-root *, #${P}-root *::before, #${P}-root *::after {
        animation:none !important; transition-duration:.01ms !important; scroll-behavior:auto !important;
    }
}`;
        document.head.appendChild(style);
    }

    function icon(name) {
        const paths = {
            bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
            minus: '<path d="M5 12h14"/>',
            close: '<path d="m6 6 12 12M18 6 6 18"/>',
            clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
            spark: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
            chat: '<path d="M4 5h16v11H8l-4 4V5Z"/>'
        };
        return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.bolt}</svg>`;
    }

    function buildCyberHTML() {
        return `
        <div class="${P}-hd" id="${P}-drag">
            <div class="${P}-brand">
                <span class="${P}-brand-mark">${icon('bolt')}</span>
                <span class="${P}-brand-copy"><span class="${P}-eyebrow" data-text="第07労働管制 // NEO TOKYO">第07労働管制 // NEO TOKYO</span><span class="${P}-title">GPUN // CYBER OPS</span></span>
                <span class="${P}-mini"><strong id="${P}-mini-worked">0:00</strong><span id="${P}-mini-remain">9:00 남음</span></span>
            </div>
            <div class="${P}-controls">
                <button class="${P}-icon-btn" id="${P}-btn-min" type="button" aria-label="위젯 최소화" aria-expanded="true">${icon('minus')}</button>
                <button class="${P}-icon-btn" id="${P}-btn-close" type="button" aria-label="위젯 닫기">${icon('close')}</button>
            </div>
        </div>
        <div id="${P}-body">
            <section class="${P}-hero" id="${P}-hero" aria-label="오늘 근무 요약">
                <div class="${P}-ring" id="${P}-daily-ring"><div class="${P}-ring-copy"><strong id="${P}-ring-value">0:00</strong><span class="${P}-ring-mode">WORK SYNC</span></div></div>
                <div class="${P}-hero-info"><div class="${P}-hero-kicker"><span>SHIFT LINK // ACTIVE</span><span class="${P}-telemetry">NEO TOKYO / 2077</span></div><div class="${P}-hero-head"><strong id="${P}-remain-value">9:00 남음</strong><span>/ 9:00</span></div><div class="${P}-hero-meta"><div><span>예상 퇴근</span><strong id="${P}-end-value">계산 중</strong></div><div><span>오늘 상태</span><strong id="${P}-done-value">예열 중</strong></div></div></div>
            </section>
            <div class="${P}-status" id="${P}-status-line">업무 엔진과 협상 중입니다.</div>
            <div class="${P}-tabs" role="tablist" aria-label="GPUN Timer 메뉴">
                <button class="${P}-tab" id="${P}-tab-work" type="button" role="tab" aria-selected="true" aria-controls="${P}-panel-work" data-tab="work">${icon('clock')}<span>근무</span></button>
                <button class="${P}-tab" id="${P}-tab-fortune" type="button" role="tab" aria-selected="false" aria-controls="${P}-panel-fortune" data-tab="fortune" tabindex="-1">${icon('spark')}<span>운세</span></button>
                <button class="${P}-tab" id="${P}-tab-chat" type="button" role="tab" aria-selected="false" aria-controls="${P}-panel-chat" data-tab="chat" tabindex="-1">${icon('chat')}<span>채팅</span></button>
            </div>
            <section class="${P}-panel" id="${P}-panel-work" role="tabpanel" aria-labelledby="${P}-tab-work" data-panel="work"><div id="${P}-work-content"></div></section>
            <section class="${P}-panel" id="${P}-panel-fortune" role="tabpanel" aria-labelledby="${P}-tab-fortune" data-panel="fortune" hidden><div id="${P}-fortune-content"></div></section>
            <section class="${P}-panel" id="${P}-panel-chat" role="tabpanel" aria-labelledby="${P}-tab-chat" data-panel="chat" hidden>
                <div class="${P}-chat-card"><div class="${P}-chat-top"><div><strong>익명 라운지 // SECURE CHANNEL</strong><span>신원은 암호화, 드립은 평문으로 전송합니다.</span></div><b class="${P}-online">LINKED</b></div><div class="${P}-cht" id="${P}-chat-display"></div><div class="${P}-field-head"><label for="${P}-chat-input">익명 메시지</label><span class="${P}-count" id="${P}-chat-count">0/27</span></div><div class="${P}-compose"><input type="text" class="${P}-input" id="${P}-chat-input" aria-label="채팅 메시지" maxlength="27" placeholder="${escapeHTML(SYSTEM_COPY.chatPlaceholder)}" autocomplete="off"><button class="${P}-send" id="${P}-chat-send" type="button">보내기</button></div><div class="${P}-live" id="${P}-chat-live" aria-live="polite"></div></div>
            </section>
        </div>`;
    }

    let selectedTab = 'work';

    function selectTab(name, focus = false) {
        selectedTab = name;
        document.querySelectorAll(`#${P}-root [role="tab"]`).forEach((tab) => {
            const active = tab.dataset.tab === name;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            if (active && focus) tab.focus();
        });
        document.querySelectorAll(`#${P}-root [role="tabpanel"]`).forEach((panel) => {
            panel.hidden = panel.dataset.panel !== name;
        });
    }

    function initTabs() {
        const tabs = [...document.querySelectorAll(`#${P}-root [role="tab"]`)];
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => selectTab(tab.dataset.tab));
            tab.addEventListener('keydown', (event) => {
                const target = event.key === 'Home' ? 0
                    : event.key === 'End' ? tabs.length - 1
                    : event.key === 'ArrowRight' ? (index + 1) % tabs.length
                    : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
                    : -1;
                if (target >= 0) {
                    event.preventDefault();
                    selectTab(tabs[target].dataset.tab, true);
                }
            });
        });
    }

    /* ==========================================================================
       드래그
       ========================================================================== */
    function initDrag(box) {
        const handle = document.getElementById(`${P}-drag`);
        if (!handle) return;
        handle.addEventListener("mousedown", (e) => {
            if (e.target.closest(`.${P}-icon-btn`)) return;
            isDragging = true;
            const r = box.getBoundingClientRect();
            dragOffsetX = e.clientX - r.left;
            dragOffsetY = e.clientY - r.top;
            e.preventDefault();
        });
        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            box.style.left = Math.max(0, e.clientX - dragOffsetX) + "px";
            box.style.top = Math.max(0, e.clientY - dragOffsetY) + "px";
            box.style.right = "auto";
            box.style.bottom = "auto";
        });
        document.addEventListener("mouseup", () => { isDragging = false; });
    }

    /* ==========================================================================
       운세 히스토리 그래프 빌더
       ========================================================================== */
    function buildFortuneHistChart(history, todayScore) {
        const all = [...(history || []), { date: 'today', score: todayScore }].slice(-10);
        if (all.length < 1) return '';

        const MAX_BAR_H = 44;

        function scoreColor(s) {
            if (s >= 75) return '#DFFF00';       // 길/대길 — 라임
            if (s >= 55) return '#35F2FF';       // 평      — 시안
            if (s >= 35) return '#FF3CAC';       // 흉      — 마젠타
            return '#FF4D5A';                    // 대흉    — 코랄
        }

        const chartItems = all.map(item => {
            const score = Math.max(0, Math.min(100, Number(item.score) || 0));
            const barH = Math.max(4, Math.round((score / 100) * MAX_BAR_H));
            const color = scoreColor(score);
            const isToday = item.date === 'today';
            const label = isToday ? '오늘' : String(item.date || '').slice(5).replace('-', '/');
            const todayCls = isToday ? ` ${P}-ft-bar-today` : '';
            const opacity = isToday ? '1' : '0.5';
            return `
            <div class="${P}-ft-bar-wrap${todayCls}">
                <span class="${P}-ft-bar-score">${score}</span>
                <div class="${P}-ft-bar-col"
                     style="height:${barH}px;background:${color};opacity:${opacity};"></div>
                <span class="${P}-ft-bar-lbl">${escapeHTML(label)}</span>
            </div>`;
        }).join('');

        return `
        <div class="${P}-ft-hist">
            <div class="${P}-ft-hist-title">최근 10일 운세 로그</div>
            <div class="${P}-ft-chart">${chartItems}</div>
        </div>`;
    }

    function renderDashboard(model) {
        const ring = document.getElementById(`${P}-daily-ring`);
        const workContent = document.getElementById(`${P}-work-content`);
        const fortuneContent = document.getElementById(`${P}-fortune-content`);
        if (!ring || !workContent || !fortuneContent) return;

        ring.style.setProperty('--daily-progress', `${model.dailyPct * 3.6}deg`);
        document.getElementById(`${P}-ring-value`).textContent = fmt(model.todayDone);
        document.getElementById(`${P}-remain-value`).textContent = model.isDone ? '퇴근 가능' : `${fmt(model.remaining)} 남음`;
        document.getElementById(`${P}-end-value`).textContent = model.endTime;
        document.getElementById(`${P}-done-value`).textContent = model.isDone ? '납품 완료' : `${Math.round(model.dailyPct)}% 진행`;
        document.getElementById(`${P}-status-line`).textContent = model.statusMsg;
        document.getElementById(`${P}-mini-worked`).textContent = fmt(model.todayDone);
        document.getElementById(`${P}-mini-remain`).textContent = model.isDone ? '퇴근 가능' : `${fmt(model.remaining)} 남음`;

        const mealValue = model.isMealOk ? '식대 해금' : model.isDone ? `${fmt(DAILY_GOAL + MEAL_QUALIFY_HOURS - model.todayDone)} 남음` : '9시간 후 등장';
        const mealCopy = model.isMealOk ? SYSTEM_COPY.mealUnlocked : model.isDone ? '조금만 더 버티면 회사 카드가 말랑해집니다.' : '정시 퇴근이 우선, 식대는 숨은 보너스입니다.';
        workContent.innerHTML = `
            <div class="${P}-bento">
                <article class="${P}-card ${P}-card-wide">
                    <div class="${P}-card-label"><span>주간 누적</span><span class="${P}-badge">목표 53h</span></div>
                    <strong class="${P}-value">${fmt(model.realWeekly)} <small>/ 53:00</small></strong>
                    <div class="${P}-bar"><i style="width:${model.weeklyPct}%"></i></div>
                    <span class="${P}-sub">이번 주도 캘린더와 정면 승부 중입니다.</span>
                </article>
                <article class="${P}-card">
                    <div class="${P}-card-label"><span>OT 달성</span><span>${Math.round(model.extraPct)}%</span></div>
                    <strong class="${P}-value">${fmt(model.extraDone)}</strong>
                    <div class="${P}-bar ${P}-bar-amber"><i style="width:${model.extraPct}%"></i></div>
                    <span class="${P}-sub">하루 평균 ${model.avgExtra <= 0 ? '0:00' : fmt(model.avgExtra)} 추가</span>
                </article>
                <article class="${P}-card">
                    <div class="${P}-card-label"><span>야근 식대</span><span>${Math.round(model.mealPct)}%</span></div>
                    <strong class="${P}-value">${mealValue}</strong>
                    <div class="${P}-bar ${model.isMealOk ? '' : `${P}-bar-coral`}"><i style="width:${model.mealPct}%"></i></div>
                    <span class="${P}-sub">${escapeHTML(mealCopy)}</span>
                </article>
                <article class="${P}-card ${P}-card-wide">
                    <div class="${P}-card-label"><span>오늘의 작전 메모</span><span>${model.isDone ? 'COMPLETE' : 'IN PROGRESS'}</span></div>
                    <strong class="${P}-value">${model.isDone ? '사람 모드 복귀 승인' : '새 일보다 닫을 일을 사랑할 시간'}</strong>
                    <span class="${P}-sub">${escapeHTML(model.statusMsg)}</span>
                </article>
            </div>`;

        const fortune = cachedFortune;
        if (!fortune) {
            fortuneContent.innerHTML = `<div class="${P}-card ${P}-skeleton"><span>${escapeHTML(SYSTEM_COPY.fortuneLoading)}</span></div>`;
        } else {
            const score = Math.max(0, Math.min(100, Number(fortune.score) || 0));
            fortuneContent.innerHTML = `
                <article class="${P}-card">
                    <div class="${P}-fortune-head"><div><span class="${P}-eyebrow">TODAY'S SIGNAL</span><strong class="${P}-fortune-title">${escapeHTML(fortune.title)}</strong></div><strong class="${P}-fortune-score">${score}점</strong></div>
                    <div class="${P}-bar ${P}-bar-amber"><i style="width:${score}%"></i></div>
                    <p class="${P}-fortune-body">${escapeHTML(fortune.body)}</p>
                    <div class="${P}-fortune-advice"><strong>오늘의 생존 팁</strong><br>${escapeHTML(fortune.advice)}</div>
                    ${buildFortuneHistChart(fortune.history, score)}
                </article>`;
        }

        const input = document.getElementById(`${P}-chat-input`);
        if (input) input.placeholder = SYSTEM_COPY.chatPlaceholder;
    }

    /* ==========================================================================
       메인 실행
       ========================================================================== */
    function run() {
        if (!location.href.includes("time-tracking")) {
            const box = document.getElementById(`${P}-root`);
            if (box) box.style.display = "none";
            return;
        }

        try {
            checkFixedTimeAlarms();

            const todayTag = document.querySelector('time[datetime*="T"]');
            const todayDone = parseHM(todayTag?.textContent?.trim() || "0분");

            check9HourAlarms(todayDone);
            checkMealQualify(todayDone);

            const pastTag = document.querySelector('span.c-lmXAkT');
            const pastWeekly = parseHM(pastTag?.textContent?.trim() || "0:00");
            const weekday = new Date().getDay();
            const workedDaysPast = (weekday >= 1 && weekday <= 5) ? weekday - 1 : 0;
            const extraPast = Math.max(0, pastWeekly - workedDaysPast * 9);
            const extraToday = Math.max(0, todayDone - 9);
            const extraDone = extraPast + extraToday;
            const extraPct = Math.min(100, (extraDone / EXTRA_HOURS) * 100);
            const remainDays = getRemainDays();
            const avgExtra = remainDays > 0 ? Math.max(0, EXTRA_HOURS - extraDone) / remainDays : 0;
            const realWeekly = pastWeekly + todayDone;
            const weeklyPct = Math.min(100, (realWeekly / WEEKLY_GOAL) * 100);

            const dailyPct = Math.min(100, (todayDone / 9) * 100);
            const mealPct = todayDone >= 9 ? Math.min(100, ((todayDone - 9) / MEAL_QUALIFY_HOURS) * 100) : 0;
            const endTime = getRealEndTime(todayDone);
            const statusMsg = getStatusMent(todayDone);

            let box = document.getElementById(`${P}-root`);

            if (!box) {
                injectStyles();
                box = document.createElement("div");
                box.id = `${P}-root`;
                box.innerHTML = buildCyberHTML();
                document.body.appendChild(box);

                document.getElementById(`${P}-btn-close`).addEventListener("click", () => { box.style.display = "none"; });
                document.getElementById(`${P}-btn-min`).addEventListener("click", (event) => {
                    const minimized = box.classList.toggle(`${P}-min`);
                    event.currentTarget.setAttribute('aria-expanded', String(!minimized));
                    event.currentTarget.setAttribute('aria-label', minimized ? '위젯 펼치기' : '위젯 최소화');
                });

                const inp = document.getElementById(`${P}-chat-input`);
                const btn = document.getElementById(`${P}-chat-send`);
                const live = document.getElementById(`${P}-chat-live`);
                const counter = document.getElementById(`${P}-chat-count`);
                const updateCount = () => { counter.textContent = `${inp.value.length}/27`; };
                const doSend = async () => {
                    const original = inp.value.trim();
                    if (!original || btn.disabled) return;
                    btn.disabled = true;
                    btn.textContent = SYSTEM_COPY.chatSending;
                    const sent = await sendChat(original);
                    if (sent) {
                        inp.value = '';
                        live.textContent = SYSTEM_COPY.chatSent;
                    } else {
                        inp.value = original;
                        live.textContent = SYSTEM_COPY.chatError;
                    }
                    live.classList.toggle(`${P}-live-error`, !sent);
                    updateCount();
                    btn.disabled = false;
                    btn.textContent = '보내기';
                };
                btn.addEventListener('click', doSend);
                inp.addEventListener('input', updateCount);
                inp.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        doSend();
                    }
                });

                initTabs();
                initDrag(box);
                setChatState('loading');
                fetchChat();
                setTimeout(() => box.classList.add(`${P}-ready`), 520);
            } else {
                box.style.display = "";
            }

            renderDashboard({
                todayDone,
                dailyPct,
                remaining: Math.max(0, DAILY_GOAL - todayDone),
                endTime,
                isDone: todayDone >= DAILY_GOAL,
                statusMsg,
                realWeekly,
                weeklyPct,
                extraDone,
                extraPct,
                avgExtra,
                mealPct,
                isMealOk: todayDone >= DAILY_GOAL + MEAL_QUALIFY_HOURS
            });
            return;

        } catch (_) {}
    }

    /* ==========================================================================
       실행 루프
       ========================================================================== */
    setInterval(() => {
        const today = new Date().toDateString();
        if (lastResetDate !== today) {
            lastResetDate = today;
            triggeredFixed.clear();
            triggered9Hour10Min = false;
            triggered9HourDone = false;
            triggeredMeal = false;
        }
        run();
    }, 2000);

    setInterval(fetchChat, 3000);

    if (Notification.permission === "default") {
        setTimeout(() => Notification.requestPermission(), 4000);
    }

    const { messagesReady, fortunesReady } = initializeExternalData();
    messagesReady.catch(() => {});
    fortunesReady.then(() => loadFortune()).catch(() => loadFortune());
    setTimeout(run, 1500);
})();
