// js/bingo.js

let websocket = null;
let wsUri = "wss://chzzk-data.ddutto.com/api/dataSocket/?EIO=4&transport=websocket";
let scope = ['chat', 'donation'];

const authState = {
    authData: ["auth-api", BINGO_CONFIG.apiKey],
    authChk: false
};

let bingoWords = [];
let isRevealed = new Array(25).fill(false);
let targetBingoLines = 3;
let currentBingoCount = 0;
let currentCooldownSec = 60;
let currentDonoAmount = 1000;
let currentRevealDonoAmount = 0;

let currentSubject = "";
let currentReward = "";

let userCooldowns = {}; 
let completedLines = new Set();
let lineAchievers = []; 
let isGameOver = false;
let gameStarted = false;

let firstBloodTriggered = false;

// 빙고 정답 판정 기준 (완벽하게 검증된 정상 배열입니다)
const winningLines = [
    [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24], // 가로 0~4번
    [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24], // 세로 5~9번
    [0,6,12,18,24], [4,8,12,16,20] // 대각선 10~11번
];

function initBingoSystem() {
    websocket = new WebSocket(wsUri);
    websocket.onmessage = onMessage;
    window.addEventListener('storage', handleStorageEvent);
    setInterval(checkCooldowns, 1000);
}

const doSend = (msg) => { websocket.send(msg); }

const onMessage = (evt) => {
    let code = evt.data.match(/^\d{1,2}/g)[0];
    let procData = evt.data.replace(/^\d{1,2}/g, '');
    
    switch(parseInt(code)) {
        case 0:
            doSend(40);
            break;
        case 2:
            doSend(3);
            break;
        case 40: 
            doSend(`42["${authState.authData.join('", "')}"]`);
            break;
        case 42:
            if(!authState.authChk) {
                scope.map((_scope) => {
                    doSend(`42["subscribe", "${BINGO_CONFIG.chzzkId}:${_scope}"]`);
                });
                authState.authChk = true;
            } else {
                let rcvData = JSON.parse(procData);
                if (!rcvData[2]) return;

                let purpose = rcvData[1].split(':')[1];
                if (purpose === 'chat') {
                    let chatInfo = JSON.parse(rcvData[2]);
                    let profile = JSON.parse(chatInfo.profile);
                    processChat(profile.nickname, chatInfo.msg, false, 0);
                } else if (purpose === 'donation') {
                    let donateInfo = JSON.parse(rcvData[2]);
                    let msg = donateInfo.message || "";
                    processChat(donateInfo.nickname, msg, true, donateInfo.donationAmount);
                }
            }
            break;
    }
}

function processChat(nick, msg, isDono, amount) {
    if (!gameStarted || isGameOver) return;

    let msgClean = msg.trim();

    let isRevealDono = isDono && (currentRevealDonoAmount > 0 && amount === currentRevealDonoAmount);
    if (isRevealDono) {
        let unrevealedIndices = [];
        isRevealed.forEach((rev, idx) => {
            if (!rev) unrevealedIndices.push(idx);
        });

        if (unrevealedIndices.length > 0) {
            let randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
            isRevealed[randomIndex] = true;
            let word = bingoWords[randomIndex];

            if (typeof updateBingoUI === "function") {
                updateBingoUI(randomIndex, nick, word, 'reveal');
            }

            checkFirstBlood(nick);
            checkBingo(nick);
        }
        return;
    }

    if (!msgClean) return;

    let isExactDono = isDono && (amount === currentDonoAmount);

    if (!isExactDono) {
        let now = Date.now();
        if (userCooldowns[nick] && userCooldowns[nick] > now) {
            return;
        }
    }

    let matchedAny = false;
    bingoWords.forEach((word, index) => {
        if (!isRevealed[index] && msgClean === word) {
            isRevealed[index] = true;
            matchedAny = true;

            if (typeof updateBingoUI === "function") {
                updateBingoUI(index, nick, word, isExactDono ? 'exact' : 'normal');
            }
        }
    });

    if (matchedAny && !isExactDono) {
        userCooldowns[nick] = Date.now() + (currentCooldownSec * 1000);
    }

    if (matchedAny) {
        checkFirstBlood(nick);
        checkBingo(nick);
    }
}

function checkFirstBlood(nick) {
    if (!firstBloodTriggered) {
        firstBloodTriggered = true;
        if (typeof showFirstBloodUI === "function") {
            showFirstBloodUI(nick);
        }
    }
}

function checkBingo(nick) {
    let lastLineCompleted = false;
    let newlyCompletedLines = [];

    winningLines.forEach((line, lineIndex) => {
        if (completedLines.has(lineIndex)) return;

        let isComplete = line.every(cellIdx => isRevealed[cellIdx]);
        if (isComplete) {
            completedLines.add(lineIndex);
            currentBingoCount++;
            
            let lineNum = completedLines.size;
            lineAchievers.push(`${lineNum}번라인 달성자 : ${nick}`);
            newlyCompletedLines.push(lineIndex);

            if (typeof updateScoreUI === "function") {
                updateScoreUI();
            }

            if (currentBingoCount >= targetBingoLines) {
                lastLineCompleted = true;
            }
        }
    });

    newlyCompletedLines.forEach((lineIdx, i) => {
        setTimeout(() => {
            if (typeof drawBingoLineUI === "function") {
                drawBingoLineUI(lineIdx);
            }
        }, i * 200); 
    });

    if (lastLineCompleted && !isGameOver) {
        isGameOver = true;
        setTimeout(() => {
            if (typeof triggerSuccessUI === "function") {
                triggerSuccessUI(lineAchievers);
            }
        }, newlyCompletedLines.length * 200 + 500);
    }
}

function checkCooldowns() {
    if (!gameStarted) return;
    let now = Date.now();
    let activeUsers = [];

    for (let u in userCooldowns) {
        if (userCooldowns[u] > now) {
            activeUsers.push(u);
        } else {
            delete userCooldowns[u];
        }
    }

    if (typeof updateCooldownUI === "function") {
        updateCooldownUI(activeUsers.join(', '));
    }
}

function handleStorageEvent(e) {
    if (e.key === 'bingo_init') {
        let data = JSON.parse(e.newValue);
        bingoWords = [...data.words].sort(() => Math.random() - 0.5);
        isRevealed = new Array(25).fill(false);
        targetBingoLines = data.targetLines;
        currentCooldownSec = data.cooldownSec;
        currentDonoAmount = data.donoAmount;
        currentRevealDonoAmount = data.revealDonoAmount || 0;
        
        currentSubject = data.subject || "";
        currentReward = data.reward || "";
        
        currentBingoCount = 0;
        completedLines.clear();
        lineAchievers = [];
        userCooldowns = {};
        isGameOver = false;
        gameStarted = true;
        firstBloodTriggered = false;

        if (typeof renderBoardUI === "function") {
            renderBoardUI();
        }
    }
    
    if (e.key === 'bingo_end') {
        gameStarted = false;
        isGameOver = false;
        if (typeof hideOverlayUI === "function") {
            hideOverlayUI();
        }
    }

    if (e.key === 'bingo_chat') {
        let data = JSON.parse(e.newValue);
        processChat(data.nick, data.msg, data.isDono, data.amount);
    }

    if (e.key === 'bingo_view_control') {
        let data = JSON.parse(e.newValue);
        if (typeof toggleSuccessView === "function") {
            toggleSuccessView(data.showResult);
        }
    }
}