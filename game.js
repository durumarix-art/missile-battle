const terrainCanvas = document.getElementById('terrain-canvas');
const entityCanvas = document.getElementById('entity-canvas');
const terrainCtx = terrainCanvas.getContext('2d', { willReadFrequently: true });
const entityCtx = entityCanvas.getContext('2d');

let width, height;

// UI 오브젝트
const windMeter = document.getElementById('wind-meter');
const turnIndicator = document.getElementById('turn-indicator');
const angleDisplay = document.getElementById('angle-display');
const powerFill = document.getElementById('power-fill');
const hpP1 = document.getElementById('hp-p1');
const hpTextP1 = document.getElementById('hp-text-p1');
const hpP2 = document.getElementById('hp-p2');
const hpTextP2 = document.getElementById('hp-text-p2');
const gameOverScreen = document.getElementById('game-over-screen');
const winnerText = document.getElementById('winner-text');
const cpuToggle = document.getElementById('cpu-toggle'); // CPU 토글 버튼 추가

// 게임 물리 상수
const GRAVITY = 0.2; 
const TANK_WIDTH = 34;
const TANK_HEIGHT = 16;
const MAX_POWER = 22; 

// 게임 진행 상태
let state = 'GAMEOVER'; // AIMING, FIRING, WAITING, CPU_THINKING, GAMEOVER
let currentPlayer = 1;
let wind = 0;
let spacePressed = false;
let isCpuMode = true; // 무조건 CPU 대전 모드 (1인용 싱글 플레이 전용)

let missile = null;
let p1 = { x: 150, y: 0, hp: 100, angle: 45, power: 0, color: '#00f2fe' };
let p2 = { x: 850, y: 0, hp: 100, angle: 135, power: 0, color: '#ff0844' };

let audioCtx;
let bgmOsc = false;

function initAudio() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    
    // 첫 조작 시 배경음악(BGM) 자동 재생 (한번만 실행)
    if(!bgmOsc) {
        bgmOsc = true;
        const bass = [110, 0, 110, 0, 130.8, 0, 98, 0]; // 쫀득한 8비트 베이스라인 루프
        let idx = 0;
        setInterval(() => {
            if(state === 'GAMEOVER' || audioCtx.state === 'suspended') return;
            let freq = bass[idx];
            idx = (idx + 1) % bass.length;
            if(freq > 0) {
                let osc = audioCtx.createOscillator();
                let gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.015, audioCtx.currentTime); // 배경음이므로 살짝 작게
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.2);
            }
        }, 250); // 1.5비트 간격
    }
}

function playSound(type) {
    if(!audioCtx) return;
    const now = audioCtx.currentTime;
    
    if (type === 'shoot') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'explode') {
        // 1. 거친 화약 파편 소리 (White Noise Burst)
        const bufferSize = audioCtx.sampleRate * 1.0; 
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(40, now + 0.8);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(1.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        noise.start(now);
        
        // 2. 묵직하고 탁 터지는 지진음 (Sub-bass Impact)
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now); // 피치가 뚜욱 떨어지며 물리적 타격 연출
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
        oscGain.gain.setValueAtTime(2.0, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        
        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
    }
}

function init() {
    const wrapper = document.getElementById('canvas-wrapper');
    
    // 매 게임(스테이지) 시작 시 무작위 테마 배경 그라데이션 적용
    const backgrounds = [
        'linear-gradient(to bottom, #0f2027, #203a43, #2c5364)', // 오리지널 밤하늘
        'linear-gradient(to bottom, #2b1055, #7597de)',          // 새벽 보라빛
        'linear-gradient(to bottom, #ff4e50, #f9d423)',          // 불타는 석양
        'linear-gradient(to bottom, #114357, #f29492)',          // 황혼 노을
        'linear-gradient(to bottom, #1a2a6c, #b21f1f, #fdbb2d)'  // 스페이스 컬러
    ];
    wrapper.style.background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    
    width = wrapper.clientWidth;
    height = wrapper.clientHeight;
    
    terrainCanvas.width = width;
    terrainCanvas.height = height;
    entityCanvas.width = width;
    entityCanvas.height = height;
    
    p1.x = width * 0.15;
    p2.x = width * 0.85;

    generateTerrain();
    
    p1.y = getTerrainY(p1.x) - TANK_HEIGHT / 2;
    p2.y = getTerrainY(p2.x) - TANK_HEIGHT / 2;

    state = 'AIMING';
    currentPlayer = 1;
    spacePressed = false;
    randomizeWind();

    updateUI();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    requestAnimationFrame(gameLoop);
}

function randomizeWind() {
    wind = (Math.random() - 0.5) * 0.15; // 바람 영향을 대폭 감소 (기존 0.4 -> 0.15)
    let displayWind = Math.round(wind * 200); // UI 표시 스케일링
    let direction = displayWind > 0 ? "→" : (displayWind < 0 ? "←" : "");
    windMeter.innerText = `${Math.abs(displayWind)} ${direction}`;
}

function generateTerrain() {
    terrainCtx.clearRect(0, 0, width, height);
    terrainCtx.beginPath();
    terrainCtx.moveTo(0, height);
    
    // 지형의 주기(넓이), 진폭(높낮이), 위상, 고도를 모두 과감하게 무작위화합니다.
    let rnd1 = Math.random() * 80 + 50;     // 기본 굴곡 주기: 50 ~ 130 
    let rnd2 = Math.random() * 60 + 30;     // 세밀한 굴곡 주기: 30 ~ 90
    let rnd3 = Math.random() * 200 + 80;    // 거대한 언덕 주기: 80 ~ 280
    
    let amp1 = Math.random() * 50 + 20;     // 기본 굴곡 평탄도: 20 ~ 70
    let amp2 = Math.random() * 40 + 10;     // 세밀한 굴곡 평탄도: 10 ~ 50
    let amp3 = Math.random() * 100 + 40;    // 거대한 산맥/협곡 깊이: 40 ~ 140
    
    let phase1 = Math.random() * Math.PI * 2;
    let phase2 = Math.random() * Math.PI * 2;
    let phase3 = Math.random() * Math.PI * 2;
    
    // 전체적인 땅의 높이(고도)를 크게 무작위로 변경합니다. (위로 15% ~ 아래로 25% 넓게 변동)
    let heightOffset = (Math.random() * 0.4) - 0.15; 

    for(let x = 0; x <= width; x += 5) {
        let y = height * (0.6 + heightOffset) + 
                Math.sin(x / rnd1 + phase1) * amp1 + 
                Math.sin(x / rnd2 + phase2) * amp2 + 
                Math.cos(x / rnd3 + phase3) * amp3;
                
        // 꼭대기와 바닥 한계치 약간 넓혀서 극단적인 지형 허용
        y = Math.max(height * 0.15, Math.min(height * 0.95, y));
        terrainCtx.lineTo(x, y);
    }
    terrainCtx.lineTo(width, height);
    terrainCtx.closePath();
    
    terrainCtx.fillStyle = '#1c2833';
    terrainCtx.fill();
    
    terrainCtx.strokeStyle = '#45a29e';
    terrainCtx.lineWidth = 3;
    terrainCtx.stroke();
}

function getTerrainY(x) {
    const px = Math.floor(Math.max(0, Math.min(width - 1, x)));
    const imgData = terrainCtx.getImageData(px, 0, 1, height).data;
    for(let y = 0; y < height; y++) {
        if(imgData[y * 4 + 3] > 50) return y; 
    }
    return height;
}

function handleKeyDown(e) {
    if(state !== 'AIMING') return;
    initAudio(); 
    
    if(['ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(e.key) || e.code === 'Space') {
        e.preventDefault(); 
    }
    
    const p = currentPlayer === 1 ? p1 : p2;
    
    if(e.code === 'ArrowUp') {
        if(currentPlayer === 1) p.angle = Math.min(180, Math.max(0, p.angle + 1));
        else p.angle = Math.min(180, Math.max(0, p.angle - 1));
        updateUI();
    }
    if(e.code === 'ArrowDown') {
        if(currentPlayer === 1) p.angle = Math.min(180, Math.max(0, p.angle - 1));
        else p.angle = Math.min(180, Math.max(0, p.angle + 1));
        updateUI();
    }
    if(e.code === 'Space' && !spacePressed) {
        spacePressed = true;
        p.power = 0;
    }
}

function handleKeyUp(e) {
    if(state !== 'AIMING') return;
    
    if(e.code === 'Space') {
        spacePressed = false;
        fireMissile(currentPlayer === 1 ? p1 : p2);
    }
}

function updateUI() {
    const p = currentPlayer === 1 ? p1 : p2;
    angleDisplay.innerText = p.angle + '°';
    powerFill.style.width = Math.min(100, (p.power / MAX_POWER) * 100) + '%';
    
    let turnName = currentPlayer === 1 ? "PLAYER 1" : (isCpuMode ? "CPU (Player 2)" : "PLAYER 2");
    turnIndicator.innerText = `${turnName} TURN`;
    turnIndicator.className = `turn-p${currentPlayer}`;
    
    hpP1.style.width = p1.hp + '%';
    hpTextP1.innerText = Math.round(p1.hp);
    hpP2.style.width = p2.hp + '%';
    hpTextP2.innerText = Math.round(p2.hp);
}

function fireMissile(player) {
    state = 'FIRING';
    playSound('shoot'); 
    
    let finalPower = Math.max(8, player.power); 
    let rad = player.angle * Math.PI / 180;
    
    // 투사체 생성 위치를 포탑(탱크 머리)이 아닌 대포(포신) 끝으로 변경하여
    // 각도가 낮을 때 바로 눈앞의 땅에 충돌해서 자폭해버리는 문제를 해결
    missile = {
        x: player.x + Math.cos(rad) * 22,
        y: player.y - TANK_HEIGHT/2 - Math.sin(rad) * 22,
        vx: Math.cos(rad) * finalPower,
        vy: -Math.sin(rad) * finalPower,
        radius: 4,
        trail: []
    };
    
    player.power = 0;
    updateUI();
}

// ==========================================
// CPU (컴퓨터) 인공지능 로직
// ==========================================
function playCPUTurn() {
    // 1초간 생각(대기)하는 척 연출
    setTimeout(() => {
        if(state === 'GAMEOVER') return;
        
        let targetX = p1.x;
        let targetY = p1.y;
        
        // 성능 하락을 막기 위해 시뮬레이션 직전에 지형 높이맵을 캐싱
        let heightMap = new Int16Array(width);
        for(let x = 0; x < width; x += 5) heightMap[x] = getTerrainY(x);
        function fastGetTerrainY(x) {
            let px = Math.floor(x);
            if(px < 0) px = 0;
            if(px >= width) px = width - 1;
            px = Math.round(px / 5) * 5;
            if(px >= width) px = width - 5;
            return heightMap[px];
        }

        let bestAngle = 135;
        let bestPower = 15;
        let minDiff = 99999;
        
        // 110도부터 180도까지 모든 각도, 모든 파워 조합을 시뮬레이션
        for(let a = 110; a <= 180; a += 5) {
            for(let p = 8; p <= MAX_POWER; p += 1) {
                let rad = a * Math.PI / 180;
                let simX = p2.x + Math.cos(rad) * 22;
                let simY = p2.y - TANK_HEIGHT/2 - Math.sin(rad) * 22;
                let v_x = Math.cos(rad) * p;
                let v_y = -Math.sin(rad) * p;
                
                let pMinDiff = 99999;
                for(let t = 0; t < 150; t++) {
                    v_x += wind;
                    v_y += GRAVITY;
                    simX += v_x;
                    simY += v_y;
                    
                    if (simX >= 0 && simX < width && simY > 0) {
                        // 지형에 충돌했다면
                        if (simY >= fastGetTerrainY(simX)) {
                            let diff = Math.hypot(simX - targetX, simY - targetY);
                            if (diff < pMinDiff) pMinDiff = diff;
                            
                            // P1 위치에 도달하기 한참 전(산이나 벽)에 부딪혔다면 절대 채택 안 함 (고의 패널티)
                            if (simX > targetX + 60) pMinDiff = 99999;
                            break;
                        }
                    }
                    
                    let diff = Math.hypot(simX - targetX, simY - targetY);
                    if (diff < pMinDiff) pMinDiff = diff;
                    
                    if (simY > height || simX < targetX - 50) break;
                }
                
                // 장애물을 넘어가며 P1에게 가장 가깝게 꽂히는 (최고의 효율) 궤적을 픽스
                if (pMinDiff < minDiff) {
                    minDiff = pMinDiff;
                    bestAngle = a;
                    bestPower = p;
                }
            }
        }
        
        // CPU가 찾아낸 최고 정밀 각도를 조준!
        p2.angle = bestAngle;
        updateUI();
        
        // 백발백중이면 숨 막히므로, 약간의 인간다운 삑사리(오차) 추가
        let finalPower = bestPower + (Math.random() - 0.5) * 1.5;
        finalPower = Math.max(8, Math.min(MAX_POWER, finalPower));
        
        // 스페이스바를 누른 것처럼 파워 게이지가 차오르는 애니메이션
        let currentPower = 0;
        let chargeInterval = setInterval(() => {
            currentPower += 0.4;
            p2.power = currentPower;
            updateUI();
            
            if(currentPower >= finalPower) {
                clearInterval(chargeInterval);
                p2.power = 0;  // UI 게이지 초기화
                
                // 실제 미사일 발사 처리
                fireMissile(p2);
                
                // fireMissile()는 최소 발사속도등을 보정하므로 정확한 시뮬레이션 값을 덮어씌움
                missile.vx = Math.cos(p2.angle * Math.PI / 180) * finalPower;
                missile.vy = -Math.sin(p2.angle * Math.PI / 180) * finalPower;
            }
        }, 20); // 20ms마다 게이지 상승
        
    }, 1000);
}

function gameLoop() {
    if(state === 'GAMEOVER') return;
    
    // 플레이어 1 파워 차징 (꾹 누르기)
    if(state === 'AIMING' && spacePressed && currentPlayer === 1) {
        p1.power += 0.35;
        if(p1.power > MAX_POWER) p1.power = MAX_POWER;
        updateUI();
    } 
    // 플레이어 2 파워 차징 (CPU 모드가 꺼져있을 때만 수동)
    else if (state === 'AIMING' && spacePressed && currentPlayer === 2 && !isCpuMode) {
        p2.power += 0.35;
        if(p2.power > MAX_POWER) p2.power = MAX_POWER;
        updateUI();
    }
    
    p1.y += (getTerrainY(p1.x) - p1.y - TANK_HEIGHT/2) * 0.2;
    p2.y += (getTerrainY(p2.x) - p2.y - TANK_HEIGHT/2) * 0.2;
    
    if(state === 'FIRING' && missile) {
        missile.trail.push({x: missile.x, y: missile.y});
        if(missile.trail.length > 20) missile.trail.shift();
        
        missile.vx += wind;
        missile.vy += GRAVITY;
        missile.x += missile.vx;
        missile.y += missile.vy;
        
        if(missile.x < -200 || missile.x > width + 200 || missile.y > height + 200) {
            nextTurn();
        } 
        else if (missile.x >= 0 && missile.x <= width && missile.y >= 0 && missile.y <= height) {
            let px = Math.floor(missile.x);
            let py = Math.floor(missile.y);
            let imgData = terrainCtx.getImageData(px, py, 1, 1).data;
            let hitTerrain = imgData[3] > 50;
            
            let distP1 = Math.hypot(missile.x - p1.x, missile.y - p1.y);
            let distP2 = Math.hypot(missile.x - p2.x, missile.y - p2.y);
            
            if(hitTerrain || distP1 < 25 || distP2 < 25) {
                explode(missile.x, missile.y);
            }
        }
    }
    
    drawEntityCanvas(); 
    requestAnimationFrame(gameLoop); 
}

function explode(x, y) {
    playSound('explode'); 
    
    // 탱크 윗부분 직격타 시에도 지형이 파이도록 크기 보완 (25 -> 35)
    // (탱크 모델보다 반경이 너무 작으면, 직격 시 공중에서 터져서 땅이 파이지 않는 현상 해결)
    const explosionRadius = 35; 
    
    terrainCtx.globalCompositeOperation = 'destination-out';
    terrainCtx.beginPath();
    terrainCtx.arc(x, y, explosionRadius, 0, Math.PI * 2);
    terrainCtx.fill();
    terrainCtx.globalCompositeOperation = 'source-over'; 
    
    const damageCalc = (dist) => dist < (explosionRadius + 15) ? ((explosionRadius + 15) - dist) * 1.5 : 0;
    
    let distP1 = Math.hypot(x - p1.x, y - p1.y);
    let distP2 = Math.hypot(x - p2.x, y - p2.y);
    
    p1.hp = Math.max(0, p1.hp - damageCalc(distP1));
    p2.hp = Math.max(0, p2.hp - damageCalc(distP2));
    
    updateUI();
    
    entityCtx.fillStyle = 'rgba(255, 100, 0, 0.8)';
    entityCtx.beginPath();
    entityCtx.arc(x, y, explosionRadius + 5, 0, Math.PI * 2);
    entityCtx.fill();
    
    state = 'WAITING';
    missile = null;
    
    if(p1.hp <= 0 || p2.hp <= 0) {
        setTimeout(gameOver, 800);
    } else {
        setTimeout(nextTurn, 800);
    }
}

function nextTurn() {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    randomizeWind(); 
    state = 'AIMING';
    updateUI();
    
    // 다음 턴이 Player 2인데 'CPU MODE'가 켜져 있다면, 입력을 막고 CPU 로직 실행!
    if(currentPlayer === 2 && isCpuMode) {
        state = 'CPU_THINKING';
        playCPUTurn();
    }
}

function gameOver() {
    state = 'GAMEOVER';
    let winner = p1.hp > 0 ? 1 : 2;
    if(p1.hp <= 0 && p2.hp <= 0) winner = "무승부";
    
    let winMsg = winner === "무승부" ? "DRAW!" : `PLAYER ${winner} WINS!`;
    if(winner === 2 && isCpuMode) winMsg = "CPU WINS!"; // CPU 승리 메시지 지원
    
    winnerText.innerText = winMsg;
    if(winner === 1) winnerText.style.color = p1.color;
    else if(winner === 2) winnerText.style.color = p2.color;
    
    gameOverScreen.classList.remove('hidden');
}

function drawEntityCanvas() {
    entityCtx.clearRect(0, 0, width, height); 
    
    [p1, p2].forEach((p, idx) => {
        let isCurrentTurn = (idx + 1) === currentPlayer && (state === 'AIMING' || state === 'CPU_THINKING');
        
        if(isCurrentTurn) {
            entityCtx.shadowBlur = 15;
            entityCtx.shadowColor = p.color;
        } else {
            entityCtx.shadowBlur = 0;
        }
        
        entityCtx.fillStyle = p.color;
        
        entityCtx.fillRect(p.x - TANK_WIDTH/2, p.y - TANK_HEIGHT/2, TANK_WIDTH, TANK_HEIGHT);
        
        entityCtx.beginPath();
        entityCtx.arc(p.x, p.y - TANK_HEIGHT/2, 9, 0, Math.PI*2);
        entityCtx.fill();
        
        entityCtx.strokeStyle = p.color;
        entityCtx.lineWidth = 5;
        entityCtx.lineCap = 'round';
        entityCtx.beginPath();
        entityCtx.moveTo(p.x, p.y - TANK_HEIGHT/2);
        
        let cRad = p.angle * Math.PI / 180;
        entityCtx.lineTo(p.x + Math.cos(cRad)*22, p.y - TANK_HEIGHT/2 - Math.sin(cRad)*22);
        entityCtx.stroke();
        
        entityCtx.shadowBlur = 0; 
    });
    
    if(state === 'AIMING' || state === 'CPU_THINKING') {
        const p = currentPlayer === 1 ? p1 : p2;
        let p_rad = p.angle * Math.PI / 180;
        let v_x = Math.cos(p_rad) * MAX_POWER; 
        let v_y = -Math.sin(p_rad) * MAX_POWER;
        
        entityCtx.beginPath();
        entityCtx.setLineDash([4, 8]); 
        entityCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        entityCtx.lineWidth = 2;
        
        let tx = p.x;
        let ty = p.y - TANK_HEIGHT/2;
        entityCtx.moveTo(tx, ty);
        
        for(let i=0; i<30; i++) {
            v_x += wind;
            v_y += GRAVITY;
            tx += v_x;
            ty += v_y;
            entityCtx.lineTo(tx, ty);
        }
        entityCtx.stroke();
        entityCtx.setLineDash([]); 
    }
    
    if(missile) {
        if(missile.trail.length > 0) {
            entityCtx.beginPath();
            entityCtx.moveTo(missile.trail[0].x, missile.trail[0].y);
            for(let i=1; i<missile.trail.length; i++) {
                entityCtx.lineTo(missile.trail[i].x, missile.trail[i].y);
            }
            entityCtx.strokeStyle = 'rgba(255, 230, 0, 0.6)';
            entityCtx.lineWidth = 2;
            entityCtx.stroke();
        }
        
        entityCtx.fillStyle = '#fff';
        entityCtx.shadowBlur = 12;
        entityCtx.shadowColor = '#ffff00';
        entityCtx.beginPath();
        entityCtx.arc(missile.x, missile.y, missile.radius, 0, Math.PI*2);
        entityCtx.fill();
        entityCtx.shadowBlur = 0;
    }
}

window.onload = init;
