// ==UserScript==
// @name         Flex 근무시간 체크 - 시계기준 알람 완벽 최종판
// @version      1.1.2
// @description  시계 알람 + 9시간 알람 + 잔여 추가시간(8h) 프로그레스 + 예쁜 UI
// @match        https://flex.team/time-tracking/my-work-record*
// @updateURL    https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @downloadURL  https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DAILY_GOAL = 9.0;
    const BASE_WEEKLY = 45;
    const EXTRA_HOURS = 8;
    const WEEKLY_GOAL = BASE_WEEKLY + EXTRA_HOURS;

    const FIXED_ALARMS = new Map([
        ["10:28", { title: "스크럼 ~", body: "팀 회의 시작합시다!", emoji: "☕" }],
        ["12:29", { title: "밥 타임", body: "점심 먹으러 ㄱㄱ", emoji: "🍱" }],
        ["18:59", { title: "밥 타임", body: "저녁 먹으러 ㄱㄱ", emoji: "🍴" }],
    ]);

    let triggeredFixed = new Set();
    let triggered9Hour10Min = false;
    let triggered9HourDone = false;
    let lastCheckedMinute = -1;

    console.clear();
    console.log("%cFlex 알람 스크립트 로드 완료 ", "color:#00ff00;font-size:24px;font-weight:bold;background:#000;padding:12px");

    function triggerAlarm(title, body = "", emoji = "Alert") {
        const now = new Date();
        const timeStr = now.toTimeString().slice(0, 8);
        const displayTime = now.toLocaleTimeString('ko-KR', { // 새로 추가: 분까지만
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

        console.log(`%c│ ${emoji}  ${title}  ${emoji} [${timeStr}]`, "color:#fff;background:#ff0066;font-size:20px;font-weight:bold;padding:8px");

        let count = 0;
        const originalTitle = document.title;
        const titleInterval = setInterval(() => {
            document.title = count++ % 2 ? `${emoji} ${title} ${emoji}` : originalTitle;
            if (count > 40) { clearInterval(titleInterval); document.title = originalTitle; }
        }, 350);

        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const flash = document.createElement("div");
                flash.style.cssText = `pointer-events:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#ff000088;z-index:999999;opacity:0;transition:opacity 0.6s;`;
                document.body.appendChild(flash);
                setTimeout(() => flash.style.opacity = "1", 50);
                setTimeout(() => flash.style.opacity = "0", 500);
                setTimeout(() => flash.remove(), 1100);
            }, i * 700);
        }

        if (navigator.vibrate) {
            navigator.vibrate([600, 300, 600, 300, 800, 300, 1000]);
        }

        if (Notification.permission === "granted") {
            new Notification(`${emoji} ${title} ${emoji}`, {
                body: `${body}\n(${displayTime})`,
                icon: "https://yt3.googleusercontent.com/BjCJqLUWGwNoFdoE7rG0ZNc9Hp-uVxzXk80UPgvQYpYpqBQAkk6Xz4LPOCkMKgOqI72KpAp5tA=s72-c-k-c0x00ffffff-no-rj",
                requireInteraction: true,
                renotify: true,
                tag: "alarm-" + Date.now()
            });
        }
    }

    function checkFixedTimeAlarms() {
        const now = new Date();
        const currentMinute = now.getHours() * 60 + now.getMinutes();
        if (currentMinute === lastCheckedMinute) return;
        lastCheckedMinute = currentMinute;

        const todayKey = now.toDateString();

        for (const [time, info] of FIXED_ALARMS) {
            const [h, m] = time.split(":").map(Number);
            if (currentMinute === h * 60 + m) {
                const key = `${todayKey}|${time}`;
                if (!triggeredFixed.has(key)) {
                    triggeredFixed.add(key);
                    triggerAlarm(info.title, info.body, info.emoji);
                }
            }
        }
    }

    function check9HourAlarms(todayDone) {
        const totalMinutes = Math.round(todayDone * 60);

        if (totalMinutes >= 530 && totalMinutes <= 535 && !triggered9Hour10Min) {
            triggered9Hour10Min = true;
            triggerAlarm("9시간까지 10분 남음!!", "조금만 더 버텨라!!", "🔥");
        }

        if (totalMinutes >= 539 && totalMinutes <= 545 && !triggered9HourDone) {
            triggered9HourDone = true;
            triggerAlarm("9시간 완료!!", "퇴근 가즈아!! 오늘도 수고했다!!", "👍😄");
        }
    }

    function parseHM(str) {
        if (!str) return 0;
        str = str.trim().replace(/\s/g, ''); // 모든 공백 제거

        // 1. "10시간" 형식
        const onlyHour = str.match(/^(\d+)시간$/);
        if (onlyHour) return parseInt(onlyHour[1]);

        // 2. "10시간30분" 형식
        const hourMin = str.match(/^(\d+)시간(\d+)분?$/);
        if (hourMin) return parseInt(hourMin[1]) + (parseInt(hourMin[2]) || 0) / 60;

        // 3. "10:30" 형식
        const colon = str.match(/^(\d+):(\d+)$/);
        if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;

        // 4. "30분" 형식
        const onlyMin = str.match(/^(\d+)분$/);
        if (onlyMin) return parseInt(onlyMin[1]) / 60;

        return 0;
    }

    function format(h) {
        const hh = Math.floor(h);
        const mm = Math.floor((h - hh) * 60);
        return `${hh}:${mm.toString().padStart(2, "0")}`;
    }

    function getRemainDays() {
        const d = new Date().getDay();
        if (d === 0 || d === 6) return 0;
        return 5 - d; // 월:4, 화:3, 수:2, 목:1, 금:0
    }

    function run() {
    checkFixedTimeAlarms();

    // 오늘 근무시간
    const todayTag = document.querySelector('time[datetime*="T"]');
    const todayText = todayTag?.textContent?.trim() || "0분";
    const todayDone = parseHM(todayText);
    check9HourAlarms(todayDone);

    // 오늘 제외한 주간 누적 (span.c-lmXAkT)
    const pastTag = document.querySelector('span.c-lmXAkT');
    const pastWeeklyExcludingToday = parseHM(pastTag?.textContent?.trim() || "0:00");

    // 지난 근무일 수 (월요일=1 → 0일, 화요일=2 → 1일, ..., 금요일=5 → 4일)
    const weekday = new Date().getDay(); // 0=일, 1=월, ..., 6=토
    const workedDaysExcludingToday = (weekday >= 1 && weekday <= 5) ? weekday - 1 : 0;

    // 지난 날들의 기본 근무시간
    const baseFromPastDays = workedDaysExcludingToday * 9;

    // 지난 날들에서 쌓인 추가시간
    const extraFromPastDays = Math.max(0, pastWeeklyExcludingToday - baseFromPastDays);

    // 오늘 추가시간
    const extraFromToday = Math.max(0, todayDone - 9);

    // 총 추가시간
    const extraDone = extraFromPastDays + extraFromToday;
    const extraLeft = Math.max(0, EXTRA_HOURS - extraDone);
    const extraPct = (extraDone / EXTRA_HOURS) * 100;

    const remainDays = getRemainDays();
    const avgExtraPerDay = remainDays > 0 ? extraLeft / remainDays : 0;

    const realWeeklyDone = pastWeeklyExcludingToday + todayDone;
    const totalLeft = Math.max(0, WEEKLY_GOAL - realWeeklyDone);
    const minsLeft = Math.ceil((9 - todayDone) * 60);
    const isAlmost = minsLeft === 10;
    const todayPct = Math.min(100, (todayDone / 9) * 100);
    const weeklyPct = Math.min(100, (realWeeklyDone / WEEKLY_GOAL) * 100);

    // 박스
    let box = document.getElementById("flex-box");
    if (!box) {
        box = document.createElement("div");
        box.id = "flex-box";
        Object.assign(box.style, {
            position: "fixed", bottom: "24px", right: "24px", width: "380px",
            background: "linear-gradient(135deg, rgba(20,25,50,0.98), rgba(10,15,35,0.98))",
            color: "#fff", borderRadius: "28px", padding: "26px", fontFamily: "'Pretendard', sans-serif",
            fontSize: "14.5px", zIndex: "999999", boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
            border: "1px solid rgba(100,200,255,0.3)", backdropFilter: "blur(32px)"
        });
        document.body.appendChild(box);
    }

    box.innerHTML = `
        <style>
            .bar{height:15px;background:rgba(255,255,255,0.12);border-radius:15px;overflow:hidden;margin:12px 0;box-shadow:inset 0 2px 6px rgba(0,0,0,0.3);}
            .fill{height:100%;transition:width 1.2s cubic-bezier(0.4,0,0.2,1);border-radius:15px;}
            .label{display:flex;justify-content:flex-start;gap:16px;align-items:center;font-weight:900;margin-bottom:8px;font-size:16px;letter-spacing:-0.3px;}
            .sub{font-size:13px;opacity:0.88;margin-top:6px;text-align:right;}
            .glow{animation:g 1.6s infinite alternate;}
            @keyframes g{from{box-shadow:0 0 40px #ff0066;}to{box-shadow:0 0 80px #ff0066,0 0 120px #ff3399;}}
            .emoji{font-size:20px;}
        </style>

        <div style="margin-bottom:26px;${isAlmost?'class=glow':''}">
            <div class="label" style="color:#00e0ff;"><span class="emoji">⏰</span> 오늘 근무 <span style="margin-left:auto;">${format(todayDone)} / 9:00</span></div>
            <div class="bar"><div class="fill" style="width:${todayPct}%;background:linear-gradient(90deg,#00ffff,#00aaff);box-shadow:0 0 20px rgba(0,255,255,0.5);"></div></div>
            <div class="sub" style="color:${todayDone>=9?'#00ff9d':minsLeft<=30?'#ff3366':'#aaa'}">
                ${todayDone>=9?'퇴근 가능! 🏃‍♂️💨':minsLeft<=0?'초과 근무 중 🔥':minsLeft+'분 남음 ⏳'} ${isAlmost?'10분만 더 화이팅! 🚀':''}
            </div>
        </div>

        <div style="margin-bottom:26px;">
            <div class="label" style="color:#ff66cc;"><span class="emoji">📅</span> 주간 누적 <span style="margin-left:auto;">${format(realWeeklyDone)} / 53:00</span></div>
            <div class="bar"><div class="fill" style="width:${weeklyPct}%;background:linear-gradient(90deg,#ff66cc,#ff3399);box-shadow:0 0 20px rgba(255,100,200,0.4);"></div></div>
            <div class="sub" style="color:${realWeeklyDone>=53?'#00ffaa':'#ff88aa'}">
                ${realWeeklyDone>=53?'주간 목표 달성! 🏆✨':'남은 시간 '+format(totalLeft)+' ⏰'}
            </div>
        </div>

        <div>
            <div class="label" style="color:#ffff66;"><span class="emoji">⚡</span> 잔여 추가시간 (8시간 기준)</div>
            <div class="bar">
                <div class="fill" style="width:${extraPct.toFixed(1)}%;background:linear-gradient(90deg,#aaffaa,#66ff99);box-shadow:0 0 20px rgba(100,255,100,0.6);"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                <div style="font-size:13px;color:#ccc;">
                    남은 날 ${remainDays}일 → 평균 <strong style="color:${avgExtraPerDay>2?'#ff3366':avgExtraPerDay>1?'#ffaa33':'#aaffaa'}">${avgExtraPerDay<=0?'여유만땅 😎':format(avgExtraPerDay)}/일</strong>
                </div>
                <div class="sub" style="color:${extraLeft<=0?'#00ffaa':extraLeft>6?'#ff3366':extraLeft>3?'#ffaa33':'#ffff88'}">
                    ${extraLeft<=0?'추가시간 완료! 🎉🎊':extraLeft>6?'죽을 거 같아 💀☠️':extraLeft>3?'빡세네 😓💦':'괜찮음 👍😄'}
                </div>
            </div>
        </div>
    `;
}

    let lastResetDate = null;
setInterval(() => {
    const now = new Date();
    const today = now.toDateString();
    if (lastResetDate !== today) {
        lastResetDate = today;
        triggeredFixed.clear();
        triggered9Hour10Min = false;
        triggered9HourDone = false;
        console.log("%c새로운 날 시작 → 모든 알람 리셋됨", "color:#00ff00;font-weight:bold");
    }
}, 1000);

    if (Notification.permission === "default") {
        setTimeout(() => Notification.requestPermission(), 4000);
    }

    setTimeout(run, 1200);
    setInterval(run, 2500);
})();
