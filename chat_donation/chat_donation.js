// js/chat_donation.js

// 1. 포인트 은행 및 뚜봇 연결 설정
const BANK_API_URL = "https://admirable-custard-8f7713.netlify.app/api/bank";
let chatWebSocket = null;
const chatWsUri = "wss://chzzk-data.ddutto.com/api/dataSocket/?EIO=4&transport=websocket";
const chatScope = ['chat', 'donation'];

const chatAuthState = {
    authData: ["auth-api", DDUBOT_CONFIG.apiKey],
    authChk: false
};

// 시청자별 채팅 적립 쿨타임 관리용 Map (key: userId, value: 만료 타임스탬프)
const userChatCooldowns = new Map();
const CHAT_COOLDOWN_MS = 60 * 1000; // 60초

// 2. 넷리파이 포인트 은행 서버로 통신하는 함수
async function sendToBank(userId, userName, action, amount, reason) {
    try {
        const response = await fetch(BANK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: action, // "earn" 또는 "spend"
                userId: userId,
                amount: amount
            })
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log(`[포인트 은행 연동 성공] (${reason}) 유저: ${userName}(${userId}) | 변동: +${amount}P | 누적 잔액: ${result.points}P`);
            return result;
        } else {
            console.error('[포인트 은행 거부/실패]', result.error || result.reason || response.statusText);
        }
    } catch (error) {
        console.error('[포인트 은행 통신 에러]:', error);
    }
}

// 3. 뚜봇 웹소켓 초기화 및 실시간 데이터 수신 처리
function initChatDonationSystem() {
    chatWebSocket = new WebSocket(chatWsUri);
    
    chatWebSocket.onmessage = (evt) => {
        let code = evt.data.match(/^\d{1,2}/g)?.[0];
        if (!code) return;
        let procData = evt.data.replace(/^\d{1,2}/g, '');
        
        switch(parseInt(code)) {
            case 0:
                chatWebSocket.send(40);
                break;
            case 2:
                chatWebSocket.send(3);
                break;
            case 40: 
                chatWebSocket.send(`42["${chatAuthState.authData.join('", "')}"]`);
                break;
            case 42:
                if(!chatAuthState.authChk) {
                    chatScope.map((_scope) => {
                        chatWebSocket.send(`42["subscribe", "${DDUBOT_CONFIG.chzzkId}:${_scope}"]`);
                    });
                    chatAuthState.authChk = true;
                } else {
                    let rcvData = JSON.parse(procData);
                    if (!rcvData[2]) return;

                    let purpose = rcvData[1].split(':')[1];
                    
                    // --- 채팅 규칙 처리 ---
                    if (purpose === 'chat') {
                        let chatInfo = JSON.parse(rcvData[2]);
                        let profile = JSON.parse(chatInfo.profile);
                        
                        let userId = profile.userId;
                        let userName = profile.nickname;
                        let message = chatInfo.msg ? chatInfo.msg.trim() : "";

                        if (!message) return;

                        let now = Date.now();
                        let expireTime = userChatCooldowns.get(userId) || 0;

                        // 60초 쿨타임 검사
                        if (now >= expireTime) {
                            // 쿨타임 통과: 갱신 후 은행에 1포인트 적립 요청
                            userChatCooldowns.set(userId, now + CHAT_COOLDOWN_MS);
                            sendToBank(userId, userName, "earn", 1, "채팅 참여 적립");
                        }
                    } 
                    
                    // --- 후원 규칙 처리 ---
                    else if (purpose === 'donation') {
                        let donateInfo = JSON.parse(rcvData[2]);
                        
                        let userId = donateInfo.userId || donateInfo.profile?.userId;
                        let userName = donateInfo.nickname;
                        let rawAmount = donateInfo.donationAmount; // 후원 금액 (원 단위)

                        if (!userId || !rawAmount) return;

                        // 후원금액의 1/10 적립 (소수점 발생 시 내림 처리)
                        let earnPoints = Math.floor(rawAmount / 10);

                        if (earnPoints > 0) {
                            sendToBank(userId, userName, "earn", earnPoints, `후원 적립 (${rawAmount}원 1/10)`);
                        }
                    }
                }
                break;
        }
    };

    chatWebSocket.onclose = () => {
        console.log('뚜봇 연결이 종료되었습니다. 5초 후 재연결을 시도합니다.');
        setTimeout(initChatDonationSystem, 5000);
    };
}

// 스크립트 로드 시 독립 사업 시스템 자동 가동
window.addEventListener('DOMContentLoaded', () => {
    initChatDonationSystem();
});