// ==UserScript==
// @name         Flex 근무시간 체크 + 익명채팅 (레트로 완벽판)
// @version      5.0.0
// @description  찐 윈도우95 UI + 랜덤 뻘글 상태창 + 익명 비밀채팅
// @match        https://flex.team/time-tracking/my-work-record*
// @updateURL    https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @downloadURL  https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DAILY_GOAL = 9.0;
    const MEAL_QUALIFY_HOURS = 2.5;
    const BASE_WEEKLY = 45;
    const EXTRA_HOURS = 8;
    const WEEKLY_GOAL = BASE_WEEKLY + EXTRA_HOURS;

    const FIREBASE_BASE_URL = "https://monkeychatting-default-rtdb.firebaseio.com/chat";
    const FIREBASE_URL = `${FIREBASE_BASE_URL}.json`;
    const NICKNAME = "루팡_" + Math.floor(Math.random() * 9999).toString().padStart(4, '0');

    /* ==========================================================================
       랜덤 멘트 자판기
       ========================================================================== */
    const ALARM_MENT = {
        "10:28": {
            title: "스크럼 1분 전",
            emoji: "☕",
            bodies: [
                "팀장님 오십니다. 알트 탭 장전하세요.",
                "영혼 없는 '네, 알겠습니다' 발사 준비.",
                "어제 한 일: 숨쉬기, 오늘 할 일: 퇴근하기",
                "모니터 닦는 척하면서 바쁜 척 하세요.",
                "커피 수혈이 시급합니다. 탕비실로 튀어!"
            ]
        },
        "12:29": {
            title: "점심시간 1분 전",
            emoji: "🍱",
            bodies: [
                "지갑 챙기셨나요? 맛점하러 튀어!",
                "엘리베이터 눈치게임 시작! 늦으면 줄 섭니다.",
                "오후를 버티기 위한 칼로리 비축 시간입니다.",
                "오늘은 법카 찬스 없나요? 내돈내산 ㅠ",
                "점심 메뉴 고르는 게 오늘 가장 어려운 업무입니다."
            ]
        },
        "18:59": {
            title: "저녁식사 시간",
            emoji: "😭",
            bodies: [
                "야근 확정... 법카로 맛있는 거라도 드세요.",
                "집에 가고 싶다... 격렬하게 집에 가고 싶다.",
                "회사에 뼈를 묻지 마세요, 집에 묻으세요.",
                "야근 요정이 당신을 찾아왔습니다 (절망)",
                "지금 나가는 저 사람, 혹시 배신자...?"
            ]
        }
    };

    const STATUS_MENT = {
        level1: [
            "뇌 부팅 중... (진행률 12%)", "집에서 나왔는데 집에 가고 싶다.", "아직도 오전이라니, 시계 고장난 듯.", "모니터 뚫어지게 보며 딴 생각 하는 중.", "아침부터 기가 빨립니다...", "오늘따라 키보드 소리가 거슬리네요."
        ],
        level2: [
            "식곤증과의 사투... 눈꺼풀이 천근만근", "커피 약발이 떨어져 갑니다. 리필 요망.", "점심 먹은 거 다 소화됨. 간식 마렵다.", "의미 없는 마우스 딸깍거림 시전 중.", "팀장님과 눈 마주침. (회피 기동 성공)", "이 시간대가 제일 시간이 안 갑니다."
        ],
        level3: [
            "퇴근 쿨타임 도는 중... 버텨야 한다.", "슬슬 가방 지퍼를 열어둘 시간입니다.", "내일의 나에게 업무를 토스 준비 중.", "엉덩이에 쥐가 날 것 같습니다.", "창밖을 보며 자유를 갈망하는 중.", "오늘 저녁은 뭘 먹어야 소문이 날까."
        ],
        level4: [
            "눈치 게임 시작. 누가 먼저 일어날 것인가.", "마음은 이미 지하철 탔습니다.", "모니터를 끄는 상상을 했습니다. 짜릿해.", "외투를 슬쩍 의자에 걸쳐둡니다.", "1분이 1시간처럼 느껴지는 매직."
        ],
        level5: [
            "★ 시스템 종료 가능 ★ 당장 나가세요!", "승리자! 당신의 자유를 쟁취했습니다.", "아직도 안 가셨나요? 회사의 노예...", "치킨 한 마리 시켜도 무죄인 시간입니다.", "야근 수당이라도 달달하게 챙깁시다 ㅠ"
        ]
    };

    let triggeredFixed = new Set();
    let triggered9Hour10Min = false;
    let triggered9HourDone = false;
    let triggeredMeal = false;
    let lastCheckedMinute = -1;

    console.clear();
    console.log("%c[SYSTEM] GPUN Work Manager Pro (Retro + Stats) 가동...", "color:#fff;font-weight:bold;font-size:16px;background:#000080;padding:4px");

    /* ==========================================================================
       네트워크 로직
       ========================================================================== */
    let isFetching = false;
    let lastChatCount = 0;

    async function fetchChat() {
        if (isFetching || !document.getElementById("win95-flex-box")) return;
        isFetching = true;

        try {
            const response = await fetch(FIREBASE_URL, { method: "GET" });
            isFetching = false;

            const chatBox = document.getElementById("win95-chat-display");
            if (!chatBox) return;

            if (response.ok) {
                const data = await response.json();
                if (data !== null) {
                    renderChat(data);
                    pruneChat(data);
                } else {
                    chatBox.innerHTML = "<div style='color:#888; text-align:center; margin-top:30px; font-family:Gulim;'>첫 메시지를 남겨보세요!</div>";
                }
            }
        } catch (error) {
            isFetching = false;
        }
    }

    async function sendChat(message) {
        message = message.trim().substring(0, 20);
        if (!message) return;

        const payload = {
            name: NICKNAME,
            msg: message,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };

        try {
            const response = await fetch(FIREBASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (response.ok) fetchChat();
        } catch (error) {}
    }

    function pruneChat(data) {
        const keys = Object.keys(data);
        if (keys.length > 20) {
            const keysToDelete = keys.slice(0, keys.length - 20);
            keysToDelete.forEach(key => {
                fetch(`${FIREBASE_BASE_URL}/${key}.json`, { method: "DELETE" }).catch(()=>{});
            });
        }
    }

    function renderChat(data) {
        const chatBox = document.getElementById("win95-chat-display");
        if (!chatBox) return;

        let chatHtml = "";
        const keys = Object.keys(data);

        keys.slice(-20).forEach(key => {
            const item = data[key];
            const isMe = item.name === NICKNAME;
            const color = isMe ? "#000080" : "#000";
            chatHtml += `<div style="margin-bottom:4px; word-break:break-all; line-height:1.2;">
                <span style="color:${color}; font-weight:bold;">[${item.name}]</span> ${item.msg}
                <span style="font-size:10px; color:#888;">(${item.time})</span>
            </div>`;
        });

        chatBox.innerHTML = chatHtml;
        if (keys.length !== lastChatCount) {
            chatBox.scrollTop = chatBox.scrollHeight;
            lastChatCount = keys.length;
        }
    }

    /* ==========================================================================
       시간 계산 및 알람 로직
       ========================================================================== */
    function getRandomMent(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getStatusMentByTime(todayDone) {
        const minuteSeed = new Date().getMinutes();
        let mentArray = STATUS_MENT.level1;

        if (todayDone >= 9.0) mentArray = STATUS_MENT.level5;
        else if (todayDone >= 8.5) mentArray = STATUS_MENT.level4;
        else if (todayDone >= 6.0) mentArray = STATUS_MENT.level3;
        else if (todayDone >= 3.0) mentArray = STATUS_MENT.level2;

        return mentArray[minuteSeed % mentArray.length];
    }

    function triggerAlarm(title, body = "", emoji = "⚠️") {
        const now = new Date();
        const displayTime = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

        let count = 0;
        const originalTitle = document.title;
        const titleInterval = setInterval(() => {
            document.title = count++ % 2 ? `>>> ${title} <<<` : originalTitle;
            if (count > 20) { clearInterval(titleInterval); document.title = originalTitle; }
        }, 500);

        if (Notification.permission === "granted") {
            new Notification(`[GPUN] ${title}`, {
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

        const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        const todayKey = now.toDateString();

        if (ALARM_MENT[timeStr]) {
            const key = `${todayKey}|${timeStr}`;
            if (!triggeredFixed.has(key)) {
                triggeredFixed.add(key);
                const info = ALARM_MENT[timeStr];
                triggerAlarm(info.title, getRandomMent(info.bodies), info.emoji);
            }
        }
    }

    function check9HourAlarms(todayDone) {
        const totalMinutes = Math.round(todayDone * 60);
        if (totalMinutes >= 530 && totalMinutes <= 535 && !triggered9Hour10Min) {
            triggered9Hour10Min = true;
            triggerAlarm("퇴근 10분 전", getRandomMent(STATUS_MENT.level4), "🎒");
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
       UI 렌더링
       ========================================================================== */
    function run() {
        if (!location.href.includes("time-tracking")) {
            const box = document.getElementById("win95-flex-box");
            if (box) box.style.display = "none";
            return;
        }

        try {
            checkFixedTimeAlarms();

            const todayTag = document.querySelector('time[datetime*="T"]');
            const todayText = todayTag?.textContent?.trim() || "0분";
            const todayDone = parseHM(todayText);

            check9HourAlarms(todayDone);
            checkMealQualify(todayDone);

            // 데이터 계산 (주간 통계 복구!)
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

            let statusIcon = todayDone >= 9 ? "🚀" : "💾";
            let statusMsg = getStatusMentByTime(todayDone);
            let statusColor = todayDone >= 9 ? "blue" : "#000";
            if (todayDone >= 11.5) statusColor = "red";

            let box = document.getElementById("win95-flex-box");

            if (!box) {
                box = document.createElement("div");
                box.id = "win95-flex-box";
                document.body.appendChild(box);

                box.innerHTML = `
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=DungGeunMo&display=swap');

                    .win95-border-outset {
                        border: 1px solid #dfdfdf;
                        box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
                    }
                    .win95-border-inset {
                        background: #fff;
                        border: 1px solid #0a0a0a;
                        box-shadow: inset 1px 1px #808080, inset -1px -1px #fff;
                    }
                    .win95-btn {
                        background: #c0c0c0; cursor: default;
                        box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
                    }
                    .win95-btn:active {
                        box-shadow: inset 1px 1px #0a0a0a, inset 2px 2px #808080;
                        padding-top: 1px; padding-left: 1px;
                    }

                    #win95-flex-box * { box-sizing: border-box; }
                    #win95-flex-box {
                        position: fixed; bottom: 24px; right: 24px; width: 340px;
                        background-color: #c0c0c0;
                        font-family: 'Gulim', 'DungGeunMo', monospace;
                        z-index: 2147483647 !important;
                        font-size: 13px; color: #000; user-select: none;
                    }

                    .win95-title-bar {
                        background: #000080; padding: 3px; display: flex; justify-content: space-between; align-items: center;
                        color: white; font-weight: bold; font-family: 'DungGeunMo';
                    }

                    .win95-btn-close {
                        width: 16px; height: 14px; font-size: 10px; line-height: 12px; text-align: center; color: black; font-weight: bold;
                    }

                    .win95-content { padding: 8px; }

                    .win95-group-box {
                        border: 1px solid #808080; border-right-color: #fff; border-bottom-color: #fff;
                        padding: 10px 8px 8px; margin-bottom: 10px; position: relative;
                    }
                    .win95-legend {
                        position: absolute; top: -7px; left: 8px; background: #c0c0c0;
                        padding: 0 4px; color: #000; font-size: 12px; font-family: 'Gulim';
                    }

                    .row { display: flex; justify-content: space-between; margin-bottom: 4px; align-items: flex-end; }
                    .val-large { font-size: 14px; font-weight: bold; font-family: 'DungGeunMo'; color: #000; }

                    .p-bar-frame { height: 16px; padding: 1px; }
                    .p-bar-fill { height: 100%; background: #000080; transition: width 0.5s; }

                    .status-bar {
                        padding: 3px 6px; margin-top: 6px; font-size: 12px; font-family: 'Gulim';
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    }

                    #win95-chat-display::-webkit-scrollbar { width: 15px; }
                    #win95-chat-display::-webkit-scrollbar-track { background: #dfdfdf; border-left: 1px solid #fff; }
                    #win95-chat-display::-webkit-scrollbar-thumb {
                        background: #c0c0c0;
                        box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
                    }
                </style>

                <div class="win95-border-outset">
                    <div class="win95-title-bar">
                        <span style="margin-left:2px;">💾 GPUN_Timer & Chat</span>
                        <div class="win95-btn win95-btn-close" onclick="document.getElementById('win95-flex-box').style.display='none'">X</div>
                    </div>

                    <div class="win95-content">
                        <div id="win95-timer-stats"></div>

                        <div class="win95-group-box" style="margin-top:8px;">
                            <span class="win95-legend">Local Area Network (LAN)</span>
                            <div id="win95-chat-display" class="win95-border-inset" style="height:90px; overflow-y:scroll; padding:4px; font-size:12px; margin-bottom:6px; user-select:text; font-family:'Gulim'; line-height:1.4;">
                                <span style="color:#888;">모뎀 연결 중... 삐이-</span>
                            </div>
                            <div style="display:flex; gap:4px;">
                                <input type="text" id="win95-chat-input" class="win95-border-inset" maxlength="20" placeholder="아무말 대잔치 (20자)" autocomplete="off" style="flex:1; padding:2px 4px; font-family:'Gulim'; outline:none;">
                                <div id="win95-chat-send" class="win95-btn" style="padding:2px 10px; font-family:'Gulim'; font-size:12px; text-align:center; display:flex; align-items:center; justify-content:center;">보내기</div>
                            </div>
                        </div>
                    </div>
                </div>
                `;

                setTimeout(() => {
                    const chatInput = document.getElementById("win95-chat-input");
                    const chatBtn = document.getElementById("win95-chat-send");
                    if(chatInput && chatBtn) {
                        const handleSend = () => {
                            if(chatInput.value) { sendChat(chatInput.value); chatInput.value = ""; }
                        };
                        chatBtn.addEventListener("click", handleSend);
                        chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSend(); });
                    }
                    fetchChat();
                }, 100);
            } else {
                box.style.display = "block";
            }

            const statsBox = document.getElementById("win95-timer-stats");
            if (statsBox) {
                statsBox.innerHTML = `
                    <div class="win95-group-box">
                        <span class="win95-legend">Time Management</span>
                        <div class="row">
                            <span>근무 시간</span>
                            <span class="val-large">${format(todayDone)} <span style="font-size:12px; font-weight:normal; font-family:'Gulim';">/ 9.0</span></span>
                        </div>
                        <div class="win95-border-inset p-bar-frame">
                            <div class="p-bar-fill" style="width:${Math.min(100, (todayDone/9)*100)}%;"></div>
                        </div>
                        <div class="row" style="margin-top:6px;">
                            <span style="font-weight:bold; color:${todayDone>=9 ? 'blue' : '#000'}">
                                ${todayDone >= 9 ? "🏁 탈출하세요!" : "🏃 퇴근까지"}
                            </span>
                            <span class="val-large" style="color:${todayDone>=9 ? 'blue' : '#d00000'}">
                                ${todayDone >= 9 ? "안녕히 가세요" : format(9-todayDone) + " 남음"}
                            </span>
                        </div>
                        <div style="text-align:right; font-size:11px; color:#444; margin-top:4px;">
                            시스템 예상 종료: <b>${realEndTime}</b>
                        </div>
                    </div>

                    ${todayDone >= 9 ? `
                    <div class="win95-group-box">
                        <span class="win95-legend" style="color:#d00000">Night Meal</span>
                        <div class="row">
                            <span>식대 자격</span>
                            <span style="font-family:'DungGeunMo'; font-size:13px;">${todayDone>=11.5 ? '<span style="color:red">획득 완료!</span>' : format(11.5-todayDone)+' 대기중'}</span>
                        </div>
                        <div class="win95-border-inset p-bar-frame" style="height:10px;">
                            <div class="p-bar-fill" style="width:${mealPct}%; background:#d00000;"></div>
                        </div>
                    </div>` : ''}

                    <div class="win95-group-box">
                        <span class="win95-legend">Weekly Status</span>
                        <div class="row">
                            <span>주간 누적</span>
                            <span style="font-family:'DungGeunMo'; font-size:13px;">${format(realWeeklyDone)} / 53h</span>
                        </div>
                        <div class="win95-border-inset p-bar-frame" style="height:10px; margin-bottom:8px">
                            <div class="p-bar-fill" style="width:${weeklyPct}%; background:#008080;"></div>
                        </div>

                        <div class="row">
                            <span>잔여 OT</span>
                            <span style="font-family:'DungGeunMo'; font-size:13px;">${format(extraDone)} / 8h</span>
                        </div>
                        <div class="win95-border-inset p-bar-frame" style="height:10px;">
                            <div class="p-bar-fill" style="width:${extraPct}%; background:#808000;"></div>
                        </div>
                        <div style="text-align:right; font-size:11px; margin-top:4px; color:#444;">
                            하루 평균 <b>${avgExtraPerDay <= 0 ? '0' : format(avgExtraPerDay)}</b>시간 더 하면 됨
                        </div>
                    </div>

                    <div class="win95-border-inset status-bar" style="color:${statusColor}">
                        ${statusIcon} ${statusMsg}
                    </div>
                `;
            }
        } catch(e) {}
    }

    /* ==========================================================================
       실행 루프
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
        }
        run();
    }, 2000);

    setInterval(fetchChat, 3000);

    if (Notification.permission === "default") {
        setTimeout(() => Notification.requestPermission(), 4000);
    }

    setTimeout(run, 2000);
})();
