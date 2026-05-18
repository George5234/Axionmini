// ============================================================================
// AXION AI - SWAP MINI APP LOGIC v4.0 (PROFESSIONAL)
// ============================================================================

// Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a2e1c');
    tg.setBackgroundColor('#0a2e1c');
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    axcPrice: 0.0099,
    swapFeeTON: 0.05,
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
    activateBtn: document.getElementById('activateBtn'),
    activationBox: document.getElementById('activationBox'),
    swapBox: document.getElementById('swapBox'),
    walletStatus: document.getElementById('walletStatus'),
    axcPrice: document.getElementById('axcPrice')
};

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
    
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4,
            speedY: Math.random() * 8 + 4,
            speedX: (Math.random() - 0.5) * 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }
    
    let animationId;
    let startTime = Date.now();
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let allFinished = true;
        for (let p of particles) {
            if (p.y < canvas.height + 50) {
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

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    console.log('[Swap] Initializing...');
    
    // Get user from URL params (from bot)
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('userId');
    
    if (!userId) {
        // Try from Telegram
        const initData = tg?.initDataUnsafe;
        userId = initData?.user?.id?.toString();
    }
    
    if (!userId) {
        showStatus('swapStatus', '❌ Please open from Telegram Bot', 'error');
        console.error('[Swap] No userId found');
        return;
    }
    
    console.log('[Swap] User ID:', userId);
    
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
}

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        console.log('[Swap] Config loaded');
    } catch(e) {
        console.error('[Swap] Config error:', e);
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
        console.log('[Swap] Firebase initialized');
    } catch(e) {
        console.error('[Swap] Firebase init error:', e);
    }
}

// ============================================================================
// TON CONNECT
// ============================================================================

function initTonConnect() {
    const container = document.getElementById('ton-connect');
    if (!container) return;
    
    if (typeof TON_CONNECT_UI === 'undefined') {
        console.error('[Swap] TON Connect UI not loaded');
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
        console.error('[Swap] TON Connect error:', e);
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
            // Try via API
            const res = await fetch(`/api/user/${userId}`);
            const data = await res.json();
            if (data.success) {
                currentUser = data.user;
                updateUI();
            }
        }
    } catch(e) {
        console.error('[Swap] Load user error:', e);
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
    
    // Update swap button based on activation
    if (currentUser.tonPaid) {
        unlockSwap();
    } else {
        lockSwap();
    }
}

async function checkActivation() {
    if (!currentUser || !tonWalletAddress) return;
    
    // Refresh user data
    await loadUserData();
}

// ============================================================================
// SWAP LOCK/UNLOCK SYSTEM
// ============================================================================

function lockSwap() {
    if (elements.activationBox) {
        elements.activationBox.classList.remove('unlocked');
        elements.activationBox.classList.add('locked');
    }
    if (elements.swapBox) {
        elements.swapBox.classList.add('disabled');
    }
    if (elements.swapBtn) {
        elements.swapBtn.disabled = true;
    }
}

function unlockSwap() {
    if (elements.activationBox) {
        elements.activationBox.classList.remove('locked');
        elements.activationBox.classList.add('unlocked');
        const icon = elements.activationBox.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-unlock-alt';
        }
        const title = elements.activationBox.querySelector('h3');
        if (title) title.innerHTML = '🔓 Swap Unlocked';
        const desc = elements.activationBox.querySelector('p');
        if (desc) desc.innerHTML = 'Swap feature is permanently activated for your account!';
        const btn = elements.activationBox.querySelector('button');
        if (btn) btn.style.display = 'none';
    }
    if (elements.swapBox) {
        elements.swapBox.classList.remove('disabled');
    }
    // Enable swap button if amount is valid
    validateSwapAmount();
}

// ============================================================================
// ACTIVATION (PAY 0.05 TON)
// ============================================================================

if (elements.activateBtn) {
    elements.activateBtn.addEventListener('click', async () => {
        if (!tonConnected || !tonWalletAddress) {
            showStatus('activationStatus', '❌ Please connect TON wallet first', 'error');
            return;
        }
        
        if (!CONFIG.ownerWallet) {
            showStatus('activationStatus', '❌ Owner wallet not configured', 'error');
            return;
        }
        
        if (isActivating) return;
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
            showStatus('activationStatus', '⏳ Waiting for payment confirmation...', 'info');
            if (elements.activateBtn) {
                elements.activateBtn.disabled = true;
                elements.activateBtn.innerHTML = '<span class="spinner"></span> Processing...';
            }
            
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
                showStatus('activationStatus', '✅ Swap activated! You can now swap.', 'success');
                showConfetti();
                unlockSwap();
            } else {
                showStatus('activationStatus', '❌ ' + (verifyData.error || 'Verification failed'), 'error');
            }
            
        } catch(error) {
            console.error('Activation error:', error);
            showStatus('activationStatus', '❌ Payment cancelled or failed', 'error');
        } finally {
            isActivating = false;
            if (elements.activateBtn) {
                elements.activateBtn.disabled = false;
                elements.activateBtn.innerHTML = '<i class="fas fa-gem"></i> Activate for 0.05 TON';
            }
        }
    });
}

// ============================================================================
// SWAP LOGIC
// ============================================================================

function validateSwapAmount() {
    const amount = parseFloat(elements.swapFrom?.value || '0');
    const balance = currentUser?.balance || 0;
    const isActive = currentUser?.tonPaid === true;
    
    if (!isActive) {
        if (elements.swapBtn) elements.swapBtn.disabled = true;
        return;
    }
    
    if (isNaN(amount) || amount <= 0) {
        if (elements.swapBtn) elements.swapBtn.disabled = true;
        return;
    }
    
    const isValid = amount >= CONFIG.minSwap && amount <= balance && amount <= CONFIG.maxSwap;
    if (elements.swapBtn) elements.swapBtn.disabled = !isValid;
}

if (elements.swapFrom) {
    elements.swapFrom.addEventListener('input', function() {
        const amount = parseFloat(this.value);
        
        if (isNaN(amount) || amount <= 0) {
            if (elements.swapTo) elements.swapTo.value = '';
            validateSwapAmount();
            return;
        }
        
        const usdtAmount = amount * CONFIG.axcPrice;
        if (elements.swapTo) elements.swapTo.value = `$${usdtAmount.toFixed(2)}`;
        validateSwapAmount();
    });
}

if (elements.swapBtn) {
    elements.swapBtn.addEventListener('click', async () => {
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
                showStatus('swapStatus', `✅ Swapped ${amount.toLocaleString()} AXC → $${data.usdtAmount?.toFixed(2) || (amount * CONFIG.axcPrice).toFixed(2)} USDT`, 'success');
                showConfetti();
                
                // Close Mini App after successful swap
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
            elements.swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
            validateSwapAmount();
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
