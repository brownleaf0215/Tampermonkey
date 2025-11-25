// ==UserScript==
// @name         Flex_WorkingTimeChecker
// @version      1.0.0
// @match        https://flex.team/time-tracking/my-work-record*
// ==/UserScript==

(function () {
    'use strict';
    const DAILY_GOAL = 9;
    const WEEKLY_GOAL = 53;

    function parseHM(str) {
        if (!str) return 0;
        const match = str.match(/(\d+)시간\s*(\d*)분?/);
        if (match) return parseInt(match[1]) + (match[2] ? parseInt(match[2]) : 0) / 60;
        const colon = str.match(/(\d+):(\d+)/);
        if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
        return 0;
    }

    function format(h) {
        const hh = Math.floor(h);
        const mm = Math.floor((h - hh) * 60);
        return `${hh}:${mm.toString().padStart(2, '0')}`;
    }

    function getRemainingWorkdaysExcludingToday() {
        const day = new Date().getDay();
        if (day === 0 || day === 6) return 0;
        return 5 - day; // 월요일=4, 화=3, ..., 금=0
    }

    function run() {
        const todayTag = document.querySelector('time[datetime*="T"]');
        const weeklySpan = document.querySelector('span.c-lmXAkT'); // ← 이건 월~어제까지만!

        const todayDone = todayTag ? parseHM(todayTag.textContent.trim()) : 0;
        const pastWeeklyDone = weeklySpan ? parseHM(weeklySpan.textContent.trim()) : 0;

        // 진짜 이번주 총 근로시간 = 어제까지 + 오늘
        const realWeeklyDone = pastWeeklyDone + todayDone;

        const todayLeft = Math.max(0, DAILY_GOAL - todayDone);
        const todayOver = Math.max(0, todayDone - DAILY_GOAL);
        const weeklyLeft = Math.max(0, WEEKLY_GOAL - realWeeklyDone);
        const weeklyOver = Math.max(0, realWeeklyDone - WEEKLY_GOAL);

        const remainDays = getRemainingWorkdaysExcludingToday();
        const totalLeftForWeek = Math.max(0, WEEKLY_GOAL - realWeeklyDone);
        const avgNeededPerDay = remainDays > 0 ? totalLeftForWeek / remainDays : 0;

        const todayPct = Math.min(100, (todayDone / DAILY_GOAL) * 100);
        const weeklyPct = Math.min(100, (realWeeklyDone / WEEKLY_GOAL) * 100);

        let box = document.getElementById('flex-progress-box');
        if (!box) {
            box = document.createElement('div');
            box.id = 'flex-progress-box';
            Object.assign(box.style, {
                position: 'fixed', bottom: '20px', left: '20px',
                background: 'rgba(15,15,25,0.90)', color: '#fff',
                padding: '14px 18px', borderRadius: '20px',
                fontSize: '13px', fontWeight: '600',
                fontFamily: '"Pretendard", "Malgun Gothic", sans-serif',
                zIndex: '999999', minWidth: '270px',
                border: '1px solid rgba(100,200,255,0.3)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,200,255,0.15)',
                backdropFilter: 'blur(16px)', lineHeight: '1.3'
            });
            document.body.appendChild(box);
        }

        box.innerHTML = `
            <style>
                .flex-bar {height:8px; background:rgba(255,255,255,0.12); border-radius:8px; overflow:hidden; position:relative; margin:6px 0;}
                .flex-fill {height:100%; transition:width .6s cubic-bezier(0.4,0,0.2,1);}
                .flex-over {position:absolute; top:0; left:0; height:100%; background:#e040ff; opacity:0.85;}
                .flex-label {display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;}
                .flex-sub {text-align:right; font-size:11px; opacity:0.9;}
            </style>

            <!-- 오늘 -->
            <div style="margin-bottom:12px;">
                <div class="flex-label" style="color:#00ffff;">
                    <span>오늘</span>
                    <span>${format(todayDone)} / 9:00 ${todayOver>0?`<span style="color:#ff00ff">+${format(todayOver)}</span>`:''}</span>
                </div>
                <div class="flex-bar">
                    <div class="flex-fill" style="width:${todayPct}%; background:linear-gradient(90deg,#00ffff,#00aaff);"></div>
                    ${todayOver>0?`<div class="flex-over" style="width:${(todayOver/DAILY_GOAL)*100}%"></div>`:''}
                </div>
                <div class="flex-sub" style="color:${todayOver>0?'#ff00ff':todayLeft===0?'#00ff88':'#ff6666'}">
                    ${todayOver>0?'초과 '+format(todayOver):todayLeft===0?'완료!':'남음 '+format(todayLeft)}
                </div>
            </div>

            <!-- 이번주 총 (오늘 포함 정확 계산) -->
            <div style="margin-bottom:12px;">
                <div class="flex-label" style="color:#ff3366;">
                    <span>이번주 총</span>
                    <span>${format(realWeeklyDone)} / 53:00 ${weeklyOver>0?`<span style="color:#ff00ff">+${format(weeklyOver)}</span>`:''}</span>
                </div>
                <div class="flex-bar">
                    <div class="flex-fill" style="width:${weeklyPct}%; background:linear-gradient(90deg,#ff3366,#ff0066);"></div>
                    ${weeklyOver>0?`<div class="flex-over" style="width:${(weeklyOver/WEEKLY_GOAL)*100}%"></div>`:''}
                </div>
                <div class="flex-sub" style="color:${weeklyOver>0?'#ff00ff':weeklyLeft===0?'#00ff88':'#ff8888'}">
                    ${weeklyOver>0?'초과 '+format(weeklyOver):weeklyLeft===0?'완료!':'남음 '+format(weeklyLeft)}
                </div>
            </div>

            <!-- 남은 근무일 평균 필요시간 -->
            <div>
                <div class="flex-label" style="color:#ffff00;">
                    <span>남은 ${remainDays}일 평균 필요</span>
                    <span style="font-weight:700; color:${avgNeededPerDay>10?'#ff0088':avgNeededPerDay>9?'#ff6600':avgNeededPerDay>0?'#ffff00':'#00ff88'}">
                        ${avgNeededPerDay <= 0 ? '충분!' : format(avgNeededPerDay) + '/일'}
                    </span>
                </div>
                <div class="flex-bar">
                    <div class="flex-fill" style="width:${remainDays>0?Math.min(100,(avgNeededPerDay/12)*100):100}%;
                        background:linear-gradient(90deg,
                        ${avgNeededPerDay<=0?'#00ff88':avgNeededPerDay>10?'#ff0088':avgNeededPerDay>9?'#ff6600':'#ffff00'},
                        ${avgNeededPerDay<=0?'#00ffaa':avgNeededPerDay>9?'#ff0066':'#ffdd00'});">
                    </div>
                </div>
                <div class="flex-sub" style="color:${avgNeededPerDay>10?'#ff0088':avgNeededPerDay>9?'#ff6600':avgNeededPerDay>0?'#ffff88':'#00ff88'}">
                    ${avgNeededPerDay <= 0 ? '여유 충분 🔥' :
                      avgNeededPerDay > 10 ? '죽음 😱' :
                      avgNeededPerDay > 9 ? '빡셈 😰' : '가능 👍'}
                </div>
            </div>
        `;

        if (!box.dataset.loaded) {
            console.clear();
            console.log('%c[Flex 2025] weeklySpan 오늘 제외 버그 완전 수정 🔥', 'color:#ff00ff; font-size:16px; font-weight:bold;');
            console.log(`어제까지: ${format(pastWeeklyDone)} + 오늘 ${format(todayDone)} = 총 ${format(realWeeklyDone)}`);
            box.dataset.loaded = '1';
        }
    }

    setTimeout(run, 500);
    setInterval(run, 1000);
})();