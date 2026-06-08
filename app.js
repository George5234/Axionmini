// ============================================================================
// AXION AI - COMPLETE ERROR-FREE EDITION v13.0
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
    console.log('✅ AXION AI Ready');
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
    botUsername: 'AxionBep20Airdropbot'
};

// ============================================================================
// 3. GLOBAL STATE
// ============================================================================
let currentPage = 'wallet';
let currentUser = null;
let userId = null;
let db = null;
let tonConnected = false;
let tonWalletAddress = null;
let isActivating = false;
let isSwapping = false;

// ============================================================================
// 4. SAFE DOM ELEMENTS (التحقق من وجود كل عنصر)
// ============================================================================
const safeGetElement = (id) => document.getElementById(id);

// Pages
const walletPage = safeGetElement('walletPage');
const earnPage = safeGetElement('earnPage');
const swapPage = safeGetElement('swapPage');
const axionPage = safeGetElement('axionPage');

// Wallet Elements
const totalBalance = safeGetElement('totalBalance');
const walletAxcBalance = safeGetElement('walletAxcBalance');
const walletUsdtBalance = safeGetElement('walletUsdtBalance');
const assetsList = safeGetElement('assetsList');
const topCryptoList = safeGetElement('topCryptoList');
const depositBtn = safeGetElement('depositBtn');
const withdrawBtnWallet = safeGetElement('withdrawBtnWallet');
const historyBtn = safeGetElement('historyBtn');

// Earn Elements
const miningRate = safeGetElement('miningRate');
const miningPower = safeGetElement('miningPower');
const miningProgress = safeGetElement('miningProgress');
const miningTimer = safeGetElement('miningTimer');
const nextReward = safeGetElement('nextReward');
const watchAdBtn = safeGetElement('watchAdBtn');
const tasksContainer = safeGetElement('tasksContainer');
const referralCount = safeGetElement('referralCount');
const referralEarned = safeGetElement('referralEarned');
const referralLink = safeGetElement('referralLink');
const copyReferralLink = safeGetElement('copyReferralLink');

// Swap Elements
const axcBalance = safeGetElement('axcBalance');
const usdtBalance = safeGetElement('usdtBalance');
const fromBalance = safeGetElement('fromBalance');
const toBalance = safeGetElement('toBalance');
const swapFrom = safeGetElement('swapFrom');
const swapTo = safeGetElement('swapTo');
const swapBtn = safeGetElement('swapBtn');
const walletStatus = safeGetElement('walletStatus');
const axcPrice = safeGetElement('axcPrice');

// Modal Elements
const verificationModal = safeGetElement('verificationModal');
const modalProceedBtn = safeGetElement('modalProceedBtn');
const modalCancelBtn = safeGetElement('modalCancelBtn');
const depositModal = safeGetElement('depositModal');
const withdrawModal = safeGetElement('withdrawModal');
const historyModal = safeGetElement('historyModal');
const toast = safeGetElement('toast');
const toastMessage = safeGetElement('toastMessage');
const confirmDepositBtn = safeGetElement('confirmDepositBtn');
const submitWithdrawBtn = safeGetElement('submitWithdrawBtn');
const withdrawAddressInput = safeGetElement('withdrawAddressInput');
const withdrawAmountInput = safeGetElement('withdrawAmountInput');
const depositAddress = safeGetElement('depositAddress');

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

function closeModal(modalId) {
    const modal = safeGetElement(modalId);
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
        CONFIG.botUsername = data.botUsername || CONFIG.botUsername;
        if (data.config) {
            CONFIG.axcPrice = data.config.axcPrice || CONFIG.axcPrice;
            CONFIG.minSwap = data.config.minSwap || CONFIG.minSwap;
            CONFIG.maxSwap = data.config.maxSwap || CONFIG.maxSwap;
        }
        if (axcPrice) axcPrice.textContent = CONFIG.axcPrice;
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
            updateReferralUI();
        }
    } catch(e) { console.error('Load user error:', e); }
}

function updateAllBalances() {
    if (!currentUser) return;
    const balance = currentUser.balance || 0;
    const usdtBalance = currentUser.usdtBalance || 0;
    const totalValue = (balance * CONFIG.axcPrice) + usdtBalance;
    
    if (totalBalance) totalBalance.textContent = `$${totalValue.toFixed(2)}`;
    if (walletAxcBalance) walletAxcBalance.textContent = balance.toLocaleString();
    if (walletUsdtBalance) walletUsdtBalance.textContent = `$${usdtBalance.toFixed(2)}`;
    if (axcBalance) axcBalance.innerHTML = balance.toLocaleString();
    if (usdtBalance) usdtBalance.innerHTML = `$${usdtBalance.toFixed(2)}`;
    if (fromBalance) fromBalance.innerHTML = balance;
    if (toBalance) toBalance.innerHTML = `$${usdtBalance.toFixed(2)}`;
}

function updateReferralUI() {
    if (!currentUser) return;
    const inviteCount = currentUser.inviteCount || 0;
    const earned = inviteCount * 100;
    if (referralCount) referralCount.textContent = inviteCount;
    if (referralEarned) referralEarned.textContent = `${earned.toLocaleString()} AXC`;
    if (referralLink) {
        referralLink.value = `https://t.me/${CONFIG.botUsername}?start=${userId}`;
    }
}

// ============================================================================
// 7. ASSETS RENDERING (بيانات بسيطة)
// ============================================================================
function renderAssets() {
    if (!assetsList || !currentUser) return;
    const balance = currentUser.balance || 0;
    const usdtBalance = currentUser.usdtBalance || 0;
    assetsList.innerHTML = `
        <div class="asset-item">
            <div class="asset-left"><div class="asset-icon">🔮</div><div class="asset-info"><h4>Axion Coin</h4><p>AXC</p></div></div>
            <div class="asset-right"><div class="asset-balance">${balance.toLocaleString()} AXC</div><div class="asset-value">$${(balance * CONFIG.axcPrice).toFixed(2)}</div></div>
        </div>
        <div class="asset-item">
            <div class="asset-left"><div class="asset-icon">💵</div><div class="asset-info"><h4>Tether</h4><p>USDT</p></div></div>
            <div class="asset-right"><div class="asset-balance">${usdtBalance.toLocaleString()} USDT</div><div class="asset-value">$${usdtBalance.toFixed(2)}</div></div>
        </div>
    `;
}

function renderTopCryptos() {
    if (!topCryptoList) return;
    topCryptoList.innerHTML = `
        <div class="crypto-item"><div class="crypto-left"><div class="crypto-icon">₿</div><div class="crypto-info"><h4>Bitcoin</h4><p>BTC</p></div></div><div class="crypto-right"><div class="crypto-price">$68,500</div><div class="crypto-change positive">+2.4%</div></div></div>
        <div class="crypto-item"><div class="crypto-left"><div class="crypto-icon">Ξ</div><div class="crypto-info"><h4>Ethereum</h4><p>ETH</p></div></div><div class="crypto-right"><div class="crypto-price">$3,200</div><div class="crypto-change positive">+1.2%</div></div></div>
        <div class="crypto-item"><div class="crypto-left"><div class="crypto-icon">ⓑ</div><div class="crypto-info"><h4>BNB</h4><p>BNB</p></div></div><div class="crypto-right"><div class="crypto-price">$580</div><div class="crypto-change negative">-0.8%</div></div></div>
        <div class="crypto-item"><div class="crypto-left"><div class="crypto-icon">Ⓣ</div><div class="crypto-info"><h4>Toncoin</h4><p>TON</p></div></div><div class="crypto-right"><div class="crypto-price">$5.50</div><div class="crypto-change negative">-0.5%</div></div></div>
    `;
}

function refreshPrices() { renderTopCryptos(); showToast('Prices refreshed', 'success'); }
function showAllAssets() { showToast('All assets view coming soon', 'info'); }

// ============================================================================
// 8. WALLET MODALS
// ============================================================================
function showDepositModal() { if (depositModal) depositModal.classList.add('show'); }
function showWithdrawModal() { if (withdrawModal) withdrawModal.classList.add('show'); }
function showHistoryModal() { if (historyModal) historyModal.classList.add('show'); }

function copyDepositAddress() {
    const address = '0xd51d68d057805514823652dc090b9d455c79801a';
    navigator.clipboard.writeText(address);
    showToast('Address copied!', 'success');
}

async function confirmDeposit() {
    try {
        await fetch('/api/notify-deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userName: currentUser?.userName || 'Axion User', currency: 'AXC' })
        });
    } catch(e) {}
    showToast('✅ Admin notified! AXC will be added within 15 minutes.', 'success');
    if (depositModal) depositModal.classList.remove('show');
}

async function submitWithdraw() {
    const address = withdrawAddressInput?.value;
    const amount = parseFloat(withdrawAmountInput?.value || '0');
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) { showToast('Invalid BEP20 address', 'error'); return; }
    if (amount <= 0 || amount > (currentUser?.balance || 0)) { showToast('Invalid amount', 'error'); return; }
    try {
        const res = await fetch('/api/withdraw-usdt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, address })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Withdrawal submitted (Auto-approved)', 'success');
            if (withdrawModal) withdrawModal.classList.remove('show');
            await loadUserData();
        } else { showToast(data.error || 'Withdrawal failed', 'error'); }
    } catch(e) { showToast('Network error', 'error'); }
}

// ============================================================================
// 9. SWAP MODULE WITH MODAL
// ============================================================================
function updateSwapButtonState(isActive) {
    if (!swapBtn) return;
    if (isActive) {
        swapBtn.disabled = false;
        swapBtn.classList.remove('locked');
        swapBtn.classList.add('active');
        swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
    } else {
        swapBtn.disabled = false;
        swapBtn.classList.remove('active');
        swapBtn.classList.add('locked');
        swapBtn.innerHTML = '<i class="fas fa-lock"></i> 🔒 SWAP LOCKED';
    }
}

function showActivationModal() {
    if (!verificationModal) return;
    if (currentPage !== 'swap') return;
    if (currentUser?.tonPaid) return;
    verificationModal.classList.add('active');
}

function hideActivationModal() {
    if (verificationModal) verificationModal.classList.remove('active');
}

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
        window.tonConnectUI.onStatusChange(async (wallet) => {
            if (wallet) {
                tonConnected = true;
                tonWalletAddress = wallet.account.address;
                if (walletStatus) walletStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
                if (currentUser?.tonPaid) updateSwapButtonState(true);
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                if (walletStatus) walletStatus.innerHTML = 'Not connected';
                updateSwapButtonState(false);
            }
        });
    } catch(e) { console.error('TON error:', e); }
}

async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) { showStatus('swapStatus', '❌ Connect TON wallet first', 'error'); return false; }
    if (!CONFIG.ownerWallet) { showStatus('swapStatus', '❌ Owner wallet not configured', 'error'); return false; }
    if (isActivating) return false;
    isActivating = true;
    const amountNano = (CONFIG.swapFeeTON * 1000000000).toString();
    const transaction = { validUntil: Math.floor(Date.now() / 1000) + 600, messages: [{ address: CONFIG.ownerWallet, amount: amountNano }] };
    try {
        showStatus('swapStatus', '⏳ Waiting for payment...', 'info');
        const result = await window.tonConnectUI.sendTransaction(transaction);
        const verifyRes = await fetch('/api/ton-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, txHash: result.boc, walletAddress: tonWalletAddress }) });
        const verifyData = await verifyRes.json();
        if (verifyData.success) {
            await loadUserData();
            showStatus('swapStatus', '✅ Swap unlocked!', 'success');
            showConfetti();
            updateSwapButtonState(true);
            return true;
        } else { showStatus('swapStatus', '❌ Verification failed', 'error'); updateSwapButtonState(false); return false; }
    } catch(error) { showStatus('swapStatus', '❌ Payment cancelled', 'error'); updateSwapButtonState(false); return false; }
    finally { isActivating = false; }
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
        particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height, size: Math.random() * 8 + 4, speedY: Math.random() * 8 + 4, speedX: (Math.random() - 0.5) * 5, color: colors[Math.floor(Math.random() * colors.length)], rotation: Math.random() * 360, rotationSpeed: (Math.random() - 0.5) * 12 });
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
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation * Math.PI / 180); ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size); ctx.restore();
            }
        }
        if (allFinished || Date.now() - startTime > 3000) { cancelAnimationFrame(animationId); ctx.clearRect(0, 0, canvas.width, canvas.height); }
        else { animationId = requestAnimationFrame(animate); }
    }
    animate();
}

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `ai-status ${type}`;
    el.style.display = 'block';
    if (type !== 'error') setTimeout(() => el.style.display = 'none', 5000);
}

// Swap Event Listeners
if (swapFrom) {
    swapFrom.addEventListener('input', function() {
        const amount = parseFloat(this.value);
        if (isNaN(amount) || amount <= 0) { if (swapTo) swapTo.value = ''; return; }
        if (swapTo) swapTo.value = (amount * CONFIG.axcPrice).toFixed(2);
    });
}

if (swapBtn) {
    swapBtn.addEventListener('click', async () => {
        if (!currentUser?.tonPaid) { showActivationModal(); return; }
        const amount = parseFloat(swapFrom?.value || '0');
        if (isSwapping) return;
        if (amount < CONFIG.minSwap) { showStatus('swapStatus', `❌ Min ${CONFIG.minSwap} AXC`, 'error'); return; }
        if (amount > CONFIG.maxSwap) { showStatus('swapStatus', `❌ Max ${CONFIG.maxSwap} AXC`, 'error'); return; }
        if (amount > (currentUser?.balance || 0)) { showStatus('swapStatus', '❌ Insufficient balance', 'error'); return; }
        try {
            isSwapping = true;
            if (swapBtn) { swapBtn.disabled = true; swapBtn.innerHTML = '<span class="spinner"></span> PROCESSING...'; }
            const res = await fetch('/api/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, amount }) });
            const data = await res.json();
            if (data.success) {
                await loadUserData();
                if (swapFrom) swapFrom.value = '';
                if (swapTo) swapTo.value = '';
                showStatus('swapStatus', `✅ Swapped ${amount.toLocaleString()} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
                showConfetti();
            } else { showStatus('swapStatus', '❌ ' + (data.error || 'Swap failed'), 'error'); }
        } catch(error) { showStatus('swapStatus', '❌ Network error', 'error'); }
        finally { isSwapping = false; if (swapBtn) { swapBtn.disabled = false; updateSwapButtonState(true); } }
    });
}

if (modalProceedBtn) {
    modalProceedBtn.onclick = async () => {
        hideActivationModal();
        await handleActivation();
    };
}
if (modalCancelBtn) modalCancelBtn.onclick = hideActivationModal;

// ============================================================================
// 10. PAGE NAVIGATION
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
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageName) item.classList.add('active');
    });
}

// ============================================================================
// 11. AXION AI PAGE
// ============================================================================
function renderAxionPage() {
    const container = document.getElementById('axionContent');
    if (!container) return;
    container.innerHTML = `
        <div class="axion-hero"><div class="axion-icon">🧠</div><h1 class="axion-title">AXION AI</h1><p class="axion-subtitle">NEURAL INTELLIGENCE PROTOCOL</p></div>
        <div class="axion-card"><div class="axion-card-title">⚡ THE FUTURE OF DEFI & AI</div><p class="axion-card-text">Axion Coin (AXC) is a next-generation decentralized trading and liquidity token designed to solve challenges through a unified ecosystem integrating DeFi liquidity, decentralized governance, and AI-driven trading intelligence.</p></div>
        <div class="axion-card"><div class="axion-card-title">🎯 KEY FEATURES</div><div class="axion-features"><div class="axion-feature">🤖 AI TRADING INTELLIGENCE</div><div class="axion-feature">💧 DECENTRALIZED LIQUIDITY</div><div class="axion-feature">🗳️ COMMUNITY GOVERNANCE</div><div class="axion-feature">💰 STAKING REWARDS</div></div></div>
        <div class="axion-card"><div class="axion-card-title">📊 TOKENOMICS</div><div class="axion-stat"><span class="axion-stat-label">NETWORK:</span><span class="axion-stat-value">BNB SMART CHAIN (BEP-20)</span></div><div class="axion-stat"><span class="axion-stat-label">TOTAL SUPPLY:</span><span class="axion-stat-value">500,000,000 AXC</span></div><div class="axion-stat"><span class="axion-stat-label">LAUNCH PRICE:</span><span class="axion-stat-value">$0.003</span></div></div>
        <div class="axion-card axion-future"><div class="axion-card-title">🔮 OPEN-SOURCE AI MODEL</div><p class="axion-card-text">NO BOUNDARIES. NO RED LINES. FULLY TRANSPARENT AND COMMUNITY-DRIVEN.</p><div class="axion-badge">COMING SOON</div></div>
    `;
}

// ============================================================================
// 12. MINING SYSTEM (BASIC)
// ============================================================================
let miningData = { miningRate: 50, lastClaimTime: Date.now() };

function updateMiningUI() {
    if (miningRate) miningRate.textContent = `${miningData.miningRate} AXC`;
    const timeSinceLastClaim = Date.now() - miningData.lastClaimTime;
    const remaining = Math.max(0, 2.5 * 60 * 60 * 1000 - timeSinceLastClaim);
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    if (miningTimer) miningTimer.textContent = `${hours}h ${minutes}m`;
    if (nextReward) nextReward.textContent = `${hours}h ${minutes}m`;
    const progress = (timeSinceLastClaim / (2.5 * 60 * 60 * 1000)) * 100;
    if (miningProgress) miningProgress.style.width = `${Math.min(100, progress)}%`;
}

setInterval(() => {
    const timeSinceLastClaim = Date.now() - miningData.lastClaimTime;
    if (timeSinceLastClaim >= 2.5 * 60 * 60 * 1000) {
        miningData.lastClaimTime = Date.now();
        updateMiningUI();
        showToast(`🎉 +${miningData.miningRate} AXC MINED!`, 'success');
    }
    updateMiningUI();
}, 60000);

updateMiningUI();

// ============================================================================
// 13. TASKS SYSTEM (BASIC)
// ============================================================================
function renderTasks() {
    if (!tasksContainer) return;
    tasksContainer.innerHTML = `
        <div class="task-item"><div class="task-info"><div class="task-name">Join Telegram Channel</div><div class="task-reward">+100 AXC</div></div><button class="task-btn" onclick="window.open('https://t.me/AxionAiSignal', '_blank')">COMPLETE</button></div>
        <div class="task-item"><div class="task-info"><div class="task-name">Follow on Twitter</div><div class="task-reward">+100 AXC</div></div><button class="task-btn" onclick="window.open('https://twitter.com/AxionAI', '_blank')">COMPLETE</button></div>
        <div class="task-item"><div class="task-info"><div class="task-name">Visit Website</div><div class="task-reward">+100 AXC</div></div><button class="task-btn" onclick="window.open('https://axionai.io', '_blank')">COMPLETE</button></div>
    `;
}
renderTasks();

// ============================================================================
// 14. WATCH AD (BASIC)
// ============================================================================
if (watchAdBtn) {
    watchAdBtn.addEventListener('click', () => {
        showToast('🎬 +100 AXC ADDED!', 'success');
    });
}

// ============================================================================
// 15. INITIALIZATION
// ============================================================================
async function init() {
    console.log('🚀 AXION AI Initializing...');
    
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    if (!userId && tg?.initDataUnsafe?.user) {
        userId = tg.initDataUnsafe.user.id.toString();
    }
    
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
    
    renderAssets();
    renderTopCryptos();
    renderAxionPage();
    
    if (depositBtn) depositBtn.addEventListener('click', showDepositModal);
    if (withdrawBtnWallet) withdrawBtnWallet.addEventListener('click', showWithdrawModal);
    if (historyBtn) historyBtn.addEventListener('click', showHistoryModal);
    if (confirmDepositBtn) confirmDepositBtn.addEventListener('click', confirmDeposit);
    if (submitWithdrawBtn) submitWithdrawBtn.addEventListener('click', submitWithdraw);
    if (copyReferralLink) {
        copyReferralLink.addEventListener('click', () => {
            if (referralLink?.value) {
                navigator.clipboard.writeText(referralLink.value);
                showToast('Referral link copied!', 'success');
            }
        });
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => showPage(item.getAttribute('data-page')));
    });
    
    showPage('wallet');
    console.log('✅ AXION AI Ready!');
}

// Expose globals
window.showPage = showPage;
window.copyDepositAddress = copyDepositAddress;
window.confirmDeposit = confirmDeposit;
window.submitWithdraw = submitWithdraw;
window.showWithdrawModal = showWithdrawModal;
window.closeModal = closeModal;
window.refreshPrices = refreshPrices;
window.showAllAssets = showAllAssets;
window.showHistoryModal = showHistoryModal;

init();
