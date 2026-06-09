// ============================================================================
// AXION AI - LEGENDARY EDITION v21.0 (COMPLETE)
// ============================================================================
// نظام متكامل يشمل:
// ✅ Swap + TON Activation (من الإصدار القديم)
// ✅ Mining (2.5 ساعة + 10 AXC لكل إعلان)
// ✅ Withdraw Bottom Sheet (AXC + USDT)
// ✅ Notifications + History
// ✅ Tasks + Referral + Boost
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
    console.log('✅ AXION AI v21.0 Ready');
}

// ============================================================================
// 2. CONFIGURATION
// ============================================================================

const CONFIG = {
    axcPrice: 0.01,
    swapFeeTON: 5,
    minSwap: 100,
    maxSwap: 100000,
    ownerWallet: null,
    botUsername: 'AxionBep20Airdropbot',
    
    // Mining System
    ADS_PER_CLAIM: 40,
    REWARD_PER_AD: 10,
    REWARD_PER_CLAIM: 400,
    COOLDOWN_HOURS: 2.5,
    COOLDOWN_MS: 2.5 * 60 * 60 * 1000,
    
    // Boosts
    BOOSTS: {
        bronze: { price: 2.5, reward: 800, duration: 3, name: 'BRONZE' },
        silver: { price: 5, reward: 1250, duration: 7, name: 'SILVER' },
        gold: { price: 10, reward: 2500, duration: 30, name: 'GOLD' }
    },
    
    // Tasks
    tasks: [
        { id: 1, name: 'Join Telegram Channel', url: 'https://t.me/AxionAiSignal', reward: 100, completed: false },
        { id: 2, name: 'Follow on Twitter', url: 'https://twitter.com/AxionAI', reward: 100, completed: false },
        { id: 3, name: 'Visit Website', url: 'https://axionai.io', reward: 100, completed: false },
        { id: 4, name: 'Join Community', url: 'https://t.me/AxionAiCommunity', reward: 100, completed: false }
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
// 3. GLOBAL STATE
// ============================================================================

let currentPage = 'wallet';
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
let miningInterval = null;
let notifications = [];
let unreadCount = 0;

// Mining State
let miningState = {
    adsWatched: 0,
    lastClaimTime: null,
    boostType: null,
    boostExpiry: null,
    totalMined: 0
};

// Withdraw State
let withdrawCurrency = 'AXC';
let withdrawModal = null;

// ============================================================================
// 4. UTILITIES
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

function formatTimeLeft(ms) {
    if (ms <= 0) return 'Ready!';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function saveMiningState() {
    localStorage.setItem(`axion_mining_${userId}`, JSON.stringify(miningState));
}

function loadMiningState() {
    const saved = localStorage.getItem(`axion_mining_${userId}`);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            miningState = { ...miningState, ...data };
        } catch(e) {}
    }
    
    if (miningState.boostExpiry && Date.now() > miningState.boostExpiry) {
        miningState.boostType = null;
        miningState.boostExpiry = null;
        saveMiningState();
    }
    
    if (!miningState.lastClaimTime) {
        miningState.lastClaimTime = Date.now() - CONFIG.COOLDOWN_MS;
        saveMiningState();
    }
}

function saveNotifications() {
    localStorage.setItem(`axion_notifications_${userId}`, JSON.stringify(notifications));
}

function loadNotifications() {
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
        title,
        message,
        type,
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

function getCurrentReward() {
    let reward = CONFIG.REWARD_PER_CLAIM;
    if (miningState.boostType && CONFIG.BOOSTS[miningState.boostType]) {
        reward = CONFIG.BOOSTS[miningState.boostType].reward;
    }
    return reward;
}

function calculateProgress() {
    if (!miningState.lastClaimTime) return 0;
    
    const now = Date.now();
    const timeSinceLastClaim = now - miningState.lastClaimTime;
    
    if (timeSinceLastClaim >= CONFIG.COOLDOWN_MS) {
        return CONFIG.ADS_PER_CLAIM;
    }
    
    const timeProgress = (timeSinceLastClaim / CONFIG.COOLDOWN_MS) * CONFIG.ADS_PER_CLAIM;
    const total = timeProgress + miningState.adsWatched;
    return Math.min(CONFIG.ADS_PER_CLAIM, total);
}

function canClaim() {
    return calculateProgress() >= CONFIG.ADS_PER_CLAIM;
}

function getRemainingTime() {
    if (!miningState.lastClaimTime) return 0;
    const now = Date.now();
    const elapsed = now - miningState.lastClaimTime;
    if (elapsed >= CONFIG.COOLDOWN_MS) return 0;
    return CONFIG.COOLDOWN_MS - elapsed;
}

// ============================================================================
// 5. MINING SYSTEM
// ============================================================================

function updateMiningUI() {
    const progress = calculateProgress();
    const percent = (progress / CONFIG.ADS_PER_CLAIM) * 100;
    const ready = canClaim();
    const reward = getCurrentReward();
    const remainingTime = getRemainingTime();
    
    const progressFill = document.getElementById('miningProgressFill');
    const progressValue = document.getElementById('miningProgressValue');
    const rewardEl = document.getElementById('miningReward');
    const powerEl = document.getElementById('miningPower');
    const infoText = document.getElementById('miningInfoText');
    const claimBtn = document.getElementById('claimMiningBtn');
    const miningBalance = document.getElementById('miningAxcBalance');
    
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressValue) progressValue.textContent = Math.floor(progress);
    if (rewardEl) rewardEl.textContent = `${reward} AXC`;
    
    if (powerEl) {
        if (miningState.boostType) {
            powerEl.textContent = CONFIG.BOOSTS[miningState.boostType].name;
        } else {
            powerEl.textContent = 'STANDARD';
        }
    }
    
    if (infoText) {
        if (ready) {
            infoText.innerHTML = '<i class="fas fa-gem"></i> Ready to claim!';
        } else if (remainingTime > 0) {
            infoText.innerHTML = `<i class="fas fa-hourglass-half"></i> Next claim in ${formatTimeLeft(remainingTime)}`;
        } else {
            const adsNeeded = Math.max(0, CONFIG.ADS_PER_CLAIM - miningState.adsWatched);
            infoText.innerHTML = `<i class="fas fa-play-circle"></i> ${adsNeeded} ads or wait for auto-fill`;
        }
    }
    
    if (claimBtn) {
        if (ready && !isClaiming) {
            claimBtn.style.display = 'flex';
            claimBtn.disabled = false;
            claimBtn.innerHTML = `<i class="fas fa-gem"></i> CLAIM ${reward} AXC`;
        } else if (isClaiming) {
            claimBtn.style.display = 'flex';
            claimBtn.disabled = true;
            claimBtn.innerHTML = '<span class="spinner"></span> CLAIMING...';
        } else {
            claimBtn.style.display = 'none';
        }
    }
    
    if (miningBalance && currentUser) {
        miningBalance.textContent = (currentUser.balance || 0).toLocaleString();
    }
}

function startMiningTimer() {
    if (miningInterval) clearInterval(miningInterval);
    miningInterval = setInterval(updateMiningUI, 1000);
}

async function claimMiningReward() {
    if (!canClaim()) {
        showToast('Mining in progress! Watch ads or wait.', 'warning');
        return;
    }
    
    if (isClaiming) return;
    isClaiming = true;
    updateMiningUI();
    
    const reward = getCurrentReward();
    
    try {
        const res = await fetch('/api/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: reward, currency: 'AXC' })
        });
        const data = await res.json();
        
        if (data.success) {
            miningState.adsWatched = 0;
            miningState.lastClaimTime = Date.now();
            miningState.totalMined += reward;
            saveMiningState();
            
            await loadUserData();
            updateMiningUI();
            addNotification('Mining Reward!', `You claimed ${reward} AXC!`, 'success');
            showConfetti();
        } else {
            showToast(data.error || 'Claim failed, try again', 'error');
        }
    } catch(e) {
        showToast('Network error, try again', 'error');
    } finally {
        isClaiming = false;
        updateMiningUI();
    }
}

// ============================================================================
// 6. WATCH AD (10 AXC PER AD)
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
        const result = await platform.show(controller);
        return result === true;
    } catch(e) {
        return false;
    }
}

async function watchAd() {
    if (canClaim()) {
        showToast('Mining complete! Claim your reward first.', 'warning');
        return;
    }
    
    if (adSequenceActive) {
        showToast('Ad in progress...', 'warning');
        return;
    }
    
    adSequenceActive = true;
    const btn = document.getElementById('watchAdBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> LOADING AD...';
    }
    
    let adSuccess = false;
    for (const platform of AD_PLATFORMS) {
        adSuccess = await tryShowAd(platform);
        if (adSuccess) break;
    }
    
    if (adSuccess) {
        miningState.adsWatched = Math.min(miningState.adsWatched + 1, CONFIG.ADS_PER_CLAIM);
        saveMiningState();
        updateMiningUI();
        
        const progress = calculateProgress();
        const remaining = Math.ceil(CONFIG.ADS_PER_CLAIM - progress);
        
        if (canClaim()) {
            showToast(`🎉 Mining complete! Claim ${getCurrentReward()} AXC!`, 'success');
        } else {
            showToast(`✅ +10 AXC! ${remaining} steps to claim`, 'success');
        }
    } else {
        showToast('❌ Failed to load ad, try again', 'error');
    }
    
    adSequenceActive = false;
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play-circle"></i> WATCH AD (+10 AXC)';
    }
}

// ============================================================================
// 7. BOOST SYSTEM
// ============================================================================

async function activateBoost(boostKey) {
    const boost = CONFIG.BOOSTS[boostKey];
    if (!boost) return;
    
    if (!tonConnected || !tonWalletAddress) {
        showToast('Connect TON wallet first', 'warning');
        return;
    }
    
    if (!CONFIG.ownerWallet) {
        showToast('Owner wallet not configured', 'error');
        return;
    }
    
    const amountNano = (boost.price * 1000000000).toString();
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: CONFIG.ownerWallet, amount: amountNano }]
    };
    
    try {
        showToast('⏳ Processing payment...', 'info');
        await window.tonConnectUI.sendTransaction(transaction);
        
        miningState.boostType = boostKey;
        miningState.boostExpiry = Date.now() + (boost.duration * 24 * 60 * 60 * 1000);
        saveMiningState();
        updateMiningUI();
        showToast(`✅ ${boost.name} BOOST ACTIVATED!`, 'success');
        
        const options = document.getElementById('boostOptions');
        if (options) options.style.display = 'none';
    } catch(error) {
        showToast('Payment cancelled', 'error');
    }
}

// ============================================================================
// 8. TASKS SYSTEM
// ============================================================================

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    
    const tasksData = JSON.parse(localStorage.getItem(`axion_tasks_${userId}`) || JSON.stringify(CONFIG.tasks));
    
    container.innerHTML = tasksData.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <div class="task-info">
                <div class="task-name">${task.name}</div>
                <div class="task-reward">+${task.reward} AXC</div>
            </div>
            ${!task.completed ? 
                `<button class="task-btn" onclick="window.completeTask(${task.id})">COMPLETE</button>` :
                '<span class="task-completed">✓ Completed</span>'
            }
        </div>
    `).join('');
}

async function completeTask(taskId) {
    const tasksData = JSON.parse(localStorage.getItem(`axion_tasks_${userId}`) || JSON.stringify(CONFIG.tasks));
    const task = tasksData.find(t => t.id === taskId);
    if (!task || task.completed) return;
    
    if (task.url) window.open(task.url, '_blank');
    
    showToast(`Task: ${task.name}. +${task.reward} AXC in 15 seconds...`, 'info');
    
    setTimeout(async () => {
        task.completed = true;
        localStorage.setItem(`axion_tasks_${userId}`, JSON.stringify(tasksData));
        
        const res = await fetch('/api/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: task.reward, currency: 'AXC' })
        });
        
        if (res.ok) {
            await loadUserData();
            renderTasks();
            showToast(`✅ +${task.reward} AXC added!`, 'success');
            addNotification('Task Completed!', `You earned ${task.reward} AXC from ${task.name}`, 'success');
        }
    }, 15000);
}

// ============================================================================
// 9. API & USER DATA
// ============================================================================

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        CONFIG.ownerWallet = data.ownerWallet;
        if (data.config) {
            CONFIG.axcPrice = data.config.axcPrice || 0.01;
        }
        const priceEl = document.getElementById('axcPrice');
        if (priceEl) priceEl.textContent = CONFIG.axcPrice;
    } catch(e) { console.error('Config error:', e); }
}

async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (firebase.apps.length === 0) firebase.initializeApp(config.firebaseConfig);
        db = firebase.firestore();
        console.log('Firebase ready');
    } catch(e) { console.error('Firebase error:', e); }
}

async function loadUserData() {
    if (!userId) return;
    try {
        const res = await fetch(`/api/user/${userId}`);
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            updateWalletUI();
            updateSwapUI();
            updateMiningUI();
            updateReferralUI();
        }
    } catch(e) { console.error('Load error:', e); }
}

async function fetchLivePrices() {
    try {
        const ids = ['bitcoin', 'ethereum', 'binancecoin', 'the-open-network'];
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`);
        const data = await res.json();
        
        livePrices = {
            BTC: { price: data.bitcoin?.usd || 68500, change: data.bitcoin?.usd_24h_change || 0 },
            ETH: { price: data.ethereum?.usd || 3200, change: data.ethereum?.usd_24h_change || 0 },
            BNB: { price: data.binancecoin?.usd || 580, change: data.binancecoin?.usd_24h_change || 0 },
            TON: { price: data['the-open-network']?.usd || 5.5, change: data['the-open-network']?.usd_24h_change || 0 }
        };
        
        renderTopCryptos();
    } catch(e) {
        console.error('Price error:', e);
    }
}

// ============================================================================
// 10. WALLET UI
// ============================================================================

function updateWalletUI() {
    if (!currentUser) return;
    
    const balance = currentUser.balance || 0;
    const usdtBalance = currentUser.usdtBalance || 0;
    const totalValue = (balance * CONFIG.axcPrice) + usdtBalance;
    
    const totalEl = document.getElementById('totalBalance');
    const axcEl = document.getElementById('walletAxcBalance');
    const usdtEl = document.getElementById('walletUsdtBalance');
    
    if (totalEl) totalEl.textContent = `$${totalValue.toFixed(2)}`;
    if (axcEl) axcEl.textContent = balance.toLocaleString();
    if (usdtEl) usdtEl.textContent = `$${usdtBalance.toFixed(2)}`;
    
    renderAssets();
}

function renderAssets() {
    const container = document.getElementById('assetsList');
    if (!container || !currentUser) return;
    
    container.innerHTML = `
        <div class="asset-item">
            <div class="asset-left">
                <img src="${CMC_ICONS.AXC}" class="asset-icon-img">
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
                <img src="${CMC_ICONS.USDT}" class="asset-icon-img">
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
    
    container.innerHTML = cryptos.map(crypto => {
        const changeClass = crypto.change >= 0 ? 'positive' : 'negative';
        const changeSymbol = crypto.change >= 0 ? '+' : '';
        return `
            <div class="crypto-item">
                <div class="crypto-left">
                    <img src="${crypto.icon}" class="crypto-icon-img">
                    <div class="crypto-info">
                        <h4>${crypto.name}</h4>
                        <p>${crypto.symbol}</p>
                    </div>
                </div>
                <div class="crypto-right">
                    <div class="crypto-price">$${crypto.price.toLocaleString()}</div>
                    <div class="crypto-change ${changeClass}">${changeSymbol}${crypto.change.toFixed(2)}%</div>
                </div>
            </div>
        `;
    }).join('');
}

function updateReferralUI() {
    if (!currentUser) return;
    const count = currentUser.inviteCount || 0;
    const earned = count * 100;
    
    const countEl = document.getElementById('referralCount');
    const earnedEl = document.getElementById('referralEarned');
    const linkEl = document.getElementById('referralLink');
    
    if (countEl) countEl.textContent = count;
    if (earnedEl) earnedEl.textContent = `${earned.toLocaleString()} AXC`;
    if (linkEl) linkEl.value = `https://t.me/${CONFIG.botUsername}?start=${userId}`;
}

// ============================================================================
// 11. WITHDRAW SYSTEM (BOTTOM SHEET)
// ============================================================================

function initWithdrawSheet() {
    const sheet = document.getElementById('withdrawBottomSheet');
    const closeBtn = document.getElementById('closeWithdrawSheetBtn');
    const submitBtn = document.getElementById('submitWithdrawSheetBtn');
    const currencyBtns = document.querySelectorAll('.currency-option');
    const quickAmounts = document.querySelectorAll('.quick-amount');
    
    if (closeBtn) {
        closeBtn.onclick = () => sheet.classList.remove('show');
    }
    
    if (submitBtn) {
        submitBtn.onclick = () => submitWithdraw();
    }
    
    currencyBtns.forEach(btn => {
        btn.onclick = () => {
            withdrawCurrency = btn.dataset.currency;
            currencyBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateWithdrawSheet();
        };
    });
    
    quickAmounts.forEach(btn => {
        btn.onclick = () => {
            const percent = parseInt(btn.dataset.percent) / 100;
            const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
            const amount = Math.floor(balance * percent);
            const input = document.getElementById('sheetAmountInput');
            if (input) input.value = amount;
        };
    });
}

function updateWithdrawSheet() {
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    const minAmount = withdrawCurrency === 'AXC' ? 1000 : 10;
    const maxAmount = withdrawCurrency === 'AXC' ? 50000 : 1000;
    
    const balanceEl = document.getElementById('sheetBalanceValue');
    const minEl = document.getElementById('sheetMinAmount');
    const maxEl = document.getElementById('sheetMaxAmount');
    const currencyLabel = document.getElementById('sheetCurrencyLabel');
    
    if (balanceEl) balanceEl.textContent = withdrawCurrency === 'AXC' ? `${balance.toLocaleString()} AXC` : `$${balance.toFixed(2)}`;
    if (minEl) minEl.textContent = withdrawCurrency === 'AXC' ? `1,000 AXC` : `10 USDT`;
    if (maxEl) maxEl.textContent = withdrawCurrency === 'AXC' ? `50,000 AXC` : `1,000 USDT`;
    if (currencyLabel) currencyLabel.textContent = withdrawCurrency;
}

function showWithdrawModal() {
    updateWithdrawSheet();
    const sheet = document.getElementById('withdrawBottomSheet');
    if (sheet) sheet.classList.add('show');
}

async function submitWithdraw() {
    const amount = parseFloat(document.getElementById('sheetAmountInput')?.value || '0');
    const address = document.getElementById('sheetAddressInput')?.value || '';
    
    const isValidBEP20 = /^0x[a-fA-F0-9]{40}$/i.test(address);
    if (!address || !isValidBEP20) {
        showToast('Invalid BEP20 address', 'error');
        return;
    }
    
    const minAmount = withdrawCurrency === 'AXC' ? 1000 : 10;
    const maxAmount = withdrawCurrency === 'AXC' ? 50000 : 1000;
    
    if (amount < minAmount) {
        showToast(`Minimum ${minAmount} ${withdrawCurrency}`, 'error');
        return;
    }
    if (amount > maxAmount) {
        showToast(`Maximum ${maxAmount} ${withdrawCurrency}`, 'error');
        return;
    }
    
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    if (amount > balance) {
        showToast(`Insufficient ${withdrawCurrency} balance`, 'error');
        return;
    }
    
    const endpoint = withdrawCurrency === 'AXC' ? '/api/withdraw-axc' : '/api/withdraw-usdt';
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, address, currency: withdrawCurrency })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(`✅ ${amount} ${withdrawCurrency} submitted!`, 'success');
            addNotification('Withdrawal', `${amount} ${withdrawCurrency} withdrawal submitted`, 'success');
            document.getElementById('withdrawBottomSheet')?.classList.remove('show');
            await loadUserData();
        } else {
            showToast(data.error || 'Withdrawal failed', 'error');
        }
    } catch(e) {
        showToast('Network error', 'error');
    }
}

// ============================================================================
// 12. DEPOSIT SYSTEM
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
        showToast('Admin notified! AXC will be added within 15 minutes.', 'success');
    } catch(e) {}
    closeModal('depositModal');
}

// ============================================================================
// 13. SWAP SYSTEM (FROM ORIGINAL)
// ============================================================================

function initTonConnect() {
    const container = document.getElementById('ton-connect');
    if (!container) return;
    
    if (typeof TON_CONNECT_UI === 'undefined') {
        container.innerHTML = '<span style="color:#e74c3c">⚠️ TON Connect unavailable</span>';
        return;
    }
    
    try {
        window.tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
            manifestUrl: window.location.origin + '/tonconnect-manifest.json',
            buttonRootId: 'ton-connect'
        });
        
        window.tonConnectUI.onStatusChange((wallet) => {
            if (wallet) {
                tonConnected = true;
                tonWalletAddress = wallet.account.address;
                const statusEl = document.getElementById('walletStatus');
                if (statusEl) statusEl.innerHTML = `${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                const statusEl = document.getElementById('walletStatus');
                if (statusEl) statusEl.innerHTML = 'Not connected';
            }
        });
    } catch(e) {
        console.error('TON error:', e);
    }
}

function updateSwapUI() {
    if (!currentUser) return;
    
    const fromBalance = document.getElementById('fromBalance');
    const toBalance = document.getElementById('toBalance');
    const swapBtn = document.getElementById('swapBtn');
    
    if (fromBalance) fromBalance.textContent = (currentUser.balance || 0).toLocaleString();
    if (toBalance) toBalance.textContent = `$${(currentUser.usdtBalance || 0).toFixed(2)}`;
    
    if (swapBtn) {
        if (currentUser.tonPaid) {
            swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> SWAP NOW';
            swapBtn.classList.add('active');
        } else {
            swapBtn.innerHTML = '<i class="fas fa-lock"></i> Unlock Neural Swap (5 TON)';
            swapBtn.classList.remove('active');
        }
    }
}

function showSwapStatus(message, isError = false) {
    const statusEl = document.getElementById('swapStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `swap-status ${isError ? 'error' : 'success'}`;
        statusEl.style.display = 'block';
        if (!isError) setTimeout(() => statusEl.style.display = 'none', 5000);
    }
}

function showActivationModal() {
    const modal = document.getElementById('activationModal');
    if (modal) modal.classList.add('show');
}

function hideActivationModal() {
    const modal = document.getElementById('activationModal');
    if (modal) modal.classList.remove('show');
}

async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) {
        showSwapStatus('Connect TON wallet first', true);
        return false;
    }
    
    if (!CONFIG.ownerWallet) {
        showSwapStatus('System error: Owner wallet not configured', true);
        return false;
    }
    
    if (isActivating) return false;
    isActivating = true;
    
    const amountNano = (CONFIG.swapFeeTON * 1000000000).toString();
    
    try {
        showSwapStatus('Waiting for payment...', false);
        await window.tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{ address: CONFIG.ownerWallet, amount: amountNano }]
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
            showSwapStatus('Swap unlocked!', false);
            addNotification('Swap Activated!', 'You can now swap AXC to USDT', 'success');
            showConfetti();
            return true;
        } else {
            showSwapStatus('Verification failed', true);
            return false;
        }
    } catch(error) {
        showSwapStatus('Payment cancelled', true);
        return false;
    } finally {
        isActivating = false;
        hideActivationModal();
    }
}

async function executeSwap() {
    if (!currentUser?.tonPaid) {
        showActivationModal();
        return;
    }
    
    const amount = parseFloat(document.getElementById('swapFrom')?.value || '0');
    
    if (amount < CONFIG.minSwap) {
        showSwapStatus(`Minimum ${CONFIG.minSwap} AXC`, true);
        return;
    }
    if (amount > CONFIG.maxSwap) {
        showSwapStatus(`Maximum ${CONFIG.maxSwap} AXC`, true);
        return;
    }
    if (amount > (currentUser?.balance || 0)) {
        showSwapStatus('Insufficient AXC balance', true);
        return;
    }
    
    if (isSwapping) return;
    isSwapping = true;
    
    const swapBtn = document.getElementById('swapBtn');
    if (swapBtn) {
        swapBtn.disabled = true;
        swapBtn.innerHTML = '<span class="spinner"></span> PROCESSING...';
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
            const input = document.getElementById('swapFrom');
            const output = document.getElementById('swapTo');
            if (input) input.value = '';
            if (output) output.value = '';
            showSwapStatus(`✅ Swapped ${amount} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, false);
            addNotification('Swap Completed', `Swapped ${amount} AXC to ${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
            showConfetti();
        } else {
            showSwapStatus(data.error || 'Swap failed', true);
        }
    } catch(e) {
        showSwapStatus('Network error', true);
    } finally {
        isSwapping = false;
        if (swapBtn) {
            swapBtn.disabled = false;
            if (currentUser?.tonPaid) {
                swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> SWAP NOW';
            } else {
                swapBtn.innerHTML = '<i class="fas fa-lock"></i> Unlock Neural Swap (5 TON)';
            }
        }
    }
}

// ============================================================================
// 14. NOTIFICATIONS MODAL
// ============================================================================

function renderNotificationsList() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">No notifications yet</div>';
        return;
    }
    
    container.innerHTML = notifications.map(notif => `
        <div class="notification-item ${!notif.read ? 'unread' : ''}" onclick="window.markNotificationRead('${notif.id}')">
            <div class="notification-icon ${notif.type}">
                <i class="fas ${notif.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${notif.title}</div>
                <div class="notification-message">${notif.message}</div>
                <div class="notification-time">${new Date(notif.timestamp).toLocaleString()}</div>
            </div>
            ${!notif.read ? '<div class="notification-unread-dot"></div>' : ''}
        </div>
    `).join('');
}

function showNotificationsModal() {
    renderNotificationsList();
    const modal = document.getElementById('notificationsModal');
    if (modal) modal.classList.add('show');
}

function closeNotificationsModal() {
    const modal = document.getElementById('notificationsModal');
    if (modal) modal.classList.remove('show');
}

function markNotificationRead(id) {
    const notif = notifications.find(n => n.id === id);
    if (notif && !notif.read) {
        notif.read = true;
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
// 15. MODALS & HISTORY
// ============================================================================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

function showHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('show');
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;
    
    const transactions = JSON.parse(localStorage.getItem(`axion_transactions_${userId}`) || '[]');
    
    if (transactions.length === 0) {
        container.innerHTML = '<div class="empty-state">No transactions yet</div>';
        return;
    }
    
    container.innerHTML = transactions.slice(0, 50).map(tx => `
        <div class="history-item">
            <div class="history-type ${tx.type}">${tx.type.toUpperCase()}</div>
            <div class="history-amount">${tx.amount} ${tx.currency}</div>
            <div class="history-date">${new Date(tx.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

// ============================================================================
// 16. AXION AI PAGE
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
            <div class="axion-stat"><span>NETWORK:</span><span>BNB SMART CHAIN (BEP-20)</span></div>
            <div class="axion-stat"><span>TOTAL SUPPLY:</span><span>500,000,000 AXC</span></div>
            <div class="axion-stat"><span>LAUNCH PRICE:</span><span>$0.003</span></div>
        </div>
        <div class="axion-card">
            <div class="axion-card-title">🔮 OPEN-SOURCE AI MODEL</div>
            <p class="axion-card-text">NO BOUNDARIES. NO RED LINES. FULLY TRANSPARENT AND COMMUNITY-DRIVEN.</p>
            <div class="axion-badge">COMING SOON</div>
        </div>
    `;
}

// ============================================================================
// 17. CONFETTI
// ============================================================================

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
    
    let animationId;
    const startTime = Date.now();
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let allFinished = true;
        
        for (const p of particles) {
            if (p.y < canvas.height + 100) {
                allFinished = false;
                p.y += p.speedY;
                p.x += p.speedX;
                p.rotation += p.rotationSpeed;
                
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
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

// ============================================================================
// 18. PAGE NAVIGATION
// ============================================================================

function showPage(pageName) {
    currentPage = pageName;
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const selectedPage = document.getElementById(`${pageName}Page`);
    if (selectedPage) selectedPage.classList.add('active');
    
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) item.classList.add('active');
    });
    
    // Show/hide header actions (notification bell only on wallet page)
    const headerActions = document.getElementById('headerActions');
    if (headerActions) {
        if (pageName === 'wallet') {
            headerActions.style.display = 'flex';
        } else {
            headerActions.style.display = 'none';
        }
    }
}

// ============================================================================
// 19. INITIALIZATION
// ============================================================================

async function init() {
    console.log('🚀 AXION AI v21.0 Initializing...');
    
    // Get userId
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    if (!userId) {
        const initData = tg?.initDataUnsafe;
        userId = initData?.user?.id?.toString();
    }
    if (!userId) {
        showToast('Please open from Telegram bot', 'error');
        return;
    }
    
    // Load data
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
    await fetchLivePrices();
    
    // Load saved states
    loadMiningState();
    loadNotifications();
    updateMiningUI();
    startMiningTimer();
    
    // Render UI
    renderTasks();
    renderAxionPage();
    updateReferralUI();
    updateSwapUI();
    initWithdrawSheet();
    
    // Event listeners
    const notificationBtn = document.getElementById('notificationBtn');
    const historyBtnWallet = document.getElementById('historyBtnWallet');
    const depositBtn = document.getElementById('depositBtn');
    const withdrawBtn = document.getElementById('withdrawBtnWallet');
    const watchAdBtn = document.getElementById('watchAdBtn');
    const claimBtn = document.getElementById('claimMiningBtn');
    const boostTrigger = document.getElementById('boostTriggerBtn');
    const boostOptions = document.getElementById('boostOptions');
    const copyReferralBtn = document.getElementById('copyReferralLink');
    const swapFrom = document.getElementById('swapFrom');
    const swapTo = document.getElementById('swapTo');
    const swapBtn = document.getElementById('swapBtn');
    const confirmDepositBtn = document.getElementById('confirmDepositBtn');
    const activationCancel = document.getElementById('activationCancelBtn');
    const activationProceed = document.getElementById('activationProceedBtn');
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    const clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
    
    if (notificationBtn) notificationBtn.onclick = showNotificationsModal;
    if (historyBtnWallet) historyBtnWallet.onclick = showHistoryModal;
    if (depositBtn) depositBtn.onclick = showDepositModal;
    if (withdrawBtn) withdrawBtn.onclick = showWithdrawModal;
    if (watchAdBtn) watchAdBtn.onclick = watchAd;
    if (claimBtn) claimBtn.onclick = claimMiningReward;
    if (confirmDepositBtn) confirmDepositBtn.onclick = confirmDeposit;
    if (copyReferralBtn) copyReferralBtn.onclick = () => {
        const link = document.getElementById('referralLink');
        if (link?.value) {
            navigator.clipboard.writeText(link.value);
            showToast('Referral link copied!', 'success');
        }
    };
    if (activationCancel) activationCancel.onclick = hideActivationModal;
    if (activationProceed) activationProceed.onclick = handleActivation;
    if (markAllReadBtn) markAllReadBtn.onclick = markAllRead;
    if (clearNotificationsBtn) clearNotificationsBtn.onclick = clearAllNotifications;
    
    if (boostTrigger) {
        boostTrigger.onclick = () => {
            if (boostOptions) {
                boostOptions.style.display = boostOptions.style.display === 'flex' ? 'none' : 'flex';
            }
        };
    }
    
    document.querySelectorAll('.boost-option').forEach(option => {
        option.onclick = () => {
            const boost = option.dataset.boost;
            if (boost) activateBoost(boost);
        };
    });
    
    if (swapFrom) {
        swapFrom.oninput = () => {
            const amount = parseFloat(swapFrom.value);
            if (isNaN(amount) || amount <= 0) {
                if (swapTo) swapTo.value = '';
            } else {
                if (swapTo) swapTo.value = (amount * CONFIG.axcPrice).toFixed(2);
            }
        };
    }
    
    if (swapBtn) swapBtn.onclick = executeSwap;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => showPage(item.dataset.page);
    });
    
    document.addEventListener('click', (e) => {
        if (boostOptions && boostTrigger && !boostTrigger.contains(e.target) && !boostOptions.contains(e.target)) {
            boostOptions.style.display = 'none';
        }
    });
    
    showPage('wallet');
    console.log('✅ AXION AI v21.0 Ready!');
}

// Expose globals
window.showPage = showPage;
window.showAllAssets = () => showToast('All assets view coming soon', 'info');
window.refreshPrices = () => { fetchLivePrices(); showToast('Prices refreshed', 'success'); };
window.closeModal = closeModal;
window.closeNotificationsModal = closeNotificationsModal;
window.markNotificationRead = markNotificationRead;
window.completeTask = completeTask;
window.copyDepositAddress = copyDepositAddress;
window.showHistoryModal = showHistoryModal;
window.activateBoost = activateBoost;

// Start
init();
