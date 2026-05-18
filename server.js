// ============================================================================
// AXION AI BOT - LEGENDARY EDITION v10.1 (COMPLETE FINAL)
// ============================================================================
// Professional Design | Rate Limiting | Transaction History | Cache Warmup
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 🔐 LOAD ENVIRONMENT VARIABLES & SECRETS
// ============================================================================

let serviceAccount = null;
let firebaseWebConfig = {};
let ADMIN_ID = null;
let ADMIN_PASSWORD = null;
let BOT_TOKEN = null;
let WITHDRAWAL_GROUP_ID = null;
let OWNER_WALLET = null;
let APP_URL = null;
let BOT_USERNAME = null;

// Load Firebase Admin Key
try {
    const firebasePath = '/etc/secrets/firebase-admin-key.json';
    if (fs.existsSync(firebasePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
        console.log('✅ Firebase Admin key loaded');
    }
} catch (error) {
    console.error('❌ Firebase Admin key error:', error.message);
}

// Load Firebase Web Config
try {
    const configPath = '/etc/secrets/firebase-web-config.json';
    if (fs.existsSync(configPath)) {
        firebaseWebConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ Firebase Web config loaded');
    }
} catch (error) {
    console.error('❌ Firebase Web config error:', error.message);
}

// Load Admin Config
try {
    const adminPath = '/etc/secrets/admin-config.json';
    if (fs.existsSync(adminPath)) {
        const adminConfig = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
        ADMIN_ID = adminConfig.admin_id;
        ADMIN_PASSWORD = adminConfig.admin_password;
        console.log('✅ Admin config loaded | ID:', ADMIN_ID);
    }
} catch (error) {
    console.error('❌ Admin config error:', error.message);
}

// Environment Variables
BOT_TOKEN = process.env.BOT_TOKEN;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;
OWNER_WALLET = process.env.OWNER_WALLET;
APP_URL = process.env.APP_URL;

// ============================================================================
// 2. ⚙️ APPLICATION CONFIGURATION
// ============================================================================

const APP_CONFIG = {
    welcomeBonus: 100,
    referralBonus: 100,
    minWithdrawAXC: 1000,
    minWithdrawUSDT: 10,
    maxWithdrawAXC: 50000,
    maxWithdrawUSDT: 1000,
    axcPrice: 0.0099,
    swapFeeTON: 0.05,
    minSwap: 100,
    maxNotifications: 50,
    withdrawCooldown: 86400000,
    sessionTTL: 3600000,          // 1 hour for sessions
    adminSessionTTL: 86400000,    // 24 hours for admin
    syncInterval: 21600000,       // 6 hours
    cacheTTL: 3600000,            // 1 hour
    rateLimitWindow: 60000,       // 1 minute
    rateLimitMax: 30,             // 30 requests per minute
    sessionCleanupInterval: 3600000 // 1 hour
};

const REFERRAL_MILESTONES = [
    { count: 5, reward: 1, name: '🥉 Bronze', rewardUnit: 'USDT' },
    { count: 15, reward: 5, name: '🥈 Silver', rewardUnit: 'USDT' },
    { count: 30, reward: 10, name: '🥇 Gold', rewardUnit: 'USDT' },
    { count: 60, reward: 25, name: '👑 Platinum', rewardUnit: 'USDT' },
    { count: 100, reward: 50, name: '💎 Diamond', rewardUnit: 'USDT' }
];

const REQUIRED_CHANNELS = [
    { name: 'Axion AI Signal', username: '@AxionAiSignal' },
    { name: 'Axion AI Signals', username: '@AxionAiSignals' },
    { name: 'Airdrop Master VIP', username: '@Airdrop_MasterVIP' },
    { name: 'Daily Airdrop X', username: '@Daily_AirdropX' }
];

// ============================================================================
// 3. 🎨 PROFESSIONAL FORMATTING (RESTORED)
// ============================================================================

const DIVIDER = '═'.repeat(35);
const STAR_DIVIDER = '✧' + '═'.repeat(33) + '✧';
const MINI_DIVIDER = '•' + '─'.repeat(10) + '✧' + '─'.repeat(10) + '•';
const BOTTOM_DIVIDER = '✧' + '═'.repeat(33) + '✧';

function formatProfessionalMessage(title, content, footer = '') {
    return `
${STAR_DIVIDER}
✨ <b>${title}</b> ✨
${MINI_DIVIDER}

${content}

${footer ? footer + '\n' : ''}${BOTTOM_DIVIDER}`;
}

function formatAXC(amount) {
    const usd = (amount * APP_CONFIG.axcPrice).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function formatUSD(amount) {
    return `$${amount.toFixed(2)} USD`;
}

function formatTransactionHistory(transactions) {
    if (!transactions || transactions.length === 0) {
        return '📭 No transactions yet.';
    }
    
    let history = '';
    for (let i = 0; i < Math.min(transactions.length, 20); i++) {
        const tx = transactions[i];
        const date = new Date(tx.timestamp).toLocaleString();
        const sign = tx.type === 'withdrawal' ? '-' : '+';
        const color = tx.type === 'withdrawal' ? '📤' : '📥';
        
        history += `
${color} <b>${tx.type.toUpperCase()}</b>
   Amount: ${tx.currency === 'AXC' ? formatAXC(tx.amount) : formatUSD(tx.amount)}
   Status: ${tx.status === 'approved' ? '✅ Approved' : tx.status === 'pending' ? '⏳ Pending' : '❌ Rejected'}
   ${tx.status === 'rejected' ? `Reason: ${tx.reason || 'N/A'}\n` : ''}
   📅 ${date}
${MINI_DIVIDER}`;
    }
    return history;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isValidBEP20(address) {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

function isAdmin(userId) {
    return userId === ADMIN_ID;
}

function getProgressBar(current, target, length = 10) {
    const percent = Math.min(100, (current / target) * 100);
    const filled = Math.floor((percent / 100) * length);
    const empty = length - filled;
    return `▰`.repeat(filled) + `▱`.repeat(empty) + ` ${Math.floor(percent)}%`;
}

// ============================================================================
// 4. 🛡️ RATE LIMITING SYSTEM
// ============================================================================

class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 30) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.requests = new Map();
    }

    isRateLimited(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        
        // Clean old requests
        const validRequests = userRequests.filter(timestamp => now - timestamp < this.windowMs);
        
        if (validRequests.length >= this.maxRequests) {
            return true;
        }
        
        validRequests.push(now);
        this.requests.set(userId, validRequests);
        return false;
    }

    getRemainingRequests(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        const validRequests = userRequests.filter(timestamp => now - timestamp < this.windowMs);
        return Math.max(0, this.maxRequests - validRequests.length);
    }

    cleanup() {
        const now = Date.now();
        for (const [userId, timestamps] of this.requests.entries()) {
            const valid = timestamps.filter(t => now - t < this.windowMs);
            if (valid.length === 0) {
                this.requests.delete(userId);
            } else {
                this.requests.set(userId, valid);
            }
        }
    }
}

const rateLimiter = new RateLimiter(APP_CONFIG.rateLimitWindow, APP_CONFIG.rateLimitMax);

// Cleanup rate limiter every hour
setInterval(() => rateLimiter.cleanup(), 3600000);

// ============================================================================
// 5. 💾 ADVANCED CACHE SYSTEM WITH WARMUP
// ============================================================================

class UserCache {
    constructor() {
        this.cache = new Map();
        this.dirtyUsers = new Set();
        this.isShuttingDown = false;
        this.isWarmingUp = false;
    }

    async warmup(db, limit = 100) {
        if (!db || this.isWarmingUp) return;
        this.isWarmingUp = true;
        console.log('🔥 Warming up cache...');
        
        try {
            const snapshot = await db.collection('users').limit(limit).get();
            let loaded = 0;
            snapshot.forEach(doc => {
                this.cache.set(doc.id, { ...doc.data(), lastAccess: Date.now(), cachedAt: Date.now() });
                loaded++;
            });
            console.log(`✅ Cache warmed up with ${loaded} users`);
        } catch (error) {
            console.error('Cache warmup error:', error.message);
        } finally {
            this.isWarmingUp = false;
        }
    }

    get(userId) {
        const user = this.cache.get(userId);
        if (user) {
            user.lastAccess = Date.now();
            return { ...user };
        }
        return null;
    }

    set(userId, userData) {
        const user = { ...userData, lastAccess: Date.now(), cachedAt: Date.now() };
        this.cache.set(userId, user);
        return user;
    }

    update(userId, updates) {
        const existing = this.cache.get(userId);
        if (existing) {
            const updated = { ...existing, ...updates, lastAccess: Date.now() };
            this.cache.set(userId, updated);
            this.dirtyUsers.add(userId);
            return updated;
        }
        return null;
    }

    async updateImmediate(userId, updates, db) {
        const updated = this.update(userId, updates);
        if (updated && db) {
            try {
                await db.collection('users').doc(userId).update(updates);
                this.dirtyUsers.delete(userId);
                console.log(`⚡ Immediate sync: ${userId}`);
            } catch (error) {
                console.error(`Immediate sync failed:`, error.message);
            }
        }
        return updated;
    }

    async syncAllToFirebase(db) {
        if (!db) return;
        const dirtyArray = Array.from(this.dirtyUsers);
        if (dirtyArray.length === 0) return;
        
        console.log(`🔄 Syncing ${dirtyArray.length} users...`);
        let success = 0;
        
        for (const userId of dirtyArray) {
            const user = this.cache.get(userId);
            if (user) {
                try {
                    const { lastAccess, cachedAt, ...userToSave } = user;
                    await db.collection('users').doc(userId).set(userToSave, { merge: true });
                    success++;
                } catch (error) {
                    console.error(`Failed to sync ${userId}:`, error.message);
                }
            }
        }
        
        this.dirtyUsers.clear();
        console.log(`✅ Synced ${success} users`);
    }

    getStats() {
        return { cacheSize: this.cache.size, dirtyCount: this.dirtyUsers.size };
    }
}

const userCache = new UserCache();

// ============================================================================
// 6. 🔥 FIREBASE SETUP
// ============================================================================

const admin = require('firebase-admin');
let db = null;

if (serviceAccount) {
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        db = admin.firestore();
        console.log('🔥 Firebase initialized');
        
        // Warmup cache
        setTimeout(() => userCache.warmup(db, 500), 5000);
        
        // Periodic sync
        setInterval(async () => {
            await userCache.syncAllToFirebase(db);
        }, APP_CONFIG.syncInterval);
        
    } catch (error) {
        console.error('❌ Firebase init error:', error.message);
    }
}

function checkDb() {
    return db !== null;
}

// ============================================================================
// 7. 📊 USER MANAGEMENT WITH CACHE
// ============================================================================

async function getUser(userId) {
    let user = userCache.get(userId);
    if (user) return user;
    
    if (!checkDb()) return null;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            return userCache.set(userId, userDoc.data());
        }
        return null;
    } catch (error) {
        console.error('Get user error:', error.message);
        return null;
    }
}

async function getOrCreateUser(userId, userName, username, referredBy = null) {
    let user = userCache.get(userId);
    if (user) return user;
    
    if (!checkDb()) return null;
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            return userCache.set(userId, userDoc.data());
        }
        
        const newUser = {
            userId,
            userName: userName || 'Axion User',
            userUsername: username || '',
            balance: 0,
            usdtBalance: 0,
            totalEarned: 0,
            inviteCount: 0,
            referredBy: referredBy || null,
            referrals: [],
            walletAddress: null,
            tonWallet: null,
            tonPaid: false,
            withdrawBlocked: false,
            isVerified: false,
            verifiedAt: null,
            claimedMilestones: [],
            transactions: [],
            withdrawals: [],
            createdAt: new Date().toISOString(),
            notifications: [{
                id: Date.now().toString(),
                type: 'welcome',
                title: '🎉 Welcome to Axion AI!',
                message: `Complete verification to get ${APP_CONFIG.welcomeBonus} AXC bonus!`,
                read: false,
                timestamp: new Date().toISOString()
            }]
        };
        
        await userRef.set(newUser);
        console.log(`✅ New user: ${userId} (${userName})`);
        return userCache.set(userId, newUser);
        
    } catch (error) {
        console.error('Create user error:', error.message);
        return null;
    }
}

async function updateUser(userId, updates, immediate = false) {
    if (immediate) {
        return await userCache.updateImmediate(userId, updates, db);
    }
    return userCache.update(userId, updates);
}

async function addTransaction(userId, transaction) {
    const user = await getUser(userId);
    if (!user) return;
    
    const transactions = user.transactions || [];
    transactions.unshift({
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 8),
        ...transaction,
        timestamp: new Date().toISOString()
    });
    
    // Keep last 100 transactions
    const limited = transactions.slice(0, 100);
    await updateUser(userId, { transactions: limited }, true);
}

// ============================================================================
// 8. 🔍 CHANNEL VERIFICATION
// ============================================================================

const channelStatusCache = new Map();

async function verifyChannelMembership(userId, channelUsername, forceRefresh = false) {
    const cacheKey = `${userId}_${channelUsername}`;
    
    if (!forceRefresh) {
        const cached = channelStatusCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 30000) {
            return cached.isMember;
        }
    }
    
    try {
        const cleanChannel = channelUsername.replace('@', '').trim();
        const chatMember = await bot.telegram.getChatMember(`@${cleanChannel}`, parseInt(userId));
        const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
        
        channelStatusCache.set(cacheKey, { isMember, timestamp: Date.now() });
        return isMember;
        
    } catch (error) {
        console.log(`⚠️ Channel check failed for ${channelUsername}:`, error.code);
        return false;
    }
}

async function getMissingChannels(userId, forceRefresh = false) {
    const results = await Promise.all(REQUIRED_CHANNELS.map(async (channel) => ({
        channel,
        isMember: await verifyChannelMembership(userId, channel.username, forceRefresh)
    })));
    return results.filter(r => !r.isMember).map(r => r.channel);
}

async function isUserVerifiedInChannels(userId) {
    const missing = await getMissingChannels(userId, true);
    return missing.length === 0;
}

// ============================================================================
// 9. 🔗 REFERRAL SYSTEM
// ============================================================================

async function processReferralAfterVerification(referrerId, newUserId, newUserName) {
    if (!checkDb()) return false;
    if (referrerId === newUserId) return false;

    try {
        const referrer = await getUser(referrerId);
        if (!referrer) return false;

        const currentReferrals = referrer.referrals || [];
        if (currentReferrals.includes(newUserId)) return false;

        await updateUser(referrerId, {
            referrals: [...currentReferrals, newUserId],
            inviteCount: (referrer.inviteCount || 0) + 1,
            balance: (referrer.balance || 0) + APP_CONFIG.referralBonus,
            totalEarned: (referrer.totalEarned || 0) + APP_CONFIG.referralBonus,
            lastReferralAt: new Date().toISOString()
        }, true);
        
        // Add transaction record
        await addTransaction(referrerId, {
            type: 'referral',
            amount: APP_CONFIG.referralBonus,
            currency: 'AXC',
            status: 'completed',
            description: `Referral bonus for ${newUserName}`
        });

        const newInviteCount = (referrer.inviteCount || 0) + 1;
        
        const message = formatProfessionalMessage(
            '🎉 NEW REFERRAL!',
            `👤 <b>${escapeHtml(newUserName)}</b> joined and verified!\n\n💰 <b>+${APP_CONFIG.referralBonus} AXC</b>\n\n👥 <b>Total Referrals:</b> ${newInviteCount}`,
            `💡 Keep inviting to unlock milestone rewards!`
        );
        
        await bot.telegram.sendMessage(referrerId, message, { parse_mode: 'HTML' }).catch(() => {});
        await checkMilestoneAchievement(referrerId);
        
        return true;
    } catch (error) {
        console.error('Referral error:', error.message);
        return false;
    }
}

async function checkMilestoneAchievement(userId) {
    try {
        const user = await getUser(userId);
        if (!user) return;
        
        const currentInvites = user.inviteCount || 0;
        const claimed = user.claimedMilestones || [];

        for (const milestone of REFERRAL_MILESTONES) {
            if (currentInvites >= milestone.count && !claimed.includes(milestone.count)) {
                await updateUser(userId, {
                    usdtBalance: (user.usdtBalance || 0) + milestone.reward,
                    claimedMilestones: [...claimed, milestone.count]
                }, true);
                
                // Add transaction record
                await addTransaction(userId, {
                    type: 'milestone',
                    amount: milestone.reward,
                    currency: 'USDT',
                    status: 'completed',
                    description: `${milestone.name} milestone: ${milestone.count} referrals`
                });

                const message = formatProfessionalMessage(
                    '🏆 MILESTONE UNLOCKED!',
                    `🎉 ${milestone.name}\n👥 ${milestone.count} Referrals\n💰 +${milestone.reward} USDT Added!`,
                    `✨ You're on fire! Keep going!`
                );
                await bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' }).catch(() => {});
            }
        }
    } catch (error) {
        console.error('Milestone error:', error.message);
    }
}

// ============================================================================
// 10. 💸 WITHDRAWAL SYSTEM
// ============================================================================

const withdrawCooldownTracker = new Map();
const withdrawSessions = new Map();

// Session cleanup every hour
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of withdrawSessions.entries()) {
        if (session.createdAt && (now - session.createdAt) > APP_CONFIG.sessionTTL) {
            withdrawSessions.delete(userId);
        }
    }
}, APP_CONFIG.sessionCleanupInterval);

async function createWithdrawalRequest(userId, amount, currency, walletAddress) {
    if (!checkDb()) return { success: false, error: 'Database error' };

    try {
        const user = await getUser(userId);
        if (!user) return { success: false, error: 'User not found' };

        const lastWithdraw = withdrawCooldownTracker.get(userId);
        if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
            const hours = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
            return { success: false, error: `Please wait ${hours} hour(s) before next withdrawal` };
        }

        if (currency === 'AXC') {
            if (amount < APP_CONFIG.minWithdrawAXC) return { success: false, error: `Minimum: ${APP_CONFIG.minWithdrawAXC} AXC` };
            if (amount > APP_CONFIG.maxWithdrawAXC) return { success: false, error: `Maximum: ${APP_CONFIG.maxWithdrawAXC} AXC` };
            if (amount > (user.balance || 0)) return { success: false, error: 'Insufficient AXC balance' };
        } else {
            if (amount < APP_CONFIG.minWithdrawUSDT) return { success: false, error: `Minimum: $${APP_CONFIG.minWithdrawUSDT}` };
            if (amount > APP_CONFIG.maxWithdrawUSDT) return { success: false, error: `Maximum: $${APP_CONFIG.maxWithdrawUSDT}` };
            if (amount > (user.usdtBalance || 0)) return { success: false, error: 'Insufficient USDT balance' };
        }

        if (currency === 'AXC') {
            await updateUser(userId, { balance: (user.balance || 0) - amount }, true);
        } else {
            await updateUser(userId, { usdtBalance: (user.usdtBalance || 0) - amount }, true);
        }

        withdrawCooldownTracker.set(userId, Date.now());

        const withdrawalRef = db.collection('withdrawals').doc();
        const requestId = withdrawalRef.id;

        await withdrawalRef.set({
            id: requestId,
            userId,
            userName: user.userName,
            amount,
            currency,
            walletAddress,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        // Add transaction record
        await addTransaction(userId, {
            type: 'withdrawal',
            amount: amount,
            currency: currency,
            status: 'pending',
            description: `Withdrawal request to ${walletAddress.substring(0, 10)}...`
        });

        const userWithdrawals = user.withdrawals || [];
        userWithdrawals.push({ id: requestId, amount, currency, status: 'pending', createdAt: new Date().toISOString() });
        await updateUser(userId, { withdrawals: userWithdrawals }, true);

        if (WITHDRAWAL_GROUP_ID) {
            const message = formatProfessionalMessage(
                '💸 NEW WITHDRAWAL REQUEST',
                `👤 <b>User:</b> ${escapeHtml(user.userName)}\n🆔 <b>ID:</b> ${userId}\n💰 <b>Amount:</b> ${currency === 'AXC' ? amount + ' AXC' : '$' + amount}\n💳 <b>Wallet:</b> <code>${walletAddress}</code>\n🆔 <b>Request:</b> <code>${requestId}</code>`,
                `👇 Click Approve or Reject`
            );
            const keyboard = { inline_keyboard: [[{ text: '✅ APPROVE', callback_data: `approve_wd_${requestId}` }, { text: '❌ REJECT', callback_data: `reject_wd_${requestId}` }]] };
            await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, message, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
        }

        return { success: true, requestId };
    } catch (error) {
        console.error('Withdrawal error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// 11. 🎨 KEYBOARDS
// ============================================================================

function getMainKeyboard(userId) {
    const keyboard = [
        ['💰 BALANCE', '🔗 REFERRAL'],
        ['💸 WITHDRAW', '🔄 SWAP STATION'],
        ['📜 HISTORY', '⚙️ SETTINGS']
    ];
    if (isAdmin(userId)) keyboard.push(['👑 ADMIN PANEL']);
    return { keyboard, resize_keyboard: true, persistent: true };
}

function getChannelsKeyboard() {
    const keyboard = [];
    for (const channel of REQUIRED_CHANNELS) {
        keyboard.push([{ text: `📢 ${channel.name}`, url: `https://t.me/${channel.username.substring(1)}` }]);
    }
    keyboard.push([{ text: '✅ VERIFY MEMBERSHIP', callback_data: 'verify_membership' }]);
    return { inline_keyboard: keyboard };
}

function getWithdrawAmountKeyboard(currency, minAmount, maxAmount, balance) {
    const suggestions = [];
    if (currency === 'AXC') {
        suggestions.push(
            { text: `${minAmount} AXC (Min)`, callback_data: `withdraw_amount_${minAmount}` },
            { text: `${Math.floor(balance / 4)} AXC (25%)`, callback_data: `withdraw_amount_${Math.floor(balance / 4)}` },
            { text: `${Math.floor(balance / 2)} AXC (50%)`, callback_data: `withdraw_amount_${Math.floor(balance / 2)}` },
            { text: `${balance} AXC (100%)`, callback_data: `withdraw_amount_${balance}` }
        );
    } else {
        suggestions.push(
            { text: `${minAmount} USDT (Min)`, callback_data: `withdraw_amount_${minAmount}` },
            { text: `${Math.floor(balance / 4)} USDT (25%)`, callback_data: `withdraw_amount_${Math.floor(balance / 4)}` },
            { text: `${Math.floor(balance / 2)} USDT (50%)`, callback_data: `withdraw_amount_${Math.floor(balance / 2)}` },
            { text: `${balance} USDT (100%)`, callback_data: `withdraw_amount_${balance}` }
        );
    }
    return {
        inline_keyboard: [
            suggestions.slice(0, 2),
            suggestions.slice(2, 4),
            [{ text: '✏️ ENTER CUSTOM AMOUNT', callback_data: 'withdraw_custom_amount' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_withdraw' }]
        ]
    };
}

function getAdminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '📊 STATISTICS', callback_data: 'admin_stats' }],
            [{ text: '💸 PENDING WITHDRAWALS', callback_data: 'admin_pending' }],
            [{ text: '👥 TOTAL USERS', callback_data: 'admin_users' }],
            [{ text: '🔍 SEARCH USER', callback_data: 'admin_search' }],
            [{ text: '💰 ADD BALANCE', callback_data: 'admin_add_balance' }],
            [{ text: '➖ REMOVE BALANCE', callback_data: 'admin_remove_balance' }],
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }],
            [{ text: '🔄 SYNC CACHE', callback_data: 'admin_sync_cache' }],
            [{ text: '🚪 LOGOUT', callback_data: 'admin_logout' }]
        ]
    };
}

function getCancelKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '❌ CANCEL', callback_data: 'cancel_action' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

const userLastMessages = new Map();

async function sendAndTrack(ctx, message, keyboard = null) {
    // Rate limiting check
    if (rateLimiter.isRateLimited(ctx.from.id.toString())) {
        const remaining = rateLimiter.getRemainingRequests(ctx.from.id.toString());
        await ctx.reply(`⚠️ <b>Rate limit exceeded!</b>\n\nPlease slow down. You have ${remaining} requests remaining this minute.`, { parse_mode: 'HTML' });
        return null;
    }
    
    try {
        const lastMsg = userLastMessages.get(ctx.from.id);
        if (lastMsg?.id) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, lastMsg.id); } catch (e) {}
        }
        const opts = { parse_mode: 'HTML', disable_web_page_preview: true };
        if (keyboard) opts.reply_markup = keyboard;
        const sentMsg = await ctx.reply(message, opts);
        userLastMessages.set(ctx.from.id, { id: sentMsg.message_id, timestamp: Date.now() });
        return sentMsg;
    } catch (error) {
        return await ctx.reply(message, { parse_mode: 'HTML' });
    }
}

// ============================================================================
// 12. 🤖 BOT COMMANDS & HANDLERS
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);

bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
bot.telegram.getMe().then((botInfo) => { BOT_USERNAME = botInfo.username; console.log(`🤖 Bot: @${BOT_USERNAME}`); }).catch(() => {});

// ==================== START COMMAND ====================
bot.start(async (ctx) => {
    const refCode = ctx.startPayload;
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name || 'Axion User';
    const userUsername = ctx.from.username || '';

    if (!checkDb()) {
        await ctx.reply('⚠️ Database unavailable. Please try again later.');
        return;
    }

    let user = await getOrCreateUser(userId, userName, userUsername, refCode);
    if (!user) return;

    if (refCode && refCode !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: refCode }, true);
    }

    const isVerified = await isUserVerifiedInChannels(userId);
    
    if (isVerified && !user.isVerified) {
        await updateUser(userId, { isVerified: true, verifiedAt: new Date().toISOString() }, true);
        
        if (user.balance === 0) {
            await updateUser(userId, { balance: APP_CONFIG.welcomeBonus, totalEarned: APP_CONFIG.welcomeBonus }, true);
            
            // Add welcome bonus transaction
            await addTransaction(userId, {
                type: 'welcome_bonus',
                amount: APP_CONFIG.welcomeBonus,
                currency: 'AXC',
                status: 'completed',
                description: 'Welcome bonus for joining Axion AI'
            });
            
            if (user.referredBy) {
                await processReferralAfterVerification(user.referredBy, userId, user.userName);
            }
        }
        
        const updatedUser = await getUser(userId);
        const message = formatProfessionalMessage(
            '✅ VERIFICATION COMPLETE!',
            `Welcome to Axion AI, ${escapeHtml(userName)}!\n\n💰 Balance: ${formatAXC(updatedUser?.balance || 0)}\n💵 USDT: ${formatUSD(updatedUser?.usdtBalance || 0)}\n👥 Referrals: ${updatedUser?.inviteCount || 0}`,
            `Use the buttons below to manage your account.`
        );
        await sendAndTrack(ctx, message, getMainKeyboard(userId));
        return;
    }
    
    if (isVerified && user.isVerified) {
        const message = formatProfessionalMessage(
            `✨ Welcome Back, ${escapeHtml(userName)} ✨`,
            `💰 Balance: ${formatAXC(user.balance || 0)}\n💵 USDT: ${formatUSD(user.usdtBalance || 0)}\n👥 Referrals: ${user.inviteCount || 0}`,
            `Select an option below:`
        );
        await sendAndTrack(ctx, message, getMainKeyboard(userId));
        return;
    }
    
    const message = formatProfessionalMessage(
        '🌟 WELCOME TO AXION AI 🌟',
        `🎁 Get ${APP_CONFIG.welcomeBonus} AXC (~$${(APP_CONFIG.welcomeBonus * APP_CONFIG.axcPrice).toFixed(2)}) after verification\n👥 Get ${APP_CONFIG.referralBonus} AXC per referral\n💎 Min Withdrawal: ${APP_CONFIG.minWithdrawAXC} AXC`,
        `Please join our channels below and click VERIFY:`
    );
    await sendAndTrack(ctx, message, getChannelsKeyboard());
});

// ==================== BALANCE ====================
bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getUser(userId);
    if (!user) return;
    
    const progress = Math.min(100, ((user.balance || 0) / APP_CONFIG.minWithdrawAXC) * 100);
    const progressBar = getProgressBar(user.balance || 0, APP_CONFIG.minWithdrawAXC);
    
    const message = formatProfessionalMessage(
        '📊 YOUR BALANCE',
        `💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n🎁 <b>Total Earned:</b> ${formatAXC(user.totalEarned || 0)}\n\n<b>Progress to Withdrawal:</b>\n${progressBar}`,
        `Use the buttons below to manage your funds.`
    );
    await sendAndTrack(ctx, message, getMainKeyboard(userId));
});

// ==================== REFERRAL ====================
bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getUser(userId);
    if (!user) return;
    
    const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    
    let milestonesText = '';
    const claimed = user.claimedMilestones || [];
    for (const milestone of REFERRAL_MILESTONES) {
        const status = claimed.includes(milestone.count) ? '✅' : (user.inviteCount >= milestone.count ? '🎯' : `🔒 ${milestone.count - user.inviteCount} left`);
        milestonesText += `• ${milestone.name} (${milestone.count}) → $${milestone.reward} ${status}\n`;
    }
    
    const message = formatProfessionalMessage(
        '🔗 YOUR REFERRAL LINK',
        `<code>${link}</code>\n\n📊 <b>Stats:</b>\n👥 Total Referrals: ${user.inviteCount || 0}\n🎁 Earned: ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}\n\n🏆 <b>Milestones:</b>\n${milestonesText}`,
        `Share your link and earn rewards!`
    );
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=Join%20Axion%20AI%20and%20earn%20crypto!` }],
            [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]
        ]
    };
    await sendAndTrack(ctx, message, keyboard);
});

// ==================== HISTORY ====================
bot.hears('📜 HISTORY', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getUser(userId);
    if (!user) return;
    
    const history = formatTransactionHistory(user.transactions || []);
    
    const message = formatProfessionalMessage(
        '📜 TRANSACTION HISTORY',
        `${history}`,
        `Showing last 20 transactions.`
    );
    await sendAndTrack(ctx, message, getMainKeyboard(userId));
});

// ==================== WITHDRAW ====================
bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getUser(userId);
    if (!user) return;
    
    const isVerified = await isUserVerifiedInChannels(userId);
    if (!isVerified) {
        const missing = await getMissingChannels(userId);
        let list = '';
        for (const ch of missing) list += `📢 ${ch.name}\n`;
        const message = formatProfessionalMessage(
            '⚠️ VERIFICATION REQUIRED',
            `You are not a member of all required channels.\n\n<b>Missing channels:</b>\n${list}`,
            `Please join all channels and click VERIFY.`
        );
        await sendAndTrack(ctx, message, getChannelsKeyboard());
        return;
    }
    
    if (!user.isVerified) {
        await updateUser(userId, { isVerified: true, verifiedAt: new Date().toISOString() }, true);
        if (user.balance === 0) {
            await updateUser(userId, { balance: APP_CONFIG.welcomeBonus, totalEarned: APP_CONFIG.welcomeBonus }, true);
            await addTransaction(userId, {
                type: 'welcome_bonus',
                amount: APP_CONFIG.welcomeBonus,
                currency: 'AXC',
                status: 'completed',
                description: 'Welcome bonus'
            });
            if (user.referredBy) {
                await processReferralAfterVerification(user.referredBy, userId, user.userName);
            }
        }
    }
    
    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        const message = formatProfessionalMessage('⏳ COOLDOWN ACTIVE', `You can request withdrawal once every 24 hours.\nPlease wait ${hoursLeft} hour(s).`);
        await sendAndTrack(ctx, message, getMainKeyboard(userId));
        return;
    }
    
    if (!user.walletAddress) {
        const message = formatProfessionalMessage(
            '💳 SETUP WITHDRAWAL WALLET',
            `Please send your BEP20 wallet address to continue.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
            `Send your address now:`
        );
        await sendAndTrack(ctx, message, getCancelKeyboard());
        withdrawSessions.set(userId, { step: 'waitingForWallet', createdAt: Date.now() });
        return;
    }
    
    const message = formatProfessionalMessage(
        '💸 WITHDRAWAL',
        `💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...${user.walletAddress.substring(38)}</code>`,
        `Choose currency to withdraw:`
    );
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '💰 WITHDRAW AXC', callback_data: 'withdraw_axc' }],
            [{ text: '💵 WITHDRAW USDT', callback_data: 'withdraw_usdt' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]
        ]
    };
    await sendAndTrack(ctx, message, keyboard);
});

// ==================== WITHDRAW CURRENCY SELECTION ====================
bot.action('withdraw_axc', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const user = await getUser(userId);
    const balance = user?.balance || 0;
    
    if (balance < APP_CONFIG.minWithdrawAXC) {
        await ctx.reply(formatProfessionalMessage('❌ INSUFFICIENT BALANCE', `Minimum withdrawal: ${APP_CONFIG.minWithdrawAXC} AXC\nYour balance: ${formatAXC(balance)}`));
        return;
    }
    
    withdrawSessions.set(userId, { currency: 'AXC', step: 'waitingForAmount', createdAt: Date.now() });
    
    const message = formatProfessionalMessage(
        '💰 ENTER WITHDRAWAL AMOUNT (AXC)',
        `💎 <b>Your Balance:</b> ${formatAXC(balance)}\n📉 <b>Minimum:</b> ${APP_CONFIG.minWithdrawAXC} AXC\n📈 <b>Maximum:</b> ${APP_CONFIG.maxWithdrawAXC} AXC\n\n<i>Select an amount or send a custom number:</i>`,
        `⚠️ Amount will be deducted after confirmation.`
    );
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getWithdrawAmountKeyboard('AXC', APP_CONFIG.minWithdrawAXC, APP_CONFIG.maxWithdrawAXC, balance) });
});

bot.action('withdraw_usdt', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const user = await getUser(userId);
    const balance = user?.usdtBalance || 0;
    
    if (balance < APP_CONFIG.minWithdrawUSDT) {
        await ctx.reply(formatProfessionalMessage('❌ INSUFFICIENT BALANCE', `Minimum withdrawal: $${APP_CONFIG.minWithdrawUSDT}\nYour balance: ${formatUSD(balance)}`));
        return;
    }
    
    withdrawSessions.set(userId, { currency: 'USDT', step: 'waitingForAmount', createdAt: Date.now() });
    
    const message = formatProfessionalMessage(
        '💵 ENTER WITHDRAWAL AMOUNT (USDT)',
        `💎 <b>Your Balance:</b> ${formatUSD(balance)}\n📉 <b>Minimum:</b> $${APP_CONFIG.minWithdrawUSDT}\n📈 <b>Maximum:</b> $${APP_CONFIG.maxWithdrawUSDT}\n\n<i>Select an amount or send a custom number:</i>`,
        `⚠️ Amount will be deducted after confirmation.`
    );
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getWithdrawAmountKeyboard('USDT', APP_CONFIG.minWithdrawUSDT, APP_CONFIG.maxWithdrawUSDT, balance) });
});

// ==================== WITHDRAW AMOUNT SELECTION ====================
bot.action(/withdraw_amount_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const amount = parseFloat(ctx.match[1]);
    await ctx.answerCbQuery();
    
    const session = withdrawSessions.get(userId);
    if (!session || session.step !== 'waitingForAmount') {
        await ctx.reply('❌ Session expired. Please start over.');
        return;
    }
    
    const user = await getUser(userId);
    const balance = session.currency === 'AXC' ? (user?.balance || 0) : (user?.usdtBalance || 0);
    const minAmount = session.currency === 'AXC' ? APP_CONFIG.minWithdrawAXC : APP_CONFIG.minWithdrawUSDT;
    const maxAmount = session.currency === 'AXC' ? APP_CONFIG.maxWithdrawAXC : APP_CONFIG.maxWithdrawUSDT;
    
    if (amount < minAmount || amount > maxAmount || amount > balance) {
        await ctx.reply(formatProfessionalMessage('❌ INVALID AMOUNT', `Amount must be between ${minAmount} ${session.currency === 'AXC' ? 'AXC' : 'USDT'} and ${maxAmount} ${session.currency === 'AXC' ? 'AXC' : 'USDT'}\nYour balance: ${session.currency === 'AXC' ? formatAXC(balance) : formatUSD(balance)}`));
        return;
    }
    
    withdrawSessions.set(userId, { ...session, amount, step: 'confirmWithdraw' });
    
    const message = formatProfessionalMessage(
        '✅ CONFIRM WITHDRAWAL',
        `💰 <b>Currency:</b> ${session.currency}\n💵 <b>Amount:</b> ${session.currency === 'AXC' ? formatAXC(amount) : formatUSD(amount)}\n💳 <b>Wallet:</b> <code>${user?.walletAddress?.substring(0, 10)}...${user?.walletAddress?.substring(38)}</code>`,
        `⚠️ Click CONFIRM to submit your request.`
    );
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw_final' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_withdraw' }]
        ]
    };
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
});

bot.action('withdraw_custom_amount', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const session = withdrawSessions.get(userId);
    if (!session) return;
    
    withdrawSessions.set(userId, { ...session, step: 'waitingForCustomAmount' });
    await ctx.reply(formatProfessionalMessage('✏️ CUSTOM AMOUNT', 'Please send the amount you wish to withdraw as a number.\n\nExample: 500', 'Send a number now:'));
});

bot.action('confirm_withdraw_final', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = withdrawSessions.get(userId);
    await ctx.answerCbQuery();
    
    if (!session?.amount) {
        await ctx.reply('❌ Session expired. Please start over.');
        return;
    }
    
    const user = await getUser(userId);
    if (!user) return;
    
    const isVerified = await isUserVerifiedInChannels(userId);
    if (!isVerified) {
        await ctx.reply('⚠️ You left one or more required channels. Please re-verify.');
        return;
    }
    
    const result = await createWithdrawalRequest(userId, session.amount, session.currency, user.walletAddress);
    
    if (result.success) {
        const message = formatProfessionalMessage(
            '✅ WITHDRAWAL SUBMITTED!',
            `💰 Amount: ${session.currency === 'AXC' ? formatAXC(session.amount) : formatUSD(session.amount)}\n⏳ Processing Time: 24-48 hours\n🆔 Request ID: <code>${result.requestId}</code>`,
            `You will be notified once processed.`
        );
        await ctx.reply(message, { parse_mode: 'HTML' });
    } else {
        await ctx.reply(formatProfessionalMessage('❌ WITHDRAWAL FAILED', result.error));
    }
    
    withdrawSessions.delete(userId);
});

bot.action('back_to_withdraw', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    withdrawSessions.delete(userId);
    
    const user = await getUser(userId);
    const message = formatProfessionalMessage('💸 WITHDRAWAL', `💰 AXC: ${formatAXC(user?.balance || 0)}\n💵 USDT: ${formatUSD(user?.usdtBalance || 0)}`, `Choose currency:`);
    const keyboard = { inline_keyboard: [[{ text: '💰 AXC', callback_data: 'withdraw_axc' }, { text: '💵 USDT', callback_data: 'withdraw_usdt' }], [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]] };
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
});

// ==================== VERIFY MEMBERSHIP ====================
bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery('🔍 Checking channels...');
    
    console.log(`🔍 Verifying channels for user ${userId}...`);
    
    const missing = await getMissingChannels(userId, true);
    
    if (missing.length > 0) {
        let list = '';
        const keyboard = { inline_keyboard: [] };
        
        for (const ch of missing) {
            list += `📢 ${ch.name}\n`;
            keyboard.inline_keyboard.push([{ text: `📢 Join ${ch.name}`, url: `https://t.me/${ch.username.substring(1)}` }]);
        }
        keyboard.inline_keyboard.push([{ text: '🔄 TRY AGAIN', callback_data: 'verify_membership' }]);
        keyboard.inline_keyboard.push([{ text: '🔙 BACK', callback_data: 'back_to_menu' }]);
        
        const message = formatProfessionalMessage(
            '⚠️ VERIFICATION FAILED',
            `You are not a member of:\n\n${list}\n\nPlease join all channels and try again.`,
            `After joining, click TRY AGAIN.`
        );
        await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
        return;
    }
    
    const user = await getUser(userId);
    const wasVerified = user?.isVerified || false;
    
    await updateUser(userId, {
        isVerified: true,
        verifiedAt: new Date().toISOString()
    }, true);
    
    if (!wasVerified && (user?.balance || 0) === 0) {
        await updateUser(userId, {
            balance: APP_CONFIG.welcomeBonus,
            totalEarned: APP_CONFIG.welcomeBonus
        }, true);
        
        await addTransaction(userId, {
            type: 'welcome_bonus',
            amount: APP_CONFIG.welcomeBonus,
            currency: 'AXC',
            status: 'completed',
            description: 'Welcome bonus for joining channels'
        });
        
        if (user?.referredBy) {
            await processReferralAfterVerification(user.referredBy, userId, user.userName);
        }
    }
    
    const updatedUser = await getUser(userId);
    
    const message = formatProfessionalMessage(
        '✅ VERIFICATION SUCCESSFUL!',
        `🎉 Welcome to Axion AI!\n\n💰 <b>Your Balance:</b> ${formatAXC(updatedUser?.balance || 0)}\n👥 <b>Referrals:</b> ${updatedUser?.inviteCount || 0}\n💵 <b>USDT Balance:</b> ${formatUSD(updatedUser?.usdtBalance || 0)}`,
        `You can now withdraw funds and invite friends!`
    );
    
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
});

// ==================== SWAP STATION ====================
bot.hears('🔄 SWAP STATION', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getUser(userId);
    if (!user) return;
    
    const isVerified = await isUserVerifiedInChannels(userId);
    if (!isVerified) {
        await ctx.reply('⚠️ Please verify channel membership first.');
        return;
    }
    
    const swapUrl = `${APP_URL}/swap.html?userId=${userId}`;
    const message = formatProfessionalMessage(
        '⚡ AXION SWAP STATION',
        `💰 AXC: ${formatAXC(user.balance || 0)}\n💵 USDT: ${formatUSD(user.usdtBalance || 0)}\n\n${user.tonPaid ? '✅ Swap Active' : '🔒 Activate with 0.05 TON'}`,
        `Click below to open:`
    );
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '🔄 OPEN SWAP STATION', web_app: { url: swapUrl } }],
            [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]
        ]
    };
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
});

// ==================== SETTINGS ====================
bot.hears('⚙️ SETTINGS', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getUser(userId);
    
    const message = formatProfessionalMessage(
        '⚙️ SETTINGS',
        `💳 <b>Wallet:</b> ${user?.walletAddress ? `<code>${user.walletAddress.substring(0, 10)}...${user.walletAddress.substring(38)}</code>` : 'Not set'}\n🔐 <b>Verified:</b> ${user?.isVerified ? '✅ Yes' : '❌ No'}\n🔄 <b>Swap:</b> ${user?.tonPaid ? '✅ Activated' : '❌ Not activated'}`,
        `Select an option:`
    );
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '💳 CHANGE WALLET', callback_data: 'change_wallet' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
    await sendAndTrack(ctx, message, keyboard);
});

bot.action('change_wallet', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const message = formatProfessionalMessage(
        '💳 CHANGE WALLET',
        `Send your new BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
        `Send your new address now:`
    );
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getCancelKeyboard() });
    withdrawSessions.set(userId, { step: 'waitingForWalletUpdate', createdAt: Date.now() });
});

// ==================== GENERAL ACTIONS ====================
bot.action('cancel_action', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    withdrawSessions.delete(userId);
    const message = formatProfessionalMessage('❌ ACTION CANCELLED', 'Returning to main menu.');
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    withdrawSessions.delete(userId);
    const user = await getUser(userId);
    const message = formatProfessionalMessage('🎯 MAIN MENU', `💰 Balance: ${formatAXC(user?.balance || 0)}`, `Select an option:`);
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
});

// ============================================================================
// 13. 👑 ADMIN PANEL
// ============================================================================

const adminSessions = new Map();

// Cleanup admin sessions
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of adminSessions.entries()) {
        if (session.createdAt && (now - session.createdAt) > APP_CONFIG.adminSessionTTL) {
            adminSessions.delete(userId);
        }
    }
}, APP_CONFIG.sessionCleanupInterval);

async function getBotStats() {
    if (!checkDb()) return { users: 0, pendingWithdrawals: 0, totalBalance: 0, totalUsdt: 0, verified: 0 };
    try {
        let totalBalance = 0, totalUsdt = 0, verified = 0;
        for (const [_, user] of userCache.cache) {
            totalBalance += user.balance || 0;
            totalUsdt += user.usdtBalance || 0;
            if (user.isVerified) verified++;
        }
        const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
        return { users: userCache.cache.size, pendingWithdrawals: pendingSnapshot.size, totalBalance, totalUsdt, verified };
    } catch (error) {
        return { users: 0, pendingWithdrawals: 0, totalBalance: 0, totalUsdt: 0, verified: 0 };
    }
}

async function getPendingWithdrawals() {
    if (!checkDb()) return [];
    try {
        const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').orderBy('createdAt', 'desc').get();
        const withdrawals = [];
        snapshot.forEach(doc => withdrawals.push({ id: doc.id, ...doc.data() }));
        return withdrawals;
    } catch (error) {
        return [];
    }
}

async function approveWithdrawal(withdrawalId, adminId) {
    if (!checkDb()) return { success: false };
    try {
        const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
        const withdrawalDoc = await withdrawalRef.get();
        if (!withdrawalDoc.exists) return { success: false, error: 'Not found' };
        const withdrawal = withdrawalDoc.data();
        if (withdrawal.status !== 'pending') return { success: false, error: `Already ${withdrawal.status}` };
        
        await withdrawalRef.update({ status: 'approved', approvedAt: new Date().toISOString(), approvedBy: adminId });
        
        // Update transaction status
        const user = await getUser(withdrawal.userId);
        const transactions = user?.transactions || [];
        const updatedTransactions = transactions.map(tx => 
            tx.type === 'withdrawal' && tx.amount === withdrawal.amount && tx.status === 'pending'
                ? { ...tx, status: 'approved', approvedAt: new Date().toISOString() }
                : tx
        );
        await updateUser(withdrawal.userId, { transactions: updatedTransactions }, true);
        
        const message = formatProfessionalMessage(
            '✅ WITHDRAWAL APPROVED',
            `💰 Amount: ${withdrawal.currency === 'AXC' ? withdrawal.amount + ' AXC' : '$' + withdrawal.amount}\n\nYour withdrawal request has been approved. Funds will be sent within 24 hours.`
        );
        await bot.telegram.sendMessage(withdrawal.userId, message, { parse_mode: 'HTML' }).catch(() => {});
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function rejectWithdrawal(withdrawalId, adminId, reason) {
    if (!checkDb()) return { success: false };
    try {
        const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
        const withdrawalDoc = await withdrawalRef.get();
        if (!withdrawalDoc.exists) return { success: false, error: 'Not found' };
        const withdrawal = withdrawalDoc.data();
        if (withdrawal.status !== 'pending') return { success: false, error: `Already ${withdrawal.status}` };
        
        if (withdrawal.currency === 'AXC') {
            const user = await getUser(withdrawal.userId);
            await updateUser(withdrawal.userId, { balance: (user?.balance || 0) + withdrawal.amount }, true);
        } else {
            const user = await getUser(withdrawal.userId);
            await updateUser(withdrawal.userId, { usdtBalance: (user?.usdtBalance || 0) + withdrawal.amount }, true);
        }
        
        await withdrawalRef.update({ status: 'rejected', rejectReason: reason, rejectedAt: new Date().toISOString(), rejectedBy: adminId });
        
        // Update transaction status
        const user = await getUser(withdrawal.userId);
        const transactions = user?.transactions || [];
        const updatedTransactions = transactions.map(tx => 
            tx.type === 'withdrawal' && tx.amount === withdrawal.amount && tx.status === 'pending'
                ? { ...tx, status: 'rejected', reason, rejectedAt: new Date().toISOString() }
                : tx
        );
        await updateUser(withdrawal.userId, { transactions: updatedTransactions }, true);
        
        const message = formatProfessionalMessage(
            '❌ WITHDRAWAL REJECTED',
            `💰 Amount: ${withdrawal.currency === 'AXC' ? withdrawal.amount + ' AXC' : '$' + withdrawal.amount}\nReason: ${reason}\n\nThe amount has been returned to your balance.`
        );
        await bot.telegram.sendMessage(withdrawal.userId, message, { parse_mode: 'HTML' }).catch(() => {});
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function broadcastToAllUsers(message) {
    let sent = 0, failed = 0;
    for (const [userId, _] of userCache.cache) {
        try {
            await bot.telegram.sendMessage(userId, formatProfessionalMessage('📢 ANNOUNCEMENT', message), { parse_mode: 'HTML' });
            sent++;
            await new Promise(r => setTimeout(r, 50));
        } catch (e) { failed++; }
    }
    return { success: true, sent, failed };
}

// ==================== ADMIN PANEL HANDLER ====================
bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ Access Denied');
        return;
    }
    
    const session = adminSessions.get(userId);
    if (session?.authenticated) {
        const stats = await getBotStats();
        const cacheStats = userCache.getStats();
        const message = formatProfessionalMessage(
            '👑 ADMIN PANEL',
            `✅ Authenticated\n\n👥 Users: ${stats.users}\n✅ Verified: ${stats.verified}\n⏳ Pending: ${stats.pendingWithdrawals}\n💰 Total AXC: ${formatAXC(stats.totalBalance)}\n💵 Total USDT: ${formatUSD(stats.totalUsdt)}\n📦 Cache: ${cacheStats.cacheSize} users`,
            `Select an option:`
        );
        await ctx.reply(message, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        return;
    }
    
    await ctx.reply(formatProfessionalMessage('🔐 ADMIN LOGIN', 'Please enter your admin password.'));
    adminSessions.set(userId, { waitingForPassword: true, createdAt: Date.now() });
});

// ==================== ADMIN ACTIONS ====================
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    const stats = await getBotStats();
    const message = formatProfessionalMessage('📊 STATISTICS', `👥 Users: ${stats.users}\n✅ Verified: ${stats.verified}\n💸 Pending: ${stats.pendingWithdrawals}\n💰 Total AXC: ${formatAXC(stats.totalBalance)}\n💵 Total USDT: ${formatUSD(stats.totalUsdt)}`);
    await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    const withdrawals = await getPendingWithdrawals();
    if (withdrawals.length === 0) {
        await ctx.reply('✅ No pending withdrawals.');
        return;
    }
    let msg = '';
    for (let i = 0; i < Math.min(withdrawals.length, 10); i++) {
        const w = withdrawals[i];
        msg += `${i + 1}. 👤 ${w.userName}\n   💰 ${w.currency === 'AXC' ? w.amount + ' AXC' : '$' + w.amount}\n   🆔 <code>${w.id.substring(0, 8)}...</code>\n\n`;
    }
    const keyboard = { inline_keyboard: [] };
    for (let i = 0; i < Math.min(withdrawals.length, 5); i++) {
        const w = withdrawals[i];
        keyboard.inline_keyboard.push([
            { text: `✅ Approve`, callback_data: `approve_wd_${w.id}` },
            { text: `❌ Reject`, callback_data: `reject_wd_${w.id}` }
        ]);
    }
    keyboard.inline_keyboard.push([{ text: '🔄 Refresh', callback_data: 'admin_pending' }, { text: '🔙 Back', callback_data: 'admin_back' }]);
    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: keyboard });
});

bot.action(/approve_wd_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const withdrawalId = ctx.match[1];
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery('✅ Approving...');
    const result = await approveWithdrawal(withdrawalId, userId);
    await ctx.reply(result.success ? `✅ Withdrawal approved!` : `❌ Error: ${result.error}`);
});

bot.action(/reject_wd_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const withdrawalId = ctx.match[1];
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    adminSessions.get(userId).step = 'awaiting_reject_reason';
    adminSessions.get(userId).withdrawalId = withdrawalId;
    await ctx.reply(`📝 Please send the reason for rejecting this withdrawal:`);
});

bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    let verified = 0, withWallet = 0;
    for (const [_, user] of userCache.cache) {
        if (user.isVerified) verified++;
        if (user.walletAddress) withWallet++;
    }
    const message = formatProfessionalMessage('👥 USERS', `📊 Total: ${userCache.cache.size}\n✅ Verified: ${verified}\n💳 With Wallet: ${withWallet}`);
    await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    adminSessions.get(userId).step = 'searching_user';
    await ctx.reply('🔍 <b>SEARCH USER</b>\n\nSend user ID or username:', { parse_mode: 'HTML' });
});

bot.action('admin_add_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    adminSessions.get(userId).step = 'adding_balance';
    await ctx.reply('💰 <b>ADD BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\nExample: <code>123456789 100 AXC</code>', { parse_mode: 'HTML' });
});

bot.action('admin_remove_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    adminSessions.get(userId).step = 'removing_balance';
    await ctx.reply('➖ <b>REMOVE BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\nExample: <code>123456789 50 AXC</code>', { parse_mode: 'HTML' });
});

bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    adminSessions.get(userId).step = 'broadcasting';
    await ctx.reply('📢 <b>BROADCAST</b>\n\nSend your message to all users:', { parse_mode: 'HTML' });
});

bot.action('admin_sync_cache', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery('🔄 Syncing...');
    await userCache.syncAllToFirebase(db);
    await ctx.reply('✅ Cache synced to Firebase!');
});

bot.action('admin_logout', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    adminSessions.delete(userId);
    await ctx.reply('🔓 Logged out successfully.');
});

bot.action('admin_back', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    const stats = await getBotStats();
    const cacheStats = userCache.getStats();
    const message = formatProfessionalMessage('👑 ADMIN PANEL', `✅ Authenticated\n\n👥 Users: ${stats.users}\n✅ Verified: ${stats.verified}\n⏳ Pending: ${stats.pendingWithdrawals}\n📦 Cache: ${cacheStats.cacheSize} users`, `Select an option:`);
    await ctx.reply(message, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
    try { await ctx.deleteMessage(); } catch(e) {}
});

// ============================================================================
// 14. 📝 TEXT MESSAGE HANDLER
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const messageText = ctx.message.text;
    
    const buttons = ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '🔄 SWAP STATION', '📜 HISTORY', '⚙️ SETTINGS', '👑 ADMIN PANEL'];
    if (buttons.includes(messageText)) return;
    if (messageText.startsWith('/')) return;
    
    // Admin session handling
    const adminSession = adminSessions.get(userId);
    
    if (adminSession?.waitingForPassword && isAdmin(userId)) {
        if (messageText === ADMIN_PASSWORD) {
            adminSessions.set(userId, { authenticated: true, createdAt: Date.now() });
            const stats = await getBotStats();
            const message = formatProfessionalMessage('✅ LOGIN SUCCESSFUL', `Welcome Admin.\n\n👥 Users: ${stats.users}\n⏳ Pending: ${stats.pendingWithdrawals}`, `Select an option:`);
            await ctx.reply(message, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        } else {
            await ctx.reply('❌ Invalid password.');
            adminSessions.delete(userId);
        }
        return;
    }
    
    if (adminSession?.step === 'awaiting_reject_reason' && isAdmin(userId)) {
        const result = await rejectWithdrawal(adminSession.withdrawalId, userId, messageText);
        await ctx.reply(result.success ? `✅ Withdrawal rejected.\nReason: ${messageText}` : `❌ Error: ${result.error}`);
        adminSessions.delete(userId);
        return;
    }
    
    if (adminSession?.step === 'broadcasting' && isAdmin(userId)) {
        await ctx.reply(`⏳ Sending broadcast to ${userCache.cache.size} users...`);
        const result = await broadcastToAllUsers(messageText);
        await ctx.reply(`✅ Broadcast sent to ${result.sent} users${result.failed > 0 ? ` (${result.failed} failed)` : ''}`);
        adminSessions.delete(userId);
        return;
    }
    
    if (adminSession?.step === 'adding_balance' && isAdmin(userId)) {
        const parts = messageText.trim().split(' ');
        if (parts.length === 3) {
            const targetUserId = parts[0];
            const amount = parseFloat(parts[1]);
            const currency = parts[2].toUpperCase();
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount.');
            } else if (currency === 'AXC') {
                const user = await getUser(targetUserId);
                await updateUser(targetUserId, { balance: (user?.balance || 0) + amount, totalEarned: (user?.totalEarned || 0) + amount }, true);
                await addTransaction(targetUserId, {
                    type: 'admin_add',
                    amount: amount,
                    currency: 'AXC',
                    status: 'completed',
                    description: `Admin added ${amount} AXC`
                });
                await ctx.reply(`✅ Added ${formatAXC(amount)} to user ${targetUserId}`);
            } else if (currency === 'USDT') {
                const user = await getUser(targetUserId);
                await updateUser(targetUserId, { usdtBalance: (user?.usdtBalance || 0) + amount }, true);
                await addTransaction(targetUserId, {
                    type: 'admin_add',
                    amount: amount,
                    currency: 'USDT',
                    status: 'completed',
                    description: `Admin added $${amount} USDT`
                });
                await ctx.reply(`✅ Added ${formatUSD(amount)} to user ${targetUserId}`);
            } else {
                await ctx.reply('❌ Invalid currency. Use AXC or USDT');
            }
        } else {
            await ctx.reply('❌ Format: USER_ID AMOUNT CURRENCY\nExample: 123456789 100 AXC');
        }
        adminSessions.delete(userId);
        return;
    }
    
    if (adminSession?.step === 'removing_balance' && isAdmin(userId)) {
        const parts = messageText.trim().split(' ');
        if (parts.length === 3) {
            const targetUserId = parts[0];
            const amount = parseFloat(parts[1]);
            const currency = parts[2].toUpperCase();
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount.');
            } else if (currency === 'AXC') {
                const user = await getUser(targetUserId);
                if ((user?.balance || 0) < amount) {
                    await ctx.reply(`❌ User balance is only ${formatAXC(user?.balance || 0)}`);
                } else {
                    await updateUser(targetUserId, { balance: (user?.balance || 0) - amount }, true);
                    await addTransaction(targetUserId, {
                        type: 'admin_remove',
                        amount: amount,
                        currency: 'AXC',
                        status: 'completed',
                        description: `Admin removed ${amount} AXC`
                    });
                    await ctx.reply(`✅ Removed ${formatAXC(amount)} from user ${targetUserId}`);
                }
            } else if (currency === 'USDT') {
                const user = await getUser(targetUserId);
                if ((user?.usdtBalance || 0) < amount) {
                    await ctx.reply(`❌ User USDT balance is only ${formatUSD(user?.usdtBalance || 0)}`);
                } else {
                    await updateUser(targetUserId, { usdtBalance: (user?.usdtBalance || 0) - amount }, true);
                    await addTransaction(targetUserId, {
                        type: 'admin_remove',
                        amount: amount,
                        currency: 'USDT',
                        status: 'completed',
                        description: `Admin removed $${amount} USDT`
                    });
                    await ctx.reply(`✅ Removed ${formatUSD(amount)} from user ${targetUserId}`);
                }
            } else {
                await ctx.reply('❌ Invalid currency. Use AXC or USDT');
            }
        } else {
            await ctx.reply('❌ Format: USER_ID AMOUNT CURRENCY\nExample: 123456789 50 AXC');
        }
        adminSessions.delete(userId);
        return;
    }
    
    if (adminSession?.step === 'searching_user' && isAdmin(userId)) {
        const searchTerm = messageText.trim();
        let user = null;
        if (searchTerm.match(/^\d+$/)) {
            user = await getUser(searchTerm);
        } else {
            for (const [_, u] of userCache.cache) {
                if (u.userName?.toLowerCase().includes(searchTerm.toLowerCase())) {
                    user = u;
                    break;
                }
            }
        }
        if (user) {
            const withdrawals = user.withdrawals || [];
            const approved = withdrawals.filter(w => w.status === 'approved').length;
            const pending = withdrawals.filter(w => w.status === 'pending').length;
            const rejected = withdrawals.filter(w => w.status === 'rejected').length;
            const message = formatProfessionalMessage('👤 USER FOUND', `🆔 ID: ${user.userId}\n👤 Name: ${escapeHtml(user.userName)}\n👥 Referrals: ${user.inviteCount || 0}\n💰 AXC: ${formatAXC(user.balance || 0)}\n💵 USDT: ${formatUSD(user.usdtBalance || 0)}\n✅ Verified: ${user.isVerified ? 'Yes' : 'No'}\n💳 Wallet: ${user.walletAddress ? user.walletAddress.substring(0, 15) + '...' : 'Not set'}\n\n📊 Withdrawals:\n   ✅ Approved: ${approved}\n   ⏳ Pending: ${pending}\n   ❌ Rejected: ${rejected}`);
            await ctx.reply(message, { parse_mode: 'HTML' });
        } else {
            await ctx.reply('❌ User not found.');
        }
        adminSessions.delete(userId);
        return;
    }
    
    // User sessions
    const session = withdrawSessions.get(userId);
    
    if (session?.step === 'waitingForWallet') {
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText }, true);
            withdrawSessions.delete(userId);
            const message = formatProfessionalMessage('✅ WALLET SAVED!', `💳 <code>${messageText}</code>\n\nYou can now withdraw funds.`);
            await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
        } else {
            await ctx.reply('❌ Invalid BEP20 address. Please send a valid wallet address starting with 0x...');
        }
        return;
    }
    
    if (session?.step === 'waitingForWalletUpdate') {
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText }, true);
            withdrawSessions.delete(userId);
            const message = formatProfessionalMessage('✅ WALLET UPDATED!', `💳 <code>${messageText}</code>`);
            await ctx.reply(message, { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
        } else {
            await ctx.reply('❌ Invalid BEP20 address.');
        }
        return;
    }
    
    if (session?.step === 'waitingForCustomAmount') {
        const amount = parseFloat(messageText);
        const user = await getUser(userId);
        const balance = session.currency === 'AXC' ? (user?.balance || 0) : (user?.usdtBalance || 0);
        const minAmount = session.currency === 'AXC' ? APP_CONFIG.minWithdrawAXC : APP_CONFIG.minWithdrawUSDT;
        const maxAmount = session.currency === 'AXC' ? APP_CONFIG.maxWithdrawAXC : APP_CONFIG.maxWithdrawUSDT;
        
        if (isNaN(amount) || amount < minAmount || amount > maxAmount || amount > balance) {
            await ctx.reply(formatProfessionalMessage('❌ INVALID AMOUNT', `Amount must be between ${minAmount} ${session.currency === 'AXC' ? 'AXC' : 'USDT'} and ${maxAmount} ${session.currency === 'AXC' ? 'AXC' : 'USDT'}\nYour balance: ${session.currency === 'AXC' ? formatAXC(balance) : formatUSD(balance)}`));
            return;
        }
        
        withdrawSessions.set(userId, { ...session, amount, step: 'confirmWithdraw' });
        
        const message = formatProfessionalMessage('✅ CONFIRM WITHDRAWAL', `💰 Currency: ${session.currency}\n💵 Amount: ${session.currency === 'AXC' ? formatAXC(amount) : formatUSD(amount)}\n💳 Wallet: <code>${user?.walletAddress?.substring(0, 10)}...${user?.walletAddress?.substring(38)}</code>`, `Click CONFIRM to submit.`);
        const keyboard = { inline_keyboard: [[{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw_final' }], [{ text: '🔙 BACK', callback_data: 'back_to_withdraw' }]] };
        await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
        return;
    }
});

// ============================================================================
// 15. 🌐 API ROUTES
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'alive', timestamp: Date.now(), totalUsers: userCache.cache.size, firebase: !!db, cache: userCache.getStats() });
});

app.get('/api/config', (req, res) => {
    res.json({
        firebaseConfig: firebaseWebConfig,
        appUrl: APP_URL,
        ownerWallet: OWNER_WALLET,
        config: {
            welcomeBonus: APP_CONFIG.welcomeBonus,
            referralBonus: APP_CONFIG.referralBonus,
            minWithdrawAXC: APP_CONFIG.minWithdrawAXC,
            minWithdrawUSDT: APP_CONFIG.minWithdrawUSDT,
            maxWithdrawAXC: APP_CONFIG.maxWithdrawAXC,
            maxWithdrawUSDT: APP_CONFIG.maxWithdrawUSDT,
            axcPrice: APP_CONFIG.axcPrice
        }
    });
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await getUser(req.params.userId);
        if (!user) return res.json({ success: false, error: 'User not found' });
        res.json({ success: true, user: {
            userId: user.userId,
            userName: user.userName,
            balance: user.balance || 0,
            usdtBalance: user.usdtBalance || 0,
            totalEarned: user.totalEarned || 0,
            inviteCount: user.inviteCount || 0,
            isVerified: user.isVerified || false,
            walletAddress: user.walletAddress || null,
            tonPaid: user.tonPaid || false,
            notifications: (user.notifications || []).slice(0, 30),
            transactions: (user.transactions || []).slice(0, 30)
        }});
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/tonconnect-manifest.json', (req, res) => {
    res.json({ url: APP_URL, name: 'Axion AI', iconUrl: `${APP_URL}/icon.png`, termsOfUseUrl: `${APP_URL}/terms`, privacyPolicyUrl: `${APP_URL}/privacy` });
});

// ============================================================================
// 16. 🚀 GRACEFUL SHUTDOWN
// ============================================================================

async function gracefulShutdown() {
    console.log('🛑 Shutting down gracefully...');
    await userCache.syncAllToFirebase(db);
    console.log('✅ All data saved. Goodbye!');
    process.exit(0);
}

process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown);

// ============================================================================
// 17. 🚀 START THE BOT
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🚀 Axion AI Bot v10.1 Started'))
    .catch(err => console.error('❌ Bot error:', err));

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                  AXION AI BOT - LEGENDARY EDITION v10.1                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  📍 Port: ${PORT}                                                              ║
║  🔥 Firebase: ${db ? '✅ Connected' : '❌ Disconnected'}                                             ║
║  👑 Admin: ${ADMIN_ID ? '✅ Configured' : '❌ Missing'}                                              ║
║  🤖 Bot: ${BOT_TOKEN ? '✅ Running' : '❌ Missing'}                                                ║
║  📦 Cache: ${userCache.getStats().cacheSize} users (${userCache.getStats().dirtyCount} dirty)                     ║
║  🛡️ Rate Limit: ${APP_CONFIG.rateLimitMax} req/${APP_CONFIG.rateLimitWindow / 1000}s                        ║
║  🎁 Welcome: ${APP_CONFIG.welcomeBonus} AXC (~$${(APP_CONFIG.welcomeBonus * APP_CONFIG.axcPrice).toFixed(2)})                    ║
║  👥 Referral: ${APP_CONFIG.referralBonus} AXC (~$${(APP_CONFIG.referralBonus * APP_CONFIG.axcPrice).toFixed(2)})                    ║
║  💎 Withdraw AXC: ${APP_CONFIG.minWithdrawAXC} - ${APP_CONFIG.maxWithdrawAXC} AXC                               ║
║  💵 Withdraw USDT: $${APP_CONFIG.minWithdrawUSDT} - $${APP_CONFIG.maxWithdrawUSDT}                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
});

// ============================================================================
// END OF FILE 🎯
// ============================================================================
