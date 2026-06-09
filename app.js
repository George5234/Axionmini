// ============================================================================
// AXION AI - COMPLETE EDITION v20.0
// ============================================================================

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0c0f');
    tg.setBackgroundColor('#0a0c0f');
    console.log('✅ AXION AI v20.0 Ready');
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
    
    ADS_PER_CLAIM: 40,
    REWARD_PER_CLAIM: 2000,
    BOOST_MULTIPLIERS: {
        bronze: 2.4,
        silver: 5,
        gold: 10
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
// GLOBAL STATE
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
let isWithdrawing = false;
let withdrawCurrency = 'AXC';
let withdrawModal = null;
let notifications = [];
let unreadCount = 0;

let miningState = {
    adsWatched: 0,
    boostType: null,
    boostExpiry: null,
    totalMined: 0
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const pages = {
    wallet: document.getElementById('walletPage'),
    earn: document.getElementById('earnPage'),
    swap: document.getElementById('swapPage'),
    axion: document.getElementById('axionPage')
};

// ============================================================================
// UTILITIES
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

function getCurrentMiningRate() {
    let baseRate = 50;
    if (miningState.boostType && CONFIG.BOOST_MULTIPLIERS[miningState.boostType]) {
        baseRate = 50 * CONFIG.BOOST_MULTIPLIERS[miningState.boostType];
    }
    return baseRate;
}

function getClaimReward() {
    let reward = CONFIG.REWARD_PER_CLAIM;
    if (miningState.boostType && CONFIG.BOOST_MULTIPLIERS[miningState.boostType]) {
        reward = Math.floor(CONFIG.REWARD_PER_CLAIM * CONFIG.BOOST_MULTIPLIERS[miningState.boostType] / 2.4);
    }
    return reward;
}

// ============================================================================
// NOTIFICATION SYSTEM
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
// MINING UI
// ============================================================================

function updateMiningUI() {
    const progressPercent = (miningState.adsWatched / CONFIG.ADS_PER_CLAIM) * 100;
    const isReady = miningState.adsWatched >= CONFIG.ADS_PER_CLAIM;
    const currentRate = getCurrentMiningRate();
    const claimReward = getClaimReward();
    
    const miningProgress = document.getElementById('miningProgress');
    const miningTimer = document.getElementById('miningTimer');
    const nextReward = document.getElementById('nextReward');
    const miningRate = document.getElementById('miningRate');
    const miningPower = document.getElementById('miningPower');
    const adsCount = document.getElementById('adsCounter');
    const claimBtn = document.getElementById('claimMiningBtn');
    const miningBalance = document.getElementById('miningAxcBalance');
    
    if (miningProgress) miningProgress.style.width = `${Math.min(100, progressPercent)}%`;
    if (miningTimer) miningTimer.textContent = isReady ? 'READY!' : `${miningState.adsWatched} / ${CONFIG.ADS_PER_CLAIM}`;
    if (nextReward) nextReward.textContent = isReady ? 'Click CLAIM!' : `${CONFIG.ADS_PER_CLAIM - miningState.adsWatched} ads remaining`;
    if (miningRate) miningRate.textContent = `${currentRate} AXC`;
    if (miningPower) {
        if (miningState.boostType) miningPower.textContent = `${miningState.boostType.toUpperCase()} (×${CONFIG.BOOST_MULTIPLIERS[miningState.boostType]})`;
        else miningPower.textContent = 'STANDARD';
    }
    if (adsCount) adsCount.textContent = `📊 Progress: ${miningState.adsWatched} / ${CONFIG.ADS_PER_CLAIM}`;
    
    if (claimBtn) {
        if (isReady && !isClaiming) {
            claimBtn.style.display = 'flex';
            claimBtn.disabled = false;
            claimBtn.innerHTML = `<i class="fas fa-gem"></i> CLAIM ${claimReward} AXC`;
        } else if (isClaiming) {
            claimBtn.disabled = true;
            claimBtn.innerHTML = '<span class="spinner"></span> CLAIMING...';
        } else {
            claimBtn.style.display = 'none';
        }
    }
    
    if (miningBalance && currentUser) miningBalance.textContent = (currentUser.balance || 0).toLocaleString();
}

// ============================================================================
// CLAIM REWARD
// ============================================================================

async function claimMiningReward() {
    if (miningState.adsWatched < CONFIG.ADS_PER_CLAIM) {
        showToast(`Watch ${CONFIG.ADS_PER_CLAIM - miningState.adsWatched} more ads!`, 'warning');
        return;
    }
    if (isClaiming) return;
    isClaiming = true;
    updateMiningUI();
    
    const reward = getClaimReward();
    
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
            await loadUserData();
            updateMiningUI();
            addNotification('Mining Reward!', `You claimed ${reward} AXC!`, 'success');
            showToast(`🎉 +${reward} AXC CLAIMED!`, 'success');
            showConfetti();
        } else {
            showToast('⚠️ Claim failed, try again', 'error');
        }
    } catch(e) {
        showToast('Network error, try again', 'error');
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
        const result = await platform.show(controller);
        return result === true;
    } catch(e) {
        return false;
    }
}

async function watchAd() {
    if (miningState.adsWatched >= CONFIG.ADS_PER_CLAIM) {
        showToast('Mining complete! Click CLAIM first.', 'warning');
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
        const remaining = CONFIG.ADS_PER_CLAIM - miningState.adsWatched;
        if (remaining === 0) {
            showToast(`🎉 Mining complete! Click CLAIM for ${getClaimReward()} AXC!`, 'success');
        } else {
            showToast(`✅ +1 ad! ${remaining} ads to claim`, 'success');
        }
    } else {
        showToast('❌ Failed to load ad, try again', 'error');
    }
    
    adSequenceActive = false;
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play-circle"></i> WATCH AD';
    }
}

// ============================================================================
// BOOST SYSTEM
// ============================================================================

async function activateBoost(boostKey) {
    const boostConfig = {
        bronze: { price: 2.5, multiplier: 2.4, duration: 3, name: 'BRONZE' },
        silver: { price: 5, multiplier: 5, duration: 7, name: 'SILVER' },
        gold: { price: 10, multiplier: 10, duration: 30, name: 'GOLD' }
    };
    
    const boost = boostConfig[boostKey];
    if (!boost) return;
    if (!tonConnected || !tonWalletAddress) {
        showToast('CONNECT TON WALLET FIRST', 'warning');
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
        miningState.boostType = boostKey;
        miningState.boostExpiry = Date.now() + (boost.duration * 24 * 60 * 60 * 1000);
        saveMiningState();
        updateMiningUI();
        addNotification('Boost Activated!', `${boost.name} boost activated for ${boost.duration} days!`, 'success');
        showToast(`✅ ${boost.name} BOOST ACTIVATED!`, 'success');
        const boostOptions = document.getElementById('boostOptions');
        if (boostOptions) boostOptions.style.display = 'none';
    } catch(error) {
        showToast('PAYMENT CANCELLED', 'error');
    }
}

// ============================================================================
// TASKS SYSTEM
// ============================================================================

function initTasksSystem() {
    const tasksData = loadFromLocalStorage('tasks', CONFIG.tasks);
    renderTasks(tasksData);
}

function renderTasks(tasksData) {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    container.innerHTML = tasksData.map(task => `
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
    showToast(`📋 TASK: ${task.name}. +${task.reward} AXC will be added in 15 seconds...`, 'info');
    setTimeout(async () => {
        task.completed = true;
        saveToLocalStorage('tasks', tasksData);
        const res = await fetch('/api/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: task.reward, currency: 'AXC' })
        });
        const data = await res.json();
        if (data.success) {
            await loadUserData();
            renderTasks(tasksData);
            addNotification('Task Completed!', `You earned ${task.reward} AXC from ${task.name}`, 'success');
            showToast(`✅ +${task.reward} AXC ADDED!`, 'success');
        } else {
            showToast(`⚠️ +${task.reward} AXC will be added later`, 'warning');
            renderTasks(tasksData);
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
        CONFIG.botUsername = data.botUsername || CONFIG.botUsername;
        if (data.config) {
            CONFIG.axcPrice = data.config.axcPrice || CONFIG.axcPrice;
            CONFIG.minSwap = data.config.minSwap || CONFIG.minSwap;
            CONFIG.maxSwap = data.config.maxSwap || CONFIG.maxSwap;
        }
        const axcPriceEl = document.getElementById('axcPrice');
        if (axcPriceEl) axcPriceEl.textContent = CONFIG.axcPrice;
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
    if (!userId) return;
    try {
        const res = await fetch(`/api/user/${userId}`);
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            updateAllBalances();
            renderAssets();
            updateReferralUI();
        }
    } catch(e) { console.error('[API] Load error:', e); }
}

async function fetchLivePrices() {
    try {
        const ids = ['bitcoin', 'ethereum', 'binancecoin', 'the-open-network'];
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`);
        const data = await response.json();
        livePrices = {
            BTC: { price: data.bitcoin?.usd || 68500, change: data.bitcoin?.usd_24h_change || 0 },
            ETH: { price: data.ethereum?.usd || 3200, change: data.ethereum?.usd_24h_change || 0 },
            BNB: { price: data.binancecoin?.usd || 580, change: data.binancecoin?.usd_24h_change || 0 },
            TON: { price: data['the-open-network']?.usd || 5.5, change: data['the-open-network']?.usd_24h_change || 0 }
        };
        renderTopCryptos();
    } catch(e) {
        console.error('Price fetch error:', e);
        livePrices = {
            BTC: { price: 68500, change: 2.4 },
            ETH: { price: 3200, change: 1.2 },
            BNB: { price: 580, change: -0.8 },
            TON: { price: 5.5, change: -0.5 }
        };
        renderTopCryptos();
    }
}

// ============================================================================
// ASSETS & CRYPTOCURRENCIES
// ============================================================================

const ASSETS = [
    { symbol: 'AXC', name: 'Axion Coin', icon: CMC_ICONS.AXC },
    { symbol: 'USDT', name: 'Tether', icon: CMC_ICONS.USDT }
];

function renderAssets() {
    const container = document.getElementById('assetsList');
    if (!container || !currentUser) return;
    container.innerHTML = ASSETS.map(asset => {
        const balance = asset.symbol === 'AXC' ? (currentUser.balance || 0) : (currentUser.usdtBalance || 0);
        const value = asset.symbol === 'AXC' ? balance * CONFIG.axcPrice : balance;
        return `
            <div class="asset-item">
                <div class="asset-left">
                    <img src="${asset.icon}" class="asset-icon-img" alt="${asset.symbol}">
                    <div class="asset-info">
                        <h4>${asset.name}</h4>
                        <p>${asset.symbol}</p>
                    </div>
                </div>
                <div class="asset-right">
                    <div class="asset-balance">${balance.toLocaleString()} ${asset.symbol === 'AXC' ? 'AXC' : 'USDT'}</div>
                    <div class="asset-value">$${formatNumber(value)}</div>
                </div>
            </div>
        `;
    }).join('');
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
                    <img src="${crypto.icon}" class="crypto-icon-img" alt="${crypto.symbol}">
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

function refreshPrices() {
    fetchLivePrices();
    showToast('Prices refreshed', 'success');
}

function showAllAssets() {
    showToast('All assets view coming soon', 'info');
}

function updateAllBalances() {
    if (!currentUser) return;
    const balance = currentUser.balance || 0;
    const usdtBalance = currentUser.usdtBalance || 0;
    const totalValue = (balance * CONFIG.axcPrice) + usdtBalance;
    
    const totalBalanceEl = document.getElementById('totalBalance');
    const walletAxcEl = document.getElementById('walletAxcBalance');
    const walletUsdtEl = document.getElementById('walletUsdtBalance');
    const fromBalanceEl = document.getElementById('fromBalance');
    const toBalanceEl = document.getElementById('toBalance');
    
    if (totalBalanceEl) totalBalanceEl.textContent = `$${totalValue.toFixed(2)}`;
    if (walletAxcEl) walletAxcEl.textContent = balance.toLocaleString();
    if (walletUsdtEl) walletUsdtEl.textContent = `$${usdtBalance.toFixed(2)}`;
    if (fromBalanceEl) fromBalanceEl.textContent = balance;
    if (toBalanceEl) toBalanceEl.textContent = `$${usdtBalance.toFixed(2)}`;
}

function updateReferralUI() {
    if (!currentUser) return;
    const inviteCount = currentUser.inviteCount || 0;
    const earned = inviteCount * 100;
    const referralCountEl = document.getElementById('referralCount');
    const referralEarnedEl = document.getElementById('referralEarned');
    const referralLinkEl = document.getElementById('referralLink');
    if (referralCountEl) referralCountEl.textContent = inviteCount;
    if (referralEarnedEl) referralEarnedEl.textContent = `${earned.toLocaleString()} AXC`;
    if (referralLinkEl) referralLinkEl.value = `https://t.me/${CONFIG.botUsername}?start=${userId}`;
}

// ============================================================================
// WALLET MODALS
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
        addNotification('Deposit Request', 'Admin notified. AXC will be added within 15 minutes.', 'info');
    } catch(e) {}
    showToast('✅ ADMIN NOTIFIED! AXC WILL BE ADDED WITHIN 15 MINUTES.', 'success');
    closeModal('depositModal');
}

function showHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('show');
    renderHistory();
}

function renderHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    const transactions = JSON.parse(localStorage.getItem(`axion_transactions_${userId}`) || '[]');
    if (transactions.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No transactions yet</div>';
        return;
    }
    historyList.innerHTML = transactions.map(tx => `
        <div class="history-item">
            <div class="history-type ${tx.type}">${tx.type.toUpperCase()}</div>
            <div class="history-amount">${tx.amount} ${tx.currency}</div>
            <div class="history-date">${new Date(tx.timestamp).toLocaleString()}</div>
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

function createWithdrawModal() {
    const existing = document.getElementById('withdrawBottomSheet');
    if (existing) {
        withdrawModal = existing;
        return;
    }
    
    const modalHTML = `
        <div id="withdrawBottomSheet" class="bottom-sheet">
            <div class="bottom-sheet-overlay"></div>
            <div class="bottom-sheet-content">
                <div class="bottom-sheet-header">
                    <h3>💸 Withdraw Funds</h3>
                    <button class="close-sheet-btn" id="closeWithdrawSheetBtn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="sheet-currency-toggle">
                    <button class="currency-option active" data-currency="AXC">
                        <img src="${CMC_ICONS.AXC}" alt="AXC" width="24" height="24">
                        <span>AXC</span>
                    </button>
                    <button class="currency-option" data-currency="USDT">
                        <img src="${CMC_ICONS.USDT}" alt="USDT" width="24" height="24">
                        <span>USDT</span>
                    </button>
                </div>
                <div class="sheet-balance-info">
                    <span class="balance-label">Available Balance</span>
                    <span class="balance-value" id="sheetBalanceValue">0 AXC</span>
                </div>
                <div class="sheet-amount-input">
                    <label>Amount</label>
                    <div class="amount-input-wrapper">
                        <input type="number" id="sheetAmountInput" placeholder="0">
                        <span class="amount-currency">AXC</span>
                    </div>
                    <div class="quick-amounts">
                        <button class="quick-amount" data-percent="25">25%</button>
                        <button class="quick-amount" data-percent="50">50%</button>
                        <button class="quick-amount" data-percent="75">75%</button>
                        <button class="quick-amount" data-percent="100">100%</button>
                    </div>
                </div>
                <div class="sheet-address-input">
                    <label>BEP20 Wallet Address</label>
                    <input type="text" id="sheetAddressInput" placeholder="0x...">
                </div>
                <div class="sheet-info-row">
                    <div class="info-item"><span>Minimum</span><strong id="sheetMinAmount">1,000 AXC</strong></div>
                    <div class="info-item"><span>Maximum</span><strong id="sheetMaxAmount">50,000 AXC</strong></div>
                    <div class="info-item"><span>Fee</span><strong>0</strong></div>
                </div>
                <button class="sheet-submit-btn" id="submitWithdrawSheetBtn"><i class="fas fa-paper-plane"></i> Confirm Withdrawal</button>
                <p class="sheet-note">⚠️ Withdrawals are auto-approved and processed within 1-12 hours.</p>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    withdrawModal = document.getElementById('withdrawBottomSheet');
    
    document.getElementById('closeWithdrawSheetBtn')?.addEventListener('click', () => {
        if (withdrawModal) withdrawModal.classList.remove('show');
    });
    
    document.querySelectorAll('.currency-option').forEach(btn => {
        btn.addEventListener('click', () => {
            withdrawCurrency = btn.dataset.currency;
            updateSheetForCurrency();
            document.querySelectorAll('.currency-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    document.querySelectorAll('.quick-amount').forEach(btn => {
        btn.addEventListener('click', () => {
            const percent = parseInt(btn.dataset.percent) / 100;
            const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
            const amount = Math.floor(balance * percent);
            const input = document.getElementById('sheetAmountInput');
            if (input) input.value = amount;
        });
    });
    
    const submitBtn = document.getElementById('submitWithdrawSheetBtn');
    if (submitBtn) submitBtn.onclick = () => submitWithdrawFromSheet();
}

function updateSheetForCurrency() {
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    const minAmount = withdrawCurrency === 'AXC' ? 1000 : 10;
    const maxAmount = withdrawCurrency === 'AXC' ? 50000 : 1000;
    
    const balanceEl = document.getElementById('sheetBalanceValue');
    const minEl = document.getElementById('sheetMinAmount');
    const maxEl = document.getElementById('sheetMaxAmount');
    const currencySpan = document.querySelector('.amount-currency');
    const inputEl = document.getElementById('sheetAmountInput');
    
    if (balanceEl) balanceEl.textContent = withdrawCurrency === 'AXC' ? `${balance.toLocaleString()} AXC` : `$${balance.toFixed(2)}`;
    if (minEl) minEl.textContent = withdrawCurrency === 'AXC' ? `1,000 AXC` : `10 USDT`;
    if (maxEl) maxEl.textContent = withdrawCurrency === 'AXC' ? `50,000 AXC` : `1,000 USDT`;
    if (currencySpan) currencySpan.textContent = withdrawCurrency;
    if (inputEl) {
        inputEl.step = withdrawCurrency === 'AXC' ? '100' : '1';
        inputEl.value = '';
    }
}

function showWithdrawModal() {
    if (!withdrawModal) createWithdrawModal();
    withdrawCurrency = 'AXC';
    updateSheetForCurrency();
    document.querySelectorAll('.currency-option').forEach(b => b.classList.remove('active'));
    const axcOption = document.querySelector('.currency-option[data-currency="AXC"]');
    if (axcOption) axcOption.classList.add('active');
    if (withdrawModal) withdrawModal.classList.add('show');
}

async function submitWithdrawFromSheet() {
    const amount = parseFloat(document.getElementById('sheetAmountInput')?.value || '0');
    const address = document.getElementById('sheetAddressInput')?.value || '';
    
    const isValidBEP20 = /^0x[a-fA-F0-9]{40}$/i.test(address);
    if (!address || !isValidBEP20) {
        showToast('Invalid BEP20 address', 'error');
        return;
    }
    
    const minAmount = withdrawCurrency === 'AXC' ? 1000 : 10;
    const maxAmount = withdrawCurrency === 'AXC' ? 50000 : 1000;
    
    if (isNaN(amount) || amount < minAmount) {
        showToast(`Minimum withdrawal is ${minAmount} ${withdrawCurrency}`, 'error');
        return;
    }
    if (amount > maxAmount) {
        showToast(`Maximum withdrawal is ${maxAmount} ${withdrawCurrency}`, 'error');
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
            addNotification('Withdrawal', `${amount} ${withdrawCurrency} withdrawal submitted!`, 'success');
            showToast(`✅ ${amount} ${withdrawCurrency} withdrawal submitted!`, 'success');
            if (withdrawModal) withdrawModal.classList.remove('show');
            await loadUserData();
        } else {
            showToast(data.error || 'Withdrawal failed', 'error');
        }
    } catch(e) {
        showToast('Network error', 'error');
    }
}

// ============================================================================
// SWAP MODULE
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
                const walletStatus = document.getElementById('walletStatus');
                if (walletStatus) {
                    walletStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
                }
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                const walletStatus = document.getElementById('walletStatus');
                if (walletStatus) walletStatus.innerHTML = 'Not connected';
            }
        });
    } catch(e) { console.error('[TON] ERROR:', e); }
}

function showSwapStatus(message, type) {
    const swapStatus = document.getElementById('swapStatus');
    if (!swapStatus) return;
    swapStatus.textContent = message;
    swapStatus.className = `ai-status ${type}`;
    swapStatus.style.display = 'block';
    if (type !== 'error') setTimeout(() => swapStatus.style.display = 'none', 5000);
}

// TON Activation Modal Functions
function showActivationModal() {
    const modal = document.getElementById('verificationModal');
    if (modal) {
        if (currentUser?.tonPaid) return;
        modal.classList.add('active');
    }
}

function hideActivationModal() {
    const modal = document.getElementById('verificationModal');
    if (modal) modal.classList.remove('active');
}

async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) {
        showSwapStatus('❌ CONNECT TON WALLET FIRST', 'error');
        return false;
    }
    if (!CONFIG.ownerWallet) {
        showSwapStatus('❌ OWNER WALLET NOT CONFIGURED', 'error');
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
        showSwapStatus('⏳ WAITING FOR PAYMENT...', 'info');
        await window.tonConnectUI.sendTransaction(transaction);
        const verifyRes = await fetch('/api/ton-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, walletAddress: tonWalletAddress })
        });
        const verifyData = await verifyRes.json();
        if (verifyData.success) {
            await loadUserData();
            addNotification('Swap Activated!', 'You can now swap AXC to USDT instantly!', 'success');
            showSwapStatus('✅ SWAP UNLOCKED!', 'success');
            showConfetti();
            return true;
        } else {
            showSwapStatus('❌ VERIFICATION FAILED', 'error');
            return false;
        }
    } catch(error) {
        showSwapStatus('❌ PAYMENT CANCELLED', 'error');
        return false;
    } finally {
        isActivating = false;
    }
}

// Swap Event Listeners
const swapFrom = document.getElementById('swapFrom');
const swapTo = document.getElementById('swapTo');
const swapBtn = document.getElementById('swapBtn');

if (swapFrom) {
    swapFrom.addEventListener('input', function() {
        const amount = parseFloat(this.value);
        if (isNaN(amount) || amount <= 0) {
            if (swapTo) swapTo.value = '';
            return;
        }
        const usdtAmount = amount * CONFIG.axcPrice;
        if (swapTo) swapTo.value = usdtAmount.toFixed(2);
    });
}

if (swapBtn) {
    swapBtn.addEventListener('click', async () => {
        if (!currentUser?.tonPaid) {
            showActivationModal();
            return;
        }
        const amount = parseFloat(swapFrom?.value || '0');
        if (isSwapping) return;
        if (amount < CONFIG.minSwap) {
            showSwapStatus(`❌ MIN ${CONFIG.minSwap} AXC`, 'error');
            return;
        }
        if (amount > CONFIG.maxSwap) {
            showSwapStatus(`❌ MAX ${CONFIG.maxSwap} AXC`, 'error');
            return;
        }
        if (amount > (currentUser?.balance || 0)) {
            showSwapStatus('❌ INSUFFICIENT BALANCE', 'error');
            return;
        }
        
        try {
            isSwapping = true;
            if (swapBtn) {
                swapBtn.disabled = true;
                swapBtn.innerHTML = '<span class="spinner"></span> PROCESSING...';
            }
            const res = await fetch('/api/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount })
            });
            const data = await res.json();
            if (data.success) {
                await loadUserData();
                if (swapFrom) swapFrom.value = '';
                if (swapTo) swapTo.value = '';
                addNotification('Swap Completed', `Swapped ${amount} AXC to ${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
                showSwapStatus(`✅ SWAPPED ${amount.toLocaleString()} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
                showConfetti();
            } else {
                showSwapStatus('❌ ' + (data.error || 'SWAP FAILED'), 'error');
            }
        } catch(error) {
            showSwapStatus('❌ NETWORK ERROR', 'error');
        } finally {
            isSwapping = false;
            if (swapBtn) {
                swapBtn.disabled = false;
                if (currentUser?.tonPaid) {
                    swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
                    swapBtn.classList.add('active');
                } else {
                    swapBtn.innerHTML = '<i class="fas fa-lock"></i> Unlock Neural Swap';
                    swapBtn.classList.remove('active');
                }
            }
        }
    });
}

// ============================================================================
// AXION AI PAGE
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
// PAGE NAVIGATION
// ============================================================================

function showPage(pageName) {
    currentPage = pageName;
    
    // Hide all pages
    Object.keys(pages).forEach(page => {
        if (pages[page]) pages[page].classList.remove('active');
    });
    
    // Show selected page
    if (pages[pageName]) pages[pageName].classList.add('active');
    
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageName) item.classList.add('active');
    });
    
    // Show/hide notification bell (only on wallet page)
    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        if (pageName === 'wallet') {
            notificationBtn.style.display = 'flex';
        } else {
            notificationBtn.style.display = 'none';
        }
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    console.log('🚀 AXION AI v20.0 INITIALIZING...');
    
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
    await fetchLivePrices();
    
    loadMiningState();
    loadNotifications();
    updateMiningUI();
    
    initTasksSystem();
    renderAxionPage();
    renderAssets();
    renderTopCryptos();
    createWithdrawModal();
    
    // Setup TON Activation Modal buttons
    const modalProceedBtn = document.getElementById('modalProceedBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    
    if (modalProceedBtn) {
        modalProceedBtn.onclick = async () => {
            hideActivationModal();
            await handleActivation();
        };
    }
    if (modalCancelBtn) {
        modalCancelBtn.onclick = () => hideActivationModal();
    }
    
    // Event Listeners
    document.getElementById('depositBtn')?.addEventListener('click', showDepositModal);
    document.getElementById('withdrawBtnWallet')?.addEventListener('click', showWithdrawModal);
    document.getElementById('headerHistoryBtn')?.addEventListener('click', showHistoryModal);
    document.getElementById('watchAdBtn')?.addEventListener('click', watchAd);
    document.getElementById('confirmDepositBtn')?.addEventListener('click', confirmDeposit);
    document.getElementById('claimMiningBtn')?.addEventListener('click', claimMiningReward);
    document.getElementById('notificationBtn')?.addEventListener('click', showNotificationsModal);
    
    const boostBtn = document.getElementById('boostTriggerBtn');
    const boostOptions = document.getElementById('boostOptions');
    if (boostBtn) {
        boostBtn.addEventListener('click', () => {
            if (boostOptions) {
                boostOptions.style.display = boostOptions.style.display === 'flex' ? 'none' : 'flex';
            }
        });
    }
    
    const copyReferralBtn = document.getElementById('copyReferralLink');
    if (copyReferralBtn) {
        copyReferralBtn.addEventListener('click', () => {
            const referralLink = document.getElementById('referralLink');
            if (referralLink?.value) {
                navigator.clipboard.writeText(referralLink.value);
                showToast('REFERRAL LINK COPIED!', 'success');
            }
        });
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => showPage(item.getAttribute('data-page')));
    });
    
    document.addEventListener('click', (e) => {
        if (boostOptions && boostBtn && !boostBtn.contains(e.target) && !boostOptions.contains(e.target)) {
            boostOptions.style.display = 'none';
        }
    });
    
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    const clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
    if (markAllReadBtn) markAllReadBtn.addEventListener('click', markAllRead);
    if (clearNotificationsBtn) clearNotificationsBtn.addEventListener('click', clearAllNotifications);
    
    showPage('wallet');
    console.log('✅ AXION AI v20.0 READY! 🚀');
}

// EXPOSE GLOBALS
window.showPage = showPage;
window.copyDepositAddress = copyDepositAddress;
window.confirmDeposit = confirmDeposit;
window.showWithdrawModal = showWithdrawModal;
window.closeModal = closeModal;
window.closeNotificationsModal = closeNotificationsModal;
window.markNotificationRead = markNotificationRead;
window.startTask = startTask;
window.activateBoost = activateBoost;
window.refreshPrices = refreshPrices;
window.showAllAssets = showAllAssets;
window.showHistoryModal = showHistoryModal;

// LAUNCH
init();
