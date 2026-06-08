// ============================================================================
// AXION AI - COMPLETE FULL FEATURES EDITION v16.0
// ============================================================================
// جميع الميزات:
// ✅ 6 منصات إعلانية (AdsGram, Taddy, Monetag, RichAds, Adexium, GigaPub)
// ✅ إعلانين متتاليين بنقرة واحدة
// ✅ 40 إعلان = كول داون 6 ساعات
// ✅ تعدين كامل (مكافأة تلقائية كل 2.5 ساعة)
// ✅ Boost بـ TON (3 خطط: 2.5, 5, 10 TON)
// ✅ مهام مع عداد 15 ثانية
// ✅ محفظة متكاملة + إحالات
// ✅ Swap + TON Connect
// ✅ نافذة التفعيل تظهر فقط عند الحاجة
// ✅ أسعار حية من CoinGecko
// ✅ أيقونات CoinMarketCap
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
    console.log('✅ AXION AI v16.0 Ready');
}

// ============================================================================
// 2. GLOBAL CONFIGURATION
// ============================================================================
const CONFIG = {
    axcPrice: 0.01,
    swapFeeTON: 5,
    minSwap: 100,
    maxSwap: 100000,
    ownerWallet: null,
    botUsername: 'AxionBep20Airdropbot',
    miningInterval: 2.5 * 60 * 60 * 1000,
    baseMiningRate: 50,
    boosts: {
        bronze: { price: 2.5, rate: 120, duration: 3, name: 'BRONZE' },
        silver: { price: 5, rate: 250, duration: 7, name: 'SILVER' },
        gold: { price: 10, rate: 500, duration: 30, name: 'GOLD' }
    },
    ADS_PER_CYCLE: 40,
    RESET_HOURS: 6,
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
let miningData = null;
let earnData = null;
let tonConnected = false;
let tonWalletAddress = null;
let isActivating = false;
let isSwapping = false;
let adSequenceActive = false;
let miningTimer = null;

// ============================================================================
// 4. DOM ELEMENTS
// ============================================================================
function $(id) { return document.getElementById(id); }

// Pages
const walletPage = $('walletPage');
const earnPage = $('earnPage');
const swapPage = $('swapPage');
const axionPage = $('axionPage');

// Wallet Elements
const totalBalance = $('totalBalance');
const walletAxcBalance = $('walletAxcBalance');
const walletUsdtBalance = $('walletUsdtBalance');
const assetsList = $('assetsList');
const topCryptoList = $('topCryptoList');
const depositBtn = $('depositBtn');
const withdrawBtnWallet = $('withdrawBtnWallet');
const historyBtn = $('historyBtn');

// Earn Elements
const miningRate = $('miningRate');
const miningPower = $('miningPower');
const miningProgress = $('miningProgress');
const miningTimerEl = $('miningTimer');
const nextReward = $('nextReward');
const watchAdBtn = $('watchAdBtn');
const tasksContainer = $('tasksContainer');
const referralCount = $('referralCount');
const referralEarned = $('referralEarned');
const referralLink = $('referralLink');
const copyReferralLink = $('copyReferralLink');

// Swap Elements
const axcBalance = $('axcBalance');
const usdtBalance = $('usdtBalance');
const fromBalance = $('fromBalance');
const toBalance = $('toBalance');
const swapFrom = $('swapFrom');
const swapTo = $('swapTo');
const swapBtn = $('swapBtn');
const walletStatus = $('walletStatus');
const axcPriceEl = $('axcPrice');

// Modal Elements
const verificationModal = $('verificationModal');
const modalProceedBtn = $('modalProceedBtn');
const modalCancelBtn = $('modalCancelBtn');
const depositModal = $('depositModal');
const withdrawModal = $('withdrawModal');
const historyModal = $('historyModal');
const toast = $('toast');
const toastMessage = $('toastMessage');
const confirmDepositBtn = $('confirmDepositBtn');
const submitWithdrawBtn = $('submitWithdrawBtn');
const withdrawAddressInput = $('withdrawAddressInput');
const withdrawAmountInput = $('withdrawAmountInput');

// ============================================================================
// 5. UTILITIES
// ============================================================================
function showToast(message, type = 'info') {
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
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

function formatTime(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
}

function saveToLocalStorage(key, data) {
    if (!userId) return;
    localStorage.setItem(`axion_${key}_${userId}`, JSON.stringify(data));
}

function loadFromLocalStorage(key, defaultValue) {
    if (!userId) return defaultValue;
    const saved = localStorage.getItem(`axion_${key}_${userId}`);
    if (saved) {
        try { return JSON.parse(saved); }
        catch(e) { return defaultValue; }
    }
    return defaultValue;
}

function closeModal(modalId) {
    const modal = $(modalId);
    if (modal) modal.classList.remove('show');
}

// ============================================================================
// 6. API CALLS & LIVE PRICES
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
        if (axcPriceEl) axcPriceEl.textContent = CONFIG.axcPrice;
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
            updateAllBalances();
            renderAssets();
            updateReferralUI();
            if (currentUser?.tonPaid) updateSwapButtonState(true);
        }
    } catch(e) { console.error('Load user error:', e); }
}

async function addBalanceToUser(amount, currency = 'AXC') {
    try {
        const res = await fetch('/api/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, currency })
        });
        if (res.ok) {
            await loadUserData();
            return true;
        }
        return false;
    } catch(e) { console.error('Add balance error:', e); return false; }
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
        livePrices = { BTC: { price: 68500, change: 2.4 }, ETH: { price: 3200, change: 1.2 }, BNB: { price: 580, change: -0.8 }, TON: { price: 5.5, change: -0.5 } };
        renderTopCryptos();
    }
}

// ============================================================================
// 7. ASSETS & CRYPTOCURRENCIES RENDERING
// ============================================================================
function renderAssets() {
    if (!assetsList || !currentUser) return;
    const axcBalanceNum = currentUser.balance || 0;
    const usdtBalanceNum = currentUser.usdtBalance || 0;
    assetsList.innerHTML = `
        <div class="asset-item"><div class="asset-left"><img src="${CMC_ICONS.AXC}" class="asset-icon-img"><div class="asset-info"><h4>Axion Coin</h4><p>AXC</p></div></div><div class="asset-right"><div class="asset-balance">${axcBalanceNum.toLocaleString()} AXC</div><div class="asset-value">$${(axcBalanceNum * CONFIG.axcPrice).toFixed(2)}</div></div></div>
        <div class="asset-item"><div class="asset-left"><img src="${CMC_ICONS.USDT}" class="asset-icon-img"><div class="asset-info"><h4>Tether</h4><p>USDT</p></div></div><div class="asset-right"><div class="asset-balance">${usdtBalanceNum.toLocaleString()} USDT</div><div class="asset-value">$${usdtBalanceNum.toFixed(2)}</div></div></div>
    `;
}

function renderTopCryptos() {
    if (!topCryptoList) return;
    const cryptos = [
        { symbol: 'BTC', name: 'Bitcoin', icon: CMC_ICONS.BTC, price: livePrices.BTC?.price || 68500, change: livePrices.BTC?.change || 0 },
        { symbol: 'ETH', name: 'Ethereum', icon: CMC_ICONS.ETH, price: livePrices.ETH?.price || 3200, change: livePrices.ETH?.change || 0 },
        { symbol: 'BNB', name: 'BNB', icon: CMC_ICONS.BNB, price: livePrices.BNB?.price || 580, change: livePrices.BNB?.change || 0 },
        { symbol: 'TON', name: 'Toncoin', icon: CMC_ICONS.TON, price: livePrices.TON?.price || 5.5, change: livePrices.TON?.change || 0 }
    ];
    topCryptoList.innerHTML = cryptos.map(crypto => {
        const changeClass = crypto.change >= 0 ? 'positive' : 'negative';
        const changeSymbol = crypto.change >= 0 ? '+' : '';
        return `<div class="crypto-item"><div class="crypto-left"><img src="${crypto.icon}" class="crypto-icon-img"><div class="crypto-info"><h4>${crypto.name}</h4><p>${crypto.symbol}</p></div></div><div class="crypto-right"><div class="crypto-price">$${crypto.price.toLocaleString()}</div><div class="crypto-change ${changeClass}">${changeSymbol}${crypto.change.toFixed(2)}%</div></div></div>`;
    }).join('');
}

function refreshPrices() { fetchLivePrices(); showToast('Prices refreshed', 'success'); }
function showAllAssets() { showToast('All assets view coming soon', 'info'); }

function updateAllBalances() {
    if (!currentUser) return;
    const balance = currentUser.balance || 0;
    const usdtBalanceNum = currentUser.usdtBalance || 0;
    const totalValue = (balance * CONFIG.axcPrice) + usdtBalanceNum;
    if (totalBalance) totalBalance.textContent = `$${totalValue.toFixed(2)}`;
    if (walletAxcBalance) walletAxcBalance.textContent = balance.toLocaleString();
    if (walletUsdtBalance) walletUsdtBalance.textContent = `$${usdtBalanceNum.toFixed(2)}`;
    if (axcBalance) axcBalance.innerHTML = balance.toLocaleString();
    if (usdtBalance) usdtBalance.innerHTML = `$${usdtBalanceNum.toFixed(2)}`;
    if (fromBalance) fromBalance.innerHTML = balance;
    if (toBalance) toBalance.innerHTML = `$${usdtBalanceNum.toFixed(2)}`;
}

function updateReferralUI() {
    if (!currentUser) return;
    const inviteCount = currentUser.inviteCount || 0;
    const earned = inviteCount * 100;
    if (referralCount) referralCount.textContent = inviteCount;
    if (referralEarned) referralEarned.textContent = `${earned.toLocaleString()} AXC`;
    if (referralLink) referralLink.value = `https://t.me/${CONFIG.botUsername}?start=${userId}`;
}

// ============================================================================
// 8. MINING SYSTEM (FULL)
// ============================================================================
function initMiningSystem() {
    const defaultData = { miningRate: CONFIG.baseMiningRate, boostType: null, boostExpiry: null, lastClaimTime: Date.now(), totalMined: 0 };
    miningData = loadFromLocalStorage('mining', defaultData);
    if (miningData.boostExpiry && Date.now() > miningData.boostExpiry) {
        miningData.boostType = null;
        miningData.miningRate = CONFIG.baseMiningRate;
        miningData.boostExpiry = null;
        saveMiningData();
    }
    updateMiningUI();
    startMiningTimer();
}

function saveMiningData() { saveToLocalStorage('mining', miningData); }

function updateMiningUI() {
    if (!miningRate) return;
    miningRate.textContent = `${miningData.miningRate} AXC`;
    if (miningData.boostType && miningPower) miningPower.textContent = `${miningData.boostType} (×${miningData.miningRate / CONFIG.baseMiningRate})`;
    else if (miningPower) miningPower.textContent = 'STANDARD';
    const timeSinceLastClaim = Date.now() - miningData.lastClaimTime;
    const remaining = Math.max(0, CONFIG.miningInterval - timeSinceLastClaim);
    const progress = (timeSinceLastClaim / CONFIG.miningInterval) * 100;
    if (miningTimerEl) miningTimerEl.textContent = formatTime(remaining);
    if (miningProgress) miningProgress.style.width = `${Math.min(100, progress)}%`;
    if (nextReward) nextReward.textContent = formatTime(remaining);
}

function startMiningTimer() {
    if (miningTimer) clearInterval(miningTimer);
    miningTimer = setInterval(() => {
        updateMiningUI();
        const timeSinceLastClaim = Date.now() - miningData.lastClaimTime;
        if (timeSinceLastClaim >= CONFIG.miningInterval) autoClaimMiningReward();
    }, 60000);
}

async function autoClaimMiningReward() {
    if (Date.now() - miningData.lastClaimTime < CONFIG.miningInterval) return;
    const reward = miningData.miningRate;
    const success = await addBalanceToUser(reward, 'AXC');
    if (success) {
        miningData.lastClaimTime = Date.now();
        miningData.totalMined += reward;
        saveMiningData();
        updateMiningUI();
        showToast(`🎉 +${reward} AXC MINED!`, 'success');
    }
}

// ============================================================================
// 9. BOOST SYSTEM
// ============================================================================
async function activateBoost(boostKey) {
    const boost = CONFIG.boosts[boostKey];
    if (!boost) return;
    if (!tonConnected || !tonWalletAddress) { showToast('Connect TON wallet first', 'warning'); return; }
    if (!CONFIG.ownerWallet) { showToast('Owner wallet not configured', 'error'); return; }
    const amountNano = (boost.price * 1000000000).toString();
    const transaction = { validUntil: Math.floor(Date.now() / 1000) + 600, messages: [{ address: CONFIG.ownerWallet, amount: amountNano }] };
    try {
        showToast('⏳ Processing payment...', 'info');
        await window.tonConnectUI.sendTransaction(transaction);
        miningData.boostType = boost.name;
        miningData.miningRate = boost.rate;
        miningData.boostExpiry = Date.now() + (boost.duration * 24 * 60 * 60 * 1000);
        saveMiningData();
        updateMiningUI();
        showToast(`✅ ${boost.name} BOOST ACTIVATED!`, 'success');
    } catch(e) { showToast('Payment cancelled', 'error'); }
}

// ============================================================================
// 10. AD PLATFORMS (6 NETWORKS - FULL)
// ============================================================================
const AD_PLATFORMS = {
    adsgram: { name: 'AdsGram', init: () => window.Adsgram, show: (ctrl) => ctrl.init({ blockId: "int-33659" }).show() },
    taddy: { name: 'Taddy', init: () => window.Taddy, show: (ctrl) => new Promise((resolve) => { ctrl.showRewardedVideo({ onReward: () => resolve(true), onError: () => resolve(false), onClose: () => resolve(false) }); }) },
    monetag: { name: 'Monetag', init: () => typeof window.show_11082910 === 'function' ? window.show_11082910 : null, show: (ctrl) => ctrl().then(() => true).catch(() => false) },
    richads: { name: 'RichAds', init: () => window.TelegramAdsController, show: (ctrl) => new Promise((resolve) => { if (!ctrl.initialized) { ctrl.initialize({ pubId: "1009657", appId: "7614" }); ctrl.initialized = true; } ctrl.showRewardedVideo({ onReward: () => resolve(true), onError: () => resolve(false) }); }) },
    adexium: { name: 'Adexium', init: () => window.AdexiumWidget, show: (ctrl) => new Promise((resolve) => { const widget = new ctrl({ wid: '63f66ba6-7410-4f47-adc1-0da3259f4c40', adFormat: 'rewarded', debug: false }); let resolved = false; widget.on('adPlaybackCompleted', () => { if (!resolved) { resolved = true; resolve(true); } }); widget.on('noAdFound', () => { if (!resolved) { resolved = true; resolve(false); } }); widget.on('adReceived', (ad) => widget.displayAd(ad)); widget.requestAd('rewarded'); }) },
    gigapub: { name: 'GigaPub', init: () => typeof window.showGiga === 'function' ? window.showGiga : null, show: (ctrl) => ctrl('main').then(() => true).catch(() => false) }
};

async function tryShowAd(platformKey) {
    const platform = AD_PLATFORMS[platformKey];
    if (!platform) return false;
    try {
        const controller = platform.init();
        if (!controller) return false;
        return await platform.show(controller);
    } catch(e) { return false; }
}

function initEarnSystem() {
    const defaultData = { totalAdsWatched: 0, isOnCooldown: false, cooldownEndTime: null };
    earnData = loadFromLocalStorage('earn', defaultData);
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
    const btn = watchAdBtn;
    if (!btn) return;
    const counterEl = document.getElementById('adsCounter');
    if (counterEl) counterEl.innerHTML = `<i class="fas fa-chart-line"></i> ${earnData.totalAdsWatched} / ${CONFIG.ADS_PER_CYCLE}`;
    if (earnData.isOnCooldown && earnData.cooldownEndTime && Date.now() < earnData.cooldownEndTime) {
        const remainingMs = earnData.cooldownEndTime - Date.now();
        const hours = Math.floor(remainingMs / (60 * 60 * 1000));
        const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-hourglass-half"></i> COOLDOWN: ${hours}h ${minutes}m`;
        btn.style.opacity = '0.6';
    } else {
        if (earnData.isOnCooldown) { earnData.totalAdsWatched = 0; earnData.isOnCooldown = false; earnData.cooldownEndTime = null; saveEarnData(); }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play-circle"></i> WATCH AD';
        btn.style.opacity = '1';
    }
}

async function watchAd() {
    if (earnData.isOnCooldown && earnData.cooldownEndTime && Date.now() < earnData.cooldownEndTime) {
        const remainingMs = earnData.cooldownEndTime - Date.now();
        const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
        showToast(`⏳ COOLDOWN: ${hours} HOURS`, 'warning');
        return;
    }
    if (earnData.totalAdsWatched >= CONFIG.ADS_PER_CYCLE) {
        earnData.isOnCooldown = true;
        earnData.cooldownEndTime = Date.now() + (CONFIG.RESET_HOURS * 60 * 60 * 1000);
        saveEarnData();
        updateEarnUI();
        showToast(`🎯 LIMIT REACHED! COME BACK IN ${CONFIG.RESET_HOURS} HOURS`, 'info');
        return;
    }
    if (adSequenceActive) { showToast('Ad in progress...', 'warning'); return; }
    adSequenceActive = true;
    const btn = watchAdBtn;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> LOADING AD...'; }
    const firstPlatforms = ['adsgram', 'taddy', 'monetag'];
    let firstSuccess = false;
    for (const p of firstPlatforms) { if (await tryShowAd(p)) { firstSuccess = true; break; } }
    if (!firstSuccess) { resetAdSequence(); showToast('Failed to load ad', 'error'); return; }
    const secondPlatforms = ['richads', 'adexium', 'gigapub'];
    let secondSuccess = false;
    for (const p of secondPlatforms) { if (await tryShowAd(p)) { secondSuccess = true; break; } }
    if (secondSuccess) {
        const reward = miningData.miningRate * 2;
        const success = await addBalanceToUser(reward, 'AXC');
        if (success) {
            earnData.totalAdsWatched += 2;
            saveEarnData();
            updateEarnUI();
            showToast(`🎬 +${reward} AXC ADDED!`, 'success');
        } else { showToast('Failed to add reward', 'error'); }
    } else { showToast('Ad sequence incomplete', 'warning'); }
    resetAdSequence();
}

function resetAdSequence() {
    adSequenceActive = false;
    const btn = watchAdBtn;
    if (btn && !earnData.isOnCooldown) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play-circle"></i> WATCH AD'; }
    else if (btn && earnData.isOnCooldown) updateEarnUI();
}

// ============================================================================
// 11. TASKS SYSTEM (FULL)
// ============================================================================
function initTasksSystem() {
    const tasksData = loadFromLocalStorage('tasks', CONFIG.tasks);
    renderTasks(tasksData);
}

function renderTasks(tasksData) {
    if (!tasksContainer) return;
    tasksContainer.innerHTML = tasksData.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <div class="task-info"><div class="task-name">${task.name}</div><div class="task-reward">+${task.reward} AXC</div></div>
            ${!task.completed ? `<button class="task-btn" onclick="window.startTask(${task.id})">COMPLETE</button>` : '<span class="task-completed-badge">✓ COMPLETED</span>'}
        </div>
    `).join('');
}

async function startTask(taskId) {
    const tasksData = loadFromLocalStorage('tasks', CONFIG.tasks);
    const task = tasksData.find(t => t.id === taskId);
    if (!task || task.completed) return;
    if (task.url) window.open(task.url, '_blank');
    let countdown = 15;
    const modal = document.createElement('div');
    modal.className = 'task-countdown-modal';
    modal.innerHTML = `<div class="task-countdown-content"><div class="task-countdown-icon">⏳</div><h3>${task.name}</h3><div class="task-countdown-timer"><span id="taskCountdownSpan">${countdown}</span><span>seconds</span></div><p class="task-countdown-note">Please wait...</p></div>`;
    document.body.appendChild(modal);
    const interval = setInterval(() => {
        countdown--;
        const span = document.getElementById('taskCountdownSpan');
        if (span) span.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(interval);
            modal.remove();
            task.completed = true;
            saveToLocalStorage('tasks', tasksData);
            const success = await addBalanceToUser(task.reward, 'AXC');
            if (success) { renderTasks(tasksData); showToast(`✅ +${task.reward} AXC ADDED!`, 'success'); }
            else { showToast('Failed to add reward', 'error'); }
        }
    }, 1000);
}

// ============================================================================
// 12. WALLET MODALS
// ============================================================================
function showDepositModal() { if (depositModal) depositModal.classList.add('show'); }
function copyDepositAddress() { navigator.clipboard.writeText('0xd51d68d057805514823652dc090b9d455c79801a'); showToast('Address copied!', 'success'); }
async function confirmDeposit() {
    try { await fetch('/api/notify-deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, userName: currentUser?.userName || 'Axion User', currency: 'AXC' }) }); } catch(e) {}
    showToast('✅ Admin notified! AXC will be added within 15 minutes.', 'success');
    if (depositModal) depositModal.classList.remove('show');
}
function showWithdrawModal() { if (withdrawModal) withdrawModal.classList.add('show'); }
async function submitWithdraw() {
    const address = withdrawAddressInput?.value;
    const amount = parseFloat(withdrawAmountInput?.value || '0');
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) { showToast('Invalid BEP20 address', 'error'); return; }
    if (amount <= 0 || amount > (currentUser?.balance || 0)) { showToast('Invalid amount', 'error'); return; }
    try {
        const res = await fetch('/api/withdraw-usdt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, amount, address }) });
        const data = await res.json();
        if (data.success) { showToast('✅ Withdrawal submitted (Auto-approved)', 'success'); if (withdrawModal) withdrawModal.classList.remove('show'); await loadUserData(); }
        else { showToast(data.error || 'Withdrawal failed', 'error'); }
    } catch(e) { showToast('Network error', 'error'); }
}
function showHistoryModal() { if (historyModal) historyModal.classList.add('show'); renderHistory(); }
function renderHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    const transactions = JSON.parse(localStorage.getItem(`axion_transactions_${userId}`) || '[]');
    if (transactions.length === 0) { historyList.innerHTML = '<div class="empty-state">No transactions yet</div>'; return; }
    historyList.innerHTML = transactions.map(tx => `<div class="history-item"><div class="history-type ${tx.type}">${tx.type.toUpperCase()}</div><div class="history-amount">${tx.amount} ${tx.currency}</div><div class="history-date">${new Date(tx.timestamp).toLocaleString()}</div></div>`).join('');
}

// ============================================================================
// 13. SWAP MODULE WITH MODAL
// ============================================================================
function showActivationModal() {
    if (!verificationModal) return;
    if (currentPage !== 'swap') return;
    if (currentUser?.tonPaid) return;
    verificationModal.classList.add('active');
}
function hideActivationModal() { if (verificationModal) verificationModal.classList.remove('active'); }
function showConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    for (let i = 0; i < 150; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height, size: Math.random() * 8 + 4, speedY: Math.random() * 8 + 4, speedX: (Math.random() - 0.5) * 5, color: '#39ff14', rotation: Math.random() * 360, rotationSpeed: (Math.random() - 0.5) * 12 });
    let animationId;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let allFinished = true;
        for (let p of particles) {
            if (p.y < canvas.height + 100) {
                allFinished = false;
                p.y += p.speedY;
                p.x += p.speedX;
                p.rotation += p.rotationSpeed;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation * Math.PI / 180); ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size); ctx.restore();
            }
        }
        if (allFinished) { cancelAnimationFrame(animationId); ctx.clearRect(0, 0, canvas.width, canvas.height); }
        else { animationId = requestAnimationFrame(animate); }
    }
    animate();
    setTimeout(() => cancelAnimationFrame(animationId), 3000);
}
function updateSwapButtonState(isActive) {
    if (!swapBtn) return;
    if (isActive) { swapBtn.disabled = false; swapBtn.classList.remove('locked'); swapBtn.classList.add('active'); swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP'; }
    else { swapBtn.disabled = false; swapBtn.classList.remove('active'); swapBtn.classList.add('locked'); swapBtn.innerHTML = '<i class="fas fa-lock"></i> 🔒 SWAP LOCKED'; }
}
function initTonConnect() {
    const container = document.getElementById('ton-connect');
    if (!container) return;
    if (typeof TON_CONNECT_UI === 'undefined') { container.innerHTML = '<span style="color:#e74c3c">⚠️ TON Connect unavailable</span>'; return; }
    try {
        window.tonConnectUI = new TON_CONNECT_UI.TonConnectUI({ manifestUrl: window.location.origin + '/tonconnect-manifest.json', buttonRootId: 'ton-connect' });
        window.tonConnectUI.onStatusChange(async (wallet) => {
            if (wallet) { tonConnected = true; tonWalletAddress = wallet.account.address; if (walletStatus) walletStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`; if (currentUser?.tonPaid) updateSwapButtonState(true); }
            else { tonConnected = false; tonWalletAddress = null; if (walletStatus) walletStatus.innerHTML = 'Not connected'; updateSwapButtonState(false); }
        });
    } catch(e) { console.error('TON error:', e); }
}
async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) { showStatus('swapStatus', '❌ Connect TON wallet', 'error'); return false; }
    if (!CONFIG.ownerWallet) { showStatus('swapStatus', '❌ Owner wallet not configured', 'error'); return false; }
    if (isActivating) return false;
    isActivating = true;
    const amountNano = (CONFIG.swapFeeTON * 1000000000).toString();
    const transaction = { validUntil: Math.floor(Date.now() / 1000) + 600, messages: [{ address: CONFIG.ownerWallet, amount: amountNano }] };
    try {
        showStatus('swapStatus', '⏳ Processing...', 'info');
        const result = await window.tonConnectUI.sendTransaction(transaction);
        const verifyRes = await fetch('/api/ton-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, txHash: result.boc, walletAddress: tonWalletAddress }) });
        const verifyData = await verifyRes.json();
        if (verifyData.success) { await loadUserData(); showStatus('swapStatus', '✅ Swap unlocked!', 'success'); showConfetti(); updateSwapButtonState(true); return true; }
        else { showStatus('swapStatus', '❌ Verification failed', 'error'); updateSwapButtonState(false); return false; }
    } catch(error) { showStatus('swapStatus', '❌ Payment cancelled', 'error'); updateSwapButtonState(false); return false; }
    finally { isActivating = false; }
}
function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `ai-status ${type}`;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}
if (swapFrom) { swapFrom.addEventListener('input', function() { const amount = parseFloat(this.value); if (isNaN(amount) || amount <= 0) { if (swapTo) swapTo.value = ''; return; } if (swapTo) swapTo.value = (amount * CONFIG.axcPrice).toFixed(2); }); }
if (swapBtn) { swapBtn.addEventListener('click', async () => { if (!currentUser?.tonPaid) { showActivationModal(); return; } const amount = parseFloat(swapFrom?.value || '0'); if (isSwapping) return; if (amount < CONFIG.minSwap) { showStatus('swapStatus', `❌ Min ${CONFIG.minSwap} AXC`, 'error'); return; } if (amount > CONFIG.maxSwap) { showStatus('swapStatus', `❌ Max ${CONFIG.maxSwap} AXC`, 'error'); return; } if (amount > (currentUser?.balance || 0)) { showStatus('swapStatus', '❌ Insufficient balance', 'error'); return; } try { isSwapping = true; swapBtn.disabled = true; swapBtn.innerHTML = '<span class="spinner"></span> PROCESSING...'; const res = await fetch('/api/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, amount }) }); const data = await res.json(); if (data.success) { await loadUserData(); swapFrom.value = ''; swapTo.value = ''; showStatus('swapStatus', `✅ Swapped ${amount.toLocaleString()} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success'); showConfetti(); } else { showStatus('swapStatus', '❌ ' + (data.error || 'Swap failed'), 'error'); } } catch(error) { showStatus('swapStatus', '❌ Network error', 'error'); } finally { isSwapping = false; swapBtn.disabled = false; updateSwapButtonState(true); } }); }
if (modalProceedBtn) { modalProceedBtn.onclick = async () => { hideActivationModal(); await handleActivation(); }; }
if (modalCancelBtn) modalCancelBtn.onclick = hideActivationModal;

// ============================================================================
// 14. AXION AI PAGE
// ============================================================================
function renderAxionPage() {
    const container = document.getElementById('axionContent');
    if (!container) return;
    container.innerHTML = `<div class="axion-hero"><div class="axion-icon">🧠</div><h1 class="axion-title">AXION AI</h1><p class="axion-subtitle">NEURAL INTELLIGENCE PROTOCOL</p></div><div class="axion-card"><div class="axion-card-title">⚡ THE FUTURE OF DEFI & AI</div><p class="axion-card-text">Axion Coin (AXC) is a next-generation decentralized trading and liquidity token designed to solve challenges through a unified ecosystem integrating DeFi liquidity, decentralized governance, and AI-driven trading intelligence.</p></div><div class="axion-card"><div class="axion-card-title">🎯 KEY FEATURES</div><div class="axion-features"><div class="axion-feature">🤖 AI TRADING INTELLIGENCE</div><div class="axion-feature">💧 DECENTRALIZED LIQUIDITY</div><div class="axion-feature">🗳️ COMMUNITY GOVERNANCE</div><div class="axion-feature">💰 STAKING REWARDS</div></div></div><div class="axion-card"><div class="axion-card-title">📊 TOKENOMICS</div><div class="axion-stat"><span class="axion-stat-label">NETWORK:</span><span class="axion-stat-value">BNB SMART CHAIN (BEP-20)</span></div><div class="axion-stat"><span class="axion-stat-label">TOTAL SUPPLY:</span><span class="axion-stat-value">500,000,000 AXC</span></div><div class="axion-stat"><span class="axion-stat-label">LAUNCH PRICE:</span><span class="axion-stat-value">$0.003</span></div></div><div class="axion-card axion-future"><div class="axion-card-title">🔮 OPEN-SOURCE AI MODEL</div><p class="axion-card-text">NO BOUNDARIES. NO RED LINES. FULLY TRANSPARENT AND COMMUNITY-DRIVEN.</p><div class="axion-badge">COMING SOON</div></div>`;
}

// ============================================================================
// 15. PAGE NAVIGATION
// ============================================================================
function showPage(pageName) {
    currentPage = pageName;
    if (walletPage) walletPage.classList.add('hidden');
    if (earnPage) earnPage.classList.add('hidden');
    if (swapPage) swapPage.classList.add('hidden');
    if (axionPage) axionPage.classList.add('hidden');
    if (pageName === 'wallet' && walletPage) walletPage.classList.remove('hidden');
    if (pageName === 'earn' && earnPage) earnPage.classList.remove('hidden');
    if (pageName === 'swap' && swapPage) swapPage.classList.remove('hidden');
    if (pageName === 'axion' && axionPage) axionPage.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(item => { item.classList.remove('active'); if (item.getAttribute('data-page') === pageName) item.classList.add('active'); });
}

// ============================================================================
// 16. INITIALIZATION
// ============================================================================
async function init() {
    console.log('🚀 AXION AI v16.0 Initializing...');
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    if (!userId && tg?.initDataUnsafe?.user) userId = tg.initDataUnsafe.user.id.toString();
    if (!userId) { showToast('❌ Open from Telegram Bot', 'error'); return; }
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
    await fetchLivePrices();
    initMiningSystem();
    initEarnSystem();
    initTasksSystem();
    renderAxionPage();
    renderAssets();
    renderTopCryptos();
    depositBtn?.addEventListener('click', showDepositModal);
    withdrawBtnWallet?.addEventListener('click', showWithdrawModal);
    historyBtn?.addEventListener('click', showHistoryModal);
    watchAdBtn?.addEventListener('click', watchAd);
    confirmDepositBtn?.addEventListener('click', confirmDeposit);
    submitWithdrawBtn?.addEventListener('click', submitWithdraw);
    copyReferralLink?.addEventListener('click', () => { if (referralLink?.value) { navigator.clipboard.writeText(referralLink.value); showToast('Referral link copied!', 'success'); } });
    document.querySelectorAll('.boost-option').forEach(el => { el.addEventListener('click', () => activateBoost(el.dataset.boost)); });
    document.querySelectorAll('.nav-item').forEach(item => { item.addEventListener('click', () => showPage(item.getAttribute('data-page'))); });
    showPage('wallet');
    console.log('✅ AXION AI v16.0 Ready!');
}

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

init();
