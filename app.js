// ============================================================================
// AXION AI - LEGENDARY EDITION v20.0 (COMPLETE REWRITE)
// ============================================================================
// نظام التعدين الجديد:
// ✅ كل إعلان = +10 AXC إلى شريط التقدم
// ✅ كل 2.5 ساعة = اكتمال الشريط بالكامل
// ✅ المطالبة = +400 AXC (أو ضعفها مع Boost)
// ✅ حفظ محلي + مزامنة مع Firebase عند المطالبة فقط
// ✅ إصلاح نافذة السحب بالكامل
// ✅ إصلاح نافذة TON Activation
// ✅ إضافة جرس الإشعارات
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
    console.log('✅ AXION AI - Legendary Edition v20.0 Ready');
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
    
    // Mining System - NEW VALUES
    ADS_PER_CLAIM: 40,           // 40 إعلان للمطالبة
    REWARD_PER_CLAIM: 400,       // 40 × 10 = 400 AXC
    REWARD_PER_AD: 10,           // 10 AXC لكل إعلان
    COOLDOWN_HOURS: 2.5,         // 2.5 ساعة بين المطالبات
    COOLDOWN_MS: 2.5 * 60 * 60 * 1000, // 9,000,000 ms
    
    // Boost Values - UPDATED
    BOOST_MULTIPLIERS: {
        bronze: 2,      // 400 × 2 = 800 AXC
        silver: 3.125,  // 400 × 3.125 = 1250 AXC
        gold: 6.25      // 400 × 6.25 = 2500 AXC
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
let notifications = [];     // إشعارات المستخدم
let unreadCount = 0;        // عدد الإشعارات غير المقروءة

// Mining State (Local Storage) - ENHANCED
let miningState = {
    adsWatched: 0,           // عدد الإعلانات المشاهدة (0-40)
    lastClaimTime: null,     // آخر وقت تمت فيه المطالبة (timestamp)
    boostType: null,         // 'bronze', 'silver', 'gold'
    boostExpiry: null,       // تاريخ انتهاء البوست
    totalMined: 0,           // إجمالي ما تم تعدينه
    pendingReward: 0         // المكافأة المعلقة (تُمنح عند المطالبة)
};

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
    assetsList: document.getElementById('assetsList'),
    topCryptoList: document.getElementById('topCryptoList'),
    notificationBell: null,      // سيتم إنشاؤه ديناميكياً
    notificationModal: null       // سيتم إنشاؤه ديناميكياً
};

const earnEls = {
    miningRate: document.getElementById('miningRate'),
    miningPower: document.getElementById('miningPower'),
    miningProgress: document.getElementById('miningProgress'),
    miningTimer: document.getElementById('miningTimer'),
    nextReward: document.getElementById('nextReward'),
    miningAxcBalance: document.getElementById('miningAxcBalance'),
    claimBtn: document.getElementById('claimMiningBtn'),
    boostBtn: document.getElementById('boostTriggerBtn'),
    boostOptions: document.getElementById('boostOptions'),
    watchAdBtn: document.getElementById('watchAdBtn'),
    tasksContainer: document.getElementById('tasksContainer'),
    referralCount: document.getElementById('referralCount'),
    referralEarned: document.getElementById('referralEarned'),
    referralLink: document.getElementById('referralLink'),
    copyReferralBtn: document.getElementById('copyReferralLink')
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
    axcPrice: document.getElementById('axcPrice'),
    swapStatus: document.getElementById('swapStatus')
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
    
    // التحقق من انتهاء البوست
    if (miningState.boostExpiry && Date.now() > miningState.boostExpiry) {
        miningState.boostType = null;
        miningState.boostExpiry = null;
        saveMiningState();
    }
    
    // إذا لم يكن lastClaimTime موجود، نضعه الآن
    if (!miningState.lastClaimTime) {
        miningState.lastClaimTime = Date.now() - CONFIG.COOLDOWN_MS; // يسمح بالمطالبة فوراً
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
}

function addNotification(title, message, type = 'info') {
    const newNotification = {
        id: Date.now().toString(),
        title,
        message,
        type,
        read: false,
        timestamp: new Date().toISOString()
    };
    notifications.unshift(newNotification);
    if (notifications.length > 50) notifications.pop();
    saveNotifications();
    unreadCount++;
    updateNotificationBell();
    showToast(message, type);
}

function getCurrentMiningReward() {
    let reward = CONFIG.REWARD_PER_CLAIM; // 400 AXC
    if (miningState.boostType && CONFIG.BOOST_MULTIPLIERS[miningState.boostType]) {
        reward = Math.floor(CONFIG.REWARD_PER_CLAIM * CONFIG.BOOST_MULTIPLIERS[miningState.boostType]);
    }
    return reward;
}

// حساب تقدم الشريط بناءً على الوقت + الإعلانات
function calculateProgress() {
    if (!miningState.lastClaimTime) return 0;
    
    const now = Date.now();
    const timeSinceLastClaim = now - miningState.lastClaimTime;
    
    // إذا كان في فترة التبريد (أقل من 2.5 ساعة)
    if (timeSinceLastClaim < CONFIG.COOLDOWN_MS) {
        // التقدم من الوقت
        const timeProgress = (timeSinceLastClaim / CONFIG.COOLDOWN_MS) * CONFIG.ADS_PER_CLAIM;
        // التقدم من الإعلانات
        const adProgress = miningState.adsWatched;
        // المجموع بحد أقصى 40
        return Math.min(CONFIG.ADS_PER_CLAIM, timeProgress + adProgress);
    }
    
    // إذا مر أكثر من 2.5 ساعة، الشريط مكتمل تلقائياً
    return CONFIG.ADS_PER_CLAIM;
}

// هل يمكن المطالبة؟
function canClaim() {
    const progress = calculateProgress();
    return progress >= CONFIG.ADS_PER_CLAIM;
}

// الوقت المتبقي للتبريد (للعرض فقط)
function getRemainingCooldown() {
    if (!miningState.lastClaimTime) return 0;
    const now = Date.now();
    const elapsed = now - miningState.lastClaimTime;
    if (elapsed >= CONFIG.COOLDOWN_MS) return 0;
    return CONFIG.COOLDOWN_MS - elapsed;
}

// ============================================================================
// 6. NOTIFICATION BELL COMPONENT
// ============================================================================

function createNotificationBell() {
    // البحث عن زر التاريخ الموجود
    const headerHistoryBtn = document.getElementById('headerHistoryBtn');
    if (!headerHistoryBtn) return;
    
    // إنشاء حاوية للإشعارات بجانب زر التاريخ
    const bellContainer = document.createElement('div');
    bellContainer.className = 'header-notification-container';
    bellContainer.style.position = 'relative';
    bellContainer.style.display = 'inline-block';
    
    bellContainer.innerHTML = `
        <button class="header-notification-btn" id="notificationBellBtn" style="background: rgba(57,255,20,0.08); border: 1px solid rgba(57,255,20,0.2); border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease; color: white; font-size: 18px; backdrop-filter: blur(10px);">
            <i class="fas fa-bell"></i>
            <span id="notificationBadge" style="position: absolute; top: -5px; right: -5px; background: #ff5555; color: white; font-size: 10px; font-weight: bold; border-radius: 50%; min-width: 18px; height: 18px; display: ${unreadCount > 0 ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 4px; border: 1px solid #050805;">${unreadCount > 9 ? '9+' : unreadCount}</span>
        </button>
    `;
    
    // إضافة الحاوية بعد زر التاريخ
    headerHistoryBtn.parentNode.insertBefore(bellContainer, headerHistoryBtn.nextSibling);
    
    // إضافة حدث النقر
    const bellBtn = document.getElementById('notificationBellBtn');
    if (bellBtn) {
        bellBtn.addEventListener('click', showNotificationModal);
    }
    
    walletEls.notificationBell = bellBtn;
}

function updateNotificationBell() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

function showNotificationModal() {
    // إنشاء نافذة الإشعارات إذا لم تكن موجودة
    let modal = document.getElementById('notificationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'notificationModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 380px;">
                <div class="modal-header">
                    <h3><i class="fas fa-bell"></i> NOTIFICATIONS</h3>
                    <button class="close-btn" onclick="window.closeNotificationModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="max-height: 500px; overflow-y: auto;">
                    <div id="notificationsList" class="notifications-list"></div>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button class="confirm-btn" id="markAllReadBtn" style="background: var(--ai-green-soft); color: var(--ai-green);">Mark all as read</button>
                    <button class="confirm-btn" id="clearNotificationsBtn" style="background: var(--ai-danger-dim); color: var(--ai-danger);">Clear all</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('markAllReadBtn')?.addEventListener('click', () => {
            notifications.forEach(n => n.read = true);
            unreadCount = 0;
            saveNotifications();
            renderNotificationsList();
            updateNotificationBell();
        });
        
        document.getElementById('clearNotificationsBtn')?.addEventListener('click', () => {
            notifications = [];
            unreadCount = 0;
            saveNotifications();
            renderNotificationsList();
            updateNotificationBell();
        });
    }
    
    renderNotificationsList();
    modal.classList.add('show');
    walletEls.notificationModal = modal;
}

function renderNotificationsList() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">No notifications yet</div>';
        return;
    }
    
    container.innerHTML = notifications.map(notif => `
        <div class="notification-item" style="background: ${!notif.read ? 'rgba(57,255,20,0.05)' : 'transparent'}; border-bottom: 1px solid rgba(57,255,20,0.1); padding: 14px; cursor: pointer; transition: all 0.2s;" onclick="window.markNotificationRead('${notif.id}')">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; background: ${notif.type === 'success' ? 'rgba(57,255,20,0.2)' : 'rgba(0,212,255,0.2)'}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <i class="fas ${notif.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}" style="color: ${notif.type === 'success' ? '#39ff14' : '#00d4ff'}; font-size: 14px;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 13px;">${notif.title}</div>
                    <div style="font-size: 11px; color: #7a9e7a; margin-top: 4px;">${notif.message}</div>
                    <div style="font-size: 9px; color: #4a6e4a; margin-top: 6px;">${new Date(notif.timestamp).toLocaleString()}</div>
                </div>
                ${!notif.read ? '<div style="width: 8px; height: 8px; background: #39ff14; border-radius: 50%;"></div>' : ''}
            </div>
        </div>
    `).join('');
}

function markNotificationRead(id) {
    const notif = notifications.find(n => n.id === id);
    if (notif && !notif.read) {
        notif.read = true;
        unreadCount--;
        saveNotifications();
        renderNotificationsList();
        updateNotificationBell();
    }
}

// ============================================================================
// 7. MINING UI UPDATE (CORE - TIME BASED)
// ============================================================================

let lastUpdateTime = 0;

function updateMiningUI() {
    const progress = calculateProgress();
    const progressPercent = (progress / CONFIG.ADS_PER_CLAIM) * 100;
    const ready = canClaim();
    const remainingCooldown = getRemainingCooldown();
    const rewardAmount = getCurrentMiningReward();
    const currentUserBalance = currentUser?.balance || 0;
    
    // تحديث شريط التقدم
    if (earnEls.miningProgress) {
        earnEls.miningProgress.style.width = `${Math.min(100, progressPercent)}%`;
    }
    
    // تحديث النصوص
    if (earnEls.miningTimer) {
        if (ready) {
            earnEls.miningTimer.textContent = 'READY!';
        } else if (remainingCooldown > 0) {
            // عرض الوقت المتبقي
            earnEls.miningTimer.textContent = formatTimeLeft(remainingCooldown);
        } else {
            earnEls.miningTimer.textContent = `${Math.floor(progress)} / ${CONFIG.ADS_PER_CLAIM}`;
        }
    }
    
    if (earnEls.nextReward) {
        if (ready) {
            earnEls.nextReward.textContent = `🎉 CLAIM ${rewardAmount} AXC READY!`;
        } else if (remainingCooldown > 0) {
            earnEls.nextReward.textContent = `⏳ Next claim in ${formatTimeLeft(remainingCooldown)}`;
        } else {
            const adsNeeded = Math.max(0, CONFIG.ADS_PER_CLAIM - miningState.adsWatched);
            earnEls.nextReward.textContent = `📺 ${adsNeeded} ads or ${formatTimeLeft(CONFIG.COOLDOWN_MS - (Date.now() - miningState.lastClaimTime))} remaining`;
        }
    }
    
    // عرض رصيد AXC الحالي في صفحة Earn
    if (earnEls.miningAxcBalance) {
        earnEls.miningAxcBalance.textContent = currentUserBalance.toLocaleString();
    }
    
    // تحديث معدل التعدين المعروض
    if (earnEls.miningRate) {
        const displayRate = ready ? `${rewardAmount} AXC` : `${CONFIG.REWARD_PER_AD} AXC / ad`;
        earnEls.miningRate.textContent = displayRate;
    }
    
    // تحديث قوة التعدين
    if (earnEls.miningPower) {
        if (miningState.boostType) {
            const multiplier = CONFIG.BOOST_MULTIPLIERS[miningState.boostType];
            earnEls.miningPower.textContent = `${miningState.boostType.toUpperCase()} (×${multiplier})`;
        } else {
            earnEls.miningPower.textContent = 'STANDARD';
        }
    }
    
    // إظهار/إخفاء زر CLAIM
    if (earnEls.claimBtn) {
        if (ready && !isClaiming) {
            earnEls.claimBtn.style.display = 'flex';
            earnEls.claimBtn.disabled = false;
            earnEls.claimBtn.innerHTML = `<i class="fas fa-gem"></i> CLAIM ${rewardAmount} AXC`;
        } else if (isClaiming) {
            earnEls.claimBtn.disabled = true;
            earnEls.claimBtn.innerHTML = '<span class="spinner"></span> CLAIMING...';
        } else {
            earnEls.claimBtn.style.display = 'none';
        }
    }
}

// المؤقت الذي يحدث الواجهة كل ثانية
function startMiningTimer() {
    if (miningInterval) clearInterval(miningInterval);
    miningInterval = setInterval(() => {
        updateMiningUI();
    }, 1000);
}

// ============================================================================
// 8. CLAIM REWARD (API CALL ONLY)
// ============================================================================

async function claimMiningReward() {
    if (!canClaim()) {
        showToast('Mining in progress! Keep watching ads or wait.', 'warning');
        return;
    }
    
    if (isClaiming) return;
    isClaiming = true;
    updateMiningUI();
    
    const reward = getCurrentMiningReward();
    
    try {
        const res = await fetch('/api/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: reward, currency: 'AXC' })
        });
        const data = await res.json();
        
        if (data.success) {
            // إعادة تعيين حالة التعدين
            miningState.adsWatched = 0;
            miningState.lastClaimTime = Date.now();
            miningState.totalMined += reward;
            saveMiningState();
            
            // إضافة إشعار محلي
            addNotification('Mining Reward!', `You claimed ${reward} AXC successfully!`, 'success');
            
            await loadUserData();
            updateMiningUI();
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
// 9. WATCH AD (10 AXC PER AD - ADDS TO PROGRESS BAR)
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
    const progress = calculateProgress();
    if (progress >= CONFIG.ADS_PER_CLAIM) {
        showToast('Mining complete! Click CLAIM first.', 'warning');
        return;
    }
    
    if (adSequenceActive) {
        showToast('Ad in progress...', 'warning');
        return;
    }
    
    adSequenceActive = true;
    const btn = earnEls.watchAdBtn;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> LOADING AD...';
    }
    
    // تجربة منصات الإعلانات
    let adSuccess = false;
    for (const platform of AD_PLATFORMS) {
        adSuccess = await tryShowAd(platform);
        if (adSuccess) break;
    }
    
    if (adSuccess) {
        // إضافة +1 إلى الإعلانات المشاهدة
        const newAdsWatched = Math.min(miningState.adsWatched + 1, CONFIG.ADS_PER_CLAIM);
        miningState.adsWatched = newAdsWatched;
        saveMiningState();
        updateMiningUI();
        
        const newProgress = calculateProgress();
        const remaining = Math.max(0, CONFIG.ADS_PER_CLAIM - newProgress);
        
        if (newProgress >= CONFIG.ADS_PER_CLAIM) {
            showToast(`🎉 Mining complete! Click CLAIM for ${getCurrentMiningReward()} AXC!`, 'success');
        } else {
            showToast(`✅ +${CONFIG.REWARD_PER_AD} AXC added to progress! ${Math.ceil(remaining)} steps to claim.`, 'success');
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
// 10. BOOST SYSTEM (UPDATED PRICES)
// ============================================================================

async function activateBoost(boostKey) {
    const boostConfig = {
        bronze: { price: 2.5, multiplier: 2, duration: 3, name: 'BRONZE', reward: 800 },
        silver: { price: 5, multiplier: 3.125, duration: 7, name: 'SILVER', reward: 1250 },
        gold: { price: 10, multiplier: 6.25, duration: 30, name: 'GOLD', reward: 2500 }
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
        showToast(`✅ ${boost.name} BOOST ACTIVATED! ${boost.reward} AXC per claim!`, 'success');
        
        if (earnEls.boostOptions) earnEls.boostOptions.style.display = 'none';
    } catch(error) {
        showToast('PAYMENT CANCELLED', 'error');
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
    
    if (task.url && task.url.trim() !== '') {
        window.open(task.url, '_blank');
    }
    
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
            showToast(`✅ +${task.reward} AXC ADDED!`, 'success');
            addNotification('Task Completed!', `You earned ${task.reward} AXC from ${task.name}`, 'success');
        } else {
            showToast(`⚠️ +${task.reward} AXC will be added later`, 'warning');
            renderTasks(tasksData);
        }
    }, 15000);
}

// ============================================================================
// 12. API CALLS & USER DATA
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
    if (!userId) return;
    try {
        const res = await fetch(`/api/user/${userId}`);
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            updateAllBalances();
            renderAssets();
            updateReferralUI();
            updateMiningUI(); // تحديث رصيد AXC المعروض
        }
    } catch(e) { console.error('[API] Load error:', e); }
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
// 13. ASSETS & CRYPTOCURRENCIES RENDERING
// ============================================================================

const ASSETS = [
    { symbol: 'AXC', name: 'Axion Coin', icon: CMC_ICONS.AXC },
    { symbol: 'USDT', name: 'Tether', icon: CMC_ICONS.USDT }
];

function renderAssets() {
    if (!walletEls.assetsList || !currentUser) return;
    
    walletEls.assetsList.innerHTML = ASSETS.map(asset => {
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
    if (!walletEls.topCryptoList) return;
    
    const cryptos = [
        { symbol: 'BTC', name: 'Bitcoin', icon: CMC_ICONS.BTC, price: livePrices.BTC?.price || 68500, change: livePrices.BTC?.change || 0 },
        { symbol: 'ETH', name: 'Ethereum', icon: CMC_ICONS.ETH, price: livePrices.ETH?.price || 3200, change: livePrices.ETH?.change || 0 },
        { symbol: 'BNB', name: 'BNB', icon: CMC_ICONS.BNB, price: livePrices.BNB?.price || 580, change: livePrices.BNB?.change || 0 },
        { symbol: 'TON', name: 'Toncoin', icon: CMC_ICONS.TON, price: livePrices.TON?.price || 5.5, change: livePrices.TON?.change || 0 }
    ];
    
    walletEls.topCryptoList.innerHTML = cryptos.map(crypto => {
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
    
    if (walletEls.totalBalance) walletEls.totalBalance.textContent = `$${totalValue.toFixed(2)}`;
    if (walletEls.axcBalance) walletEls.axcBalance.textContent = balance.toLocaleString();
    if (walletEls.usdtBalance) walletEls.usdtBalance.textContent = `$${usdtBalance.toFixed(2)}`;
    if (swapEls.axcBalance) swapEls.axcBalance.textContent = balance.toLocaleString();
    if (swapEls.usdtBalance) swapEls.usdtBalance.textContent = `$${usdtBalance.toFixed(2)}`;
    if (swapEls.fromBalance) swapEls.fromBalance.textContent = balance;
    if (swapEls.toBalance) swapEls.toBalance.textContent = `$${usdtBalance.toFixed(2)}`;
}

function updateReferralUI() {
    if (!currentUser) return;
    const inviteCount = currentUser.inviteCount || 0;
    const earned = inviteCount * 100;
    if (earnEls.referralCount) earnEls.referralCount.textContent = inviteCount;
    if (earnEls.referralEarned) earnEls.referralEarned.textContent = `${earned.toLocaleString()} AXC`;
    if (earnEls.referralLink) {
        earnEls.referralLink.value = `https://t.me/${CONFIG.botUsername}?start=${userId}`;
    }
}

// ============================================================================
// 14. WALLET MODALS
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
        addNotification('Deposit Request Sent', 'Admin has been notified. AXC will be added within 15 minutes.', 'info');
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

function closeNotificationModal() {
    if (walletEls.notificationModal) {
        walletEls.notificationModal.classList.remove('show');
    }
}

// ============================================================================
// 15. WITHDRAW BOTTOM SHEET (FIXED)
// ============================================================================

let withdrawModal = null;
let withdrawCurrency = 'AXC';

function createWithdrawModal() {
    const existing = document.getElementById('withdrawBottomSheet');
    if (existing) existing.remove();
    
    const modalHTML = `
        <div id="withdrawBottomSheet" class="bottom-sheet">
            <div class="bottom-sheet-overlay"></div>
            <div class="bottom-sheet-content">
                <div class="bottom-sheet-header">
                    <h3>💸 Withdraw Funds</h3>
                    <button class="close-sheet-btn" id="closeWithdrawSheet">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="sheet-currency-toggle">
                    <button class="currency-option ${withdrawCurrency === 'AXC' ? 'active' : ''}" data-currency="AXC">
                        <img src="${CMC_ICONS.AXC}" alt="AXC" width="24" height="24">
                        <span>AXC</span>
                    </button>
                    <button class="currency-option ${withdrawCurrency === 'USDT' ? 'active' : ''}" data-currency="USDT">
                        <img src="${CMC_ICONS.USDT}" alt="USDT" width="24" height="24">
                        <span>USDT</span>
                    </button>
                </div>
                <div class="sheet-balance-info">
                    <span class="balance-label">Available Balance</span>
                    <span class="balance-value" id="sheetBalanceValue">
                        ${withdrawCurrency === 'AXC' ? (currentUser?.balance || 0).toLocaleString() + ' AXC' : '$' + (currentUser?.usdtBalance || 0).toFixed(2)}
                    </span>
                </div>
                <div class="sheet-amount-input">
                    <label>Amount</label>
                    <div class="amount-input-wrapper">
                        <input type="number" id="sheetAmountInput" placeholder="0" value="" step="${withdrawCurrency === 'AXC' ? '100' : '1'}">
                        <span class="amount-currency">${withdrawCurrency}</span>
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
                    <input type="text" id="sheetAddressInput" placeholder="0x..." value="${currentUser?.walletAddress || ''}">
                </div>
                <div class="sheet-info-row">
                    <div class="info-item"><span>Minimum</span><strong id="sheetMinAmount">${withdrawCurrency === 'AXC' ? '1,000 AXC' : '10 USDT'}</strong></div>
                    <div class="info-item"><span>Maximum</span><strong id="sheetMaxAmount">${withdrawCurrency === 'AXC' ? '50,000 AXC' : '1,000 USDT'}</strong></div>
                    <div class="info-item"><span>Fee</span><strong>0</strong></div>
                </div>
                <button class="sheet-submit-btn" id="submitWithdrawSheetBtn"><i class="fas fa-paper-plane"></i> Confirm Withdrawal</button>
                <p class="sheet-note">⚠️ Withdrawals are auto-approved and processed within 1-12 hours.</p>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    withdrawModal = document.getElementById('withdrawBottomSheet');
    
    // إضافة المستمعين للأحداث
    document.getElementById('closeWithdrawSheet')?.addEventListener('click', () => {
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
    
    // زر التأكيد - استخدام onclick مباشرة لضمان العمل
    const submitBtn = document.getElementById('submitWithdrawSheetBtn');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            await submitWithdrawFromSheet();
        };
    }
}

function updateSheetForCurrency() {
    const balance = withdrawCurrency === 'AXC' ? (currentUser?.balance || 0) : (currentUser?.usdtBalance || 0);
    const balanceEl = document.getElementById('sheetBalanceValue');
    const minEl = document.getElementById('sheetMinAmount');
    const maxEl = document.getElementById('sheetMaxAmount');
    const inputEl = document.getElementById('sheetAmountInput');
    const currencySpan = document.querySelector('.amount-currency');
    
    if (balanceEl) balanceEl.textContent = withdrawCurrency === 'AXC' ? balance.toLocaleString() + ' AXC' : '$' + balance.toFixed(2);
    if (minEl) minEl.textContent = withdrawCurrency === 'AXC' ? '1,000 AXC' : '10 USDT';
    if (maxEl) maxEl.textContent = withdrawCurrency === 'AXC' ? '50,000 AXC' : '1,000 USDT';
    if (currencySpan) currencySpan.textContent = withdrawCurrency;
    if (inputEl) { inputEl.step = withdrawCurrency === 'AXC' ? '100' : '1'; inputEl.value = ''; }
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
    
    try {
        const res = await fetch('/api/withdraw-usdt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, address, currency: withdrawCurrency })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ ${amount} ${withdrawCurrency} withdrawal submitted!`, 'success');
            addNotification('Withdrawal Request', `${amount} ${withdrawCurrency} withdrawal has been submitted and auto-approved.`, 'success');
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
// 16. SWAP MODULE (FIXED TON ACTIVATION)
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
                if (swapEls.walletStatus) {
                    swapEls.walletStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
                }
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                if (swapEls.walletStatus) swapEls.walletStatus.innerHTML = 'Not connected';
            }
        });
    } catch(e) { console.error('[TON] ERROR:', e); }
}

function showSwapStatus(message, type) {
    if (!swapEls.swapStatus) return;
    swapEls.swapStatus.textContent = message;
    swapEls.swapStatus.className = `ai-status ${type}`;
    swapEls.swapStatus.style.display = 'block';
    if (type !== 'error') setTimeout(() => swapEls.swapStatus.style.display = 'none', 5000);
}

// TON Activation Modal - FIXED
let activeModal = null;

function createActivationModal() {
    if (activeModal) { 
        activeModal.remove(); 
        activeModal = null; 
    }
    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    overlay.id = 'verificationModal';
    overlay.innerHTML = `
        <div class="ai-modal">
            <div class="modal-ai-icon"><i class="fas fa-brain"></i></div>
            <h2>Neural Link</h2>
            <div class="fee-display">5 TON</div>
            <div class="fee-sub">One-time</div>
            <div class="ai-features">
                <p><i class="fas fa-shield-alt"></i> Anti-bot verification</p>
                <p><i class="fas fa-user-check"></i> Human-only access</p>
                <p><i class="fas fa-infinity"></i> Unlimited swaps forever</p>
            </div>
            <div class="ai-modal-buttons">
                <button class="ai-modal-btn secondary" id="modalCancelBtn">Cancel</button>
                <button class="ai-modal-btn primary" id="modalProceedBtn"><i class="fas fa-bolt"></i> Activate</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    activeModal = overlay;
    
    // استخدام onclick مباشرة لضمان العمل
    const cancelBtn = document.getElementById('modalCancelBtn');
    const proceedBtn = document.getElementById('modalProceedBtn');
    
    if (cancelBtn) {
        cancelBtn.onclick = () => hideActivationModal();
    }
    if (proceedBtn) {
        proceedBtn.onclick = async () => {
            hideActivationModal();
            await handleActivation();
        };
    }
}

function showActivationModal() {
    if (currentPage !== 'swap') return;
    if (currentUser?.tonPaid) return;
    if (!activeModal) createActivationModal();
    if (activeModal) activeModal.classList.add('active');
}

function hideActivationModal() {
    if (activeModal) activeModal.classList.remove('active');
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
            showSwapStatus('✅ SWAP UNLOCKED!', 'success');
            showConfetti();
            addNotification('Swap Activated!', 'You can now swap AXC to USDT instantly.', 'success');
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
        if (!currentUser?.tonPaid) { showActivationModal(); return; }
        const amount = parseFloat(swapEls.swapFrom?.value || '0');
        if (isSwapping) return;
        if (amount < CONFIG.minSwap) { showSwapStatus(`❌ MIN ${CONFIG.minSwap} AXC`, 'error'); return; }
        if (amount > CONFIG.maxSwap) { showSwapStatus(`❌ MAX ${CONFIG.maxSwap} AXC`, 'error'); return; }
        if (amount > (currentUser?.balance || 0)) { showSwapStatus('❌ INSUFFICIENT BALANCE', 'error'); return; }
        
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
                showSwapStatus(`✅ SWAPPED ${amount.toLocaleString()} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
                showConfetti();
                addNotification('Swap Completed', `Swapped ${amount} AXC to ${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
            } else showSwapStatus('❌ ' + (data.error || 'SWAP FAILED'), 'error');
        } catch(error) { showSwapStatus('❌ NETWORK ERROR', 'error'); }
        finally { isSwapping = false; swapEls.swapBtn.disabled = false; }
    });
}

// ============================================================================
// 17. AXION AI PAGE
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
// 18. PAGE NAVIGATION
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
// 19. INITIALIZATION
// ============================================================================

async function init() {
    console.log('🚀 AXION AI - LEGENDARY EDITION v20.0 INITIALIZING...');
    
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
    
    // Load mining state from localStorage
    loadMiningState();
    loadNotifications();
    updateMiningUI();
    startMiningTimer();
    
    initTasksSystem();
    renderAxionPage();
    renderAssets();
    renderTopCryptos();
    
    // Create notification bell
    createNotificationBell();
    
    // Event Listeners
    document.getElementById('depositBtn')?.addEventListener('click', showDepositModal);
    document.getElementById('withdrawBtnWallet')?.addEventListener('click', showWithdrawModal);
    document.getElementById('historyBtn')?.addEventListener('click', showHistoryModal);
    document.getElementById('watchAdBtn')?.addEventListener('click', watchAd);
    document.getElementById('confirmDepositBtn')?.addEventListener('click', confirmDeposit);
    document.getElementById('claimMiningBtn')?.addEventListener('click', claimMiningReward);
    
    if (earnEls.boostBtn) {
        earnEls.boostBtn.addEventListener('click', () => {
            const isVisible = earnEls.boostOptions?.style.display === 'flex';
            if (earnEls.boostOptions) earnEls.boostOptions.style.display = isVisible ? 'none' : 'flex';
        });
    }
    
    if (earnEls.copyReferralBtn) {
        earnEls.copyReferralBtn.addEventListener('click', () => {
            if (earnEls.referralLink?.value) {
                navigator.clipboard.writeText(earnEls.referralLink.value);
                showToast('REFERRAL LINK COPIED!', 'success');
            }
        });
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => showPage(item.dataset.page));
    });
    
    // Hide boost options on click outside
    document.addEventListener('click', (e) => {
        if (earnEls.boostOptions && earnEls.boostBtn) {
            if (!earnEls.boostBtn.contains(e.target) && !earnEls.boostOptions.contains(e.target)) {
                earnEls.boostOptions.style.display = 'none';
            }
        }
    });
    
    showPage('wallet');
    console.log('✅ AXION AI v20.0 READY! 🚀');
}

// EXPOSE GLOBALS
window.showPage = showPage;
window.copyDepositAddress = copyDepositAddress;
window.confirmDeposit = confirmDeposit;
window.showWithdrawModal = showWithdrawModal;
window.closeModal = closeModal;
window.closeNotificationModal = closeNotificationModal;
window.markNotificationRead = markNotificationRead;
window.startTask = startTask;
window.activateBoost = activateBoost;
window.refreshPrices = refreshPrices;
window.showAllAssets = showAllAssets;
window.showHistoryModal = showHistoryModal;

// LAUNCH
init();
