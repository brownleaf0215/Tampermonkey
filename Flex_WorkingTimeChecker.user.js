// ==UserScript==
// @name         Flex 근무시간 체크 - 밥자격 + 실제 퇴근시간 완벽판
// @version      2.1.0
// @description  9시간 알람 + 2시간30분 밥자격 알람 + 실제 시계 기준 퇴근시간 표시
// @match        https://flex.team/time-tracking/my-work-record*
// @updateURL    https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @downloadURL  https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 1. CONFIGURATION (설정)
    // =========================================================================
    const CONFIG = {
        GOALS: {
            DAILY: 9.0,
            MEAL_QUALIFY: 2.5,
            WEEKLY_LUNCH: 5.0
        },
        // 90년대 느낌 알림 텍스트
        ALARMS: [
            { time: "10:28", title: "[공지] 스크럼 접속 요망", body: "오늘도 건승하십시오.", emoji: "💾" },
            { time: "12:29", title: "(( 점심 시간 ))", body: "식사 맛있게 하세요~ ^^", emoji: "🍱" },
            { time: "18:59", title: "★퇴근시간 임박★", body: "천리안 접속 종료하시겠습니까?", emoji: "🚪" }
        ]
    };

    // =========================================================================
    // 2. STATE (상태)
    // =========================================================================
    const State = {
        alarmsTriggered: new Set(),
        dynamicAlarms: { min10: false, done9: false, meal: false },
        lastCheckedMinute: -1,
        lastResetDate: null
    };

    // =========================================================================
    // 3. UTILITIES (도구)
    // =========================================================================
    const Utils = {
        parseTime(str) {
            if (!str) return 0;
            str = str.trim().replace(/\s/g, '');
            const colon = str.match(/(-?\d+):(\d+)$/);
            if (colon) return Math.abs(parseInt(colon[1])) + parseInt(colon[2]) / 60;
            const onlyHour = str.match(/(\d+)시간$/);
            if (onlyHour) return parseInt(onlyHour[1]);
            const hourMin = str.match(/(\d+)시간(\d+)분?$/);
            if (hourMin) return parseInt(hourMin[1]) + (parseInt(hourMin[2]) || 0) / 60;
            const onlyMin = str.match(/(\d+)분$/);
            if (onlyMin) return parseInt(onlyMin[1]) / 60;
            return 0;
        },

        formatTime(h) {
            const hh = Math.floor(h);
            const mm = Math.floor((h - hh) * 60);
            return `${hh}:${mm.toString().padStart(2, "0")}`;
        },

        calculateEndTime(todayDone) {
            const now = new Date();
            const workedMs = todayDone * 60 * 60 * 1000;
            const targetMs = 9 * 60 * 60 * 1000;
            const remainMs = targetMs - workedMs;
            if (remainMs <= 0) return "NOW";
            const endTime = new Date(now.getTime() + remainMs);
            return endTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        },

        triggerAlarm(title, body = "", emoji = "🔔") {
            const now = new Date();
            const timeStr = now.toLocaleTimeString();

            // 브라우저 타이틀 깜빡임 (고전 스타일)
            let count = 0;
            const originalTitle = document.title;
            const titleInterval = setInterval(() => {
                document.title = count++ % 2 ? `*** ${title} ***` : originalTitle;
                if (count > 20) { clearInterval(titleInterval); document.title = originalTitle; }
            }, 500);

            if (Notification.permission === "granted") {
                new Notification(`[System] ${title}`, {
                    body: `${body}\nTime: ${timeStr}`,
                    icon: "https://flex.team/favicon.ico",
                    requireInteraction: false
                });
            }
        },

        log(msg) {
            console.log(`%c💾 C:\\> ${msg}`, "color:#00ff00;background:#000;padding:4px;font-family:monospace;");
        }
    };

    // =========================================================================
    // 4. UI (Win95 Style)
    // =========================================================================
    const UI = {
        containerId: "win95-flex-box",

        injectStyles() {
            if (document.getElementById("win95-style")) return;
            const css = `
                /* 90년대 폰트와 기본 설정 */
                #${this.containerId} {
                    position: fixed; bottom: 20px; right: 20px; width: 320px;
                    background-color: #c0c0c0; /* 윈도우 95 회색 */
                    border: 2px solid;
                    border-color: #ffffff #808080 #808080 #ffffff; /* 3D 효과 */
                    font-family: 'Gulim', 'MS Sans Serif', 'Dotum', sans-serif;
                    font-size: 12px;
                    color: black;
                    z-index: 999999;
                    box-shadow: 4px 4px 10px rgba(0,0,0,0.5);
                    user-select: none;
                }

                /* 타이틀 바 */
                .win95-title-bar {
                    background: #000080; /* 남색 */
                    color: white;
                    padding: 3px 4px;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    letter-spacing: 1px;
                }
                .win95-btn-close {
                    width: 16px; height: 14px;
                    background: #c0c0c0;
                    border: 1px solid;
                    border-color: #ffffff #808080 #808080 #ffffff;
                    font-size: 10px; line-height: 10px; text-align: center;
                    font-weight: bold; color: black; cursor: pointer;
                }
                .win95-btn-close:active {
                    border-color: #808080 #ffffff #ffffff #808080;
                }

                /* 컨텐츠 영역 */
                .win95-content { padding: 10px; }

                /* 섹션 박스 (Fieldset 느낌) */
                .win95-group {
                    border: 1px solid;
                    border-color: #808080 #ffffff #ffffff #808080; /* 오목한 효과 */
                    padding: 8px; margin-bottom: 8px;
                    background: #c0c0c0;
                }
                .win95-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
                .win95-label { font-weight: bold; }

                /* 프로그레스 바 컨테이너 (오목) */
                .win95-progress-bg {
                    height: 16px;
                    background: white;
                    border: 1px solid;
                    border-color: #808080 #ffffff #ffffff #808080;
                    position: relative;
                }
                /* 프로그레스 바 채우기 (파란 블럭) */
                .win95-progress-fill {
                    height: 100%;
                    background: #000080;
                    display: block;
                }
                /* 90년대 격자 무늬 오버레이 효과 */
                .win95-progress-fill::after {
                    content: ""; position: absolute; top:0; left:0; right:0; bottom:0;
                    background-image: linear-gradient(90deg, transparent 50%, rgba(255,255,255,0.2) 50%);
                    background-size: 4px 4px;
                }

                /* 하단 상태바 */
                .win95-status-bar {
                    border: 1px solid;
                    border-color: #808080 #ffffff #ffffff #808080;
                    padding: 2px 4px;
                    margin-top: 4px;
                    font-size: 11px; color: #444;
                }

                /* 깜빡이는 텍스트 효과 */
                .blink { animation: blinker 1s linear infinite; color: red; font-weight: bold; }
                @keyframes blinker { 50% { opacity: 0; } }
            `;
            const style = document.createElement("style");
            style.id = "win95-style";
            style.textContent = css;
            document.head.appendChild(style);
        },

        render(data) {
            let box = document.getElementById(this.containerId);
            if (!box) {
                box = document.createElement("div");
                box.id = this.containerId;
                document.body.appendChild(box);
                this.injectStyles();
            }

            const { todayDone, todayPct, realEndTime, mealPct, realWeeklyDone, weeklyGoal, weeklyPct, totalLeft } = data;

            box.innerHTML = `
                <div class="win95-title-bar">
                    <span>Flex.exe</span>
                    <div class="win95-btn-close" onclick="this.parentElement.parentElement.remove()">x</div>
                </div>
                <div class="win95-content">

                    <div class="win95-group">
                        <div class="win95-row">
                            <span class="win95-label">Today Work:</span>
                            <span>${Utils.formatTime(todayDone)} / 9.0 hrs</span>
                        </div>
                        <div class="win95-progress-bg">
                            <div class="win95-progress-fill" style="width: ${todayPct}%"></div>
                        </div>
                        <div class="win95-row" style="margin-top:4px;">
                            <span>Exit: <b>${realEndTime}</b></span>
                            <span class="${todayDone >= 9 ? 'blink' : ''}">
                                ${todayDone >= 9 ? 'Ready to Eject' : 'Processing...'}
                            </span>
                        </div>
                    </div>

                    ${todayDone >= 9 ? `
                    <div class="win95-group">
                        <div class="win95-row">
                            <span class="win95-label">Bonus Meal:</span>
                            <span>${Math.floor(mealPct)}%</span>
                        </div>
                        <div class="win95-progress-bg">
                            <div class="win95-progress-fill" style="width: ${mealPct}%; background: #008000;"></div>
                        </div>
                    </div>` : ''}

                    <div class="win95-group" style="margin-bottom:0;">
                        <div class="win95-row">
                            <span class="win95-label">Weekly Total:</span>
                            <span>${Utils.formatTime(realWeeklyDone)} / ${Utils.formatTime(weeklyGoal)}</span>
                        </div>
                        <div class="win95-progress-bg">
                            <div class="win95-progress-fill" style="width: ${weeklyPct}%; background: #800080;"></div>
                        </div>
                        <div style="text-align:right; margin-top:2px;">
                            ${realWeeklyDone >= weeklyGoal ? '<span class="blink">★ MISSION COMPLETE ★</span>' : `Rem: ${Utils.formatTime(totalLeft)}`}
                        </div>
                    </div>

                    <div class="win95-status-bar">
                        ${todayDone >= 9 ? 'System: Safe to shutdown.' : 'System: Working...'}
                    </div>
                </div>
            `;
        }
    };

    // =========================================================================
    // 5. LOGIC (로직)
    // =========================================================================
    function checkAlarms(todayDone) {
        const now = new Date();
        const currentMinute = now.getHours() * 60 + now.getMinutes();
        const todayKey = now.toDateString();

        // 고정 알람
        if (currentMinute !== State.lastCheckedMinute) {
            State.lastCheckedMinute = currentMinute;
            CONFIG.ALARMS.forEach(alarm => {
                const [h, m] = alarm.time.split(":").map(Number);
                if (currentMinute === h * 60 + m) {
                    const key = `${todayKey}|${alarm.time}`;
                    if (!State.alarmsTriggered.has(key)) {
                        State.alarmsTriggered.add(key);
                        Utils.triggerAlarm(alarm.title, alarm.body, alarm.emoji);
                    }
                }
            });
        }

        // 동적 알람
        const totalMinutes = Math.round(todayDone * 60);
        if (totalMinutes >= 530 && totalMinutes <= 535 && !State.dynamicAlarms.min10) {
            State.dynamicAlarms.min10 = true;
            Utils.triggerAlarm("Warning", "System shutdown in 10 mins.", "⚠️");
        }
        if (todayDone >= 9 && !State.dynamicAlarms.done9) {
            State.dynamicAlarms.done9 = true;
            Utils.triggerAlarm("Complete", "Task finished successfully.", "🆗");
        }
    }

    function run() {
        const todayStr = new Date().toDateString();
        if (State.lastResetDate !== todayStr) {
            State.lastResetDate = todayStr;
            State.alarmsTriggered.clear();
            State.dynamicAlarms = { min10: false, done9: false, meal: false };
            Utils.log("System Booting...");
        }

        // Flex 페이지 DOM 구조에 맞춰 데이터 파싱 (Flex 업데이트 시 수정 필요)
        const todayTag = document.querySelector('time[datetime*="T"]');
        const todayText = todayTag?.textContent?.trim() || "0분";
        const todayDone = Utils.parseTime(todayText);

        let baseWeeklyHours = 40;
        const weeklyGoal = baseWeeklyHours + CONFIG.GOALS.WEEKLY_LUNCH;

        const pastTag = document.querySelector('span.c-lmXAkT');
        const pastWeeklyExcludingToday = Utils.parseTime(pastTag?.textContent?.trim() || "0:00");
        const realWeeklyDone = pastWeeklyExcludingToday + todayDone;
        const totalLeft = Math.max(0, weeklyGoal - realWeeklyDone);
        const realEndTime = Utils.calculateEndTime(todayDone);

        const todayPct = Math.min(100, (todayDone / CONFIG.GOALS.DAILY) * 100);
        const weeklyPct = Math.min(100, (realWeeklyDone / weeklyGoal) * 100);
        const mealPct = todayDone >= CONFIG.GOALS.DAILY ? Math.min(100, ((todayDone - CONFIG.GOALS.DAILY) / CONFIG.GOALS.MEAL_QUALIFY) * 100) : 0;

        checkAlarms(todayDone);
        UI.render({ todayDone, todayPct, realEndTime, mealPct, realWeeklyDone, weeklyGoal, weeklyPct, totalLeft });
    }

    if (Notification.permission === "default") setTimeout(() => Notification.requestPermission(), 4000);
    Utils.log("Win95 Mode Loaded.");
    setTimeout(run, 1500);
    setInterval(run, 2000);
})();
