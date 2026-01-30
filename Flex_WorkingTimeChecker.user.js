// ==UserScript==
// @name         Flex 근무시간 체크 - 밥자격 + 실제 퇴근시간 완벽판
// @version      3.0.0
// @description  9시간 알람 + 2시간30분 밥자격 알람 + 실제 시계 기준 퇴근시간 표시
// @match        https://flex.team/time-tracking/my-work-record*
// @updateURL    https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @downloadURL  https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ==========================================================================
       설정값 (CONFIG.SYS)
       ========================================================================== */
    const DAILY_GOAL = 9.0;
    const MEAL_QUALIFY_HOURS = 2.5;
    const BASE_WEEKLY = 45;
    const EXTRA_HOURS = 8;
    const WEEKLY_GOAL = BASE_WEEKLY + EXTRA_HOURS;

    // 알람 멘트: 좀 더 구어체로 변경
    const FIXED_ALARMS = new Map([
        ["10:28", { title: "스크럼 준비", body: "팀장님 오시기 전입니다. 모니터 닦는 척 하세요.", emoji: "☕" }],
        ["12:29", { title: "점심시간 1분 전", body: "지갑 챙기셨나요? 맛점하러 튀어!", emoji: "🍱" }],
        ["18:59", { title: "저녁시간", body: "야근 확정... 법카로 맛있는 거라도 드세요.", emoji: "😭" }],
    ]);

    let triggeredFixed = new Set();
    let triggered9Hour10Min = false;
    let triggered9HourDone = false;
    let triggeredMeal = false;
    let lastCheckedMinute = -1;

    console.clear();
    console.log("%c[SYSTEM] Flex 95 로드됨...", "color:#008080;font-family:monospace;font-size:16px;background:#c0c0c0;padding:4px");

    /* ==========================================================================
       핵심 로직 (KERNEL32)
       ========================================================================== */

    function triggerAlarm(title, body = "", emoji = "⚠️") {
        const now = new Date();
        const displayTime = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

        // 타이틀바 깜빡임 효과
        let count = 0;
        const originalTitle = document.title;
        const titleInterval = setInterval(() => {
            document.title = count++ % 2 ? `>>> ${title} <<<` : originalTitle;
            if (count > 20) { clearInterval(titleInterval); document.title = originalTitle; }
        }, 500);

        if (Notification.permission === "granted") {
            new Notification(`[Flex 95] ${title}`, {
                body: `${body}\n(발생 시각: ${displayTime})`,
                icon: "https://win98icons.alexmeub.com/icons/png/msg_warning-0.png",
                requireInteraction: true
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
            triggerAlarm("퇴근 10분 전", "짐 싸기 시작하세요. 눈치 챙겨!", "🎒");
        }
        if (totalMinutes >= 540 && totalMinutes <= 545 && !triggered9HourDone) {
            triggered9HourDone = true;
            triggerAlarm("★ 퇴근 가능 ★", "지금 나가는 사람이 승리자입니다.", "🚪");
        }
    }

    function checkMealQualify(todayDone) {
        if (todayDone >= DAILY_GOAL + MEAL_QUALIFY_HOURS && !triggeredMeal) {
            triggeredMeal = true;
            triggerAlarm("야근 식대 해금됨", "고생하셨습니다. 비싼 거 드세요.", "💳");
        }
    }

    function parseHM(str) {
        if (!str) return 0;
        str = str.trim().replace(/\s/g, '');
        const onlyHour = str.match(/^(\d+)시간$/);
        if (onlyHour) return parseInt(onlyHour[1]);
        const hourMin = str.match(/^(\d+)시간(\d+)분?$/);
        if (hourMin) return parseInt(hourMin[1]) + (parseInt(hourMin[2]) || 0) / 60;
        const colon = str.match(/^(\d+):(\d+)$/);
        if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
        const onlyMin = str.match(/^(\d+)분$/);
        if (onlyMin) return parseInt(onlyMin[1]) / 60;
        return 0;
    }

    function format(h) {
        const hh = Math.floor(h);
        const mm = Math.floor((h - hh) * 60);
        return `${hh}:${mm.toString().padStart(2, "0")}`;
    }

    function getRealEndTime(todayDone) {
        const now = new Date();
        const workedMs = todayDone * 60 * 60 * 1000;
        const targetMs = 9 * 60 * 60 * 1000;
        const remainMs = targetMs - workedMs;
        if (remainMs <= 0) return "Right Now!";
        const endTime = new Date(now.getTime() + remainMs);
        return endTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function getRemainDays() {
        const d = new Date().getDay();
        if (d === 0 || d === 6) return 0;
        return 5 - d;
    }

    /* ==========================================================================
       UI 렌더링 (USER32 / GDI)
       ========================================================================== */
    function run() {
        checkFixedTimeAlarms();

        const todayTag = document.querySelector('time[datetime*="T"]');
        const todayText = todayTag?.textContent?.trim() || "0분";
        const todayDone = parseHM(todayText);

        check9HourAlarms(todayDone);
        checkMealQualify(todayDone);

        // 데이터 계산
        const pastTag = document.querySelector('span.c-lmXAkT');
        const pastWeeklyExcludingToday = parseHM(pastTag?.textContent?.trim() || "0:00");
        const weekday = new Date().getDay();
        const workedDaysExcludingToday = (weekday >= 1 && weekday <= 5) ? weekday - 1 : 0;
        const baseFromPastDays = workedDaysExcludingToday * 9;
        const extraFromPastDays = Math.max(0, pastWeeklyExcludingToday - baseFromPastDays);
        const extraFromToday = Math.max(0, todayDone - 9);
        const extraDone = extraFromPastDays + extraFromToday;
        const extraLeft = Math.max(0, EXTRA_HOURS - extraDone);
        const extraPct = Math.min(100, (extraDone / EXTRA_HOURS) * 100);
        const remainDays = getRemainDays();
        const avgExtraPerDay = remainDays > 0 ? extraLeft / remainDays : 0;
        const realWeeklyDone = pastWeeklyExcludingToday + todayDone;
        const weeklyPct = Math.min(100, (realWeeklyDone / WEEKLY_GOAL) * 100);
        const mealPct = todayDone >= 9 ? Math.min(100, ((todayDone - 9) / MEAL_QUALIFY_HOURS) * 100) : 0;

        const realEndTime = getRealEndTime(todayDone);

        // UI 생성
        let box = document.getElementById("win95-flex-box");
        if (!box) {
            box = document.createElement("div");
            box.id = "win95-flex-box";
            document.body.appendChild(box);
        }

        // --- 멘트 생성기 (감정 상태 반영) ---
        let statusIcon = "💿";
        let statusMsg = "시스템 대기 중...";
        let statusColor = "#000";

        if (todayDone < 0.5) { statusIcon="☕"; statusMsg = "뇌 부팅 중... 커피 수혈 시급"; }
        else if (todayDone < 3.5) { statusIcon="🔥"; statusMsg = "오전 업무 처리 중 (영혼 없음)"; }
        else if (todayDone < 4.5) { statusIcon="🍱"; statusMsg = "점심 메뉴 고민 중..."; }
        else if (todayDone < 6.0) { statusIcon="💤"; statusMsg = "식곤증과 사투 중..."; }
        else if (todayDone < 8.0) { statusIcon="💾"; statusMsg = "시간이 멈춘 것 같습니다..."; }
        else if (todayDone < 8.8) { statusIcon="👀"; statusMsg = "눈치 게임 시작. 퇴근각 재는 중"; }
        else if (todayDone >= 9) { statusIcon="🚀"; statusMsg = "★ 시스템 종료 가능 ★"; statusColor = "blue"; }

        if(todayDone >= 11.5) { statusIcon="🍗"; statusMsg = "야근 전사... 치킨 시키시죠."; statusColor = "red"; }

        // HTML 렌더링
        box.innerHTML = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=DungGeunMo&display=swap');

            #win95-flex-box * { box-sizing: border-box; }
            #win95-flex-box {
                position: fixed; bottom: 24px; right: 24px; width: 340px;
                background-color: #c0c0c0;
                border: 2px solid #dfdfdf;
                border-right-color: #404040; border-bottom-color: #404040;
                box-shadow: 4px 4px 10px rgba(0,0,0,0.4);
                font-family: 'Gulim', 'DungGeunMo', monospace;
                z-index: 999999; font-size: 13px; color: #000;
                user-select: none;
            }
            .win95-title-bar {
                background: linear-gradient(90deg, #000080, #1084d0);
                padding: 3px 4px; display: flex; justify-content: space-between; align-items: center;
                color: white; font-weight: bold; letter-spacing: 0.5px;
            }
            .win95-btn-close {
                width: 16px; height: 14px; background: #c0c0c0;
                border: 1px solid #fff; border-right-color: #404040; border-bottom-color: #404040;
                font-size: 10px; line-height: 11px; text-align: center; color: black; cursor: pointer;
            }
            .win95-content { padding: 12px; }

            /* 가독성을 위한 섹션 박스 (Group Box) */
            .win95-group-box {
                border: 1px solid #808080; border-right-color: #fff; border-bottom-color: #fff;
                padding: 8px; margin-bottom: 12px; position: relative;
            }
            .win95-legend {
                position: absolute; top: -8px; left: 8px; background: #c0c0c0;
                padding: 0 4px; font-weight: bold; color: #000080; font-size: 12px;
            }

            .row { display: flex; justify-content: space-between; margin-bottom: 4px; align-items: flex-end; }
            .val-large { font-size: 15px; font-weight: bold; color: #000; }
            .val-sub { font-size: 12px; color: #666; }

            /* 프로그레스 바 (가시성 강화) */
            .p-bar-frame {
                height: 18px; background: #fff;
                border: 1px solid #808080; border-right-color: #fff; border-bottom-color: #fff;
                box-shadow: inset 1px 1px 0 #000; padding: 2px;
                position: relative;
            }
            .p-bar-fill {
                height: 100%; background: #000080;
                width: 0%; transition: width 0.5s;
                display: flex; align-items: center; justify-content: center;
                overflow: hidden;
            }
            /* 95 스타일 격자 무늬 오버레이 */
            .p-bar-fill::after {
                content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background-image: linear-gradient(90deg, transparent 50%, rgba(255,255,255,0.2) 50%);
                background-size: 4px 100%;
            }

            .status-bar {
                border: 1px solid #808080; border-right-color: #fff; border-bottom-color: #fff;
                background: #c0c0c0; padding: 4px 6px; margin-top: 8px;
                box-shadow: inset 1px 1px 0 #000;
                font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .blink-text { animation: blink 1s infinite; color: red !important; }
            @keyframes blink { 50% { opacity: 0; } }
        </style>

        <div class="win95-title-bar">
            <span>💾 GPUN_Work_Timer_Pro</span>
            <div class="win95-btn-close">x</div>
        </div>

        <div class="win95-content">

            <div class="win95-group-box">
                <span class="win95-legend">Today's Mission</span>
                <div class="row">
                    <span>근무 시간</span>
                    <span class="val-large">${format(todayDone)} <span style="font-size:12px; font-weight:normal">/ 9.0</span></span>
                </div>
                <div class="p-bar-frame">
                    <div class="p-bar-fill" style="width:${Math.min(100, (todayDone/9)*100)}%;"></div>
                </div>
                <div class="row" style="margin-top:6px;">
                    <span style="font-weight:bold; color:${todayDone>=9 ? 'blue' : '#000'}">
                        ${todayDone >= 9 ? "🏁 미션 클리어!" : "🏃‍♂️ 퇴근까지"}
                    </span>
                    <span class="val-large" style="color:${todayDone>=9 ? 'blue' : '#d00000'}">
                        ${todayDone >= 9 ? "안녕히 가세요!" : format(9-todayDone) + " 남음"}
                    </span>
                </div>
                <div style="text-align:right; font-size:11px; color:#555;">
                    예상 퇴근: <b>${realEndTime}</b>
                </div>
            </div>

            ${todayDone >= 9 ? `
            <div class="win95-group-box">
                <span class="win95-legend" style="color:#d00000">Night Meal Bonus</span>
                <div class="row">
                    <span>식대 자격</span>
                    <span>${todayDone>=11.5 ? '<span class="blink-text">획득 완료!</span>' : format(11.5-todayDone)+' 더 버텨'}</span>
                </div>
                <div class="p-bar-frame">
                    <div class="p-bar-fill" style="width:${mealPct}%; background:#d00000;"></div>
                </div>
            </div>` : ''}

            <div class="win95-group-box">
                <span class="win95-legend">Weekly Status</span>
                <div class="row">
                    <span>주간 누적</span>
                    <span>${format(realWeeklyDone)} / 53h</span>
                </div>
                <div class="p-bar-frame" style="height:10px; margin-bottom:8px">
                    <div class="p-bar-fill" style="width:${weeklyPct}%; background:#008080;"></div>
                </div>

                <div class="row">
                    <span>잔여 OT</span>
                    <span>${format(extraDone)} / 8h</span>
                </div>
                <div class="p-bar-frame" style="height:10px;">
                    <div class="p-bar-fill" style="width:${extraPct}%; background:#808000;"></div>
                </div>
                <div style="text-align:right; font-size:11px; margin-top:4px; color:#444;">
                    하루 평균 <b>${avgExtraPerDay <= 0 ? '0' : format(avgExtraPerDay)}</b>시간 더 하면 됨
                </div>
            </div>

            <div class="status-bar" style="color:${statusColor}">
                ${statusIcon} ${statusMsg}
            </div>

        </div>
        `;
    }

    /* ==========================================================================
       AUTOEXEC.BAT (실행 루프)
       ========================================================================== */
    let lastResetDate = null;
    setInterval(() => {
        const now = new Date();
        const today = now.toDateString();
        if (lastResetDate !== today) {
            lastResetDate = today;
            triggeredFixed.clear();
            triggered9Hour10Min = false;
            triggered9HourDone = false;
            triggeredMeal = false;
            console.log("날짜 변경됨. 카운터 리셋.");
        }
        run();
    }, 2000);

    if (Notification.permission === "default") {
        setTimeout(() => Notification.requestPermission(), 4000);
    }

    setTimeout(run, 1500);
})();
