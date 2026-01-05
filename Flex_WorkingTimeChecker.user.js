// ==UserScript==
// @name         Flex 근무시간 체크 - 밥자격 + 실제 퇴근시간 완벽판
// @version      1.6.0
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
            DAILY: 9.0,             // 9시간 체류
            MEAL_QUALIFY: 2.5,      // 저녁 식대 (9+2.5)
            WEEKLY_LUNCH: 5.0       // 주간 점심
        },
        ALARMS: [
            { time: "10:28", title: "스크럼 준비!", body: "오늘도 찢어보자고! 🔥", emoji: "☕" },
            { time: "12:29", title: "점심 시간!", body: "맛점하고 텐션 올려! 🍔", emoji: "🍱" },
            { time: "18:59", title: "저녁 시간!", body: "법카로 맛난거 먹자 💳", emoji: "🌙" }
        ],
        // MZ 스타일 네온 팔레트
        THEME: {
            TODAY:  { bg: 'linear-gradient(135deg, #00F5A0 0%, #00D9F5 100%)', text: 'linear-gradient(to right, #00F5A0, #00D9F5)' },
            MEAL:   { bg: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 99%, #FECFEF 100%)', text: 'linear-gradient(to right, #FF9A9E, #FECFEF)' }, // 핑크 팝
            WEEKLY: { bg: 'linear-gradient(135deg, #A18CD1 0%, #FBC2EB 100%)', text: 'linear-gradient(to right, #d585ff, #00ffee)' },
            BADGE:  { bg: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.3)' }
        }
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
            if (remainMs <= 0) return "Right Now!";
            const endTime = new Date(now.getTime() + remainMs);
            return endTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        },

        triggerAlarm(title, body = "", emoji = "🔔") {
            const now = new Date();
            const displayTime = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

            let count = 0;
            const originalTitle = document.title;
            const titleInterval = setInterval(() => {
                document.title = count++ % 2 ? `${emoji} ${title}` : originalTitle;
                if (count > 20) { clearInterval(titleInterval); document.title = originalTitle; }
            }, 500);

            // 알람 시 화면 전체가 파티 조명처럼 번쩍임
            const flash = document.createElement("div");
            flash.style.cssText = `
                pointer-events:none;position:fixed;top:0;left:0;width:100vw;height:100vh;
                background: linear-gradient(45deg, rgba(255,0,200,0.3), rgba(0,255,255,0.3));
                z-index:999999;opacity:0;transition:opacity 0.3s ease-in-out; mix-blend-mode: screen;
            `;
            document.body.appendChild(flash);
            let toggle = 0;
            const flashInterval = setInterval(()=>{
                 flash.style.opacity = toggle++ % 2 ? "1" : "0.3";
            }, 150);
            setTimeout(() => { clearInterval(flashInterval); flash.remove(); }, 1500);

            if (Notification.permission === "granted") {
                new Notification(`${emoji} ${title}`, {
                    body: `${body}\n(${displayTime})`,
                    icon: "https://flex.team/favicon.ico",
                    requireInteraction: false, renotify: true, tag: "alarm-" + Date.now()
                });
            }
        },
        log(msg) {
            console.log(`%c✨ ${msg}`, "color:#fff;background:#7b2ff7;padding:4px 8px;border-radius:10px;font-weight:bold;");
        }
    };

    // =========================================================================
    // 4. UI (MZ Neon Style)
    // =========================================================================
    const UI = {
        containerId: "flex-mz-box",

        injectStyles() {
            if (document.getElementById("flex-mz-style")) return;
            const css = `
                @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');

                #${this.containerId} {
                    position: fixed; bottom: 30px; right: 30px; width: 360px; padding: 26px;
                    border-radius: 28px;
                    /* 딥 다크 + 글래스 */
                    background: rgba(18, 18, 28, 0.85);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    /* 네온 테두리 */
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    box-shadow:
                        0 10px 40px -10px rgba(0,0,0,0.8),
                        inset 0 0 0 1px rgba(255,255,255,0.1),
                        0 0 20px rgba(123, 47, 247, 0.2); /* 보라색 글로우 */
                    font-family: 'Pretendard', sans-serif;
                    color: #fff; z-index: 999999;
                    transform: translateZ(0);
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                #${this.containerId}:hover {
                    transform: translateY(-8px) scale(1.02);
                    box-shadow:
                        0 20px 50px -10px rgba(0,0,0,0.8),
                        0 0 30px rgba(123, 47, 247, 0.4);
                    border-color: rgba(255,255,255,0.3);
                }

                .mz-row { margin-bottom: 24px; position: relative; }
                .mz-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }

                /* 이모지 둥둥 애니메이션 */
                .mz-emoji {
                    font-size: 22px; margin-right: 10px; display:inline-block;
                    animation: float 3s ease-in-out infinite;
                }
                @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

                .mz-title {
                    font-size: 16px; font-weight: 800; letter-spacing: -0.5px;
                    text-transform: uppercase;
                }
                .mz-value { font-size: 14px; font-weight: 600; color: #aeb9cc; font-feature-settings: "tnum"; }

                /* 그라데이션 텍스트 (이모지 제외) */
                .gradient-text {
                    background-clip: text; -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .mz-bar-bg {
                    height: 12px; background: rgba(255,255,255,0.08); border-radius: 100px; overflow: hidden;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
                }
                .mz-bar-fill {
                    height: 100%; border-radius: 100px; position: relative;
                    transition: width 1s cubic-bezier(0.22, 1, 0.36, 1);
                }
                /* 바 위의 빛나는 효과 */
                .mz-bar-fill::after {
                    content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
                    transform: translateX(-100%);
                    animation: shimmer 2s infinite;
                }
                @keyframes shimmer { 100% { transform: translateX(150%); } }

                .mz-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }

                .mz-badge {
                    padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800;
                    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
                    color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                }
                .highlight-time {
                    font-weight: 800; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.6);
                }
            `;
            const style = document.createElement("style");
            style.id = "flex-mz-style";
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

            // 색상 테마 단축키
            const T = CONFIG.THEME;

            box.innerHTML = `
                <div class="mz-row">
                    <div class="mz-header">
                        <div style="display:flex;align-items:center;">
                            <span class="mz-emoji">⚡</span>
                            <span class="mz-title gradient-text" style="background-image:${T.TODAY.text}">Today Vibes</span>
                        </div>
                        <div class="mz-value">${Utils.formatTime(todayDone)} / 9.0</div>
                    </div>
                    <div class="mz-bar-bg">
                        <div class="mz-bar-fill" style="width: ${todayPct}%; background: ${T.TODAY.bg}; box-shadow: 0 0 15px #00F5A0;"></div>
                    </div>
                    <div class="mz-footer">
                        <span style="font-size:12px; color:#aaa;">퇴근각: <span class="highlight-time">${realEndTime}</span></span>
                        <span class="mz-badge" style="${todayDone >= 9 ? 'background:#00F5A0;color:#000;border:none;' : ''}">
                            ${todayDone >= 9 ? '퇴근 쌉가능 🏄‍♂️' : Utils.formatTime(9 - todayDone) + ' 존버 🔥'}
                        </span>
                    </div>
                </div>

                ${todayDone >= 9 ? `
                <div class="mz-row">
                    <div class="mz-header">
                        <div style="display:flex;align-items:center;">
                            <span class="mz-emoji">🍗</span>
                            <span class="mz-title gradient-text" style="background-image:${T.MEAL.text}">Bob Time</span>
                        </div>
                        <div class="mz-value">${Utils.formatTime(Math.max(0, todayDone - 9))} / 2.5</div>
                    </div>
                    <div class="mz-bar-bg">
                        <div class="mz-bar-fill" style="width: ${mealPct}%; background: ${T.MEAL.bg}; box-shadow: 0 0 15px #FF9A9E;"></div>
                    </div>
                    <div class="mz-footer">
                        <span style="font-size:12px; color:#aaa;">법카 찬스</span>
                        <span class="mz-badge" style="${todayDone >= 11.5 ? 'background:#FF9A9E;color:#000;border:none;' : ''}">
                            ${todayDone >= 11.5 ? '획득 완료 🤑' : Utils.formatTime(11.5 - todayDone) + ' 남음'}
                        </span>
                    </div>
                </div>` : ''}

                <div class="mz-row" style="margin-bottom:0;">
                    <div class="mz-header">
                        <div style="display:flex;align-items:center;">
                            <span class="mz-emoji">💎</span>
                            <span class="mz-title gradient-text" style="background-image:${T.WEEKLY.text}">Weekly Goal</span>
                        </div>
                        <div class="mz-value">${Utils.formatTime(realWeeklyDone)} / ${Utils.formatTime(weeklyGoal)}</div>
                    </div>
                    <div class="mz-bar-bg">
                        <div class="mz-bar-fill" style="width: ${weeklyPct}%; background: ${T.WEEKLY.bg}; box-shadow: 0 0 15px #A18CD1;"></div>
                    </div>
                    <div class="mz-footer">
                        <span style="font-size:12px; color:#aaa;">주간 퀘스트</span>
                        <span class="mz-badge" style="${realWeeklyDone >= weeklyGoal ? 'background:#A18CD1;color:#fff;border:none;' : ''}">
                            ${realWeeklyDone >= weeklyGoal ? '클리어! 🏆' : Utils.formatTime(totalLeft) + ' 남음'}
                        </span>
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
            Utils.triggerAlarm("집 갈 준비 해!!", "10분 남았다. 짐 싸라. 🎒", "🏃‍♂️");
        }
        if (totalMinutes >= 540 && totalMinutes <= 545 && !State.dynamicAlarms.done9) {
            State.dynamicAlarms.done9 = true;
            Utils.triggerAlarm("퇴근 시간이다!!!", "뒤도 돌아보지 말고 튀어!! 🚀", "🏠");
        }
        if (todayDone >= (CONFIG.GOALS.DAILY + CONFIG.GOALS.MEAL_QUALIFY) && !State.dynamicAlarms.meal) {
            State.dynamicAlarms.meal = true;
            Utils.triggerAlarm("야근 식대 획득", "고생했다.. 맛난거 시켜먹자 🍗", "💳");
        }
    }

    function run() {
        // 날짜 리셋 체크
        const todayStr = new Date().toDateString();
        if (State.lastResetDate !== todayStr) {
            State.lastResetDate = todayStr;
            State.alarmsTriggered.clear();
            State.dynamicAlarms = { min10: false, done9: false, meal: false };
            Utils.log("New Day, New Vibes ✨");
        }

        // 데이터 파싱
        const todayTag = document.querySelector('time[datetime*="T"]');
        const todayText = todayTag?.textContent?.trim() || "0분";
        const todayDone = Utils.parseTime(todayText);

        const baseTimeTag = document.querySelector('.c-hSTiUQ');
        let baseWeeklyHours = 40;
        if (baseTimeTag) {
            const baseText = baseTimeTag.textContent.replace('-', '').trim();
            baseWeeklyHours = Utils.parseTime(baseText);
        }
        const weeklyGoal = baseWeeklyHours + CONFIG.GOALS.WEEKLY_LUNCH;

        const pastTag = document.querySelector('span.c-lmXAkT');
        const pastWeeklyExcludingToday = Utils.parseTime(pastTag?.textContent?.trim() || "0:00");
        const realWeeklyDone = pastWeeklyExcludingToday + todayDone;
        const totalLeft = Math.max(0, weeklyGoal - realWeeklyDone);
        const realEndTime = Utils.calculateEndTime(todayDone);

        // 퍼센트 계산
        const todayPct = Math.min(100, (todayDone / CONFIG.GOALS.DAILY) * 100);
        const weeklyPct = Math.min(100, (realWeeklyDone / weeklyGoal) * 100);
        const mealPct = todayDone >= CONFIG.GOALS.DAILY ? Math.min(100, ((todayDone - CONFIG.GOALS.DAILY) / CONFIG.GOALS.MEAL_QUALIFY) * 100) : 0;

        // 실행
        checkAlarms(todayDone);
        UI.render({ todayDone, todayPct, realEndTime, mealPct, realWeeklyDone, weeklyGoal, weeklyPct, totalLeft });
    }

    // 초기 실행
    if (Notification.permission === "default") setTimeout(() => Notification.requestPermission(), 4000);
    Utils.log("MZ Flex Checker Loaded 🤘");
    setTimeout(run, 1500);
    setInterval(run, 2000);
})();
