// ============================================================================
// AXION AI - v23.0 STABLE
// ============================================================================

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0c0f');
    tg.setBackgroundColor('#0a0c0f');
}

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
    axcPrice: 0.01,
    swapFeeTON: 5,
    minSwap: 100,
    maxSwap: 100000,
    ownerWallet: null,
    botUsername: 'AxionBep20Airdropbot',
    ADS_PER_CLAIM: 40,
    REWARD_PER_AD: 10,
    REWARD_PER_CLAIM: 400,
    COOLDOWN_MS: 2.5 * 60 * 60 * 1000,
    BOOSTS: {
        bronze: { price: 2.5, reward: 800, duration: 3, name: 'BRONZE' },
        silver: { price: 5, reward: 1250, duration: 7, name: 'SILVER' },
        gold: { price: 10, reward: 2500, duration: 30, name: 'GOLD' }
    },
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
// STATE
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

let miningState = {
    adsWatched: 0,
    boostType: null,
    boostExpiry: null,
    totalMined: 0
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

function saveMiningState() {
    localStorage.setItem(`axion_mining_${userId}`, JSON.stringify(miningState));
}

function loadMiningState() {
    const saved = localStorage.getItem(`axion_mining_${userId}`);
    if (saved) {
        try { miningState = { ...miningState, ...JSON.parse(saved) }; } catch(e) {}
    }
    if (miningState.boostExpiry && Date.now() > miningState.boostExpiry) {
        miningState.boostType = null;
        miningState.boostExpiry = null;
        saveMiningState();
    }
}

function getLastClaimTime() {
    return parseInt(localStorage.getItem(`lastMiningClaim_${userId}`) || '0');
}

function setLastClaimTime() {
    localStorage.setItem(`lastMiningClaim_${userId}`, Date.now().toString());
}

function getCurrentReward() {
    if (miningState.boostType && CONFIG.BOOSTS[miningState.boostType]) {
        return CONFIG.BOOSTS[miningState.boostType].reward;
    }
    return CONFIG.REWARD_PER_CLAIM;
}

function canClaim() {
    return miningState.adsWatched >= CONFIG.ADS_PER_CLAIM;
}

function checkAutoFill() {
    const lastClaim = getLastClaimTime();
    if (lastClaim === 0) {
        setLastClaimTime();
        return;
    }
    if (Date.now() - lastClaim >= CONFIG.COOLDOWN_MS && miningState.adsWatched < CONFIG.ADS_PER_CLAIM) {
        miningState.adsWatched = CONFIG.ADS_PER_CLAIM;
        saveMiningState();
        updateMiningUI();
        showToast('🎉 Mining completed automatically! Claim your reward!', 'success');
    }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

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
                <div class="notification-title">${n.title}</div>
                <div class="notification-message">${n.message}</div>
                <div class="notification-time">${new Date(n.timestamp).toLocaleString()}</div>
            </div>
            ${!n.read ? '<div class="notification-unread-dot"></div>' : ''}
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
// MINING UI
// ============================================================================

function updateMiningUI() {
    const progressPercent = Math.min(100, (miningState.adsWatched / CONFIG.ADS_PER_CLAIM) * 100);
    const isReady = canClaim();
    const reward = getCurrentReward();
    const remainingTime = getLastClaimTime() ? Math.max(0, CONFIG.COOLDOWN_MS - (Date.now() - getLastClaimTime())) : 0;
    
    const progressFill = document.getElementById('miningProgress');
    const timer = document.getElementById('miningTimer');
    const info = document.getElementById('nextReward');
    const rate = document.getElementById('miningRate');
    const power = document.getElementById('miningPower');
    const claimBtn = document.getElementById('claimMiningBtn');
    const balance = document.getElementById('miningAxcBalance');
    const counter = document.getElementById('adsCounter');
    
    if (progressFill) progressFill.style.width = `${progressPercent}%`;
    
    if (timer) {
        if (isReady) timer.textContent = 'READY!';
        else if (remainingTime > 0) timer.textContent = formatTimeLeft(remainingTime);
        else timer.textContent = `${miningState.adsWatched} / ${CONFIG.ADS_PER_CLAIM}`;
    }
    
    if (info) {
        if (isReady) info.innerHTML = `🎉 CLAIM ${reward} AXC READY!`;
        else if (remainingTime > 0) info.innerHTML = `⏳ Auto-fill in ${formatTimeLeft(remainingTime)}`;
        else info.innerHTML = `📺 ${CONFIG.ADS_PER_CLAIM - miningState.adsWatched} ads to claim or wait for auto-fill`;
    }
    
    if (counter) counter.textContent = `📊 Progress: ${miningState.adsWatched} / ${CONFIG.ADS_PER_CLAIM}`;
    if (rate) rate.textContent = `${reward} AXC`;
    if (power) power.textContent = miningState.boostType ? CONFIG.BOOSTS[miningState.boostType].name : 'STANDARD';
    
    if (claimBtn) {
        if (isReady && !isClaiming) {
            claimBtn.style.display = 'flex';
            claimBtn.disabled = false;
            claimBtn.innerHTML = `<i class="fas fa-gem"></i> CLAIM ${reward} AXC`;
        } else if (isClaiming) {
            claimBtn.disabled = true;
            claimBtn.innerHTML = '<span class="spinner"></span> CLAIMING...';
        } else {
            claimBtn.style.display = 'none';
        }
    }
    
    if (balance && currentUser) balance.textContent = (currentUser.balance || 0).toLocaleString();
}

function startMiningTimer() {
    if (miningTimer) clearInterval(miningTimer);
    miningTimer = setInterval(() => {
        checkAutoFill();
        updateMiningUI();
    }, 1000);
}

// ============================================================================
// CLAIM REWARD
// ============================================================================

async function claimMiningReward() {
    if (!canClaim()) {
        showToast(`Watch ${CONFIG.ADS_PER_CLAIM - miningState.adsWatched} more ads or wait!`, 'warning');
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
            miningState.totalMined += reward;
            saveMiningState();
            setLastClaimTime();
            await loadUserData();
            updateMiningUI();
            addNotification('Mining Reward!', `You claimed ${reward} AXC!`, 'success');
            showToast(`🎉 +${reward} AXC CLAIMED!`, 'success');
            showConfetti();
        } else {
            showToast('Claim failed, try again', 'error');
        }
    } catch(e) {
        showToast('Network error', 'error');
    } finally {
        isClaiming = false;
        updateMiningUI();
    }
}

// ============================================================================
// WATCH AD
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
    if (canClaim()) {
        showToast('Claim your reward first!', 'warning');
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
    
    let success = false;
    for (const platform of AD_PLATFORMS) {
        success = await tryShowAd(platform);
        if (success) break;
    }
    
    if (success) {
        miningState.adsWatched = Math.min(miningState.adsWatched + 1, CONFIG.ADS_PER_CLAIM);
        saveMiningState();
        updateMiningUI();
        const remaining = CONFIG.ADS_PER_CLAIM - miningState.adsWatched;
        if (remaining === 0) {
            showToast(`🎉 Mining complete! Claim ${getCurrentReward()} AXC!`, 'success');
        } else {
            showToast(`✅ +${CONFIG.REWARD_PER_AD} AXC! ${remaining} ads to claim`, 'success');
        }
    } else {
        showToast('Failed to load ad, try again', 'error');
    }
    
    adSequenceActive = false;
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play-circle"></i> WATCH AD (+10 AXC)';
    }
}

// ============================================================================
// BOOST
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
    
    try {
        showToast('Processing payment...', 'info');
        await window.tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{ address: CONFIG.ownerWallet, amount: (boost.price * 1e9).toString() }]
        });
        
        miningState.boostType = boostKey;
        miningState.boostExpiry = Date.now() + (boost.duration * 24 * 60 * 60 * 1000);
        saveMiningState();
        updateMiningUI();
        addNotification('Boost Activated!', `${boost.name} boost activated!`, 'success');
        showToast(`✅ ${boost.name} BOOST ACTIVATED!`, 'success');
        document.getElementById('boostOptions').style.display = 'none';
    } catch(e) {
        showToast('Payment cancelled', 'error');
    }
}

// ============================================================================
// TASKS
// ============================================================================

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    const tasks = JSON.parse(localStorage.getItem(`axion_tasks_${userId}`) || JSON.stringify(CONFIG.tasks));
    container.innerHTML = tasks.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <div class="task-info">
                <div class="task-name">${task.name}</div>
                <div class="task-reward">+${task.reward} AXC</div>
            </div>
            ${!task.completed ? 
                `<button class="task-btn" onclick="window.completeTask(${task.id})">COMPLETE</button>` :
                '<span class="task-completed-badge">✓ COMPLETED</span>'
            }
        </div>
    `).join('');
}

async function completeTask(taskId) {
    const tasks = JSON.parse(localStorage.getItem(`axion_tasks_${userId}`) || JSON.stringify(CONFIG.tasks));
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.completed) return;
    if (task.url) window.open(task.url, '_blank');
    
    showToast(`Task: ${task.name}. +${task.reward} AXC in 15 seconds...`, 'info');
    
    setTimeout(async () => {
        task.completed = true;
        localStorage.setItem(`axion_tasks_${userId}`, JSON.stringify(tasks));
        
        const res = await fetch('/api/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: task.reward, currency: 'AXC' })
        });
        const data = await res.json();
        if (data.success) {
            await loadUserData();
            renderTasks();
            addNotification('Task Completed!', `You earned ${task.reward} AXC!`, 'success');
            showToast(`✅ +${task.reward} AXC ADDED!`, 'success');
        }
    }, 15000);
}

// ============================================================================
// API & USER DATA
// ============================================================================

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        CONFIG.ownerWallet = data.ownerWallet;
        if (data.config) {
            CONFIG.axcPrice = data.config.axcPrice || 0.01;
            CONFIG.minSwap = data.config.minSwap || 100;
            CONFIG.maxSwap = data.config.maxSwap || 100000;
        }
        document.getElementById('axcPrice').textContent = CONFIG.axcPrice;
    } catch(e) { console.error('Config error:', e); }
}

async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (firebase.apps.length === 0) firebase.initializeApp(config.firebaseConfig);
        db = firebase.firestore();
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
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,the-open-network&vs_currencies=usd&include_24hr_change=true');
        const data = await res.json();
        livePrices = {
            BTC: { price: data.bitcoin?.usd || 68500, change: data.bitcoin?.usd_24h_change || 0 },
            ETH: { price: data.ethereum?.usd || 3200, change: data.ethereum?.usd_24h_change || 0 },
            BNB: { price: data.binancecoin?.usd || 580, change: data.binancecoin?.usd_24h_change || 0 },
            TON: { price: data['the-open-network']?.usd || 5.5, change: data['the-open-network']?.usd_24h_change || 0 }
        };
        renderTopCryptos();
    } catch(e) { console.error('Price error:', e); }
}

// ============================================================================
// WALLET UI
// ============================================================================

function updateWalletUI() {
    if (!currentUser) return;
    const balance = currentUser.balance || 0;
    const usdt = currentUser.usdtBalance || 0;
    const total = (balance * CONFIG.axcPrice) + usdt;
    
    document.getElementById('totalBalance').textContent = `$${total.toFixed(2)}`;
    document.getElementById('walletAxcBalance').textContent = balance.toLocaleString();
    document.getElementById('walletUsdtBalance').textContent = `$${usdt.toFixed(2)}`;
    
    renderAssets();
}

function renderAssets() {
    const container = document.getElementById('assetsList');
    if (!container || !currentUser) return;
    container.innerHTML = `
        <div class="asset-item">
            <div class="asset-left"><img src="${CMC_ICONS.AXC}" class="asset-icon-img"><div class="asset-info"><h4>Axion Coin</h4><p>AXC</p></div></div>
            <div class="asset-right"><div class="asset-balance">${(currentUser.balance || 0).toLocaleString()} AXC</div><div class="asset-value">$${formatNumber((currentUser.balance || 0) * CONFIG.axcPrice)}</div></div>
        </div>
        <div class="asset-item">
            <div class="asset-left"><img src="${CMC_ICONS.USDT}" class="asset-icon-img"><div class="asset-info"><h4>Tether</h4><p>USDT</p></div></div>
            <div class="asset-right"><div class="asset-balance">${(currentUser.usdtBalance || 0).toFixed(2)} USDT</div><div class="asset-value">$${formatNumber(currentUser.usdtBalance || 0)}</div></div>
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
            <div class="crypto-left"><img src="${c.icon}" class="crypto-icon-img"><div class="crypto-info"><h4>${c.name}</h4><p>${c.symbol}</p></div></div>
            <div class="crypto-right"><div class="crypto-price">$${c.price.toLocaleString()}</div><div class="crypto-change ${c.change >= 0 ? 'positive' : 'negative'}">${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%</div></div>
        </div>
    `).join('');
}

function refreshPrices() { fetchLivePrices(); showToast('Prices refreshed', 'success'); }
function showAllAssets() { showToast('All assets view coming soon', 'info'); }

function updateReferralUI() {
    if (!currentUser) return;
    const count = currentUser.inviteCount || 0;
    document.getElementById('referralCount').textContent = count;
    document.getElementById('referralEarned').textContent = `${(count * 100).toLocaleString()} AXC`;
    document.getElementById('referralLink').value = `https://t.me/${CONFIG.botUsername}?start=${userId}`;
}

// ============================================================================
// DEPOSIT & HISTORY
// ============================================================================

function showDepositModal() {
    document.getElementById('depositModal').classList.add('show');
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
        addNotification('Deposit Request', 'Admin notified.', 'info');
        showToast('Admin notified! AXC will be added within 15 minutes.', 'success');
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
    const tx = JSON.parse(localStorage.getItem(`axion_transactions_${userId}`) || '[]');
    if (tx.length === 0) {
        container.innerHTML = '<div class="empty-state">No transactions yet</div>';
        return;
    }
    container.innerHTML = tx.slice(0, 50).map(t => `
        <div class="history-item">
            <div class="history-type ${t.type}">${t.type.toUpperCase()}</div>
            <div class="history-amount">${t.amount} ${t.currency}</div>
            <div class="history-date">${new Date(t.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('show');
}

// ============================================================================
// WITHDRAW BOTTOM SHEET
// ============================================================================

function updateWithdrawSheet() {
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    document.getElementById('sheetBalanceValue').textContent = withdrawCurrency === 'AXC' ? `${balance.toLocaleString()} AXC` : `$${balance.toFixed(2)}`;
    document.getElementById('sheetMinAmount').textContent = withdrawCurrency === 'AXC' ? '1,000 AXC' : '10 USDT';
    document.getElementById('sheetMaxAmount').textContent = withdrawCurrency === 'AXC' ? '50,000 AXC' : '1,000 USDT';
    document.querySelector('#withdrawBottomSheet .amount-currency').textContent = withdrawCurrency;
}

function showWithdrawModal() {
    withdrawCurrency = 'AXC';
    updateWithdrawSheet();
    document.getElementById('withdrawBottomSheet').classList.add('show');
}

function closeWithdrawSheet() {
    document.getElementById('withdrawBottomSheet').classList.remove('show');
}

function setWithdrawCurrency(currency) {
    withdrawCurrency = currency;
    updateWithdrawSheet();
    document.querySelectorAll('#withdrawBottomSheet .currency-option').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.currency === currency) btn.classList.add('active');
    });
}

function setWithdrawAmount(percent) {
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    document.getElementById('sheetAmountInput').value = Math.floor(balance * percent / 100);
}

async function submitWithdraw() {
    const amount = parseFloat(document.getElementById('sheetAmountInput')?.value || '0');
    const address = document.getElementById('sheetAddressInput')?.value || '';
    
    if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
        showToast('Invalid BEP20 address', 'error');
        return;
    }
    
    const min = withdrawCurrency === 'AXC' ? 1000 : 10;
    const max = withdrawCurrency === 'AXC' ? 50000 : 1000;
    if (amount < min) { showToast(`Minimum ${min} ${withdrawCurrency}`, 'error'); return; }
    if (amount > max) { showToast(`Maximum ${max} ${withdrawCurrency}`, 'error'); return; }
    
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    if (amount > balance) { showToast(`Insufficient ${withdrawCurrency} balance`, 'error'); return; }
    
    const endpoint = withdrawCurrency === 'AXC' ? '/api/withdraw-axc' : '/api/withdraw-usdt';
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, address, currency: withdrawCurrency })
        });
        const data = await res.json();
        if (data.success) {
            addNotification('Withdrawal', `${amount} ${withdrawCurrency} withdrawal submitted!`, 'success');
            showToast(`✅ ${amount} ${withdrawCurrency} withdrawal submitted!`, 'success');
            closeWithdrawSheet();
            await loadUserData();
        } else {
            showToast(data.error || 'Withdrawal failed', 'error');
        }
    } catch(e) {
        showToast('Network error', 'error');
    }
}

// ============================================================================
// SWAP
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
            if (wallet) {
                tonConnected = true;
                tonWalletAddress = wallet.account.address;
                document.getElementById('walletStatus').innerHTML = `${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                document.getElementById('walletStatus').innerHTML = 'Not connected';
            }
        });
    } catch(e) { console.error('TON error:', e); }
}

function updateSwapUI() {
    if (!currentUser) return;
    document.getElementById('fromBalance').textContent = (currentUser.balance || 0).toLocaleString();
    document.getElementById('toBalance').textContent = `$${(currentUser.usdtBalance || 0).toFixed(2)}`;
    const btn = document.getElementById('swapBtn');
    if (btn) {
        if (currentUser.tonPaid) {
            btn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
            btn.classList.add('active');
        } else {
            btn.innerHTML = '<i class="fas fa-lock"></i> Unlock Neural Swap (5 TON)';
            btn.classList.remove('active');
        }
    }
}

function showSwapStatus(msg, isErr) {
    const el = document.getElementById('swapStatus');
    if (el) {
        el.textContent = msg;
        el.className = `swap-status ${isErr ? 'error' : 'success'}`;
        el.style.display = 'block';
        if (!isErr) setTimeout(() => el.style.display = 'none', 5000);
    }
}

function showActivationModal() {
    const modal = document.getElementById('verificationModal');
    if (modal && !currentUser?.tonPaid) modal.classList.add('active');
}

function hideActivationModal() {
    document.getElementById('verificationModal')?.classList.remove('active');
}

async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) {
        showSwapStatus('Connect TON wallet first', true);
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, walletAddress: tonWalletAddress })
        });
        const data = await res.json();
        if (data.success) {
            await loadUserData();
            updateSwapUI();
            addNotification('Swap Activated!', 'You can now swap!', 'success');
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
    if (isNaN(amount) || amount <= 0) to ? to.value = '' : null;
    else to.value = (amount * CONFIG.axcPrice).toFixed(2);
}

async function executeSwap() {
    if (!currentUser?.tonPaid) {
        showActivationModal();
        return;
    }
    const amount = parseFloat(document.getElementById('swapFrom')?.value || '0');
    if (isSwapping) return;
    if (amount < CONFIG.minSwap) { showSwapStatus(`Min ${CONFIG.minSwap} AXC`, true); return; }
    if (amount > CONFIG.maxSwap) { showSwapStatus(`Max ${CONFIG.maxSwap} AXC`, true); return; }
    if (amount > (currentUser?.balance || 0)) { showSwapStatus('Insufficient balance', true); return; }
    
    isSwapping = true;
    const btn = document.getElementById('swapBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> PROCESSING...';
    }
    
    try {
        const res = await fetch('/api/swap', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount })
        });
        const data = await res.json();
        if (data.success) {
            await loadUserData();
            document.getElementById('swapFrom').value = '';
            document.getElementById('swapTo').value = '';
            addNotification('Swap Completed!', `Swapped ${amount} AXC to ${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
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
        <div class="axion-card"><div class="axion-card-title">⚡ THE FUTURE OF DEFI & AI</div><p class="axion-card-text">Axion Coin (AXC) is a next-generation decentralized trading and liquidity token...</p></div>
        <div class="axion-card"><div class="axion-card-title">🎯 KEY FEATURES</div><div class="axion-features"><div class="axion-feature">🤖 AI TRADING INTELLIGENCE</div><div class="axion-feature">💧 DECENTRALIZED LIQUIDITY</div><div class="axion-feature">🗳️ COMMUNITY GOVERNANCE</div><div class="axion-feature">💰 STAKING REWARDS</div></div></div>
        <div class="axion-card"><div class="axion-card-title">📊 TOKENOMICS</div><div class="axion-stat"><span>NETWORK:</span><span>BNB SMART CHAIN (BEP-20)</span></div><div class="axion-stat"><span>TOTAL SUPPLY:</span><span>500,000,000 AXC</span></div><div class="axion-stat"><span>LAUNCH PRICE:</span><span>$0.003</span></div></div>
        <div class="axion-card"><div class="axion-card-title">🔮 OPEN-SOURCE AI MODEL</div><p class="axion-card-text">NO BOUNDARIES. NO RED LINES.</p><div class="axion-badge">COMING SOON</div></div>
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
    console.log('🚀 AXION AI v23.0 INITIALIZING...');
    
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    if (!userId && tg?.initDataUnsafe?.user) userId = tg.initDataUnsafe.user.id.toString();
    if (!userId) {
        showToast('Please open from Telegram bot', 'error');
        return;
    }
    
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
    await fetchLivePrices();
    
    loadMiningState();
    loadNotifications();
    updateMiningUI();
    startMiningTimer();
    checkAutoFill();
    
    renderTasks();
    renderAxionPage();
    updateReferralUI();
    updateSwapUI();
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => switchTab(item.dataset.page);
    });
    
    document.getElementById('notificationBtn').onclick = showNotificationsModal;
    document.getElementById('historyBtn').onclick = showHistoryModal;
    document.getElementById('depositBtn').onclick = showDepositModal;
    document.getElementById('withdrawBtnWallet').onclick = showWithdrawModal;
    document.getElementById('watchAdBtn').onclick = watchAd;
    document.getElementById('claimMiningBtn').onclick = claimMiningReward;
    document.getElementById('confirmDepositBtn').onclick = confirmDeposit;
    document.getElementById('copyReferralLink').onclick = () => {
        const link = document.getElementById('referralLink');
        if (link?.value) { navigator.clipboard.writeText(link.value); showToast('Link copied!', 'success'); }
    };
    document.getElementById('markAllReadBtn').onclick = markAllRead;
    document.getElementById('clearNotificationsBtn').onclick = clearAllNotifications;
    
    const boostBtn = document.getElementById('boostTriggerBtn');
    const boostOpts = document.getElementById('boostOptions');
    if (boostBtn) {
        boostBtn.onclick = () => {
            boostOpts.style.display = boostOpts.style.display === 'flex' ? 'none' : 'flex';
        };
    }
    document.addEventListener('click', (e) => {
        if (boostOpts && boostBtn && !boostBtn.contains(e.target) && !boostOpts.contains(e.target)) {
            boostOpts.style.display = 'none';
        }
    });
    
    document.getElementById('modalProceedBtn').onclick = async () => { hideActivationModal(); await handleActivation(); };
    document.getElementById('modalCancelBtn').onclick = () => hideActivationModal();
    
    switchTab('wallet');
    console.log('✅ READY!');
}

// EXPORTS
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

init();
