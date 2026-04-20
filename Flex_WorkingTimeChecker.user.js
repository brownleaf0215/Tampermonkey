// ==UserScript==
// @name         Flex 근무시간 체크 - 밥자격 + 실제 퇴근시간 완벽판
// @version      8.2.0
// @description  2026 MZ 글래스모피즘 UI + 랜덤 뻘글 + 익명 채팅 + 오늘의 운세 100종 + 운세 히스토리 그래프
// @match        https://flex.team/time-tracking/my-work-record*
// @updateURL    https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @downloadURL  https://raw.githubusercontent.com/brownleaf0215/Tampermonkey/main/Flex_WorkingTimeChecker.user.js
// @grant        none
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

    /* ==========================================================================
       랜덤 멘트
       ========================================================================== */
    const ALARM_MENT = {
        "10:28": {
            title: "스크럼 1분 전",
            bodies: [
                "팀장님 오십니다. 알트+탭 장전하세요.",
                "영혼 없는 '네, 알겠습니다' 발사 준비.",
                "어제 한 일: 숨쉬기. 오늘 할 일: 퇴근.",
                "모니터 닦는 척하면서 바쁜 척 하세요.",
                "커피 수혈이 시급합니다. 탕비실로 튀어!",
                "스크럼의 정석: 고개 끄덕 + 마이크 음소거",
                "할 말은 없지만 카메라는 켜야 합니다.",
                "'진행 중입니다'는 마법의 주문입니다.",
                "어제 뭐 했는지 지금 급하게 만들어내는 중.",
                "스크럼 끝나면 진짜 업무 시작... 아닐 수도."
            ]
        },
        "12:29": {
            title: "점심시간 1분 전",
            bodies: [
                "지갑 챙기셨나요? 맛점하러 튀어!",
                "엘리베이터 눈치게임 시작! 늦으면 줄 섭니다.",
                "오후를 버티기 위한 칼로리 비축 시간입니다.",
                "오늘은 법카 찬스 없나요? 내돈내산 ㅠ",
                "점심 메뉴 고르는 게 오늘 가장 어려운 업무.",
                "배에서 고래가 노래합니다. 출동하세요.",
                "같이 먹자는 말 = 메뉴 정해달라는 뜻",
                "오늘의 미션: 어제와 다른 메뉴 선택하기",
                "밥 먹고 나면 또 졸릴 거란 걸 알지만... 갑니다.",
                "구내식당 vs 외식, 매일 반복되는 철학적 고민."
            ]
        },
        "18:59": {
            title: "저녁식사 시간",
            bodies: [
                "야근 확정... 법카로 맛있는 거라도 드세요.",
                "집에 가고 싶다... 격렬하게 집에 가고 싶다.",
                "회사에 뼈를 묻지 마세요, 집에 묻으세요.",
                "야근 요정이 당신을 찾아왔습니다 (절망)",
                "지금 나가는 저 사람, 혹시 배신자...?",
                "저녁값이라도 비싼 거 먹어서 복수합시다.",
                "야근은 체력이 아니라 멘탈의 영역입니다.",
                "퇴근한 동료의 카톡 프사가 눈부십니다.",
                "내일의 나에게 미안하지만... 오늘도 남는다.",
                "사무실 불이 꺼지면 내 영혼도 같이 꺼집니다."
            ]
        }
    };

    const STATUS_MENT = {
        level1: [
            "뇌 부팅 중... (진행률 12%)",
            "집에서 나왔는데 집에 가고 싶다.",
            "아직도 오전이라니, 시계 고장난 듯.",
            "모니터 뚫어지게 보며 딴 생각 하는 중.",
            "아침부터 기가 빨립니다...",
            "오늘따라 키보드 소리가 거슬리네요.",
            "출근한 거 자체가 오늘의 성과입니다.",
            "눈은 떴는데 정신은 이불 속에 있음.",
            "로딩 중... 잠시만 기다려 주세요.",
            "아메리카노가 혈관을 타고 흐르는 중.",
            "메일함 여는 것부터가 보스 레이드.",
            "오늘 하루가 1주일처럼 느껴질 예감."
        ],
        level2: [
            "식곤증과의 사투... 눈꺼풀이 천근만근",
            "커피 약발이 떨어져 갑니다. 리필 요망.",
            "점심 먹은 거 다 소화됨. 간식 마렵다.",
            "의미 없는 마우스 딸깍거림 시전 중.",
            "팀장님과 눈 마주침. (회피 기동 성공)",
            "이 시간대가 제일 시간이 안 갑니다.",
            "화장실 다녀오면 5분은 벌 수 있다.",
            "슬랙 알림 소리에 심장이 멎을 뻔.",
            "탕비실 왕복이 오늘의 유일한 운동.",
            "자리에 앉아있지만 영혼은 부재중.",
            "오후 3시의 벽... 넘을 수 있을까.",
            "졸음 vs 업무, 현재 졸음이 우세합니다."
        ],
        level3: [
            "퇴근 쿨타임 도는 중... 버텨야 한다.",
            "슬슬 가방 지퍼를 열어둘 시간입니다.",
            "내일의 나에게 업무를 토스 준비 중.",
            "엉덩이에 쥐가 날 것 같습니다.",
            "창밖을 보며 자유를 갈망하는 중.",
            "오늘 저녁은 뭘 먹어야 소문이 날까.",
            "퇴근 후 계획이 나를 살아있게 합니다.",
            "시계를 3번 연속 쳐다봤는데 1분도 안 지남.",
            "남은 업무량 vs 남은 의지력 = 0:0",
            "지금 이 순간 전국의 직장인이 공감 중.",
            "모니터 속 내 얼굴이 처량해 보입니다.",
            "커피 4잔째... 이게 맞나 싶지만 마십니다."
        ],
        level4: [
            "눈치 게임 시작. 누가 먼저 일어날 것인가.",
            "마음은 이미 지하철 탔습니다.",
            "모니터를 끄는 상상을 했습니다. 짜릿해.",
            "외투를 슬쩍 의자에 걸쳐둡니다.",
            "1분이 1시간처럼 느껴지는 매직.",
            "퇴근 버튼에 마우스 커서를 살짝 올려봄.",
            "가방 속 이어폰 케이스를 만지작거리는 중.",
            "화면은 업무용, 뇌는 퇴근 시뮬레이션 중.",
            "옆자리가 일어나면 나도 같이 일어날 준비.",
            "슬랙 상태를 '자리 비움'으로 바꾸고 싶다."
        ],
        level5: [
            "★ 시스템 종료 가능 ★ 당장 나가세요!",
            "승리자! 당신의 자유를 쟁취했습니다.",
            "아직도 안 가셨나요? 회사의 노예...",
            "치킨 한 마리 시켜도 무죄인 시간입니다.",
            "야근 수당이라도 달달하게 챙깁시다 ㅠ",
            "한 발짝만 더 가면 엘리베이터입니다.",
            "오늘도 살아남았다. 내일도 파이팅...",
            "퇴근이 곧 힐링. 문 밖이 천국.",
            "PC 종료 단축키: Win+L → 기상 → 퇴근",
            "남아있는 분, 내일의 영웅이 되실 겁니다."
        ]
    };

    /* ==========================================================================
       오늘의 운세 데이터 — 5등급 × 20개 = 100개
       대길(90~99) / 길(75~89) / 평(55~74) / 흉(35~54) / 대흉(10~34)
       ========================================================================== */
    const FORTUNE_DATA = [
        /* ── 대길 ── */
        { score: 99, title: "대길 ★★★★★", body: "오늘은 우주가 당신 편입니다. 팀장님 기분 최고, 커피도 맛있음.", advice: "하고 싶은 말 오늘 다 해도 됩니다." },
        { score: 97, title: "대길 ★★★★★", body: "막혔던 PR도 오늘은 머지됩니다. 모든 일이 술술 풀리는 날.", advice: "오늘 연차 쓰면 낭비입니다. 출근이 곧 행운." },
        { score: 95, title: "대길 ★★★★★", body: "기획서 한 번에 통과, 회의 일찍 끝남, 점심 줄도 짧음. 3관왕.", advice: "자신감 있게 발언하세요. 오늘은 빛납니다." },
        { score: 94, title: "대길 ★★★★★", body: "팀장님이 먼저 칭찬합니다. 받아치지 말고 그냥 웃으세요.", advice: "평소 미루던 업무 오늘 다 처리 가능." },
        { score: 93, title: "대길 ★★★★★", body: "일도 잘 풀리고 점심도 맛있고 오후도 집중이 잘 됩니다.", advice: "팀원에게 먼저 커피 한 잔 사줘도 좋은 날." },
        { score: 92, title: "대길 ★★★★★", body: "코드를 짜면 버그가 없고, 메일을 쓰면 답장이 빠릅니다.", advice: "어려운 협업 요청도 오늘은 긍정적으로 받아들여집니다." },
        { score: 91, title: "대길 ★★★★★", body: "집중력이 최고조. 오전에 한 일이 평소 하루치와 맞먹습니다.", advice: "가장 어려운 업무를 오전 중에 처리하세요." },
        { score: 90, title: "대길 ★★★★★", body: "오늘 발표가 있다면 대박 납니다. 없어도 기운이 넘칩니다.", advice: "적극적으로 의견을 내세요. 오늘은 설득력이 최강." },
        { score: 96, title: "대길 ★★★★★", body: "회식 제안이 들어올 수도 있습니다. 오늘만큼은 가도 좋습니다.", advice: "오늘 30분 일찍 시작하면 퇴근도 30분 빨라집니다." },
        { score: 98, title: "대길 ★★★★★", body: "전설급 하루입니다. 복권을 사도 좋을 것 같은 기운.", advice: "주변에 좋은 에너지를 나눠주세요. 돌아옵니다." },
        { score: 99, title: "대길 ★★★★★", body: "슬랙 알림이 전부 좋은 소식입니다. 오늘만큼은 진짜입니다.", advice: "오늘 하루만큼은 긍정적인 마음으로 시작하세요." },
        { score: 93, title: "대길 ★★★★★", body: "팀 전체 분위기가 좋은 날. 덩달아 나도 기분이 올라갑니다.", advice: "점심에 새로운 가게 도전해보세요. 성공 확률 높음." },
        { score: 91, title: "대길 ★★★★★", body: "오늘 제출한 보고서는 첫 번째 시도에 통과됩니다.", advice: "할 말 있으면 오늘 하세요. 귀 기울여줄 겁니다." },
        { score: 94, title: "대길 ★★★★★", body: "뭘 해도 잘 되는 날. 심지어 프린터도 말을 잘 듣습니다.", advice: "오늘 배운 것은 오래 기억됩니다. 공부하기 좋은 날." },
        { score: 97, title: "대길 ★★★★★", body: "오늘의 키워드는 순풍. 흐름을 타면 하루가 쭉쭉 풀립니다.", advice: "망설이던 결정, 오늘 내리세요. 후회 없습니다." },
        { score: 90, title: "대길 ★★★★★", body: "팀장님과 대화가 술술 풀립니다. 평소보다 말이 잘 통하는 날.", advice: "요청사항이 있다면 오늘 말하는 게 최적 타이밍." },
        { score: 95, title: "대길 ★★★★★", body: "오늘 만드는 산출물은 퀄리티가 높습니다. 스스로도 놀랄 수준.", advice: "포트폴리오에 넣을 작업, 오늘 하면 딱 좋습니다." },
        { score: 92, title: "대길 ★★★★★", body: "협업 운이 최고조입니다. 다른 팀에 부탁해도 거절당하지 않는 날.", advice: "밀린 협업 요청들을 오늘 한꺼번에 처리하세요." },
        { score: 96, title: "대길 ★★★★★", body: "오늘은 아이디어가 샘솟습니다. 메모장을 열어두세요.", advice: "브레인스토밍 회의가 있다면 오늘이 최고의 날입니다." },
        { score: 98, title: "대길 ★★★★★", body: "오늘만큼은 야근도 고통스럽지 않습니다. 그래도 제시간에 가는 게 이득.", advice: "에너지가 넘치는 날. 퇴근 후 운동을 붙여보세요." },

        /* ── 길 ── */
        { score: 88, title: "길 ★★★★☆", body: "작은 행운이 반복됩니다. 점심 줄 짧고 회의 일찍 끝납니다.", advice: "오후 집중력이 좋습니다. 복잡한 작업은 오후에 배치하세요." },
        { score: 86, title: "길 ★★★★☆", body: "오후에 좋은 소식 하나가 옵니다. 메신저를 주목하세요.", advice: "기대 이상의 결과가 나올 수 있습니다. 믿어보세요." },
        { score: 84, title: "길 ★★★★☆", body: "전반적으로 순탄합니다. 큰 사건 없이 하루가 흘러갑니다.", advice: "루틴대로 움직이면 하루가 완벽하게 마무리됩니다." },
        { score: 82, title: "길 ★★★★☆", body: "인간관계 운 상승. 밥 같이 먹자는 말 오늘은 해도 됩니다.", advice: "혼자 끙끙대던 문제, 동료에게 물어보면 쉽게 풀립니다." },
        { score: 80, title: "길 ★★★★☆", body: "오전에 시동이 잘 걸립니다. 출근하자마자 중요한 것부터 처리하세요.", advice: "점심 후 15분 짧은 산책이 오후 생산성을 높여줍니다." },
        { score: 85, title: "길 ★★★★☆", body: "업무 집중력이 평소보다 높습니다. 방해 요소를 최소화하면 폭발적 성과.", advice: "슬랙 알림 잠시 끄고 집중 모드 돌입하세요." },
        { score: 79, title: "길 ★★★★☆", body: "팀 분위기가 좋아서 덩달아 컨디션이 올라가는 날입니다.", advice: "긍정 에너지를 먼저 건네면 더 크게 돌아옵니다." },
        { score: 87, title: "길 ★★★★☆", body: "오늘 제출하는 자료는 큰 수정 없이 넘어갑니다. 한 번에 OK 기대.", advice: "퇴근 전 내일 할 일 목록 적어두면 내일도 좋은 날이 됩니다." },
        { score: 83, title: "길 ★★★★☆", body: "집중력이 좋은 날. 이어폰 꽂고 몰입하면 두 배 성과 가능.", advice: "점심은 든든하게. 오후에 체력이 뒷받침돼야 마무리가 깔끔합니다." },
        { score: 81, title: "길 ★★★★☆", body: "사소한 행운들이 겹칩니다. 엘리베이터 바로 오고 자리도 여유 있고.", advice: "작은 행운에 감사하면 더 큰 행운이 따라옵니다." },
        { score: 89, title: "길 ★★★★☆", body: "커뮤니케이션 운이 좋습니다. 내 의도가 잘 전달되는 날.", advice: "어려운 대화가 필요했다면 오늘이 적기입니다." },
        { score: 76, title: "길 ★★★★☆", body: "조용하지만 알차게 흘러가는 날. 소란 없이 성과가 쌓입니다.", advice: "묵묵히 하던 일 계속하세요. 알아보는 사람이 있습니다." },
        { score: 88, title: "길 ★★★★☆", body: "에너지가 충전된 느낌. 새로운 시도를 해도 좋은 타이밍입니다.", advice: "미뤄두던 배움이나 공부, 오늘부터 시작하면 지속됩니다." },
        { score: 78, title: "길 ★★★★☆", body: "오늘 한 배려 하나가 나중에 크게 돌아옵니다.", advice: "팀원 도움 요청에 기꺼이 응해주세요. 인복이 쌓입니다." },
        { score: 85, title: "길 ★★★★☆", body: "업무 효율이 좋은 날. 같은 시간에 더 많이 할 수 있습니다.", advice: "타이머 25분 집중 기법 오늘 써보세요. 효과 두 배." },
        { score: 77, title: "길 ★★★★☆", body: "점심 메뉴 선택이 오늘따라 탁월합니다. 미식운 상승.", advice: "오후 간식 타이밍 잘 잡으면 3~5시 슬럼프 없이 넘깁니다." },
        { score: 83, title: "길 ★★★★☆", body: "평소 연락이 뜸했던 동료에게 연락이 옵니다. 반갑게 받아주세요.", advice: "네트워킹 운이 좋은 날. 점심 자리 수락하세요." },
        { score: 80, title: "길 ★★★★☆", body: "아이디어보다 실행력이 뛰어난 날입니다. 생각보다 행동.", advice: "확신이 없어도 일단 시작하세요. 오늘은 행동이 답입니다." },
        { score: 87, title: "길 ★★★★☆", body: "오늘 처음 시도하는 일이 예상보다 잘 됩니다.", advice: "두려워했던 새 업무, 오늘 시작하면 생각보다 쉽습니다." },
        { score: 75, title: "길 ★★★★☆", body: "전반적으로 차분하고 안정적인 하루. 마음이 편안합니다.", advice: "무리하지 않아도 충분한 날. 페이스 유지가 핵심입니다." },

        /* ── 평 ── */
        { score: 74, title: "평 ★★★☆☆", body: "무난합니다. 무난함이 곧 행복임을 오늘은 깨달을 것입니다.", advice: "기대치를 낮추면 만족도가 올라갑니다." },
        { score: 70, title: "평 ★★★☆☆", body: "에너지가 평균치. 커피 한 잔으로 적절히 조절하세요.", advice: "억지로 기운 내려 하지 마세요. 자연스러운 리듬을 따르세요." },
        { score: 68, title: "평 ★★★☆☆", body: "딱 보통인 날. 드라마도 없고 사고도 없습니다.", advice: "평범한 날이 쌓여 좋은 커리어가 됩니다. 오늘도 성실하게." },
        { score: 65, title: "평 ★★★☆☆", body: "크게 나쁘지도 좋지도 않습니다. 무난하게 흘러가는 하루.", advice: "루틴에 충실하면 후회 없는 하루가 됩니다." },
        { score: 72, title: "평 ★★★☆☆", body: "집중이 잘 되다가 안 되다가 반복됩니다. 짧은 휴식으로 리셋.", advice: "5분 환기 → 10분 집중 사이클로 오후를 공략하세요." },
        { score: 60, title: "평 ★★★☆☆", body: "오늘은 굳이 새로운 시도를 하지 않아도 됩니다. 현상 유지가 미덕.", advice: "기존 업무 마무리에 집중하세요. 완성도를 높이는 날." },
        { score: 67, title: "평 ★★★☆☆", body: "기분도 날씨도 딱 보통. 어디서 기운을 보충할지 고민해보세요.", advice: "점심에 햇볕 좀 쬐고 오세요. 비타민D가 필요한 날." },
        { score: 73, title: "평 ★★★☆☆", body: "아무 일도 일어나지 않는 날. 그게 축복일 수도 있습니다.", advice: "조용한 날엔 문서 정리나 메일함 정리를 추천합니다." },
        { score: 62, title: "평 ★★★☆☆", body: "컨디션이 보통입니다. 무리하지 않는 게 최선입니다.", advice: "오늘 하루 목표를 딱 두 가지로만 정해보세요." },
        { score: 69, title: "평 ★★★☆☆", body: "뭔가 더 잘하고 싶은데 몸이 따라주지 않는 날.", advice: "완벽하지 않아도 괜찮습니다. 오늘은 충분히 좋음으로 목표를 낮추세요." },
        { score: 71, title: "평 ★★★☆☆", body: "기대 이상도 이하도 아닌, 딱 예상한 만큼의 하루.", advice: "일관성이 신뢰를 만듭니다. 오늘도 꾸준하게." },
        { score: 64, title: "평 ★★★☆☆", body: "집중과 해이 사이를 오가는 날. 자신에게 너그럽게 대하세요.", advice: "완벽한 집중보다 꾸준한 진행이 오늘의 전략입니다." },
        { score: 58, title: "평 ★★★☆☆", body: "특별한 사건 없이 시간이 흐릅니다. 그것도 나쁘지 않습니다.", advice: "조용한 날일수록 내면의 목소리에 귀 기울이세요." },
        { score: 66, title: "평 ★★★☆☆", body: "눈에 띄는 성과는 없지만 착실하게 쌓이는 날입니다.", advice: "보이지 않는 노력이 나중에 큰 결과로 나타납니다." },
        { score: 57, title: "평 ★★★☆☆", body: "오늘은 무난하게 버티는 것이 목표. 그것만으로 충분합니다.", advice: "현재에 집중하세요. 과거도 미래도 오늘은 잠깐 내려두세요." },
        { score: 74, title: "평 ★★★☆☆", body: "업무가 평온하게 진행됩니다. 큰 파도 없는 잔잔한 하루.", advice: "잔잔한 날에 다음 주 계획을 세워두면 알차게 활용됩니다." },
        { score: 61, title: "평 ★★★☆☆", body: "하루가 빠르지도 느리지도 않게 흘러갑니다.", advice: "적당한 페이스가 장기전에서 이깁니다. 지치지 마세요." },
        { score: 56, title: "평 ★★★☆☆", body: "별 탈 없이 마무리되는 날. 그것 자체가 감사한 일입니다.", advice: "퇴근 후 좋아하는 것 하나를 계획해두면 오후가 버텨집니다." },
        { score: 63, title: "평 ★★★☆☆", body: "보통의 하루지만, 마지막에 작은 보람이 기다리고 있습니다.", advice: "오늘 하루 끝에 스스로에게 작은 칭찬을 해주세요." },
        { score: 55, title: "평 ★★★☆☆", body: "딱 중간입니다. 올라갈 수도 내려갈 수도 있습니다.", advice: "긍정적인 프레임 하나가 하루를 바꿀 수 있습니다." },

        /* ── 흉 ── */
        { score: 54, title: "흉 ★★☆☆☆", body: "슬랙 알림이 유독 많을 예감. 화장실에서 잠깐 숨 고르세요.", advice: "반응 속도를 의도적으로 늦추세요. 급할수록 실수가 납니다." },
        { score: 50, title: "흉 ★★☆☆☆", body: "오타와 실수가 잦은 날. 전송 버튼 누르기 전에 한 번 더 읽어보세요.", advice: "중요한 메일이나 문서는 최소 두 번 검토하고 내보내세요." },
        { score: 47, title: "흉 ★★☆☆☆", body: "잠이 모자란 느낌. 점심 후 15분 눈 감기를 강력 추천합니다.", advice: "카페인에만 의존하지 마세요. 짧은 휴식이 더 효과적입니다." },
        { score: 44, title: "흉 ★★☆☆☆", body: "괜히 말 한마디가 오해를 살 수 있는 날. 오늘은 신중하게.", advice: "필요한 말만 하세요. 불필요한 코멘트는 오늘 보류." },
        { score: 42, title: "흉 ★★☆☆☆", body: "집중이 잘 안 되고 실수가 눈에 띄는 날. 자책하지 마세요.", advice: "실수를 빨리 인정하고 수정하는 것이 최선입니다." },
        { score: 48, title: "흉 ★★☆☆☆", body: "팀 분위기가 다소 무거운 날. 괜히 불씨를 건드리지 마세요.", advice: "분위기 메이커가 되려 하지 말고 조용히 자기 일에 집중하세요." },
        { score: 40, title: "흉 ★★☆☆☆", body: "기대했던 피드백이 기대를 빗나갑니다. 상처받지 마세요.", advice: "비판을 개인 공격으로 받아들이지 말고 개선점으로 보세요." },
        { score: 52, title: "흉 ★★☆☆☆", body: "몸이 무겁고 집중이 흩어집니다. 욕심 부리지 말고 천천히 가세요.", advice: "투두 리스트를 반으로 줄이세요. 오늘은 50%만 해도 성공." },
        { score: 38, title: "흉 ★★☆☆☆", body: "오늘은 유독 시간이 안 갑니다. 시계를 너무 자주 보지 마세요.", advice: "시계 대신 할 일 목록을 보세요. 시간이 더 빨리 갑니다." },
        { score: 45, title: "흉 ★★☆☆☆", body: "작은 트러블이 생길 수 있습니다. 여유를 갖고 대처하세요.", advice: "당황하지 마세요. 대부분의 문제는 생각보다 빨리 해결됩니다." },
        { score: 51, title: "흉 ★★☆☆☆", body: "에너지가 낮고 의욕이 없는 날. 억지로 쥐어짜지 말아요.", advice: "최소한의 목표만 달성해도 충분합니다. 오늘은 그게 승리." },
        { score: 36, title: "흉 ★★☆☆☆", body: "집중하려 해도 자꾸 딴생각이 납니다. 멀티태스킹은 금물.", advice: "한 번에 한 가지만 하세요. 탭을 닫고 집중 환경을 만드세요." },
        { score: 43, title: "흉 ★★☆☆☆", body: "오늘 한 선택이 나중에 후회될 수 있습니다. 중요한 결정은 보류.", advice: "확신이 없으면 오늘은 결정을 미루세요. 내일이 더 좋습니다." },
        { score: 49, title: "흉 ★★☆☆☆", body: "동료와 사소한 마찰이 생길 수 있습니다. 먼저 양보하면 편합니다.", advice: "이기려 하지 마세요. 오늘은 지는 게 이기는 겁니다." },
        { score: 37, title: "흉 ★★☆☆☆", body: "피로가 쌓여 판단력이 흐려지는 날입니다. 중요 업무는 오전에 끝내세요.", advice: "오후에는 체력 소모가 적은 단순 업무로 채우세요." },
        { score: 53, title: "흉 ★★☆☆☆", body: "기술적인 문제가 발생할 수 있습니다. 백업은 지금 당장 하세요.", advice: "중요한 파일 저장 습관, 오늘부터 다시 점검하세요." },
        { score: 41, title: "흉 ★★☆☆☆", body: "커뮤니케이션 오류가 생기기 쉬운 날. 확인하고 또 확인하세요.", advice: "중요한 내용은 구두로만 하지 말고 텍스트로 남기세요." },
        { score: 46, title: "흉 ★★☆☆☆", body: "기운이 없어서 모든 게 느리게 돌아가는 날입니다.", advice: "물을 충분히 마시세요. 탈수가 집중력을 떨어뜨립니다." },
        { score: 39, title: "흉 ★★☆☆☆", body: "뭘 해도 답답한 기분이 드는 날. 환경 탓이 아니라 컨디션 탓입니다.", advice: "바깥 공기를 5분만 마시고 오세요. 리셋이 됩니다." },
        { score: 35, title: "흉 ★★☆☆☆", body: "오늘은 버티는 것 자체가 목표입니다. 그것만으로도 충분합니다.", advice: "퇴근 후 맛있는 것 먹으며 오늘을 보상해주세요." },

        /* ── 대흉 ── */
        { score: 34, title: "대흉 ★☆☆☆☆", body: "오늘만큼은 새로운 일을 시작하지 마세요. 버티기 모드가 최선입니다.", advice: "생존이 목표입니다. 잘 버텨내는 것도 실력입니다." },
        { score: 28, title: "대흉 ★☆☆☆☆", body: "전설의 나쁜 날. 그래도 퇴근은 반드시 옵니다. 믿으세요.", advice: "이 날이 지나면 반드시 좋은 날이 옵니다. 통계적으로 확실합니다." },
        { score: 22, title: "대흉 ★☆☆☆☆", body: "모든 게 꼬이는 느낌. 계획이 틀어져도 당황하지 마세요.", advice: "플랜 B를 미리 생각해두세요. 오늘은 플랜 A가 잘 안 됩니다." },
        { score: 18, title: "대흉 ★☆☆☆☆", body: "집중 완전 불가. 멍하니 모니터를 보는 시간이 많아집니다.", advice: "억지로 집중하려 하지 마세요. 잠깐 손을 놓는 것도 전략입니다." },
        { score: 30, title: "대흉 ★☆☆☆☆", body: "팀장님 기분이 좋지 않습니다. 오늘은 최대한 안 걸리는 게 상책.", advice: "존재감을 지우세요. 오늘의 최고 전략은 무소음 작전입니다." },
        { score: 25, title: "대흉 ★☆☆☆☆", body: "실수가 연달아 발생할 수 있습니다. 자책보다는 빠른 수습이 우선.", advice: "실수를 인정하고 빠르게 사과하면 오히려 신뢰가 올라갑니다." },
        { score: 15, title: "대흉 ★☆☆☆☆", body: "모든 것이 느리게 돌아가는 날. 컴퓨터도 나도 함께 버벅입니다.", advice: "느려도 괜찮습니다. 재부팅이 필요한 날이니 무리하지 마세요." },
        { score: 32, title: "대흉 ★☆☆☆☆", body: "오늘은 어디서 먹어도 맛이 없고 어디 가도 불편합니다.", advice: "기대를 포기하면 실망도 없습니다. 그냥 하루를 흘려보내세요." },
        { score: 20, title: "대흉 ★☆☆☆☆", body: "기술적 장애, 인간관계 마찰, 업무 지연이 한 날에 몰릴 수 있습니다.", advice: "한 번에 하나씩만 해결하세요. 다 잡으려다 다 놓칩니다." },
        { score: 12, title: "대흉 ★☆☆☆☆", body: "오늘은 그냥 살아있는 것만으로도 잘하고 있는 겁니다.", advice: "오늘 하루 무사히 끝내면 그게 대성공입니다. 응원합니다." },
        { score: 27, title: "대흉 ★☆☆☆☆", body: "에너지가 바닥입니다. 억지로 채우려 하지 마세요.", advice: "수분 보충과 짧은 스트레칭. 최소한의 자기 돌봄을 챙기세요." },
        { score: 33, title: "대흉 ★☆☆☆☆", body: "오늘은 뭔가 억울한 일이 생길 수 있습니다. 냉정함을 유지하세요.", advice: "감정적으로 반응하면 손해입니다. 일단 한 발 물러서세요." },
        { score: 10, title: "대흉 ★☆☆☆☆", body: "역대급으로 안 풀리는 날. 이런 날이 있어야 좋은 날이 더 빛납니다.", advice: "오늘은 그냥 버티세요. 내일은 반드시 더 나아집니다." },
        { score: 17, title: "대흉 ★☆☆☆☆", body: "판단 실수가 잦아질 수 있습니다. 중요한 결정은 무조건 보류하세요.", advice: "결정 미루기가 오늘의 최선입니다. 내일 맑은 정신으로 결정하세요." },
        { score: 23, title: "대흉 ★☆☆☆☆", body: "오늘은 운이 따라주지 않습니다. 운에 기대던 일은 다음으로 미루세요.", advice: "기초와 기본에만 충실하세요. 화려한 시도는 오늘 금물." },
        { score: 29, title: "대흉 ★☆☆☆☆", body: "뭔가 잘못될 것 같은 불안감이 드는 날. 그 예감이 맞을 수 있습니다.", advice: "리스크 있는 결정은 오늘 하지 마세요. 안전한 선택만 하세요." },
        { score: 16, title: "대흉 ★☆☆☆☆", body: "상사에게 뭔가 지적을 받을 수 있습니다. 겸허하게 받아들이세요.", advice: "방어적으로 굴지 말고 배움의 기회로 삼으세요." },
        { score: 21, title: "대흉 ★☆☆☆☆", body: "퇴근 직전에 일이 터질 수 있습니다. 마감 30분 전에 여유를 두세요.", advice: "일찍 마무리하고 검토하는 시간을 갖는 게 오늘의 전략." },
        { score: 14, title: "대흉 ★☆☆☆☆", body: "오늘은 아무것도 하기 싫은 날. 그래도 최소한만 해내면 됩니다.", advice: "오늘 가장 중요한 일 단 하나만 정하고 그것만 하세요." },
        { score: 11, title: "대흉 ★☆☆☆☆", body: "전설이 될 만한 최악의 하루. 훗날 웃으며 얘기할 에피소드가 탄생 중.", advice: "5년 후에 웃으면서 이야기할 수 있을 겁니다. 지금은 버티세요." },
    ];

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
            const res = await fetch(nodeUrl);
            const data = await res.json();
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

            await fetch(nodeUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fortune)
            });
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
            const response = await fetch(FIREBASE_URL, { method: "GET" });
            if (!response.ok) return;
            const data = await response.json();
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
            const r = await fetch(FIREBASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (r.ok) fetchChat();
        } catch (_) {}
    }

    function pruneChat(data) {
        const keys = Object.keys(data);
        if (keys.length > 30) {
            keys.slice(0, keys.length - 30).forEach(key => {
                fetch(`${FIREBASE_BASE_URL}/${key}.json`, { method: "DELETE" }).catch(() => {});
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

    loadFortune();
    setTimeout(run, 1500);
})();
