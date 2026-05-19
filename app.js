// ============================================================================
// AXION AI - DEX SWAP v7.0 (PREMIUM WITH MODAL)
// ============================================================================

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0c0f');
    tg.setBackgroundColor('#0a0c0f');
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    axcPrice: 0.001,
    swapFeeTON: 5,
    minSwap: 100,
    maxSwap: 100000,
    ownerWallet: null
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

let currentUser = null;
let userId = null;
let db = null;
let tonConnected = false;
let tonWalletAddress = null;
let isActivating = false;
let isSwapping = false;
let isWithdrawing = false;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    axcBalance: document.getElementById('axcBalance'),
    usdtBalance: document.getElementById('usdtBalance'),
    fromBalance: document.getElementById('fromBalance'),
    toBalance: document.getElementById('toBalance'),
    swapFrom: document.getElementById('swapFrom'),
    swapTo: document.getElementById('swapTo'),
    swapBtn: document.getElementById('swapBtn'),
    walletStatus: document.getElementById('walletStatus'),
    axcPrice: document.getElementById('axcPrice'),
    withdrawAddress: document.getElementById('withdrawAddress'),
    withdrawAmount: document.getElementById('withdrawAmount'),
    withdrawBtn: document.getElementById('withdrawBtn')
};

// Modal elements
const modal = document.getElementById('verificationModal');
const modalProceedBtn = document.getElementById('modalProceedBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

// ============================================================================
// MODAL FUNCTIONS
// ============================================================================

function showModal() {
    if (modal) {
        modal.classList.add('active');
    }
}

function hideModal() {
    if (modal) {
        modal.classList.remove('active');
    }
}

// ============================================================================
// CONFETTI EFFECT
// ============================================================================

function showConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const colors = ['#2ecc71', '#f1c40f', '#e74c3c', '#3498db', '#9b59b6'];
    
    for (let i = 0; i < 200; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 10 + 4,
            speedY: Math.random() * 10 + 5,
            speedX: (Math.random() - 0.5) * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 15
        });
    }
    
    let animationId;
    let startTime = Date.now();
    
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
        
        if (allFinished || Date.now() - startTime > 3500) {
            cancelAnimationFrame(animationId);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
            animationId = requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// ============================================================================
// BUTTON STATE MANAGEMENT
// ============================================================================

function updateSwapButtonState(isActive) {
    const btn = elements.swapBtn;
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

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    console.log('[DEX] Initializing...');
    
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    
    if (!userId) {
        const initData = tg?.initDataUnsafe;
        userId = initData?.user?.id?.toString();
    }
    
    if (!userId) {
        showStatus('swapStatus', '❌ Please open from Telegram Bot', 'error');
        return;
    }
    
    console.log('[DEX] User ID:', userId);
    
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
    
    // Setup modal event listeners
    if (modalProceedBtn) {
        modalProceedBtn.addEventListener('click', async () => {
            hideModal();
            await handleActivation();
        });
    }
    
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', () => {
            hideModal();
        });
    }
}

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
        if (elements.axcPrice) {
            elements.axcPrice.textContent = CONFIG.axcPrice;
        }
    } catch(e) {
        console.error('[DEX] Config error:', e);
    }
}

async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        if (firebase.apps.length === 0) {
            firebase.initializeApp(config.firebaseConfig);
        }
        db = firebase.firestore();
        console.log('[DEX] Firebase initialized');
    } catch(e) {
        console.error('[DEX] Firebase init error:', e);
    }
}

// ============================================================================
// TON CONNECT
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
        
        window.tonConnectUI.onStatusChange(async (wallet) => {
            if (wallet) {
                tonConnected = true;
                tonWalletAddress = wallet.account.address;
                if (elements.walletStatus) {
                    elements.walletStatus.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> ${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
                }
                await checkActivation();
            } else {
                tonConnected = false;
                tonWalletAddress = null;
                if (elements.walletStatus) {
                    elements.walletStatus.innerHTML = 'Not connected';
                }
            }
        });
    } catch(e) {
        console.error('[DEX] TON Connect error:', e);
    }
}

// ============================================================================
// USER DATA
// ============================================================================

async function loadUserData() {
    if (!db || !userId) return;
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            currentUser = userDoc.data();
            updateUI();
        } else {
            const res = await fetch(`/api/user/${userId}`);
            const data = await res.json();
            if (data.success) {
                currentUser = data.user;
                updateUI();
            }
        }
    } catch(e) {
        console.error('[DEX] Load user error:', e);
    }
}

function updateUI() {
    if (!currentUser) return;
    
    const balance = currentUser.balance || 0;
    const usdtBalance = currentUser.usdtBalance || 0;
    
    if (elements.axcBalance) elements.axcBalance.innerHTML = balance.toLocaleString();
    if (elements.usdtBalance) elements.usdtBalance.innerHTML = `$${usdtBalance.toFixed(2)}`;
    if (elements.fromBalance) elements.fromBalance.innerHTML = balance;
    if (elements.toBalance) elements.toBalance.innerHTML = `$${usdtBalance.toFixed(2)}`;
    
    // Update button based on activation status
    if (currentUser.tonPaid) {
        updateSwapButtonState(true);
    } else {
        updateSwapButtonState(false);
    }
}

async function checkActivation() {
    if (!currentUser || !tonWalletAddress) return;
    await loadUserData();
}

// ============================================================================
// ACTIVATION (PAY 0.05 TON)
// ============================================================================

async function handleActivation() {
    if (!tonConnected || !tonWalletAddress) {
        showStatus('swapStatus', '❌ Please connect TON wallet first', 'error');
        return false;
    }
    
    if (!CONFIG.ownerWallet) {
        showStatus('swapStatus', '❌ Owner wallet not configured', 'error');
        return false;
    }
    
    if (isActivating) return false;
    isActivating = true;
    
    const amountNano = (CONFIG.swapFeeTON * 1000000000).toString();
    
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
            address: CONFIG.ownerWallet,
            amount: amountNano
        }]
    };
    
    try {
        showStatus('swapStatus', '⏳ Waiting for payment confirmation...', 'info');
        
        const result = await window.tonConnectUI.sendTransaction(transaction);
        
        const verifyRes = await fetch('/api/ton-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                txHash: result.boc,
                walletAddress: tonWalletAddress
            })
        });
        
        const verifyData = await verifyRes.json();
        
        if (verifyData.success) {
            await loadUserData();
            showStatus('swapStatus', '✅ Swap unlocked! You can now swap.', 'success');
            showConfetti();
            updateSwapButtonState(true);
            return true;
        } else {
            showStatus('swapStatus', '❌ ' + (verifyData.error || 'Verification failed'), 'error');
            updateSwapButtonState(false);
            return false;
        }
        
    } catch(error) {
        console.error('Activation error:', error);
        showStatus('swapStatus', '❌ Payment cancelled or failed', 'error');
        updateSwapButtonState(false);
        return false;
    } finally {
        isActivating = false;
    }
}

// ============================================================================
// SWAP LOGIC
// ============================================================================

function validateSwapAmount() {
    const amount = parseFloat(elements.swapFrom?.value || '0');
    const balance = currentUser?.balance || 0;
    const isActive = currentUser?.tonPaid === true;
    
    if (!isActive) return;
    
    if (isNaN(amount) || amount <= 0) {
        return;
    }
    
    const isValid = amount >= CONFIG.minSwap && amount <= balance && amount <= CONFIG.maxSwap;
    // Visual feedback only, button is always clickable for non-active users
}

if (elements.swapFrom) {
    elements.swapFrom.addEventListener('input', function() {
        const amount = parseFloat(this.value);
        
        if (isNaN(amount) || amount <= 0) {
            if (elements.swapTo) elements.swapTo.value = '';
            return;
        }
        
        const usdtAmount = amount * CONFIG.axcPrice;
        if (elements.swapTo) elements.swapTo.value = usdtAmount.toFixed(2);
    });
}

if (elements.swapBtn) {
    elements.swapBtn.addEventListener('click', async () => {
        // If not activated, show modal
        if (!currentUser?.tonPaid) {
            showModal();
            return;
        }
        
        const amount = parseFloat(elements.swapFrom?.value || '0');
        
        if (isSwapping) return;
        
        if (amount < CONFIG.minSwap) {
            showStatus('swapStatus', `❌ Minimum swap is ${CONFIG.minSwap} AXC`, 'error');
            return;
        }
        
        if (amount > CONFIG.maxSwap) {
            showStatus('swapStatus', `❌ Maximum swap is ${CONFIG.maxSwap} AXC`, 'error');
            return;
        }
        
        const balance = currentUser?.balance || 0;
        if (amount > balance) {
            showStatus('swapStatus', '❌ Insufficient AXC balance', 'error');
            return;
        }
        
        try {
            isSwapping = true;
            elements.swapBtn.disabled = true;
            elements.swapBtn.innerHTML = '<span class="spinner"></span> Processing...';
            
            const res = await fetch('/api/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount })
            });
            
            const data = await res.json();
            
            if (data.success) {
                await loadUserData();
                if (elements.swapFrom) elements.swapFrom.value = '';
                if (elements.swapTo) elements.swapTo.value = '';
                showStatus('swapStatus', `✅ Swapped ${amount.toLocaleString()} AXC → $${(amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
                showConfetti();
                
                setTimeout(() => {
                    if (tg) tg.close();
                }, 2500);
            } else {
                showStatus('swapStatus', '❌ ' + (data.error || 'Swap failed'), 'error');
            }
            
        } catch(error) {
            console.error('Swap error:', error);
            showStatus('swapStatus', '❌ Network error. Please try again.', 'error');
        } finally {
            isSwapping = false;
            elements.swapBtn.disabled = false;
            updateSwapButtonState(true);
        }
    });
}

// ============================================================================
// WITHDRAW USDT
// ============================================================================

if (elements.withdrawBtn) {
    elements.withdrawBtn.addEventListener('click', async () => {
        const address = elements.withdrawAddress?.value.trim();
        const amount = parseFloat(elements.withdrawAmount?.value || '0');
        
        const isValidBEP20 = /^0x[a-fA-F0-9]{40}$/i.test(address);
        
        if (!address || !isValidBEP20) {
            showStatus('withdrawStatus', '❌ Invalid BEP20 address', 'error');
            return;
        }
        
        if (isNaN(amount) || amount <= 0) {
            showStatus('withdrawStatus', '❌ Invalid amount', 'error');
            return;
        }
        
        const usdtBalance = currentUser?.usdtBalance || 0;
        if (amount > usdtBalance) {
            showStatus('withdrawStatus', '❌ Insufficient USDT balance', 'error');
            return;
        }
        
        if (isWithdrawing) return;
        isWithdrawing = true;
        
        if (elements.withdrawBtn) {
            elements.withdrawBtn.disabled = true;
            elements.withdrawBtn.innerHTML = '<span class="spinner"></span> Processing...';
        }
        
        try {
            const res = await fetch('/api/withdraw-usdt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount, address })
            });
            
            const data = await res.json();
            
            if (data.success) {
                await loadUserData();
                if (elements.withdrawAmount) elements.withdrawAmount.value = '';
                showStatus('withdrawStatus', '✅ Withdrawal submitted! Pending admin approval.', 'success');
                if (elements.withdrawAddress) elements.withdrawAddress.value = '';
            } else {
                showStatus('withdrawStatus', '❌ ' + (data.error || 'Withdrawal failed'), 'error');
            }
            
        } catch(error) {
            console.error('Withdraw error:', error);
            showStatus('withdrawStatus', '❌ Network error', 'error');
        } finally {
            isWithdrawing = false;
            if (elements.withdrawBtn) {
                elements.withdrawBtn.disabled = false;
                elements.withdrawBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Withdrawal';
            }
        }
    });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.style.display = 'block';
    
    if (type !== 'error') {
        setTimeout(() => {
            if (el) el.style.display = 'none';
        }, 5000);
    }
}

// ============================================================================
// START
// ============================================================================

init();
