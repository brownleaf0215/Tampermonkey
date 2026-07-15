// ==UserScript==
// @name         Flex 근무시간 체크 - 밥자격 + 실제 퇴근시간 완벽판
// @version      8.3.0
// @description  2026 MZ 글래스모피즘 UI + 랜덤 뻘글 + 익명 채팅 + 오늘의 운세 100종 + 운세 히스토리 그래프
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
    const FALLBACK_MESSAGES = {
        alarms: {},
        status: {
            level1: ['오늘도 천천히 시작해보세요.'],
            level2: ['오후도 무리하지 말고 진행하세요.'],
            level3: ['조금만 더 버티면 퇴근이 가까워집니다.'],
            level4: ['퇴근까지 얼마 남지 않았습니다.'],
            level5: ['오늘 근무를 완료했습니다.']
        }
    };
    const FALLBACK_FORTUNES = [{
        score: 70,
        title: '평 ★★★☆☆',
        body: '무난하고 안정적인 하루입니다.',
        advice: '평소의 리듬을 유지하세요.'
    }];

    let ALARM_MENT = FALLBACK_MESSAGES.alarms;
    let STATUS_MENT = FALLBACK_MESSAGES.status;
    let FORTUNE_DATA = FALLBACK_FORTUNES;

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function validateMessages(value) {
        if (!value || typeof value !== 'object' || !value.alarms || !value.status) return false;
        const alarmsValid = Object.entries(value.alarms).every(([time, alarm]) =>
            /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) &&
            alarm && isNonEmptyString(alarm.title) &&
            Array.isArray(alarm.bodies) && alarm.bodies.length > 0 &&
            alarm.bodies.every(isNonEmptyString)
        );
        const statusValid = ['level1', 'level2', 'level3', 'level4', 'level5'].every((level) =>
            Array.isArray(value.status[level]) && value.status[level].length > 0 &&
            value.status[level].every(isNonEmptyString)
        );
        return alarmsValid && statusValid;
    }

    function validateFortunes(value) {
        return Array.isArray(value) && value.length === 100 && value.every((item) =>
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
        const messagesReady = messages.refreshed.then((value) => {
            ALARM_MENT = value.alarms;
            STATUS_MENT = value.status;
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
    async function fetchChat() {
        if (isFetching || !document.getElementById(`${P}-root`)) return;
        isFetching = true;
        try {
            const response = await firebaseRequest('GET', FIREBASE_URL);
            if (!response.ok) return;
            const data = response.data;
            const chatBox = document.getElementById(`${P}-chat-display`);
            if (!chatBox) return;
            if (data !== null) {
                renderChat(data);
                pruneChat(data);
            } else {
                chatBox.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding-top:30px;font-size:12px;">💬 첫 메시지를 남겨보세요!</div>`;
            }
        } catch (_) {}
        finally { isFetching = false; }
    }

    async function sendChat(message) {
        message = message.trim().substring(0, 27);
        if (!message) return;
        const payload = {
            name: NICKNAME,
            msg: message,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };
        try {
            const r = await firebaseRequest('POST', FIREBASE_URL, payload);
            if (r.ok) fetchChat();
        } catch (_) {}
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
            html += `<div style="margin-bottom:6px;word-break:break-all;line-height:1.5;font-size:12px;">
                <span style="color:${isMe ? '#a78bfa' : 'rgba(255,255,255,0.7)'};font-weight:600;">${item.name}</span>
                <span style="color:rgba(255,255,255,0.9);margin-left:4px;">${item.msg}</span>
                <span style="font-size:9px;color:rgba(255,255,255,0.3);margin-left:3px;">${item.time}</span>
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
                icon: "https://win98icons.alexmeub.com/icons/png/msg_warning-0.png",
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
            triggerAlarm("퇴근 10분 전", pick(STATUS_MENT.level4));
        }
        if (m >= 540 && m <= 545 && !triggered9HourDone) {
            triggered9HourDone = true;
            triggerAlarm("★ 퇴근 가능 ★", "지금 나가는 사람이 승리자입니다.");
        }
    }

    function checkMealQualify(todayDone) {
        if (todayDone >= DAILY_GOAL + MEAL_QUALIFY_HOURS && !triggeredMeal) {
            triggeredMeal = true;
            triggerAlarm("야근 식대 해금됨", "고생하셨습니다. 비싼 거 드세요.");
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
        if (remain <= 0) return "지금 바로!";
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
        if (document.getElementById(`${P}-styles`)) return;
        const style = document.createElement("style");
        style.id = `${P}-styles`;
        style.textContent = `
#${P}-root,
#${P}-root *,
#${P}-root *::before,
#${P}-root *::after { box-sizing: border-box; }

#${P}-root {
    all: initial;
    position: fixed; bottom: 20px; right: 20px; width: 360px;
    font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif;
    font-size: 13px; color: #fff; z-index: 2147483647 !important;
    user-select: none; line-height: 1.5; direction: ltr;
    border-radius: 20px;
    background: linear-gradient(145deg, rgba(30,27,75,0.92), rgba(45,40,95,0.95));
    backdrop-filter: blur(28px) saturate(1.5);
    -webkit-backdrop-filter: blur(28px) saturate(1.5);
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset;
    overflow: hidden;
    animation: ${P}-pop 0.35s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes ${P}-pop {
    from { opacity:0; transform: translateY(16px) scale(0.96); }
    to   { opacity:1; transform: translateY(0) scale(1); }
}
#${P}-root.${P}-min #${P}-body { display:none; }
#${P}-root.${P}-min { border-radius:14px; }

#${P}-root .${P}-hd {
    display:flex; justify-content:space-between; align-items:center;
    padding:14px 16px 12px; cursor:move;
    background: linear-gradient(135deg, rgba(139,92,246,0.18), rgba(56,189,248,0.1));
    border-bottom:1px solid rgba(255,255,255,0.06);
}
#${P}-root .${P}-hd-l { display:flex; align-items:center; gap:10px; pointer-events:none; }
#${P}-root .${P}-ico {
    width:26px; height:26px; border-radius:8px;
    background:linear-gradient(135deg,#8b5cf6,#3b82f6);
    display:flex; align-items:center; justify-content:center;
    font-size:13px; flex-shrink:0; box-shadow:0 2px 8px rgba(139,92,246,0.35);
}
#${P}-root .${P}-ttl {
    font-size:14px; font-weight:700; letter-spacing:-0.3px;
    background:linear-gradient(90deg,#c4b5fd,#7dd3fc);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
}
#${P}-root .${P}-bns { display:flex; gap:6px; }
#${P}-root .${P}-cb {
    all:unset; width:28px; height:28px; border-radius:8px; cursor:pointer;
    background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.45);
    font-size:13px; display:flex; align-items:center; justify-content:center; transition:all 0.15s;
}
#${P}-root .${P}-cb:hover { background:rgba(255,255,255,0.14); color:#fff; }

#${P}-body { padding:12px 14px 14px; display:flex; flex-direction:column; gap:10px; }

#${P}-root .${P}-cd {
    background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.07);
    border-radius:14px; padding:14px; transition:background 0.2s;
}
#${P}-root .${P}-cd:hover { background:rgba(255,255,255,0.08); }
#${P}-root .${P}-cl {
    font-size:11px; font-weight:600; text-transform:uppercase;
    letter-spacing:0.6px; color:rgba(255,255,255,0.35); margin-bottom:10px;
    display:flex; align-items:center; gap:6px;
}
#${P}-root .${P}-rw {
    display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;
}
#${P}-root .${P}-lb { font-size:12px; color:rgba(255,255,255,0.5); }
#${P}-root .${P}-vl {
    font-size:20px; font-weight:800; letter-spacing:-0.5px; font-variant-numeric:tabular-nums;
}
#${P}-root .${P}-vs { font-size:14px; font-weight:700; font-variant-numeric:tabular-nums; }
#${P}-root .${P}-dm { font-size:11px; font-weight:400; color:rgba(255,255,255,0.25); }
#${P}-root .${P}-sb { text-align:right; font-size:11px; color:rgba(255,255,255,0.3); margin-top:6px; }
#${P}-root .${P}-sb b { color:rgba(255,255,255,0.65); font-weight:600; }

#${P}-root .${P}-pb {
    height:8px; border-radius:99px; background:rgba(255,255,255,0.07);
    overflow:hidden; margin-top:6px; margin-bottom:2px;
}
#${P}-root .${P}-pb-l { height:14px; }
#${P}-root .${P}-pf { height:100%; border-radius:99px; transition:width 0.8s cubic-bezier(0.4,0,0.2,1); }
#${P}-root .${P}-pf-v  { background:linear-gradient(90deg,#8b5cf6,#a78bfa); box-shadow:0 0 14px rgba(139,92,246,0.35); }
#${P}-root .${P}-pf-t  { background:linear-gradient(90deg,#14b8a6,#06b6d4); box-shadow:0 0 14px rgba(20,184,166,0.35); }
#${P}-root .${P}-pf-a  { background:linear-gradient(90deg,#f59e0b,#fbbf24); box-shadow:0 0 14px rgba(245,158,11,0.35); }
#${P}-root .${P}-pf-r  { background:linear-gradient(90deg,#f43f5e,#fb7185); box-shadow:0 0 14px rgba(244,63,94,0.35); }
#${P}-root .${P}-pf-g  { background:linear-gradient(90deg,#10b981,#34d399); box-shadow:0 0 14px rgba(16,185,129,0.35); }

#${P}-root .${P}-bg {
    display:inline-flex; align-items:center; gap:5px;
    padding:4px 12px; border-radius:99px; font-size:12px; font-weight:700;
}
#${P}-root .${P}-bg-ok {
    background:linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.2));
    border:1px solid rgba(139,92,246,0.3); color:#c4b5fd;
}
#${P}-root .${P}-bg-wt {
    background:rgba(244,63,94,0.12); border:1px solid rgba(244,63,94,0.2); color:#fda4af;
}

#${P}-root .${P}-st {
    padding:10px 14px; border-radius:12px;
    background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);
    font-size:12px; color:rgba(255,255,255,0.5);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    text-align:center; font-weight:500;
}

/* ── Fortune ── */
#${P}-root .${P}-ft-score {
    font-size:28px; font-weight:800; letter-spacing:-1px; font-variant-numeric:tabular-nums;
    background:linear-gradient(90deg,#fbbf24,#f97316);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
}
#${P}-root .${P}-ft-title { font-size:13px; font-weight:700; color:#c4b5fd; }
#${P}-root .${P}-ft-body  { font-size:11px; color:rgba(255,255,255,0.5); line-height:1.7; margin-top:6px; }
#${P}-root .${P}-ft-advice {
    font-size:11px; color:rgba(255,255,255,0.7); line-height:1.6; margin-top:8px;
    padding:7px 10px; border-radius:8px;
    background:rgba(139,92,246,0.1); border-left:2px solid rgba(139,92,246,0.45);
}
#${P}-root .${P}-ft-bar {
    height:6px; border-radius:99px; background:rgba(255,255,255,0.07); overflow:hidden; margin-top:10px;
}
#${P}-root .${P}-ft-bar-fill {
    height:100%; border-radius:99px;
    background:linear-gradient(90deg,#8b5cf6,#f59e0b,#f97316);
    box-shadow:0 0 12px rgba(251,191,36,0.3);
    transition:width 1s cubic-bezier(0.4,0,0.2,1);
}

/* ── Fortune History Chart ── */
#${P}-root .${P}-ft-hist { margin-top:14px; }
#${P}-root .${P}-ft-hist-title {
    font-size:10px; font-weight:600; text-transform:uppercase;
    letter-spacing:0.6px; color:rgba(255,255,255,0.3); margin-bottom:8px;
}
#${P}-root .${P}-ft-chart {
    display:flex; align-items:flex-end; gap:4px;
    height:70px; padding:0 2px;
}
#${P}-root .${P}-ft-bar-wrap {
    flex:1; display:flex; flex-direction:column;
    align-items:center; gap:3px; min-width:0;
}
#${P}-root .${P}-ft-bar-col {
    width:100%; border-radius:3px 3px 2px 2px;
    transition:height 0.7s cubic-bezier(0.4,0,0.2,1);
    min-height:3px;
}
#${P}-root .${P}-ft-bar-lbl {
    font-size:9px; color:rgba(255,255,255,0.28);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    width:100%; text-align:center; font-variant-numeric:tabular-nums;
}
#${P}-root .${P}-ft-bar-score {
    font-size:9px; color:rgba(255,255,255,0.4);
    font-weight:600; font-variant-numeric:tabular-nums;
    line-height:1;
}
#${P}-root .${P}-ft-bar-today .${P}-ft-bar-lbl {
    color:rgba(255,255,255,0.65); font-weight:700;
}
#${P}-root .${P}-ft-bar-today .${P}-ft-bar-score {
    color:rgba(255,255,255,0.75);
}

/* ── Chat ── */
#${P}-root .${P}-cht {
    height:110px; overflow-y:auto; padding:8px 10px;
    border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.06);
    font-size:12px; user-select:text;
    scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.12) transparent;
}
#${P}-root .${P}-cht::-webkit-scrollbar { width:5px; }
#${P}-root .${P}-cht::-webkit-scrollbar-track { background:transparent; }
#${P}-root .${P}-cht::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:99px; }
#${P}-root .${P}-cr { display:flex; gap:6px; margin-top:8px; }
#${P}-root .${P}-ci {
    all:unset; flex:1; padding:9px 12px; border-radius:10px;
    border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.05); color:#fff;
    font-size:12px; font-family:inherit; transition:border-color 0.2s;
}
#${P}-root .${P}-ci::placeholder { color:rgba(255,255,255,0.2); }
#${P}-root .${P}-ci:focus { border-color:rgba(139,92,246,0.5); }
#${P}-root .${P}-sn {
    all:unset; padding:9px 18px; border-radius:10px; cursor:pointer;
    background:linear-gradient(135deg,#8b5cf6,#6366f1); color:#fff;
    font-size:12px; font-weight:600; font-family:inherit; white-space:nowrap;
    transition:all 0.15s; box-shadow:0 3px 10px rgba(139,92,246,0.3);
}
#${P}-root .${P}-sn:hover { box-shadow:0 5px 16px rgba(139,92,246,0.5); transform:translateY(-1px); }
#${P}-root .${P}-sn:active { transform:translateY(0); }
        `;
        document.head.appendChild(style);
    }

    /* ==========================================================================
       HTML
       ========================================================================== */
    function buildHTML() {
        return `
        <div class="${P}-hd" id="${P}-drag">
            <div class="${P}-hd-l">
                <div class="${P}-ico">⚡</div>
                <span class="${P}-ttl">GPUN Timer</span>
            </div>
            <div class="${P}-bns">
                <button class="${P}-cb" id="${P}-btn-min" title="최소화">─</button>
                <button class="${P}-cb" id="${P}-btn-close" title="닫기">✕</button>
            </div>
        </div>
        <div id="${P}-body">
            <div id="${P}-stats"></div>
            <div class="${P}-cd">
                <div class="${P}-cl">💬 익명 채팅</div>
                <div class="${P}-cht" id="${P}-chat-display"></div>
                <div class="${P}-cr">
                    <input type="text" class="${P}-ci" id="${P}-chat-input"
                           maxlength="27" placeholder="아무말 대잔치 (27자)" autocomplete="off">
                    <button class="${P}-sn" id="${P}-chat-send">전송</button>
                </div>
            </div>
        </div>`;
    }

    /* ==========================================================================
       드래그
       ========================================================================== */
    function initDrag(box) {
        const handle = document.getElementById(`${P}-drag`);
        if (!handle) return;
        handle.addEventListener("mousedown", (e) => {
            if (e.target.closest(`.${P}-cb`)) return;
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
            if (s >= 75) return '#a78bfa';       // 길/대길 — 보라
            if (s >= 55) return '#34d399';        // 평     — 초록
            if (s >= 35) return '#fbbf24';        // 흉     — 노랑
            return '#f87171';                     // 대흉   — 빨강
        }

        const chartItems = all.map(item => {
            const barH = Math.max(4, Math.round((item.score / 100) * MAX_BAR_H));
            const color = scoreColor(item.score);
            const isToday = item.date === 'today';
            const label = isToday ? '오늘' : item.date.slice(5).replace('-', '/');
            const todayCls = isToday ? ` ${P}-ft-bar-today` : '';
            const opacity = isToday ? '1' : '0.5';
            return `
            <div class="${P}-ft-bar-wrap${todayCls}">
                <span class="${P}-ft-bar-score">${item.score}</span>
                <div class="${P}-ft-bar-col"
                     style="height:${barH}px;background:${color};opacity:${opacity};"></div>
                <span class="${P}-ft-bar-lbl">${label}</span>
            </div>`;
        }).join('');

        return `
        <div class="${P}-ft-hist">
            <div class="${P}-ft-hist-title">최근 운세 점수</div>
            <div class="${P}-ft-chart">${chartItems}</div>
        </div>`;
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
                box.innerHTML = buildHTML();
                document.body.appendChild(box);

                document.getElementById(`${P}-btn-close`).addEventListener("click", () => { box.style.display = "none"; });
                document.getElementById(`${P}-btn-min`).addEventListener("click", () => { box.classList.toggle(`${P}-min`); });

                const inp = document.getElementById(`${P}-chat-input`);
                const btn = document.getElementById(`${P}-chat-send`);
                const doSend = () => { if (inp.value.trim()) { sendChat(inp.value); inp.value = ""; } };
                btn.addEventListener("click", doSend);
                inp.addEventListener("keypress", (e) => { if (e.key === "Enter") doSend(); });

                initDrag(box);
                fetchChat();
            } else {
                box.style.display = "";
            }

            // 운세 카드
            const f = cachedFortune;
            const fortuneCard = f ? `
            <div class="${P}-cd">
                <div class="${P}-cl">🔮 오늘의 운세</div>
                <div class="${P}-rw">
                    <span class="${P}-ft-title">${f.title}</span>
                    <span class="${P}-ft-score">${f.score}점</span>
                </div>
                <div class="${P}-ft-bar">
                    <div class="${P}-ft-bar-fill" style="width:${f.score}%"></div>
                </div>
                <div class="${P}-ft-body">${f.body}</div>
                <div class="${P}-ft-advice">💡 ${f.advice}</div>
                ${buildFortuneHistChart(f.history, f.score)}
            </div>` : `
            <div class="${P}-cd">
                <div class="${P}-cl">🔮 오늘의 운세</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.3);text-align:center;padding:8px 0;">운세 불러오는 중...</div>
            </div>`;

            const stats = document.getElementById(`${P}-stats`);
            if (!stats) return;

            const isDone = todayDone >= 9;
            const isMealOk = todayDone >= 11.5;

            const mealCard = isDone ? `
            <div class="${P}-cd">
                <div class="${P}-cl">🍽️ 야근 식대</div>
                <div class="${P}-rw">
                    <span class="${P}-lb">자격까지</span>
                    <span class="${P}-vs" style="color:${isMealOk ? '#34d399' : '#fda4af'}">
                        ${isMealOk ? '✔ 획득 완료' : fmt(11.5 - todayDone) + ' 남음'}
                    </span>
                </div>
                <div class="${P}-pb">
                    <div class="${P}-pf ${isMealOk ? P+'-pf-g' : P+'-pf-r'}" style="width:${mealPct}%"></div>
                </div>
            </div>` : '';

            stats.innerHTML = `
            <div class="${P}-cd">
                <div class="${P}-cl">⏱ 오늘 근무</div>
                <div class="${P}-rw">
                    <span class="${P}-lb">근무시간</span>
                    <span class="${P}-vl">${fmt(todayDone)} <span class="${P}-dm">/ 9:00</span></span>
                </div>
                <div class="${P}-pb ${P}-pb-l">
                    <div class="${P}-pf ${P}-pf-v" style="width:${dailyPct}%"></div>
                </div>
                <div class="${P}-rw" style="margin-top:12px;">
                    <span>
                        ${isDone
                            ? `<span class="${P}-bg ${P}-bg-ok">🏁 퇴근 가능</span>`
                            : `<span class="${P}-bg ${P}-bg-wt">🏃 ${fmt(9 - todayDone)} 남음</span>`}
                    </span>
                    <span class="${P}-sb" style="margin:0;">예상 퇴근 <b>${endTime}</b></span>
                </div>
            </div>

            ${mealCard}

            <div class="${P}-cd">
                <div class="${P}-cl">📊 주간 현황</div>
                <div class="${P}-rw">
                    <span class="${P}-lb">주간 누적</span>
                    <span class="${P}-vs">${fmt(realWeekly)} <span class="${P}-dm">/ 53h</span></span>
                </div>
                <div class="${P}-pb">
                    <div class="${P}-pf ${P}-pf-t" style="width:${weeklyPct}%"></div>
                </div>
                <div class="${P}-rw" style="margin-top:10px;">
                    <span class="${P}-lb">OT 달성</span>
                    <span class="${P}-vs">${fmt(extraDone)} <span class="${P}-dm">/ 8h</span></span>
                </div>
                <div class="${P}-pb">
                    <div class="${P}-pf ${P}-pf-a" style="width:${extraPct}%"></div>
                </div>
                <div class="${P}-sb">
                    하루 평균 <b>${avgExtra <= 0 ? '0:00' : fmt(avgExtra)}</b> 추가 필요
                </div>
            </div>

            <div class="${P}-st">
                ${isDone ? '🚀' : '💭'} ${statusMsg}
            </div>

            ${fortuneCard}`;

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
