// ============================================================================
// AXION AI - PROFESSIONAL EDITION v27.0 (CLEAN DUAL MINING)
// جميع الحقوق محفوظة © 2024 Axion AI
// ============================================================================

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0c0f');
    tg.setBackgroundColor('#0a0c0f');
    console.log('✅ AXION AI v27.0 Ready');
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    axcPrice: 0.01,
    swapFeeTON: 5,
    minSwap: 100,
    maxSwap: 100000,
    ownerWallet: null,
    botUsername: 'AxionBep20Airdropbot',
    BASE_MINING_REWARD: 400,
    REWARD_PER_AD: 10,
    COOLDOWN_MS: 2.5 * 60 * 60 * 1000,
    MAX_AD_BONUS: 400,
    BOOSTS: {
        bronze: { price: 2.5, reward: 800, name: 'BRONZE' },
        silver: { price: 5, reward: 1250, name: 'SILVER' },
        gold: { price: 10, reward: 2500, name: 'GOLD' }
    },
    tasks: [
        { id: 1, name: 'Join Telegram Channel', url: 'https://t.me/AxionAiSignal', reward: 10, completed: false },
        { id: 2, name: 'Follow and RT axc post', url: 'https://x.com/Daily_AirdropX', reward: 10, completed: false },
        { id: 3, name: 'Restart bot', url: 'https://t.me/AxionBep20Airdropbot?start', reward: 10, completed: false },
        { id: 4, name: 'Join Community', url: 'https://t.me/AxionAiSignals', reward: 10, completed: false }
    ]
};

const CMC_ICONS = {
    BTC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1.png',
    ETH: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
    BNB: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png',
    TON: 'https://s2.coinmarketcap.com/static/img/coins/64x64/11419.png',
    AXC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/38901.png',
    USDT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png'
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

let currentUser = null;
let userId = null;
let db = null;
let livePrices = {};
let tonConnected = false;
let tonWalletAddress = null;
let isActivating = false;
let isSwapping = false;
let isClaiming = false;
let adSequenceActive = false;
let withdrawCurrency = 'AXC';
let notifications = [];
let unreadCount = 0;
let miningTimer = null;
let isProcessingWithdraw = false;

let miningState = {
    adBonus: 0,
    boostType: null,
    boostExpiry: null
};

// ============================================================================
// UTILITIES
// ============================================================================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const toastMsg = document.getElementById('toastMessage');
    if (toastMsg) toastMsg.textContent = message;
    toast.classList.remove('hidden');
    const icon = toast.querySelector('i');
    if (icon) {
        if (type === 'success') icon.className = 'fas fa-check-circle';
        else if (type === 'error') icon.className = 'fas fa-exclamation-circle';
        else icon.className = 'fas fa-info-circle';
    }
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function formatTimeLeft(ms) {
    if (ms <= 0) return 'Ready!';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============================================================================
// MINING SYSTEM - CACHE ONLY (CLEAN DUAL CORE)
// ============================================================================

function loadMiningState() {
    if (!userId) return;
    const saved = localStorage.getItem(`axion_mining_${userId}`);
    if (saved) {
        try {
            miningState = { ...miningState, ...JSON.parse(saved) };
        } catch(e) {}
    }
}

function saveMiningState() {
    if (!userId) return;
    localStorage.setItem(`axion_mining_${userId}`, JSON.stringify(miningState));
}

function getLastClaimTime() {
    return parseInt(localStorage.getItem(`lastMiningClaim_${userId}`) || '0');
}

function setLastClaimTime() {
    localStorage.setItem(`lastMiningClaim_${userId}`, Date.now().toString());
}

function canClaimMining() {
    return Date.now() - getLastClaimTime() >= CONFIG.COOLDOWN_MS;
}

function getCurrentBaseReward() {
    if (miningState.boostType && CONFIG.BOOSTS[miningState.boostType]) {
        return CONFIG.BOOSTS[miningState.boostType].reward;
    }
    return CONFIG.BASE_MINING_REWARD;
}

// ====================== CLEAN DUAL MINING UI ======================
function updateMiningUI() {
    if (!userId) return;

    // New Dual Core Elements
    const timeFill = document.getElementById('timeProgressFill');
    const rewardFill = document.getElementById('rewardProgressFill');
    const timeText = document.getElementById('timeRemaining');
    const adText = document.getElementById('adBonusDisplay');
    const claimBtn = document.getElementById('claimMiningBtn');
    const rigStatus = document.getElementById('rigStatus');

    const elapsed = Date.now() - getLastClaimTime();
    const timeProgress = Math.min(100, (elapsed / CONFIG.COOLDOWN_MS) * 100);
    const adBonus = miningState.adBonus || 0;
    const adPercent = Math.min(100, (adBonus / CONFIG.MAX_AD_BONUS) * 100);
    const totalReward = getCurrentBaseReward() + adBonus;

    // Time Belt
    if (timeFill) timeFill.style.width = `${timeProgress}%`;
    if (timeText) {
        timeText.textContent = canClaimMining() ? "⚡ READY TO CLAIM ⚡" : formatTimeLeft(CONFIG.COOLDOWN_MS - elapsed);
    }

    // Reward Belt
    if (rewardFill) rewardFill.style.width = `${adPercent}%`;
    if (adText) adText.textContent = `${adBonus} AXC`;

    // Rig Status
    if (rigStatus) {
        rigStatus.textContent = miningState.boostType 
            ? `${CONFIG.BOOSTS[miningState.boostType].name} BOOST • ACTIVE` 
            : 'LEVEL 1 • FREE';
    }

    // Claim Button
    if (claimBtn) {
        if (canClaimMining()) {
            claimBtn.innerHTML = `<i class="fas fa-leaf"></i><span>HARVEST ${totalReward.toLocaleString()} AXC</span>`;
            claimBtn.disabled = false;
        } else {
            claimBtn.innerHTML = `<i class="fas fa-clock"></i><span>WAIT FOR CYCLE</span>`;
            claimBtn.disabled = true;
        }
    }

    // Safe fallback for old elements (to not break anything)
    const oldProgress = document.getElementById('progressFillLegendary');
    if (oldProgress) oldProgress.style.width = `${adPercent}%`;

    const oldCounter = document.getElementById('adsWatchedCounter');
    if (oldCounter) oldCounter.textContent = `${Math.floor(adBonus / CONFIG.REWARD_PER_AD)} / 40`;

    const miningRateValue = document.getElementById('miningRateValue');
    if (miningRateValue) {
        const rate = getCurrentBaseReward() / 40;
        miningRateValue.textContent = `${rate} AXC`;
    }

    const miningPowerValue = document.getElementById('miningPowerValue');
    if (miningPowerValue) {
        miningPowerValue.textContent = miningState.boostType 
            ? CONFIG.BOOSTS[miningState.boostType].name 
            : 'STANDARD';
    }

    const totalMinedDisplay = document.getElementById('totalMinedDisplay');
    if (totalMinedDisplay) {
        const totalMined = parseInt(localStorage.getItem(`totalMined_${userId}`) || '0');
        totalMinedDisplay.textContent = `${totalMined.toLocaleString()} AXC`;
    }
}

function startMiningTimer() {
    if (miningTimer) clearInterval(miningTimer);
    miningTimer = setInterval(() => {
        try {
            updateMiningUI();
        } catch(e) {
            console.error('Timer error:', e);
        }
    }, 1000);
}

// ============================================================================
// FLYING COIN EFFECT
// ============================================================================

function createFlyingCoin(delay = 0) {
    setTimeout(() => {
        const container = document.getElementById('floatingCoins');
        if (!container) return;
        
        const coin = document.createElement('div');
        coin.className = 'flying-coin';
        coin.innerHTML = `✦ +${CONFIG.REWARD_PER_AD} AXC ✦`;
        coin.style.left = (30 + Math.random() * 40) + '%';
        coin.style.top = (40 + Math.random() * 30) + '%';
        container.appendChild(coin);
        
        setTimeout(() => coin.remove(), 2500);
    }, delay);
}

function showConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const colors = ['#39ff14', '#00ff88', '#2ecc71', '#f1c40f', '#e74c3c'];
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4, speedY: Math.random() * 8 + 4,
            speedX: (Math.random() - 0.5) * 5, color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360, rotationSpeed: (Math.random() - 0.5) * 12
        });
    }
    let animationId, start = Date.now();
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let allFinished = true;
        for (let p of particles) {
            if (p.y < canvas.height + 100) {
                allFinished = false;
                p.y += p.speedY; p.x += p.speedX; p.rotation += p.rotationSpeed;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                ctx.restore();
            }
        }
        if (allFinished || Date.now() - start > 3000) {
            cancelAnimationFrame(animationId);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            animationId = requestAnimationFrame(animate);
        }
    }
    animate();
}

// ============================================================================
// AD PLATFORMS
// ============================================================================

const AD_PLATFORMS = [
    { name: 'adsgram', init: () => window.Adsgram, show: (ctrl) => ctrl.init({ blockId: "int-33659" }).show() },
    { name: 'taddy', init: () => window.Taddy, show: (ctrl) => new Promise((resolve) => {
        ctrl.showRewardedVideo({ onReward: () => resolve(true), onError: () => resolve(false), onClose: () => resolve(false) });
    }) },
    { name: 'monetag', init: () => typeof window.show_11082910 === 'function' ? window.show_11082910 : null, show: (ctrl) => ctrl().then(() => true).catch(() => false) },
    { name: 'richads', init: () => window.TelegramAdsController, show: (ctrl) => new Promise((resolve) => {
        if (!ctrl.initialized) { ctrl.initialize({ pubId: "1009657", appId: "7614" }); ctrl.initialized = true; }
        ctrl.showRewardedVideo({ onReward: () => resolve(true), onError: () => resolve(false) });
    }) },
    { name: 'adexium', init: () => window.AdexiumWidget, show: (ctrl) => new Promise((resolve) => {
        const widget = new ctrl({ wid: '63f66ba6-7410-4f47-adc1-0da3259f4c40', adFormat: 'rewarded', debug: false });
        let resolved = false;
        widget.on('adPlaybackCompleted', () => { if (!resolved) { resolved = true; resolve(true); } });
        widget.on('noAdFound', () => { if (!resolved) { resolved = true; resolve(false); } });
        widget.on('adReceived', (ad) => widget.displayAd(ad));
        widget.requestAd('rewarded');
    }) },
    { name: 'gigapub', init: () => typeof window.showGiga === 'function' ? window.showGiga : null, show: (ctrl) => ctrl('main').then(() => true).catch(() => false) }
];

async function tryShowAd(platform) {
    try {
        const controller = platform.init();
        if (!controller) return false;
        return await platform.show(controller) === true;
    } catch(e) {
        return false;
    }
}

async function watchAd() {
    if (adSequenceActive) {
        showToast('Ad is playing...', 'warning');
        return;
    }
    
    if ((miningState.adBonus || 0) >= CONFIG.MAX_AD_BONUS) {
        showToast('🏆 Max bonus reached! Claim your reward!', 'warning');
        return;
    }
    
    adSequenceActive = true;
    const btn = document.getElementById('watchAdBtn');
    const originalText = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> LOADING AD...';
    }
    
    let success = false;
    for (const platform of AD_PLATFORMS) {
        success = await tryShowAd(platform);
        if (success) break;
    }
    
    if (success) {
        const newBonus = Math.min((miningState.adBonus || 0) + CONFIG.REWARD_PER_AD, CONFIG.MAX_AD_BONUS);
        miningState.adBonus = newBonus;
        saveMiningState();

        createFlyingCoin(0);
        createFlyingCoin(150);
        createFlyingCoin(300);

        updateMiningUI();
        
        const remaining = CONFIG.MAX_AD_BONUS - newBonus;
        if (remaining === 0) {
            showToast(`🎉 MAX BONUS! Claim ${(getCurrentBaseReward() + newBonus).toLocaleString()} AXC`, 'success');
        } else {
            showToast(`✅ +${CONFIG.REWARD_PER_AD} AXC (${remaining} to max)`, 'success');
        }
    } else {
        showToast('Ad failed to load. Please try again.', 'error');
    }
    
    adSequenceActive = false;
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText || '<i class="fas fa-play-circle"></i> WATCH AD <small>+10 AXC</small>';
    }
}

async function claimMiningReward() {
    if (!canClaimMining()) {
        const remaining = CONFIG.COOLDOWN_MS - (Date.now() - getLastClaimTime());
        showToast(`⏳ ${formatTimeLeft(remaining)} remaining`, 'warning');
        return;
    }

    if (isClaiming) return;
    isClaiming = true;

    const baseReward = getCurrentBaseReward();
    const adBonus = miningState.adBonus || 0;
    const totalReward = baseReward + adBonus;

    const claimBtn = document.getElementById('claimMiningBtn');
    if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.innerHTML = '<span class="spinner"></span> PROCESSING...';
    }

    try {
        const res = await fetch('/api/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: totalReward, currency: 'AXC' })
        });

        const data = await res.json();

        if (data.success) {
            const currentTotal = parseInt(localStorage.getItem(`totalMined_${userId}`) || '0');
            localStorage.setItem(`totalMined_${userId}`, (currentTotal + totalReward).toString());
            
            miningState.adBonus = 0;
            setLastClaimTime();
            saveMiningState();

            await loadUserData();
            updateMiningUI();

            showToast(`🎉 Claimed ${totalReward.toLocaleString()} AXC!`, 'success');
            showConfetti();
            
            for (let i = 0; i < 5; i++) {
                setTimeout(() => createFlyingCoin(i * 100), i * 100);
            }
        } else {
            showToast(data.error || 'Claim failed', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    } finally {
        isClaiming = false;
        updateMiningUI();
    }
}

// ============================================================================
// BOOST SYSTEM
// ============================================================================

async function activateBoost(boostKey) {
    const boost = CONFIG.BOOSTS[boostKey];
    if (!boost) return;
    if (!tonConnected || !tonWalletAddress) {
        showToast('Connect TON wallet first', 'warning');
        if (window.tonConnectUI) {
            try {
                await window.tonConnectUI.openModal();
            } catch(e) {}
        }
        return;
    }
    if (!CONFIG.ownerWallet) {
        showToast('Owner wallet not configured', 'error');
        return;
    }
    
    try {
        showToast('Processing payment...', 'info');
        await window.tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{ address: CONFIG.ownerWallet, amount: (boost.price * 1e9).toString() }]
        });
        
        miningState.boostType = boostKey;
        miningState.boostExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000);
        saveMiningState();
        updateMiningUI();
        addNotification('Boost Activated!', `${boost.name} boost activated for 30 days!`, 'success');
        showToast(`✅ ${boost.name} BOOST ACTIVATED!`, 'success');
        
        const boostOptions = document.getElementById('boostOptions');
        if (boostOptions) boostOptions.style.display = 'none';
    } catch(e) {
        showToast('Payment cancelled or failed', 'error');
    }
}

// ============================================================================
// TASKS SYSTEM
// ============================================================================

// ==================== TASKS SYSTEM ====================

// إضافة متغير لحفظ حالة تنفيذ المهام لكل مستخدم
let taskProcessing = {};

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    if (!userId) return;
    
    // محاولة جلب المهام المخزنة محلياً
    let tasks = localStorage.getItem(`axion_tasks_${userId}`);
    
    if (!tasks) {
        // إذا لم تكن هناك مهام مخزنة، استخدم CONFIG
        tasks = CONFIG.tasks;
        localStorage.setItem(`axion_tasks_${userId}`, JSON.stringify(tasks));
    } else {
        tasks = JSON.parse(tasks);
        
        // تحديث الروابط والمكافآت من CONFIG مع الحفاظ على حالة الإكمال
        const updatedTasks = CONFIG.tasks.map(newTask => {
            const existingTask = tasks.find(t => t.id === newTask.id);
            if (existingTask) {
                return {
                    ...newTask,
                    completed: existingTask.completed || false
                };
            }
            return { ...newTask, completed: false };
        });
        
        tasks = updatedTasks;
        localStorage.setItem(`axion_tasks_${userId}`, JSON.stringify(tasks));
    }
    
    container.innerHTML = tasks.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <div class="task-info">
                <div class="task-name">${escapeHtml(task.name)}</div>
                <div class="task-reward">+${task.reward} AXC</div>
            </div>
            ${!task.completed ? 
                `<button class="task-btn" id="taskBtn_${task.id}" onclick="window.completeTask(${task.id})">COMPLETE</button>` :
                '<span class="task-completed-badge">✓ COMPLETED</span>'
            }
        </div>
    `).join('');
}

async function completeTask(taskId) {
    if (!userId) return;
    
    // منع التنفيذ المتكرر لنفس المهمة
    if (taskProcessing[`${userId}_${taskId}`]) {
        showToast('Task is already in progress!', 'warning');
        return;
    }
    
    // جلب المهام من localStorage
    let tasks = JSON.parse(localStorage.getItem(`axion_tasks_${userId}`) || '[]');
    const task = tasks.find(t => t.id === taskId);
    
    // التحقق: إذا كانت المهمة مكتملة بالفعل
    if (!task || task.completed) {
        showToast('Task already completed!', 'warning');
        return;
    }
    
    // قفل المهمة لمنع الضغط المتكرر
    taskProcessing[`${userId}_${taskId}`] = true;
    
    // تعطيل الزر فوراً
    const taskBtn = document.getElementById(`taskBtn_${taskId}`);
    if (taskBtn) {
        taskBtn.disabled = true;
        taskBtn.innerHTML = '⏳ WAITING...';
        taskBtn.style.opacity = '0.6';
    }
    
    // فتح رابط المهمة
    if (task.url) {
        window.open(task.url, '_blank');
    }
    
    showToast(`Please complete: ${task.name}. You will get +${task.reward} AXC after 15 seconds`, 'info');
    
    // عداد تنازلي 15 ثانية
    let countdown = 15;
    if (taskBtn) {
        const interval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                taskBtn.innerHTML = `⏳ ${countdown}s...`;
            } else {
                clearInterval(interval);
            }
        }, 1000);
    }
    
    setTimeout(async () => {
        // التحقق مرة أخرى قبل الصرف
        const freshTasks = JSON.parse(localStorage.getItem(`axion_tasks_${userId}`) || '[]');
        const freshTask = freshTasks.find(t => t.id === taskId);
        
        // إلغاء القفل
        delete taskProcessing[`${userId}_${taskId}`];
        
        if (freshTask.completed) {
            showToast('Task already completed!', 'warning');
            if (taskBtn) {
                taskBtn.disabled = false;
                taskBtn.innerHTML = 'COMPLETE';
                taskBtn.style.opacity = '1';
            }
            return;
        }
        
        // تحديث حالة المهمة
        freshTask.completed = true;
        localStorage.setItem(`axion_tasks_${userId}`, JSON.stringify(freshTasks));
        
        try {
            const res = await fetch('/api/add-balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount: task.reward, currency: 'AXC' })
            });
            const data = await res.json();
            
            if (data.success) {
                await loadUserData();
                renderTasks(); // إعادة عرض المهام (سيختفي الزر)
                addNotification('Task Completed!', `You earned ${task.reward} AXC!`, 'success');
                showToast(`✅ +${task.reward} AXC ADDED!`, 'success');
                showConfetti();
            } else {
                showToast('Error claiming reward', 'error');
                // إذا فشلت، نرجع حالة المهمة
                freshTask.completed = false;
                localStorage.setItem(`axion_tasks_${userId}`, JSON.stringify(freshTasks));
                renderTasks();
            }
        } catch(e) {
            showToast('Network error', 'error');
            freshTask.completed = false;
            localStorage.setItem(`axion_tasks_${userId}`, JSON.stringify(freshTasks));
            renderTasks();
        }
    }, 15000);
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

function saveNotifications() {
    if (!userId) return;
    localStorage.setItem(`axion_notifications_${userId}`, JSON.stringify(notifications));
}

function loadNotifications() {
    if (!userId) return;
    const saved = localStorage.getItem(`axion_notifications_${userId}`);
    if (saved) {
        try {
            notifications = JSON.parse(saved);
            unreadCount = notifications.filter(n => !n.read).length;
        } catch(e) {}
    }
    updateNotificationBadge();
}

function addNotification(title, message, type = 'info') {
    notifications.unshift({
        id: Date.now().toString(),
        title, message, type,
        read: false,
        timestamp: new Date().toISOString()
    });
    if (notifications.length > 50) notifications.pop();
    saveNotifications();
    unreadCount++;
    updateNotificationBadge();
    renderNotificationsList();
    showToast(message, type);
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderNotificationsList() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    if (notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">No notifications yet</div>';
        return;
    }
    container.innerHTML = notifications.map(n => `
        <div class="notification-item ${!n.read ? 'unread' : ''}" onclick="window.markNotificationRead('${n.id}')">
            <div class="notification-icon ${n.type}"><i class="fas ${n.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i></div>
            <div class="notification-content">
                <div class="notification-title">${escapeHtml(n.title)}</div>
                <div class="notification-message">${escapeHtml(n.message)}</div>
                <div class="notification-time">${new Date(n.timestamp).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
}

function showNotificationsModal() {
    renderNotificationsList();
    document.getElementById('notificationsModal')?.classList.add('show');
}

function closeNotificationsModal() {
    document.getElementById('notificationsModal')?.classList.remove('show');
}

function markNotificationRead(id) {
    const n = notifications.find(n => n.id === id);
    if (n && !n.read) {
        n.read = true;
        unreadCount--;
        saveNotifications();
        updateNotificationBadge();
        renderNotificationsList();
    }
}

function markAllRead() {
    notifications.forEach(n => n.read = true);
    unreadCount = 0;
    saveNotifications();
    updateNotificationBadge();
    renderNotificationsList();
}

function clearAllNotifications() {
    notifications = [];
    unreadCount = 0;
    saveNotifications();
    updateNotificationBadge();
    renderNotificationsList();
}

// ============================================================================
// API & USER DATA
// ============================================================================

async function loadConfig() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('/api/config', { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        CONFIG.ownerWallet = data.ownerWallet;
        if (data.config) {
            CONFIG.axcPrice = data.config.axcPrice || 0.01;
            CONFIG.minSwap = data.config.minSwap || 100;
            CONFIG.maxSwap = data.config.maxSwap || 100000;
        }
        const priceEl = document.getElementById('axcPrice');
        if (priceEl) priceEl.textContent = CONFIG.axcPrice;
    } catch(e) { console.error('Config error:', e); }
}

async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (window.firebase && window.firebase.apps && window.firebase.apps.length === 0) {
            window.firebase.initializeApp(config.firebaseConfig);
            db = window.firebase.firestore();
        }
    } catch(e) { console.error('Firebase error:', e); }
}

async function loadUserData() {
    if (!userId) return;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`/api/user/${userId}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem(`axion_user_${userId}`, JSON.stringify(currentUser));
            updateWalletUI();
            updateSwapUI();
            updateMiningUI();
            updateReferralUI();
        }
    } catch(e) {
        console.error('Load error:', e);
        const cached = localStorage.getItem(`axion_user_${userId}`);
        if (cached) {
            currentUser = JSON.parse(cached);
            updateWalletUI();
            updateSwapUI();
            updateMiningUI();
            updateReferralUI();
            showToast('Using cached data', 'warning');
        } else {
            showToast('Connection error, please refresh', 'error');
        }
    }
}

async function fetchLivePrices() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,the-open-network&vs_currencies=usd&include_24hr_change=true', { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        livePrices = {
            BTC: { price: data.bitcoin?.usd || 68500, change: data.bitcoin?.usd_24h_change || 0 },
            ETH: { price: data.ethereum?.usd || 3200, change: data.ethereum?.usd_24h_change || 0 },
            BNB: { price: data.binancecoin?.usd || 580, change: data.binancecoin?.usd_24h_change || 0 },
            TON: { price: data['the-open-network']?.usd || 5.5, change: data['the-open-network']?.usd_24h_change || 0 }
        };
        localStorage.setItem('cached_prices', JSON.stringify(livePrices));
        renderTopCryptos();
    } catch(e) {
        console.error('Price error:', e);
        const cached = localStorage.getItem('cached_prices');
        if (cached) {
            livePrices = JSON.parse(cached);
            renderTopCryptos();
        }
    }
}

// ============================================================================
// WALLET UI
// ============================================================================

function updateWalletUI() {
    if (!currentUser) return;
    const balance = currentUser.balance || 0;
    const usdt = currentUser.usdtBalance || 0;
    const total = (balance * CONFIG.axcPrice) + usdt;
    
    const totalEl = document.getElementById('totalBalance');
    const axcEl = document.getElementById('walletAxcBalance');
    const usdtEl = document.getElementById('walletUsdtBalance');
    
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
    if (axcEl) axcEl.textContent = balance.toLocaleString();
    if (usdtEl) usdtEl.textContent = `$${usdt.toFixed(2)}`;
    
    renderAssets();
}

function renderAssets() {
    const container = document.getElementById('assetsList');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
        return;
    }
    container.innerHTML = `
        <div class="asset-item">
            <div class="asset-left">
                <img src="${CMC_ICONS.AXC}" class="asset-icon-img" onerror="this.src='https://placehold.co/40x40/0a180a/39ff14?text=AXC'">
                <div class="asset-info">
                    <h4>Axion Coin</h4>
                    <p>AXC</p>
                </div>
            </div>
            <div class="asset-right">
                <div class="asset-balance">${(currentUser.balance || 0).toLocaleString()} AXC</div>
                <div class="asset-value">$${formatNumber((currentUser.balance || 0) * CONFIG.axcPrice)}</div>
            </div>
        </div>
        <div class="asset-item">
            <div class="asset-left">
                <img src="${CMC_ICONS.USDT}" class="asset-icon-img" onerror="this.src='https://placehold.co/40x40/0a180a/39ff14?text=USDT'">
                <div class="asset-info">
                    <h4>Tether</h4>
                    <p>USDT</p>
                </div>
            </div>
            <div class="asset-right">
                <div class="asset-balance">${(currentUser.usdtBalance || 0).toFixed(2)} USDT</div>
                <div class="asset-value">$${formatNumber(currentUser.usdtBalance || 0)}</div>
            </div>
        </div>
    `;
}

function renderTopCryptos() {
    const container = document.getElementById('topCryptoList');
    if (!container) return;
    
    const cryptos = [
        { symbol: 'BTC', name: 'Bitcoin', icon: CMC_ICONS.BTC, price: livePrices.BTC?.price || 68500, change: livePrices.BTC?.change || 0 },
        { symbol: 'ETH', name: 'Ethereum', icon: CMC_ICONS.ETH, price: livePrices.ETH?.price || 3200, change: livePrices.ETH?.change || 0 },
        { symbol: 'BNB', name: 'BNB', icon: CMC_ICONS.BNB, price: livePrices.BNB?.price || 580, change: livePrices.BNB?.change || 0 },
        { symbol: 'TON', name: 'Toncoin', icon: CMC_ICONS.TON, price: livePrices.TON?.price || 5.5, change: livePrices.TON?.change || 0 }
    ];
    
    container.innerHTML = cryptos.map(c => `
        <div class="crypto-item">
            <div class="crypto-left">
                <img src="${c.icon}" class="crypto-icon-img" onerror="this.src='https://placehold.co/40x40/0a180a/39ff14?text=${c.symbol}'">
                <div class="crypto-info">
                    <h4>${c.name}</h4>
                    <p>${c.symbol}</p>
                </div>
            </div>
            <div class="crypto-right">
                <div class="crypto-price">$${c.price.toLocaleString()}</div>
                <div class="crypto-change ${c.change >= 0 ? 'positive' : 'negative'}">${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%</div>
            </div>
        </div>
    `).join('');
}

function refreshPrices() { fetchLivePrices(); showToast('Prices refreshed', 'success'); }
function showAllAssets() { showToast('All assets view coming soon', 'info'); }

function updateReferralUI() {
    if (!currentUser) return;
    const count = currentUser.inviteCount || 0;
    const countEl = document.getElementById('referralCount');
    const earnedEl = document.getElementById('referralEarned');
    const linkEl = document.getElementById('referralLink');
    if (countEl) countEl.textContent = count;
    if (earnedEl) earnedEl.textContent = `${(count * 100).toLocaleString()} AXC`;
    if (linkEl) linkEl.value = `https://t.me/${CONFIG.botUsername}?start=${userId}`;
}

// ============================================================================
// DEPOSIT & HISTORY
// ============================================================================

function showDepositModal() {
    const modal = document.getElementById('depositModal');
    if (modal) modal.classList.add('show');
}

function copyDepositAddress() {
    navigator.clipboard.writeText('0xd51d68d057805514823652dc090b9d455c79801a');
    showToast('Address copied!', 'success');
}

async function confirmDeposit() {
    try {
        await fetch('/api/notify-deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userName: currentUser?.userName || 'Axion User', currency: 'AXC' })
        });
        addNotification('Deposit Request', 'Admin notified. AXC will be added within 15 minutes.', 'info');
        showToast('Admin notified!', 'success');
    } catch(e) {}
    closeModal('depositModal');
}

function showHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('show');
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;
    if (!userId) return;
    
    const tx = JSON.parse(localStorage.getItem(`axion_transactions_${userId}`) || '[]');
    if (tx.length === 0) {
        container.innerHTML = '<div class="empty-state">No transactions yet</div>';
        return;
    }
    container.innerHTML = tx.slice(0, 50).map(t => `
        <div class="history-item">
            <div class="history-type ${t.type}">${(t.type || 'unknown').toUpperCase()}</div>
            <div class="history-amount">${t.amount} ${t.currency || ''}</div>
            <div class="history-date">${new Date(t.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

// ============================================================================
// WITHDRAW BOTTOM SHEET
// ============================================================================

function updateWithdrawSheet() {
    if (!currentUser) return;
    const balance = withdrawCurrency === 'AXC' ? (currentUser.balance || 0) : (currentUser.usdtBalance || 0);
    const balanceEl = document.getElementById('sheetBalanceValue');
    const minEl = document.getElementById('sheetMinAmount');
    const maxEl = document.getElementById('sheetMaxAmount');
    const currencySpans = document.querySelectorAll('.amount-currency');
    
    if (balanceEl) balanceEl.textContent = withdrawCurrency === 'AXC' ? `${balance.toLocaleString()} AXC` : `$${balance.toFixed(2)}`;
    if (minEl) minEl.textContent = withdrawCurrency === 'AXC' ? '1,000 AXC' : '10 USDT';
    if (maxEl) maxEl.textContent = withdrawCurrency === 'AXC' ? '50,000 AXC' : '1,000 USDT';
    currencySpans.forEach(span => { if (span) span.textContent = withdrawCurrency; });
}

function showWithdrawModal() {
    if (!currentUser) {
        showToast('Loading data, please wait...', 'warning');
        return;
    }
    withdrawCurrency = 'AXC';
    updateWithdrawSheet();
    const amountInput = document.getElementById('sheetAmountInput');
    const addressInput = document.getElementById('sheetAddressInput');
    if (amountInput) amountInput.value = '';
    if (addressInput) addressInput.value = '';
    const sheet = document.getElementById('withdrawBottomSheet');
    if (sheet) sheet.classList.add('show');
}

function closeWithdrawSheet() {
    const sheet = document.getElementById('withdrawBottomSheet');
    if (sheet) sheet.classList.remove('show');
}

function setWithdrawCurrency(currency) {
    withdrawCurrency = currency;
    updateWithdrawSheet();
    const options = document.querySelectorAll('.currency-option');
    options.forEach(btn => {
        if (btn.dataset.currency === currency) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function setWithdrawAmount(percent) {
    if (!currentUser) return;
    const balance = withdrawCurrency === 'AXC' ? (currentUser.balance || 0) : (currentUser.usdtBalance || 0);
    const amount = Math.floor(balance * percent / 100);
    const input = document.getElementById('sheetAmountInput');
    if (input) input.value = amount;
}

async function submitWithdraw() {
    if (isProcessingWithdraw) {
        showToast('Please wait, processing...', 'warning');
        return;
    }
    
    const amountInput = document.getElementById('sheetAmountInput');
    const addressInput = document.getElementById('sheetAddressInput');
    
    if (!amountInput || !addressInput) {
        showToast('System error, please refresh', 'error');
        return;
    }
    
    const amount = parseFloat(amountInput.value.trim());
    const address = addressInput.value.trim();
    
    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
        showToast('Invalid BEP20 address', 'error');
        return;
    }
    
    const min = withdrawCurrency === 'AXC' ? 1000 : 10;
    const max = withdrawCurrency === 'AXC' ? 50000 : 1000;
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    
    if (amount < min) { showToast(`Minimum ${min} ${withdrawCurrency}`, 'error'); return; }
    if (amount > max) { showToast(`Maximum ${max} ${withdrawCurrency}`, 'error'); return; }
    if (amount > balance) { showToast(`Insufficient ${withdrawCurrency} balance`, 'error'); return; }
    
    const btn = document.querySelector('.sheet-submit-btn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Processing...';
    }
    
    isProcessingWithdraw = true;
    
    try {
        const endpoint = withdrawCurrency === 'AXC' ? '/api/withdraw-axc' : '/api/withdraw-usdt';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, address, currency: withdrawCurrency })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(`✅ ${amount} ${withdrawCurrency} withdrawal submitted!`, 'success');
            addNotification('Withdrawal', `${amount} ${withdrawCurrency} withdrawal submitted!`, 'success');
            closeWithdrawSheet();
            await loadUserData();
        } else {
            showToast(data.error || 'Withdrawal failed', 'error');
        }
    } catch(e) {
        console.error('Withdraw error:', e);
        showToast('Network error', 'error');
    } finally {
        isProcessingWithdraw = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText || '<i class="fas fa-paper-plane"></i> Confirm Withdrawal';
        }
    }
}

// ============================================================================
// SWAP
// ============================================================================

function initTonConnect() {
    const container = document.getElementById('ton-connect');
    if (!container) return;
    if (typeof TON_CONNECT_UI === 'undefined') {
        container.innerHTML = '<span style="color:#e74c3c">⚠️ TON CONNECT UNAVAILABLE</span>';
        return;
    }
    try {
        window.tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
            manifestUrl: window.location.origin + '/tonconnect-manifest.json',
            buttonRootId: 'ton-connect'
        });
        window.tonConnectUI.onStatusChange(wallet => {
            const statusEl = document.getElementById('walletStatus');
            if (wallet) {
                tonConnected = true;
                tonWalletAddress = wallet.account.address;
                if (statusEl) statusEl.innerHTML = `${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                if (statusEl) statusEl.innerHTML = 'Not connected';
            }
        });
    } catch(e) { console.error('TON error:', e); }
}

function updateSwapUI() {
    if (!currentUser) return;
    const fromEl = document.getElementById('fromBalance');
    const toEl = document.getElementById('toBalance');
    const swapBtn = document.getElementById('swapBtn');
    if (fromEl) fromEl.textContent = (currentUser.balance || 0).toLocaleString();
    if (toEl) toEl.textContent = `$${(currentUser.usdtBalance || 0).toFixed(2)}`;
    if (swapBtn) {
        if (currentUser.tonPaid) {
            swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
            swapBtn.classList.add('active');
        } else {
            swapBtn.innerHTML = '<i class="fas fa-lock"></i> Unlock Neural Swap (5 TON)';
            swapBtn.classList.remove('active');
        }
    }
}

function showSwapStatus(msg, isErr) {
    const el = document.getElementById('swapStatus');
    if (el) {
        el.textContent = msg;
        el.className = `ai-status ${isErr ? 'error' : 'success'}`;
        el.style.display = 'block';
        if (!isErr) setTimeout(() => el.style.display = 'none', 5000);
    }
}

function showActivationModal() {
    const modal = document.getElementById('verificationModal');
    if (modal && !currentUser?.tonPaid) modal.classList.add('active');
}

function hideActivationModal() {
    const modal = document.getElementById('verificationModal');
    if (modal) modal.classList.remove('active');
}

async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) {
        showSwapStatus('Connect TON wallet first', true);
        if (window.tonConnectUI) {
            try {
                await window.tonConnectUI.openModal();
            } catch(e) {
                showSwapStatus('Connection failed', true);
            }
        }
        return false;
    }
    if (!CONFIG.ownerWallet) {
        showSwapStatus('Owner wallet not configured', true);
        return false;
    }
    if (isActivating) return false;
    isActivating = true;
    
    try {
        showSwapStatus('Waiting for payment...', false);
        await window.tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{ address: CONFIG.ownerWallet, amount: (CONFIG.swapFeeTON * 1e9).toString() }]
        });
        
        const res = await fetch('/api/ton-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, walletAddress: tonWalletAddress })
        });
        const data = await res.json();
        
        if (data.success) {
            await loadUserData();
            updateSwapUI();
            addNotification('Swap Activated!', 'You can now swap AXC to USDT!', 'success');
            showSwapStatus('Swap unlocked!', false);
            showConfetti();
            return true;
        } else {
            showSwapStatus('Verification failed', true);
            return false;
        }
    } catch(e) {
        showSwapStatus('Payment cancelled', true);
        return false;
    } finally {
        isActivating = false;
        hideActivationModal();
    }
}

function onSwapFromInput() {
    const amount = parseFloat(document.getElementById('swapFrom')?.value || '0');
    const to = document.getElementById('swapTo');
    if (isNaN(amount) || amount <= 0) {
        if (to) to.value = '';
    } else {
        if (to) to.value = (amount * CONFIG.axcPrice).toFixed(2);
    }
}

async function executeSwap() {
    if (!currentUser?.tonPaid) {
        showActivationModal();
        return;
    }
    const amount = parseFloat(document.getElementById('swapFrom')?.value || '0');
    if (isSwapping) return;
    if (amount < CONFIG.minSwap) { showSwapStatus(`Minimum swap is ${CONFIG.minSwap} AXC`, true); return; }
    if (amount > CONFIG.maxSwap) { showSwapStatus(`Maximum swap is ${CONFIG.maxSwap} AXC`, true); return; }
    if (amount > (currentUser?.balance || 0)) { showSwapStatus('Insufficient AXC balance', true); return; }
    
    isSwapping = true;
    const btn = document.getElementById('swapBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> PROCESSING...';
    }
    
    try {
        const res = await fetch('/api/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount })
        });
        const data = await res.json();
        if (data.success) {
            await loadUserData();
            const swapFrom = document.getElementById('swapFrom');
            const swapTo = document.getElementById('swapTo');
            if (swapFrom) swapFrom.value = '';
            if (swapTo) swapTo.value = '';
            addNotification('Swap Completed!', `Swapped ${amount.toLocaleString()} AXC to ${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
            showSwapStatus(`✅ Swapped ${amount.toLocaleString()} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, false);
            showConfetti();
        } else {
            showSwapStatus(data.error || 'Swap failed', true);
        }
    } catch(e) {
        showSwapStatus('Network error', true);
    } finally {
        isSwapping = false;
        if (btn) {
            btn.disabled = false;
            if (currentUser?.tonPaid) btn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
            else btn.innerHTML = '<i class="fas fa-lock"></i> Unlock Neural Swap (5 TON)';
        }
    }
}

// ============================================================================
// AXION AI PAGE
// ============================================================================

function renderAxionPage() {
    const container = document.getElementById('axionContent');
    if (!container) return;
    container.innerHTML = `
        <div class="axion-hero"><div class="axion-icon">🧠</div><h1 class="axion-title">AXION AI</h1><p class="axion-subtitle">NEURAL INTELLIGENCE PROTOCOL</p></div>
        <div class="axion-card"><div class="axion-card-title">⚡ THE FUTURE OF DEFI & AI</div><p class="axion-card-text">Axion Coin (AXC) is a next-generation decentralized trading and liquidity token powered by artificial intelligence. Our neural network analyzes market conditions to optimize yields and reduce risks.</p></div>
        <div class="axion-card"><div class="axion-card-title">🎯 KEY FEATURES</div><div class="axion-features"><div class="axion-feature">🤖 AI TRADING INTELLIGENCE</div><div class="axion-feature">💧 DECENTRALIZED LIQUIDITY</div><div class="axion-feature">🗳️ COMMUNITY GOVERNANCE</div><div class="axion-feature">💰 STAKING REWARDS</div></div></div>
        <div class="axion-card"><div class="axion-card-title">📊 TOKENOMICS</div><div class="axion-stat"><span class="axion-stat-label">NETWORK:</span><span class="axion-stat-value">BNB SMART CHAIN (BEP-20)</span></div><div class="axion-stat"><span class="axion-stat-label">TOTAL SUPPLY:</span><span class="axion-stat-value">500,000,000 AXC</span></div><div class="axion-stat"><span class="axion-stat-label">LAUNCH PRICE:</span><span class="axion-stat-value">$0.003</span></div><div class="axion-stat"><span class="axion-stat-label">CURRENT PRICE:</span><span class="axion-stat-value">$${CONFIG.axcPrice}</span></div></div>
        <div class="axion-card"><div class="axion-card-title">🔮 OPEN-SOURCE AI MODEL</div><p class="axion-card-text">NO BOUNDARIES. NO RED LINES. Our AI model is fully transparent and community-driven.</p><div class="axion-badge">COMING SOON</div></div>
    `;
}

// ============================================================================
// PAGE NAVIGATION
// ============================================================================

function switchTab(page) {
    const pages = ['walletPage', 'earnPage', 'swapPage', 'axionPage'];
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.style.display = 'none';
        }
    });
    const target = document.getElementById(`${page}Page`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) item.classList.add('active');
    });
    const notifBtn = document.getElementById('notificationBtn');
    if (notifBtn) notifBtn.style.display = page === 'wallet' ? 'flex' : 'none';
}

// ============================================================================
// INIT
// ============================================================================

async function init() {
    console.log('🚀 AXION AI v27.0 INITIALIZING...');
    
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    if (!userId && tg?.initDataUnsafe?.user) userId = tg.initDataUnsafe.user.id.toString();
    if (!userId) {
        console.error('No userId found');
        showToast('Please open from Telegram bot', 'error');
        return;
    }
    
    console.log('📱 User ID:', userId);
    showToast('Loading your data...', 'info');
    
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
    await fetchLivePrices();
    
    loadMiningState();
    loadNotifications();
    updateMiningUI();
    startMiningTimer();
    
    renderTasks();
    renderAxionPage();
    updateReferralUI();
    updateSwapUI();
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => switchTab(item.dataset.page);
    });
    
    const notifBtn = document.getElementById('notificationBtn');
    if (notifBtn) notifBtn.onclick = showNotificationsModal;
    
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) historyBtn.onclick = showHistoryModal;
    
    const depositBtn = document.getElementById('depositBtn');
    if (depositBtn) depositBtn.onclick = showDepositModal;
    
    const withdrawBtn = document.getElementById('withdrawBtnWallet');
    if (withdrawBtn) withdrawBtn.onclick = showWithdrawModal;
    
    const watchAdBtn = document.getElementById('watchAdBtn');
    if (watchAdBtn) watchAdBtn.onclick = watchAd;
    
    const claimBtn = document.getElementById('claimMiningBtn');
    if (claimBtn) claimBtn.onclick = claimMiningReward;
    
    const confirmBtn = document.getElementById('confirmDepositBtn');
    if (confirmBtn) confirmBtn.onclick = confirmDeposit;
    
    const copyLinkBtn = document.getElementById('copyReferralLink');
    if (copyLinkBtn) {
        copyLinkBtn.onclick = () => {
            const link = document.getElementById('referralLink');
            if (link?.value) { 
                navigator.clipboard.writeText(link.value); 
                showToast('Link copied!', 'success'); 
            }
        };
    }
    
    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) markAllBtn.onclick = markAllRead;
    
    const clearAllBtn = document.getElementById('clearNotificationsBtn');
    if (clearAllBtn) clearAllBtn.onclick = clearAllNotifications;
    
    const boostBtn = document.getElementById('boostTriggerBtn');
    const boostOpts = document.getElementById('boostOptions');
    if (boostBtn && boostOpts) {
        boostBtn.onclick = () => {
            boostOpts.style.display = boostOpts.style.display === 'flex' ? 'none' : 'flex';
        };
    }
    document.addEventListener('click', (e) => {
        if (boostOpts && boostBtn && !boostBtn.contains(e.target) && !boostOpts.contains(e.target)) {
            boostOpts.style.display = 'none';
        }
    });
    
    const modalProceed = document.getElementById('modalProceedBtn');
    const modalCancel = document.getElementById('modalCancelBtn');
    if (modalProceed) modalProceed.onclick = () => { hideActivationModal(); handleActivation(); };
    if (modalCancel) modalCancel.onclick = () => hideActivationModal();
    
    switchTab('wallet');
    console.log('✅ AXION AI v27.0 READY!');
}

// ============================================================================
// EXPORTS
// ============================================================================

window.switchTab = switchTab;
window.copyDepositAddress = copyDepositAddress;
window.confirmDeposit = confirmDeposit;
window.showWithdrawModal = showWithdrawModal;
window.closeModal = closeModal;
window.closeNotificationsModal = closeNotificationsModal;
window.markNotificationRead = markNotificationRead;
window.completeTask = completeTask;
window.activateBoost = activateBoost;
window.refreshPrices = refreshPrices;
window.showAllAssets = showAllAssets;
window.showHistoryModal = showHistoryModal;
window.markAllRead = markAllRead;
window.clearAllNotifications = clearAllNotifications;
window.closeWithdrawSheet = closeWithdrawSheet;
window.setWithdrawCurrency = setWithdrawCurrency;
window.setWithdrawAmount = setWithdrawAmount;
window.submitWithdraw = submitWithdraw;
window.watchAd = watchAd;
window.claimMiningReward = claimMiningReward;
window.showDepositModal = showDepositModal;
window.executeSwap = executeSwap;
window.onSwapFromInput = onSwapFromInput;
window.showActivationModal = showActivationModal;

// ============================================================================
// START
// ============================================================================

init();
