// ==UserScript==
// @name         Flex 근무시간 체크 - 시계기준 알람 완벽 최종판
// @version      1.0.10
// @description  시계 기준 알람 + 9시간 알람 + UI + 로그 미친듯이 상세
// @match        https://flex.team/time-tracking/my-work-record*
// @updateURL    https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @downloadURL  https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DAILY_GOAL = 9.0;
    const WEEKLY_GOAL = 53;

    // 시계 기반 고정 알람 (시간 + 제목 + 부제목 + 이모지)
    const FIXED_ALARMS = new Map([
        ["10:28", { title: "스크럼 ~", body: "프로그램팀 회의 시작합시다!", emoji: "☕" }],
        ["12:29", { title: "밥타임", body: "점심 먹으러 ㄱㄱ", emoji: "🍱" }],
        ["18:59", { title: "밥타임", body: "저녁 먹으러 ㄱㄱ", emoji: "🍱" }],
    ]);

    let triggeredFixed = new Set();     // 오늘 울린 고정 알람
    let triggered9Hour10Min = false;    // 9시간 10분 전 알람
    let triggered9HourDone = false;     // 9시간 완료 알람
    let lastCheckedMinute = -1;

    console.clear();
    console.log("%c🚀 Flex 알람 스크립트 로드 완료 ", "color:#00ff00;font-size:24px;font-weight:bold;background:#000;padding:12px");
    console.log("%c⏰ 시계 기반 고정 알람 + 9시간 알람 + 실시간 UI 업데이트", "color:#00ffff;font-size:16px");

    // 알람 발동 함수 (시각 + 진동 + 화면 깜빡임 + 알림)
    function triggerAlarm(title, body = "", emoji = "🚨") {
        const now = new Date();
        const timeStr = now.toTimeString().slice(0, 8);

        console.log("%c┌────────────────────────────────────────────────────┐", "color:#ff0066");
        console.log(`%c│ ${emoji}  알람 발동  ${emoji}  [${timeStr}]`, "color:#fff;background:#ff0066;font-size:20px;font-weight:bold;padding:8px");
        console.log(`%c│ 제목: ${title}`, "color:#ffff00;font-size:16px");
        if (body) console.log(`%c│ 내용: ${body}`, "color:#ffaa00;font-size:15px");
        console.log("%c└────────────────────────────────────────────────────┘", "color:#ff0066");

        // 타이틀 깜빡임
        let count = 0;
        const originalTitle = document.title;
        const titleInterval = setInterval(() => {
            document.title = count++ % 2 ? `${emoji} ${title} ${emoji}` : originalTitle;
            if (count > 40) {
                clearInterval(titleInterval);
                document.title = originalTitle;
            }
        }, 350);

        // 화면 빨간 깜빡임 4번
        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                const flash = document.createElement("div");
                flash.style.cssText = `
                    pointer-events:none;position:fixed;top:0;left:0;width:100vw;height:100vh;
                    background:#ff000088;z-index:999999;opacity:0;transition:opacity 0.6s;
                `;
                document.body.appendChild(flash);
                setTimeout(() => flash.style.opacity = "1", 50);
                setTimeout(() => flash.style.opacity = "0", 500);
                setTimeout(() => flash.remove(), 1100);
            }, i * 700);
        }

        // 진동
        if (navigator.vibrate) {
            navigator.vibrate([600, 300, 600, 300, 800, 300, 1000]);
        }

        // 브라우저 알림
        if (Notification.permission === "granted") {
            new Notification(`🚨 ${title} 🚨`, {
                body: `${body}\n( ${timeStr} )`,
                icon: "https://flex.team/favicon.ico",
                requireInteraction: true,
                renotify: true,
                tag: "flex-alarm-" + Date.now()
            });
        }
    }

    // 시계 기반 고정 알람 체크
    function checkFixedTimeAlarms() {
        const now = new Date();
        const currentMinute = now.getHours() * 60 + now.getMinutes();
        if (currentMinute === lastCheckedMinute) return;
        lastCheckedMinute = currentMinute;

        const todayKey = now.toDateString();

        for (const [time, info] of FIXED_ALARMS) {
            const [h, m] = time.split(":").map(Number);
            const targetMinute = h * 60 + m;

            if (currentMinute === targetMinute) {
                const key = `${todayKey}|${time}`;
                if (!triggeredFixed.has(key)) {
                    triggeredFixed.add(key);
                    triggerAlarm(info.title, info.body, info.emoji);
                }
            }
        }
    }

    // 9시간 근무 알람 체크
    function check9HourAlarms(todayDone) {
        const totalMinutes = Math.round(todayDone * 60);
        const todayKey = new Date().toDateString();

        if (totalMinutes >= 530 && totalMinutes <= 535 && !triggered9Hour10Min) {
            triggered9Hour10Min = true;
            triggerAlarm("9시간까지 10분 남음!!", "조금만 더 버텨라!!", "🔥");
        }

        if (totalMinutes >= 539 && totalMinutes <= 545 && !triggered9HourDone) {
            triggered9HourDone = true;
            triggerAlarm("9시간 완료!!", "퇴근 가즈아!! 오늘도 수고했다!!", "🎉");
        }
    }

    function parseHM(str) {
        if (!str) return 0;
        str = str.trim();
        const onlyMin = str.match(/^(\d+)분?$/);
        if (onlyMin) return parseInt(onlyMin[1]) / 60;
        const withHour = str.match(/(\d+)시간\s*(\d+)분?/);
        if (withHour) return parseInt(withHour[1]) + (parseInt(withHour[2] || 0) / 60);
        const colon = str.match(/(\d+):(\d+)/);
        if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
        return 0;
    }

    function format(h) {
        const hh = Math.floor(h);
        const mm = Math.floor((h - hh) * 60);
        return `${hh}:${mm.toString().padStart(2, "0")}`;
    }

    function getRemainDays() {
        const d = new Date().getDay();
        return (d === 0 || d === 6) ? 0 : 6 - d;
    }

    function run() {
        checkFixedTimeAlarms();

        const todayTag = document.querySelector('time[datetime*="T"]');
        const todayText = todayTag?.textContent?.trim() || "0분";
        const todayDone = parseHM(todayText);

        check9HourAlarms(todayDone);

        const weeklySpan = document.querySelector('span.c-lmXAkT');
        const weeklyText = weeklySpan?.textContent?.trim() || "0시간";
        const pastWeekly = parseHM(weeklyText);
        const realWeeklyDone = pastWeekly + todayDone;

        const weeklyLeft = Math.max(0, WEEKLY_GOAL - realWeeklyDone);
        const remainDays = getRemainDays();
        const avgPerDay = remainDays > 0 ? weeklyLeft / remainDays : 0;
        const minsLeft = Math.ceil((9 - todayDone) * 60);
        const isAlmost = minsLeft === 10;

        const todayPct = Math.min(100, (todayDone / 9) * 100);
        const weeklyPct = Math.min(100, (realWeeklyDone / 53) * 100);

        let box = document.getElementById("flex-box");
        if (!box) {
            box = document.createElement("div");
            box.id = "flex-box";
            Object.assign(box.style, {
                position: "fixed", bottom: "20px", right: "20px", width: "370px",
                background: "rgba(15,20,40,0.98)", color: "#fff", borderRadius: "24px",
                padding: "24px", fontFamily: "'Pretendard', sans-serif", fontSize: "14px",
                zIndex: "999999", boxShadow: "0 30px 70px rgba(0,0,0,0.8)",
                border: "2px solid rgba(0,255,255,0.6)", backdropFilter: "blur(28px)"
            });
            document.body.appendChild(box);
        }

        box.innerHTML = `
            <style>
                .bar{height:13px;background:rgba(255,255,255,0.15);border-radius:13px;overflow:hidden;margin:11px 0;}
                .fill{height:100%;transition:width 1s ease;border-radius:13px;}
                .label{display:flex;justify-content:space-between;font-weight:800;margin-bottom:7px;font-size:15px;}
                .sub{font-size:12.5px;opacity:0.92;text-align:right;margin-top:5px;}
                .glow{animation:g 1.4s infinite alternate;}
                @keyframes g{from{box-shadow:0 0 30px #ff0066;}to{box-shadow:0 0 70px #ff0066,0 0 100px #ff0066;}}
            </style>

            <div style="margin-bottom:22px;${isAlmost?'class=glow':''}">
                <div class="label" style="color:#00ffff;">오늘 근무 <span>${format(todayDone)} / 9:00</span></div>
                <div class="bar"><div class="fill" style="width:${todayPct}%;background:linear-gradient(90deg,#00ffff,#0088ff);"></div></div>
                <div class="sub" style="color:${todayDone>=9?'#00ff88':minsLeft<=30?'#ff4400':'#ccc'}">
                    ${todayDone>=9?'퇴근 가능!':minsLeft<=0?'초과 근무 중':minsLeft+'분 남음'} ${isAlmost?'10분만 더!':''}
                </div>
            </div>

            <div style="margin-bottom:22px;">
                <div class="label" style="color:#ff55aa;">이번주 누적 <span>${format(realWeeklyDone)} / 53:00</span></div>
                <div class="bar"><div class="fill" style="width:${weeklyPct}%;background:linear-gradient(90deg,#ff55aa,#ff0088);"></div></div>
                <div class="sub" style="color:${realWeeklyDone>=53?'#00ff88':'#ff8888'}">
                    ${realWeeklyDone>=53?'완료!':'남은 시간 '+format(weeklyLeft)}
                </div>
            </div>

            <div>
                <div class="label" style="color:#ffff55;">남은 ${remainDays}일 평균
                    <span style="color:${avgPerDay>10?'#ff0088':avgPerDay>9?'#ff6600':'#ffff88'}">
                        ${avgPerDay<=0?'여유!':format(avgPerDay)+'/일'}
                    </span>
                </div>
                <div class="bar">
                    <div class="fill" style="width:${Math.min(100,(avgPerDay/12)*100)}%;
                        background:linear-gradient(90deg,${avgPerDay>10?'#ff0088':avgPerDay>9?'#ff6600':'#ffff88'},#ffdd00);">
                    </div>
                </div>
                <div class="sub" style="color:${avgPerDay>10?'#ff0088':avgPerDay>9?'#ff6600':'#ffff88'}">
                    ${avgPerDay>10?'죽었다 ㅅㅂ 😵‍':avgPerDay>9?'빡세네 🔥':'괜찮음 ☕'}
                </div>
            </div>
        `;

        console.log(`%c⏱ 현재: ${new Date().toTimeString().slice(0,8)} | 오늘: ${format(todayDone)} | 주간: ${format(realWeeklyDone)} | 평균: ${format(avgPerDay)}`, "color:#00ffaa;font-size:13px");
    }

    // 자정 리셋
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            triggeredFixed.clear();
            triggered9Hour10Min = false;
            triggered9HourDone = false;
            console.log("%c자정 리셋 완료 - 모든 알람 기록 초기화", "color:#ffff00;background:#000;font-size:18px;font-weight:bold;padding:10px");
        }
    }, 60000);

    if (Notification.permission === "default") {
        setTimeout(() => Notification.requestPermission(), 4000);
    }

    setTimeout(run, 1200);
    setInterval(run, 2500);
})();

