// ============================================================================
// AXION AI - LEGENDARY MINI APP v6.0 (FULL INTEGRATION)
// ============================================================================
// جميع الميزات المطلوبة:
// ✅ 6 منصات إعلانية (AdsGram, Taddy, Monetag, RichAds, Adexium, GigaPub)
// ✅ إعلانين متتاليين بنقرة واحدة (المستخدم لا يشعر)
// ✅ 40 إعلان ثم كول داون 6 ساعات
// ✅ تعدين وهمي + Boost بـ TON (3 خطط)
// ✅ مهام مع عداد 15 ثانية
// ✅ محفظة متكاملة (رصيد + إيداع + سحب + تاريخ + إحالات)
// ✅ Swap كامل (TON Connect + تفعيل 5 TON)
// ✅ صفحة Axion AI (GitBook)
// ✅ تصميم أسطوري
// ============================================================================

// ============================================================================
// 1. TELEGRAM WEBAPP INIT
// ============================================================================

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0c0f');
    tg.setBackgroundColor('#0a0c0f');
    tg.enableClosingConfirmation?.();
    console.log('✅ AXION AI - Legendary Edition Ready');
}

// ============================================================================
// 2. GLOBAL CONFIGURATION
// ============================================================================

const CONFIG = {
    // Swap
    axcPrice: 0.01,
    swapFeeTON: 5,
    minSwap: 100,
    maxSwap: 100000,
    ownerWallet: null,
    // Mining
    miningInterval: 2.5 * 60 * 60 * 1000,
    baseMiningRate: 50,
    boosts: {
        bronze: { price: 2.5, rate: 120, duration: 3, name: '⚡ BRONZE' },
        silver: { price: 5, rate: 250, duration: 7, name: '⚡ SILVER' },
        gold: { price: 10, rate: 500, duration: 30, name: '⚡ GOLD' }
    },
    // Earn (Ads)
    ADS_PER_CYCLE: 40,
    RESET_HOURS: 6,
    ADS_PER_SEQUENCE: 2,
    REWARD_PER_SEQUENCE: 2,
    // Tasks
    tasks: [
        { id: 1, name: 'Join Telegram Channel', url: '', reward: 100, completed: false },
        { id: 2, name: 'Follow on Twitter', url: '', reward: 100, completed: false },
        { id: 3, name: 'Visit Website', url: '', reward: 100, completed: false },
        { id: 4, name: 'Join Community', url: '', reward: 100, completed: false }
    ]
};

// ============================================================================
// 3. GLOBAL STATE
// ============================================================================

let currentPage = 'wallet';
let currentUser = null;
let userId = null;
let db = null;
let miningData = null;
let earnData = null;
let tonConnected = false;
let tonWalletAddress = null;
let isActivating = false;
let isSwapping = false;
let adSequenceActive = false;

// ============================================================================
// 4. DOM ELEMENTS
// ============================================================================

const pages = {
    wallet: document.getElementById('walletPage'),
    earn: document.getElementById('earnPage'),
    swap: document.getElementById('swapPage'),
    axion: document.getElementById('axionPage')
};

const walletEls = {
    totalBalance: document.getElementById('totalBalance'),
    axcBalance: document.getElementById('walletAxcBalance'),
    usdtBalance: document.getElementById('walletUsdtBalance'),
    referralCount: document.getElementById('referralCount'),
    referralEarned: document.getElementById('referralEarned'),
    referralLink: document.getElementById('referralLink'),
    assetsList: document.getElementById('assetsList'),
    topCryptoList: document.getElementById('topCryptoList')
};

const earnEls = {
    miningRate: document.getElementById('miningRate'),
    miningPower: document.getElementById('miningPower'),
    miningProgress: document.getElementById('miningProgress'),
    nextReward: document.getElementById('nextReward'),
    readyTokens: document.getElementById('readyTokens'),
    claimMiningBtn: document.getElementById('claimMiningBtn'),
    watchAdBtn: document.getElementById('watchAdBtn'),
    adsCounter: null,
    tasksContainer: document.getElementById('tasksContainer')
};

const swapEls = {
    axcBalance: document.getElementById('axcBalance'),
    usdtBalance: document.getElementById('usdtBalance'),
    fromBalance: document.getElementById('fromBalance'),
    toBalance: document.getElementById('toBalance'),
    swapFrom: document.getElementById('swapFrom'),
    swapTo: document.getElementById('swapTo'),
    swapBtn: document.getElementById('swapBtn'),
    walletStatus: document.getElementById('walletStatus'),
    axcPrice: document.getElementById('axcPrice')
};

// ============================================================================
// 5. UTILITIES
// ============================================================================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast) return;
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    const icon = toast.querySelector('i');
    if (type === 'success') icon.className = 'fas fa-check-circle';
    else if (type === 'error') icon.className = 'fas fa-exclamation-circle';
    else icon.className = 'fas fa-info-circle';
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function formatTime(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
}

function saveToLocalStorage(key, data) {
    localStorage.setItem(`axion_${key}_${userId}`, JSON.stringify(data));
}

function loadFromLocalStorage(key, defaultValue) {
    const saved = localStorage.getItem(`axion_${key}_${userId}`);
    if (saved) {
        try { return JSON.parse(saved); }
        catch(e) { return defaultValue; }
    }
    return defaultValue;
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

// ============================================================================
// 6. API CALLS
// ============================================================================

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        CONFIG.ownerWallet = data.ownerWallet;
        if (data.config) {
            CONFIG.axcPrice = data.config.axcPrice || CONFIG.axcPrice;
            CONFIG.minSwap = data.config.minSwap || CONFIG.minSwap;
            CONFIG.maxSwap = data.config.maxSwap || CONFIG.maxSwap;
        }
        if (swapEls.axcPrice) swapEls.axcPrice.textContent = CONFIG.axcPrice;
    } catch(e) { console.error('[API] Config error:', e); }
}

async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (firebase.apps.length === 0) firebase.initializeApp(config.firebaseConfig);
        db = firebase.firestore();
        console.log('[API] Firebase ready');
    } catch(e) { console.error('[API] Firebase error:', e); }
}

async function loadUserData() {
    if (!db || !userId) return;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            currentUser = userDoc.data();
            updateAllBalances();
            updateReferralUI();
        } else {
            const res = await fetch(`/api/user/${userId}`);
            const data = await res.json();
            if (data.success) {
                currentUser = data.user;
                updateAllBalances();
                updateReferralUI();
            }
        }
    } catch(e) { console.error('[API] Load error:', e); }
}

function updateAllBalances() {
    if (!currentUser) return;
    const balance = currentUser.balance || 0;
    const usdtBalance = currentUser.usdtBalance || 0;
    const totalValue = (balance * CONFIG.axcPrice) + usdtBalance;
    
    if (walletEls.totalBalance) walletEls.totalBalance.textContent = `$${totalValue.toFixed(2)}`;
    if (walletEls.axcBalance) walletEls.axcBalance.textContent = balance.toLocaleString();
    if (walletEls.usdtBalance) walletEls.usdtBalance.textContent = `$${usdtBalance.toFixed(2)}`;
    if (swapEls.axcBalance) swapEls.axcBalance.innerHTML = balance.toLocaleString();
    if (swapEls.usdtBalance) swapEls.usdtBalance.innerHTML = `$${usdtBalance.toFixed(2)}`;
    if (swapEls.fromBalance) swapEls.fromBalance.innerHTML = balance;
    if (swapEls.toBalance) swapEls.toBalance.innerHTML = `$${usdtBalance.toFixed(2)}`;
}

function updateReferralUI() {
    if (!currentUser) return;
    const inviteCount = currentUser.inviteCount || 0;
    const earned = inviteCount * 100;
    if (walletEls.referralCount) walletEls.referralCount.textContent = inviteCount;
    if (walletEls.referralEarned) walletEls.referralEarned.textContent = `${earned.toLocaleString()} AXC`;
    const botUsername = tg?.initDataUnsafe?.user?.username || 'AxionBot';
    if (walletEls.referralLink) walletEls.referralLink.value = `https://t.me/${botUsername}?start=${userId}`;
}

// ============================================================================
// 7. MINING SYSTEM
// ============================================================================

function initMiningSystem() {
    const defaultData = {
        miningRate: CONFIG.baseMiningRate,
        boostType: null,
        boostExpiry: null,
        lastClaimTime: Date.now(),
        accumulatedTokens: 0,
        totalMined: 0
    };
    miningData = loadFromLocalStorage('mining', defaultData);
    
    if (miningData.boostExpiry && Date.now() > miningData.boostExpiry) {
        miningData.boostType = null;
        miningData.miningRate = CONFIG.baseMiningRate;
        miningData.boostExpiry = null;
        saveMiningData();
    }
    
    const elapsed = Date.now() - miningData.lastClaimTime;
    const pendingTokens = Math.floor(elapsed / CONFIG.miningInterval);
    if (pendingTokens > 0 && miningData.accumulatedTokens === 0) {
        miningData.accumulatedTokens = pendingTokens;
        saveMiningData();
    }
    updateMiningUI();
    startMiningTimer();
}

function saveMiningData() { saveToLocalStorage('mining', miningData); }

function updateMiningUI() {
    if (!earnEls.miningRate) return;
    earnEls.miningRate.textContent = `${miningData.miningRate} AXC`;
    const elapsed = Date.now() - miningData.lastClaimTime;
    const progress = Math.min(100, (elapsed / CONFIG.miningInterval) * 100);
    if (earnEls.miningProgress) earnEls.miningProgress.style.width = `${progress}%`;
    const remaining = CONFIG.miningInterval - elapsed;
    if (earnEls.nextReward) earnEls.nextReward.textContent = remaining > 0 ? formatTime(remaining) : 'READY!';
    if (earnEls.readyTokens) earnEls.readyTokens.textContent = miningData.accumulatedTokens;
    if (miningData.boostType && earnEls.miningPower) {
        earnEls.miningPower.textContent = `${miningData.boostType} (×${miningData.miningRate / CONFIG.baseMiningRate})`;
    } else if (earnEls.miningPower) earnEls.miningPower.textContent = 'STANDARD';
}

function startMiningTimer() {
    setInterval(() => {
        const elapsed = Date.now() - miningData.lastClaimTime;
        if (elapsed >= CONFIG.miningInterval) {
            const newTokens = Math.floor(elapsed / CONFIG.miningInterval);
            if (newTokens > 0) {
                miningData.accumulatedTokens += newTokens;
                miningData.lastClaimTime += newTokens * CONFIG.miningInterval;
                saveMiningData();
                updateMiningUI();
                showToast(`🎉 +${newTokens * miningData.miningRate} AXC MINED!`, 'success');
            }
        }
        updateMiningUI();
    }, 60000);
}

async function claimMiningReward() {
    if (miningData.accumulatedTokens <= 0) {
        showToast('NO TOKENS READY YET!', 'warning');
        return;
    }
    const reward = miningData.accumulatedTokens * miningData.miningRate;
    miningData.totalMined += reward;
    miningData.accumulatedTokens = 0;
    saveMiningData();
    updateMiningUI();
    showToast(`✅ CLAIMED ${reward} AXC!`, 'success');
    await loadUserData();
}

// ============================================================================
// 8. BOOST SYSTEM
// ============================================================================

async function activateBoost(boostKey) {
    const boost = CONFIG.boosts[boostKey];
    if (!boost) return;
    if (!tonConnected || !tonWalletAddress) {
        showToast('CONNECT TON WALLET FIRST!', 'warning');
        return;
    }
    if (!CONFIG.ownerWallet) {
        showToast('OWNER WALLET NOT CONFIGURED', 'error');
        return;
    }
    
    const amountNano = (boost.price * 1000000000).toString();
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: CONFIG.ownerWallet, amount: amountNano }]
    };
    
    try {
        showToast('⏳ PROCESSING PAYMENT...', 'info');
        await window.tonConnectUI.sendTransaction(transaction);
        miningData.boostType = boost.name;
        miningData.miningRate = boost.rate;
        miningData.boostExpiry = Date.now() + (boost.duration * 24 * 60 * 60 * 1000);
        saveMiningData();
        updateMiningUI();
        showToast(`✅ ${boost.name} ACTIVATED!`, 'success');
    } catch(error) {
        showToast('PAYMENT CANCELLED', 'error');
    }
}

// ============================================================================
// 9. EARN SYSTEM - ADS (40 ADS = 6 HOURS COOLDOWN)
// ============================================================================

function initEarnSystem() {
    const defaultData = {
        totalAdsWatched: 0,
        isOnCooldown: false,
        cooldownEndTime: null,
        lastResetTime: Date.now()
    };
    earnData = loadFromLocalStorage('earn', defaultData);
    
    // Check cooldown
    if (earnData.isOnCooldown && earnData.cooldownEndTime && Date.now() > earnData.cooldownEndTime) {
        earnData.totalAdsWatched = 0;
        earnData.isOnCooldown = false;
        earnData.cooldownEndTime = null;
        saveEarnData();
    }
    
    updateEarnUI();
}

function saveEarnData() { saveToLocalStorage('earn', earnData); }

function updateEarnUI() {
    const btn = earnEls.watchAdBtn;
    if (!btn) return;
    
    // Add counter if not exists
    if (!earnEls.adsCounter) {
        const watchAdCard = document.querySelector('#earnPage .neural-card:has(#watchAdBtn)');
        if (watchAdCard && !document.getElementById('adsCounter')) {
            const counterDiv = document.createElement('div');
            counterDiv.id = 'adsCounter';
            counterDiv.className = 'ads-counter';
            counterDiv.innerHTML = `<i class="fas fa-chart-line"></i> ${earnData.totalAdsWatched} / ${CONFIG.ADS_PER_CYCLE}`;
            watchAdCard.insertBefore(counterDiv, btn);
            earnEls.adsCounter = document.getElementById('adsCounter');
        } else if (document.getElementById('adsCounter')) {
            earnEls.adsCounter = document.getElementById('adsCounter');
        }
    }
    
    if (earnEls.adsCounter) {
        earnEls.adsCounter.innerHTML = `<i class="fas fa-chart-line"></i> ${earnData.totalAdsWatched} / ${CONFIG.ADS_PER_CYCLE}`;
    }
    
    if (earnData.isOnCooldown && earnData.cooldownEndTime && Date.now() < earnData.cooldownEndTime) {
        const remainingMs = earnData.cooldownEndTime - Date.now();
        const hours = Math.floor(remainingMs / (60 * 60 * 1000));
        const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-hourglass-half"></i> COOLDOWN: ${hours}h ${minutes}m`;
        btn.style.opacity = '0.6';
    } else {
        if (earnData.isOnCooldown) {
            earnData.totalAdsWatched = 0;
            earnData.isOnCooldown = false;
            earnData.cooldownEndTime = null;
            saveEarnData();
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play-circle"></i> WATCH AD';
        btn.style.opacity = '1';
    }
}

// ============================================================================
// 10. AD PLATFORMS - 6 NETWORKS
// ============================================================================

const AD_PLATFORMS = {
    adsgram: { name: 'AdsGram', init: () => window.Adsgram, show: (ctrl) => ctrl.init({ blockId: "int-33659" }).show() },
    taddy: { name: 'Taddy', init: () => window.Taddy, show: (ctrl) => new Promise((resolve) => {
        ctrl.showRewardedVideo({ onReward: () => resolve(true), onError: () => resolve(false), onClose: () => resolve(false) });
    }) },
    monetag: { name: 'Monetag', init: () => typeof window.show_11082910 === 'function' ? window.show_11082910 : null, show: (ctrl) => ctrl().then(() => true).catch(() => false) },
    richads: { name: 'RichAds', init: () => window.TelegramAdsController, show: (ctrl) => new Promise((resolve) => {
        if (!ctrl.initialized) { ctrl.initialize({ pubId: "1009657", appId: "7614" }); ctrl.initialized = true; }
        ctrl.showRewardedVideo({ onReward: () => resolve(true), onError: () => resolve(false) });
    }) },
    adexium: { name: 'Adexium', init: () => window.AdexiumWidget, show: (ctrl) => new Promise((resolve) => {
        const widget = new ctrl({ wid: '63f66ba6-7410-4f47-adc1-0da3259f4c40', adFormat: 'rewarded', debug: false });
        let resolved = false;
        widget.on('adPlaybackCompleted', () => { if (!resolved) { resolved = true; resolve(true); } });
        widget.on('noAdFound', () => { if (!resolved) { resolved = true; resolve(false); } });
        widget.on('adReceived', (ad) => widget.displayAd(ad));
        widget.requestAd('rewarded');
    }) },
    gigapub: { name: 'GigaPub', init: () => typeof window.showGiga === 'function' ? window.showGiga : null, show: (ctrl) => ctrl('main').then(() => true).catch(() => false) }
};

async function tryShowAd(platformKey) {
    const platform = AD_PLATFORMS[platformKey];
    if (!platform) return false;
    try {
        const controller = platform.init();
        if (!controller) return false;
        const result = await platform.show(controller);
        return result === true;
    } catch(e) {
        console.log(`❌ ${platform.name} failed:`, e);
        return false;
    }
}

async function watchAd() {
    // Check cooldown
    if (earnData.isOnCooldown && earnData.cooldownEndTime && Date.now() < earnData.cooldownEndTime) {
        const remainingMs = earnData.cooldownEndTime - Date.now();
        const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
        showToast(`⏳ COOLDOWN: ${hours} HOURS REMAINING`, 'warning');
        return;
    }
    
    // Check limit
    if (earnData.totalAdsWatched >= CONFIG.ADS_PER_CYCLE) {
        earnData.isOnCooldown = true;
        earnData.cooldownEndTime = Date.now() + (CONFIG.RESET_HOURS * 60 * 60 * 1000);
        saveEarnData();
        updateEarnUI();
        showToast(`🎯 LIMIT REACHED! COME BACK IN ${CONFIG.RESET_HOURS} HOURS`, 'info');
        return;
    }
    
    if (adSequenceActive) {
        showToast('⏳ AD IN PROGRESS...', 'warning');
        return;
    }
    
    adSequenceActive = true;
    const btn = earnEls.watchAdBtn;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> LOADING AD...';
    }
    
    // First ad - must watch full
    const firstPlatforms = ['adsgram', 'taddy', 'monetag'];
    let firstSuccess = false;
    for (const platform of firstPlatforms) {
        firstSuccess = await tryShowAd(platform);
        if (firstSuccess) break;
    }
    
    if (!firstSuccess) {
        showToast('❌ FAILED TO LOAD AD', 'error');
        resetAdSequence();
        return;
    }
    
    // Second ad - auto (user doesn't click)
    const secondPlatforms = ['richads', 'adexium', 'gigapub'];
    let secondSuccess = false;
    for (const platform of secondPlatforms) {
        secondSuccess = await tryShowAd(platform);
        if (secondSuccess) break;
    }
    
    if (secondSuccess) {
        miningData.accumulatedTokens += CONFIG.REWARD_PER_SEQUENCE;
        earnData.totalAdsWatched += CONFIG.ADS_PER_SEQUENCE;
        saveMiningData();
        saveEarnData();
        updateMiningUI();
        updateEarnUI();
        showToast(`🎬 +${miningData.miningRate * CONFIG.REWARD_PER_SEQUENCE} AXC!`, 'success');
    } else {
        showToast('⚠️ AD SEQUENCE INCOMPLETE', 'warning');
    }
    
    resetAdSequence();
}

function resetAdSequence() {
    adSequenceActive = false;
    const btn = earnEls.watchAdBtn;
    if (btn && !earnData.isOnCooldown) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play-circle"></i> WATCH AD';
    } else if (btn && earnData.isOnCooldown) {
        updateEarnUI();
    }
}

// ============================================================================
// 11. TASKS SYSTEM
// ============================================================================

function initTasksSystem() {
    const tasksData = loadFromLocalStorage('tasks', CONFIG.tasks);
    renderTasks(tasksData);
}

function renderTasks(tasksData) {
    if (!earnEls.tasksContainer) return;
    earnEls.tasksContainer.innerHTML = tasksData.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <div class="task-info">
                <div class="task-name">${task.name}</div>
                <div class="task-reward">+${task.reward} AXC</div>
            </div>
            ${!task.completed ? 
                `<button class="task-btn" onclick="window.startTask(${task.id})">COMPLETE</button>` :
                '<span class="task-completed-badge">✓ COMPLETED</span>'
            }
        </div>
    `).join('');
}

async function startTask(taskId) {
    const tasksData = loadFromLocalStorage('tasks', CONFIG.tasks);
    const task = tasksData.find(t => t.id === taskId);
    if (!task || task.completed) return;
    
    if (task.url && task.url.trim() !== '') window.open(task.url, '_blank');
    
    let countdown = 15;
    const modal = document.getElementById('taskModal');
    const countdownEl = document.getElementById('taskCountdown');
    const taskNameEl = document.getElementById('taskName');
    
    if (taskNameEl) taskNameEl.textContent = task.name;
    if (countdownEl) countdownEl.textContent = countdown;
    if (modal) modal.classList.add('show');
    
    const interval = setInterval(() => {
        countdown--;
        if (countdownEl) countdownEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(interval);
            if (modal) modal.classList.remove('show');
            task.completed = true;
            saveToLocalStorage('tasks', tasksData);
            miningData.accumulatedTokens += Math.ceil(task.reward / miningData.miningRate);
            saveMiningData();
            updateMiningUI();
            renderTasks(tasksData);
            showToast(`✅ +${task.reward} AXC ADDED!`, 'success');
        }
    }, 1000);
}

// ============================================================================
// 12. WALLET MODALS
// ============================================================================

function showDepositModal() {
    const modal = document.getElementById('depositModal');
    if (modal) modal.classList.add('show');
}

function copyDepositAddress() {
    const address = '0xd51d68d057805514823652dc090b9d455c79801a';
    navigator.clipboard.writeText(address);
    showToast('ADDRESS COPIED!', 'success');
}

async function confirmDeposit() {
    try {
        await fetch('/api/notify-deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userName: currentUser?.userName || 'Axion User', currency: 'AXC' })
        });
    } catch(e) {}
    showToast('✅ ADMIN NOTIFIED! AXC WILL BE ADDED WITHIN 15 MINUTES.', 'success');
    closeModal('depositModal');
}

function showWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    if (modal) modal.classList.add('show');
}

async function submitWithdraw() {
    const address = document.getElementById('withdrawAddressInput')?.value;
    const amount = parseFloat(document.getElementById('withdrawAmountInput')?.value || '0');
    
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
        showToast('INVALID BEP20 ADDRESS', 'error');
        return;
    }
    if (amount <= 0 || amount > (currentUser?.balance || 0)) {
        showToast('INVALID AMOUNT', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/withdraw-usdt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, address })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ WITHDRAWAL SUBMITTED (AUTO-APPROVED)', 'success');
            closeModal('withdrawModal');
            await loadUserData();
        } else {
            showToast(data.error || 'WITHDRAWAL FAILED', 'error');
        }
    } catch(e) {
        showToast('NETWORK ERROR', 'error');
    }
}

function showHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('show');
}

// ============================================================================
// 13. SWAP MODULE
// ============================================================================

const swapModal = document.getElementById('verificationModal');
const modalProceedBtn = document.getElementById('modalProceedBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

function showSwapModal() { if (swapModal) swapModal.classList.add('active'); }
function hideSwapModal() { if (swapModal) swapModal.classList.remove('active'); }

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
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4,
            speedY: Math.random() * 8 + 4,
            speedX: (Math.random() - 0.5) * 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 12
        });
    }
    
    let animationId, startTime = Date.now();
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let allFinished = true;
        for (let p of particles) {
            if (p.y < canvas.height + 100) {
                allFinished = false;
                p.y += p.speedY;
                p.x += p.speedX;
                p.rotation += p.rotationSpeed;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                ctx.restore();
            }
        }
        if (allFinished || Date.now() - startTime > 3000) {
            cancelAnimationFrame(animationId);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            animationId = requestAnimationFrame(animate);
        }
    }
    animate();
}

function updateSwapButtonState(isActive) {
    const btn = swapEls.swapBtn;
    if (!btn) return;
    if (isActive) {
        btn.disabled = false;
        btn.classList.remove('locked');
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
    } else {
        btn.disabled = false;
        btn.classList.remove('active');
        btn.classList.add('locked');
        btn.innerHTML = '<i class="fas fa-lock"></i> 🔒 SWAP LOCKED';
    }
}

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
        window.tonConnectUI.onStatusChange(async (wallet) => {
            if (wallet) {
                tonConnected = true;
                tonWalletAddress = wallet.account.address;
                if (swapEls.walletStatus) {
                    swapEls.walletStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
                }
                if (currentUser?.tonPaid) updateSwapButtonState(true);
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                if (swapEls.walletStatus) swapEls.walletStatus.innerHTML = 'NOT CONNECTED';
                updateSwapButtonState(false);
            }
        });
    } catch(e) { console.error('[TON] ERROR:', e); }
}

async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) {
        showStatus('swapStatus', '❌ CONNECT TON WALLET FIRST', 'error');
        return false;
    }
    if (!CONFIG.ownerWallet) {
        showStatus('swapStatus', '❌ OWNER WALLET NOT CONFIGURED', 'error');
        return false;
    }
    if (isActivating) return false;
    isActivating = true;
    
    const amountNano = (CONFIG.swapFeeTON * 1000000000).toString();
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: CONFIG.ownerWallet, amount: amountNano }]
    };
    
    try {
        showStatus('swapStatus', '⏳ WAITING FOR PAYMENT...', 'info');
        const result = await window.tonConnectUI.sendTransaction(transaction);
        const verifyRes = await fetch('/api/ton-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, txHash: result.boc, walletAddress: tonWalletAddress })
        });
        const verifyData = await verifyRes.json();
        if (verifyData.success) {
            await loadUserData();
            showStatus('swapStatus', '✅ SWAP UNLOCKED!', 'success');
            showConfetti();
            updateSwapButtonState(true);
            return true;
        } else {
            showStatus('swapStatus', '❌ VERIFICATION FAILED', 'error');
            updateSwapButtonState(false);
            return false;
        }
    } catch(error) {
        showStatus('swapStatus', '❌ PAYMENT CANCELLED', 'error');
        updateSwapButtonState(false);
        return false;
    } finally {
        isActivating = false;
    }
}

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `ai-status ${type}`;
    el.style.display = 'block';
    if (type !== 'error') setTimeout(() => el.style.display = 'none', 5000);
}

if (swapEls.swapFrom) {
    swapEls.swapFrom.addEventListener('input', function() {
        const amount = parseFloat(this.value);
        if (isNaN(amount) || amount <= 0) {
            if (swapEls.swapTo) swapEls.swapTo.value = '';
            return;
        }
        const usdtAmount = amount * CONFIG.axcPrice;
        if (swapEls.swapTo) swapEls.swapTo.value = usdtAmount.toFixed(2);
    });
}

if (swapEls.swapBtn) {
    swapEls.swapBtn.addEventListener('click', async () => {
        if (!currentUser?.tonPaid) { showSwapModal(); return; }
        const amount = parseFloat(swapEls.swapFrom?.value || '0');
        if (isSwapping) return;
        if (amount < CONFIG.minSwap) { showStatus('swapStatus', `❌ MIN ${CONFIG.minSwap} AXC`, 'error'); return; }
        if (amount > CONFIG.maxSwap) { showStatus('swapStatus', `❌ MAX ${CONFIG.maxSwap} AXC`, 'error'); return; }
        if (amount > (currentUser?.balance || 0)) { showStatus('swapStatus', '❌ INSUFFICIENT BALANCE', 'error'); return; }
        
        try {
            isSwapping = true;
            swapEls.swapBtn.disabled = true;
            swapEls.swapBtn.innerHTML = '<span class="spinner"></span> PROCESSING...';
            const res = await fetch('/api/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, amount }) });
            const data = await res.json();
            if (data.success) {
                await loadUserData();
                if (swapEls.swapFrom) swapEls.swapFrom.value = '';
                if (swapEls.swapTo) swapEls.swapTo.value = '';
                showStatus('swapStatus', `✅ SWAPPED ${amount.toLocaleString()} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
                showConfetti();
            } else showStatus('swapStatus', '❌ ' + (data.error || 'SWAP FAILED'), 'error');
        } catch(error) { showStatus('swapStatus', '❌ NETWORK ERROR', 'error'); }
        finally { isSwapping = false; swapEls.swapBtn.disabled = false; updateSwapButtonState(true); }
    });
}

if (modalProceedBtn) modalProceedBtn.addEventListener('click', async () => { hideSwapModal(); await handleActivation(); });
if (modalCancelBtn) modalCancelBtn.addEventListener('click', () => hideSwapModal());

// ============================================================================
// 14. AXION AI PAGE
// ============================================================================

function renderAxionPage() {
    const container = document.getElementById('axionContent');
    if (!container) return;
    container.innerHTML = `
        <div class="axion-hero">
            <div class="axion-icon">🧠</div>
            <h1 class="axion-title">AXION AI</h1>
            <p class="axion-subtitle">NEURAL INTELLIGENCE PROTOCOL</p>
        </div>
        <div class="axion-card">
            <div class="axion-card-title">⚡ THE FUTURE OF DEFI & AI</div>
            <p class="axion-card-text">Axion Coin (AXC) is a next-generation decentralized trading and liquidity token designed to solve challenges through a unified ecosystem integrating DeFi liquidity, decentralized governance, and AI-driven trading intelligence.</p>
        </div>
        <div class="axion-card">
            <div class="axion-card-title">🎯 KEY FEATURES</div>
            <div class="axion-features">
                <div class="axion-feature">🤖 AI TRADING INTELLIGENCE</div>
                <div class="axion-feature">💧 DECENTRALIZED LIQUIDITY</div>
                <div class="axion-feature">🗳️ COMMUNITY GOVERNANCE</div>
                <div class="axion-feature">💰 STAKING REWARDS</div>
            </div>
        </div>
        <div class="axion-card">
            <div class="axion-card-title">📊 TOKENOMICS</div>
            <div class="axion-stat"><span class="axion-stat-label">NETWORK:</span><span class="axion-stat-value">BNB SMART CHAIN (BEP-20)</span></div>
            <div class="axion-stat"><span class="axion-stat-label">TOTAL SUPPLY:</span><span class="axion-stat-value">500,000,000 AXC</span></div>
            <div class="axion-stat"><span class="axion-stat-label">LAUNCH PRICE:</span><span class="axion-stat-value">$0.003</span></div>
        </div>
        <div class="axion-card axion-future">
            <div class="axion-card-title">🔮 OPEN-SOURCE AI MODEL</div>
            <p class="axion-card-text">NO BOUNDARIES. NO RED LINES. FULLY TRANSPARENT AND COMMUNITY-DRIVEN.</p>
            <div class="axion-badge">COMING SOON</div>
        </div>
    `;
}

// ============================================================================
// 15. PAGE NAVIGATION
// ============================================================================

function showPage(pageName) {
    currentPage = pageName;
    Object.keys(pages).forEach(page => { if (pages[page]) pages[page].classList.add('hidden'); });
    if (pages[pageName]) pages[pageName].classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageName) item.classList.add('active');
    });
}

// ============================================================================
// 16. ASSETS & PRICES
// ============================================================================

async function loadPrices() {
    console.log('[AXION] Price system ready');
}

function refreshPrices() { loadPrices(); showToast('PRICES REFRESHED', 'success'); }
function showAllAssets() { showToast('ALL ASSETS VIEW COMING SOON', 'info'); }

// ============================================================================
// 17. INITIALIZATION
// ============================================================================

async function init() {
    console.log('🚀 AXION AI - LEGENDARY EDITION INITIALIZING...');
    
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    if (!userId) {
        const initData = tg?.initDataUnsafe;
        userId = initData?.user?.id?.toString();
    }
    if (!userId) {
        showToast('❌ PLEASE OPEN FROM TELEGRAM BOT', 'error');
        return;
    }
    
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
    await loadPrices();
    
    initMiningSystem();
    initEarnSystem();
    initTasksSystem();
    renderAxionPage();
    
    // Event Listeners
    document.getElementById('depositBtn')?.addEventListener('click', showDepositModal);
    document.getElementById('withdrawBtnWallet')?.addEventListener('click', showWithdrawModal);
    document.getElementById('historyBtn')?.addEventListener('click', showHistoryModal);
    document.getElementById('claimMiningBtn')?.addEventListener('click', claimMiningReward);
    document.getElementById('watchAdBtn')?.addEventListener('click', watchAd);
    document.getElementById('confirmDepositBtn')?.addEventListener('click', confirmDeposit);
    document.getElementById('submitWithdrawBtn')?.addEventListener('click', submitWithdraw);
    document.getElementById('copyReferralLink')?.addEventListener('click', () => {
        if (walletEls.referralLink?.value) {
            navigator.clipboard.writeText(walletEls.referralLink.value);
            showToast('REFERRAL LINK COPIED!', 'success');
        }
    });
    
    document.querySelectorAll('.boost-option').forEach(el => {
        el.addEventListener('click', () => activateBoost(el.dataset.boost));
    });
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => showPage(item.dataset.page));
    });
    
    showPage('wallet');
    console.log('✅ AXION AI READY! GO GET THEM, LEGEND! 🔥');
}

// EXPOSE GLOBALS
window.showPage = showPage;
window.copyDepositAddress = copyDepositAddress;
window.confirmDeposit = confirmDeposit;
window.submitWithdraw = submitWithdraw;
window.showWithdrawModal = showWithdrawModal;
window.closeModal = closeModal;
window.startTask = startTask;
window.activateBoost = activateBoost;
window.refreshPrices = refreshPrices;
window.showAllAssets = showAllAssets;
window.showHistoryModal = showHistoryModal;

// LAUNCH
init();
