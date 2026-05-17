// ============================================================================
// AXION AI - SWAP MINI APP LOGIC v2.0
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

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    const initData = tg?.initDataUnsafe;
    userId = initData?.user?.id?.toString();
    
    if (!userId) {
        showStatus('swapStatus', '❌ Please open from Telegram Bot', 'error');
        return;
    }
    
    await loadConfig();
    await initFirebase();
    initTonConnect();
    await loadUserData();
}

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        CONFIG.ownerWallet = data.ownerWallet;
        console.log('[Swap] Config loaded');
    } catch(e) {
        console.error('Config error:', e);
    }
}

async function initFirebase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        firebase.initializeApp(config.firebaseConfig);
        db = firebase.firestore();
        console.log('[Swap] Firebase initialized');
    } catch(e) {
        console.error('Firebase init error:', e);
    }
}

// ============================================================================
// TON CONNECT
// ============================================================================

function initTonConnect() {
    if (typeof TON_CONNECT_UI === 'undefined') {
        console.error('TON Connect UI not loaded');
        return;
    }
    
    window.tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: window.location.origin + '/tonconnect-manifest.json',
        buttonRootId: 'ton-connect'
    });
    
    window.tonConnectUI.onStatusChange(async (wallet) => {
        if (wallet) {
            tonConnected = true;
            tonWalletAddress = wallet.account.address;
            document.getElementById('walletStatus').innerHTML = 
                `<i class="fas fa-check-circle" style="color:#2ecc71"></i> ${tonWalletAddress.slice(0, 6)}...${tonWalletAddress.slice(-6)}`;
            await checkActivation();
        } else {
            tonConnected = false;
            tonWalletAddress = null;
            document.getElementById('walletStatus').innerHTML = 'Not connected';
        }
    });
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
        }
    } catch(e) {
        console.error('Load user error:', e);
    }
}

function updateUI() {
    if (!currentUser) return;
    
    // Update balances
    document.getElementById('axcBalance').innerHTML = (currentUser.balance || 0).toLocaleString();
    document.getElementById('usdtBalance').innerHTML = `$${(currentUser.usdtBalance || 0).toFixed(2)}`;
    document.getElementById('fromBalance').innerHTML = currentUser.balance || 0;
    document.getElementById('toBalance').innerHTML = `$${(currentUser.usdtBalance || 0).toFixed(2)}`;
    
    // Show/hide sections based on activation
    if (currentUser.tonPaid) {
        document.getElementById('activationBox').classList.add('hidden');
        document.getElementById('swapBox').classList.remove('hidden');
        document.getElementById('withdrawBox').style.display = 'block';
    } else {
        document.getElementById('activationBox').classList.remove('hidden');
        document.getElementById('swapBox').classList.add('hidden');
        document.getElementById('withdrawBox').style.display = 'none';
    }
}

async function checkActivation() {
    if (!currentUser || !tonWalletAddress) return;
    if (currentUser.tonPaid) {
        updateUI();
    }
}

// ============================================================================
// ACTIVATION (PAY 0.05 TON)
// ============================================================================

document.getElementById('activateBtn')?.addEventListener('click', async () => {
    if (!tonConnected || !tonWalletAddress) {
        showStatus('activationStatus', '❌ Please connect TON wallet first', 'error');
        return;
    }
    
    if (!CONFIG.ownerWallet) {
        showStatus('activationStatus', '❌ Owner wallet not configured', 'error');
        return;
    }
    
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
            setTimeout(() => {
                document.getElementById('activationStatus').style.display = 'none';
            }, 3000);
        } else {
            showStatus('activationStatus', '❌ ' + verifyData.error, 'error');
        }
        
    } catch(error) {
        console.error('Activation error:', error);
        showStatus('activationStatus', '❌ Payment cancelled or failed', 'error');
    }
});

// ============================================================================
// SWAP LOGIC
// ============================================================================

document.getElementById('swapFrom')?.addEventListener('input', function() {
    const amount = parseFloat(this.value);
    const swapBtn = document.getElementById('swapBtn');
    
    if (isNaN(amount) || amount <= 0) {
        document.getElementById('swapTo').value = '';
        swapBtn.disabled = true;
        return;
    }
    
    const usdtAmount = amount * CONFIG.axcPrice;
    document.getElementById('swapTo').value = `$${usdtAmount.toFixed(2)}`;
    
    const balance = currentUser?.balance || 0;
    swapBtn.disabled = amount > balance || amount < CONFIG.minSwap;
});

document.getElementById('swapBtn')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('swapFrom').value);
    const swapBtn = document.getElementById('swapBtn');
    
    if (isNaN(amount) || amount < CONFIG.minSwap) {
        showStatus('swapStatus', `❌ Minimum swap is ${CONFIG.minSwap} AXC`, 'error');
        return;
    }
    
    const balance = currentUser?.balance || 0;
    if (amount > balance) {
        showStatus('swapStatus', '❌ Insufficient AXC balance', 'error');
        return;
    }
    
    try {
        swapBtn.disabled = true;
        swapBtn.innerHTML = '<span class="spinner"></span> Processing...';
        
        const res = await fetch('/api/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount })
        });
        
        const data = await res.json();
        
        if (data.success) {
            await loadUserData();
            document.getElementById('swapFrom').value = '';
            document.getElementById('swapTo').value = '';
            showStatus('swapStatus', `✅ Swapped ${amount.toLocaleString()} AXC → $${data.usdtAmount.toFixed(2)} USDT`, 'success');
            
            // Close Mini App after successful swap
            setTimeout(() => {
                if (tg) tg.close();
            }, 2500);
        } else {
            showStatus('swapStatus', '❌ ' + data.error, 'error');
        }
        
    } catch(error) {
        console.error('Swap error:', error);
        showStatus('swapStatus', '❌ Network error', 'error');
    } finally {
        swapBtn.disabled = false;
        swapBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> CONFIRM SWAP';
    }
});

// ============================================================================
// WITHDRAW USDT
// ============================================================================

document.getElementById('withdrawBtn')?.addEventListener('click', async () => {
    const address = document.getElementById('withdrawAddress').value.trim();
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const btn = document.getElementById('withdrawBtn');
    
    // Validate BEP20 address
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
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Processing...';
    
    try {
        const res = await fetch('/api/withdraw-usdt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, address })
        });
        
        const data = await res.json();
        
        if (data.success) {
            await loadUserData();
            document.getElementById('withdrawAmount').value = '';
            showStatus('withdrawStatus', '✅ Withdrawal submitted! Pending admin approval.', 'success');
            
            // Clear address field
            document.getElementById('withdrawAddress').value = '';
            
            setTimeout(() => {
                document.getElementById('withdrawStatus').style.display = 'none';
            }, 4000);
        } else {
            showStatus('withdrawStatus', '❌ ' + data.error, 'error');
        }
        
    } catch(error) {
        console.error('Withdraw error:', error);
        showStatus('withdrawStatus', '❌ Network error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Withdrawal';
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.style.display = 'block';
    
    // Auto-hide after 5 seconds for success/info, keep error longer
    if (type !== 'error') {
        setTimeout(() => {
            el.style.display = 'none';
        }, 5000);
    }
}

// ============================================================================
// START
// ============================================================================

init();
