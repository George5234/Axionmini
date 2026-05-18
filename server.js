// ============================================================================
// AXION AI BOT - LEGENDARY EDITION v10.0
// ============================================================================
// نظام متكامل مع Cache-First Architecture + مزامنة دورية
// مناسب لمشاريع حقيقية برأس مال كبير
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 🔐 تحميل المتغيرات والـ Secrets
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

// تحميل Firebase Admin Key
try {
    const firebasePath = '/etc/secrets/firebase-admin-key.json';
    if (fs.existsSync(firebasePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
        console.log('✅ Firebase Admin key loaded');
    }
} catch (error) {
    console.error('❌ Firebase Admin key error:', error.message);
}

// تحميل Firebase Web Config
try {
    const configPath = '/etc/secrets/firebase-web-config.json';
    if (fs.existsSync(configPath)) {
        firebaseWebConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ Firebase Web config loaded');
    }
} catch (error) {
    console.error('❌ Firebase Web config error:', error.message);
}

// تحميل إعدادات المشرف
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

// متغيرات البيئة
BOT_TOKEN = process.env.BOT_TOKEN;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;
OWNER_WALLET = process.env.OWNER_WALLET;
APP_URL = process.env.APP_URL;

// ============================================================================
// 2. ⚙️ إعدادات التطبيق
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
    sessionTTL: 86400000,
    adminSessionTTL: 86400000,
    syncInterval: 21600000, // 6 ساعات
    cacheTTL: 3600000 // ساعة للكاش
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
// 3. 💾 نظام Cache المتقدم
// ============================================================================

class UserCache {
    constructor() {
        this.cache = new Map(); // userId -> userData
        this.dirtyUsers = new Set(); // المستخدمين الذين تم تعديلهم
        this.pendingSync = new Map(); // للتحديثات الفورية
        this.isShuttingDown = false;
    }

    // الحصول على مستخدم من الكاش (أسرع طريقة)
    get(userId) {
        const user = this.cache.get(userId);
        if (user) {
            // تحديث وقت آخر وصول
            user.lastAccess = Date.now();
            return { ...user }; // نسخة للقراءة فقط
        }
        return null;
    }

    // حفظ مستخدم في الكاش
    set(userId, userData) {
        const user = { ...userData, lastAccess: Date.now(), cachedAt: Date.now() };
        this.cache.set(userId, user);
        return user;
    }

    // تحديث مستخدم (يضاف إلى dirtyUsers للمزامنة)
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

    // تحديث فوري (للعمليات الحساسة)
    async updateImmediate(userId, updates, db) {
        const updated = this.update(userId, updates);
        if (updated && db) {
            try {
                await db.collection('users').doc(userId).update(updates);
                this.dirtyUsers.delete(userId);
                console.log(`⚡ Immediate sync: ${userId}`);
            } catch (error) {
                console.error(`Immediate sync failed for ${userId}:`, error.message);
            }
        }
        return updated;
    }

    // حذف مستخدم من الكاش
    delete(userId) {
        this.cache.delete(userId);
        this.dirtyUsers.delete(userId);
    }

    // مزامنة جميع المستخدمين المعدلين مع Firebase
    async syncAllToFirebase(db) {
        if (!db) return;
        
        const dirtyArray = Array.from(this.dirtyUsers);
        if (dirtyArray.length === 0) return;
        
        console.log(`🔄 Syncing ${dirtyArray.length} dirty users to Firebase...`);
        
        let success = 0;
        let failed = 0;
        
        for (const userId of dirtyArray) {
            const user = this.cache.get(userId);
            if (user) {
                try {
                    // إزالة الحقول المؤقتة قبل الحفظ
                    const { lastAccess, cachedAt, ...userToSave } = user;
                    await db.collection('users').doc(userId).set(userToSave, { merge: true });
                    success++;
                } catch (error) {
                    failed++;
                    console.error(`Failed to sync ${userId}:`, error.message);
                }
            }
        }
        
        this.dirtyUsers.clear();
        console.log(`✅ Sync complete: ${success} updated, ${failed} failed`);
    }

    // مزامنة مستخدم واحد
    async syncUser(userId, db) {
        if (!db || !this.dirtyUsers.has(userId)) return;
        
        const user = this.cache.get(userId);
        if (user) {
            try {
                const { lastAccess, cachedAt, ...userToSave } = user;
                await db.collection('users').doc(userId).set(userToSave, { merge: true });
                this.dirtyUsers.delete(userId);
                console.log(`✅ Synced user ${userId}`);
            } catch (error) {
                console.error(`Failed to sync ${userId}:`, error.message);
            }
        }
    }

    // الحصول على إحصائيات الكاش
    getStats() {
        return {
            cacheSize: this.cache.size,
            dirtyCount: this.dirtyUsers.size,
            pendingCount: this.pendingSync.size
        };
    }

    // تنظيف الكاش القديم
    cleanOldCache(maxAge = APP_CONFIG.cacheTTL) {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [userId, user] of this.cache.entries()) {
            if (user.lastAccess && (now - user.lastAccess) > maxAge) {
                // لا نحذف المستخدمين المعدلين
                if (!this.dirtyUsers.has(userId)) {
                    this.cache.delete(userId);
                    cleaned++;
                }
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old cache entries`);
        }
    }
}

// إنشاء مدير الكاش
const userCache = new UserCache();

// ============================================================================
// 4. 🔥 Firebase Setup
// ============================================================================

const admin = require('firebase-admin');
let db = null;

if (serviceAccount) {
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        db = admin.firestore();
        console.log('🔥 Firebase Admin SDK initialized');
        
        // تعيين المزامنة الدورية كل 6 ساعات
        setInterval(async () => {
            console.log('🔄 Running periodic sync...');
            await userCache.syncAllToFirebase(db);
        }, APP_CONFIG.syncInterval);
        
        // تنظيف الكاش كل ساعة
        setInterval(() => {
            userCache.cleanOldCache();
        }, 3600000);
        
    } catch (error) {
        console.error('❌ Firebase init error:', error.message);
    }
}

function checkDb() {
    return db !== null;
}

// ============================================================================
// 5. 📊 دوال إدارة المستخدمين (مع Cache)
// ============================================================================

// الحصول على مستخدم (من الكاش أولاً)
async function getUser(userId) {
    // 1. تحقق من الكاش
    let user = userCache.get(userId);
    if (user) {
        return user;
    }
    
    // 2. جلب من Firebase
    if (!checkDb()) return null;
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            user = userCache.set(userId, userDoc.data());
            return user;
        }
        return null;
    } catch (error) {
        console.error('Get user error:', error.message);
        return null;
    }
}

// إنشاء أو الحصول على مستخدم (مع Cache)
async function getOrCreateUser(userId, userName, username, referredBy = null) {
    // 1. تحقق من الكاش أولاً
    let user = userCache.get(userId);
    if (user) {
        return user;
    }
    
    // 2. جلب من Firebase
    if (!checkDb()) return null;
    
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            user = userCache.set(userId, userDoc.data());
            return user;
        }
        
        // إنشاء مستخدم جديد
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
            withdrawals: [],
            hasSeenChannels: false,
            createdAt: new Date().toISOString(),
            notifications: [{
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
                type: 'welcome',
                title: '🎉 Welcome to Axion AI!',
                message: `Complete verification to get ${formatAXC(APP_CONFIG.welcomeBonus)} bonus!`,
                read: false,
                timestamp: new Date().toISOString()
            }]
        };
        
        await userRef.set(newUser);
        user = userCache.set(userId, newUser);
        
        console.log(`✅ New user created: ${userId} (${userName})`);
        return user;
        
    } catch (error) {
        console.error('GetOrCreateUser error:', error.message);
        return null;
    }
}

// تحديث مستخدم (مع Cache + Dirty tracking)
async function updateUser(userId, updates, immediate = false) {
    if (immediate) {
        return await userCache.updateImmediate(userId, updates, db);
    } else {
        return userCache.update(userId, updates);
    }
}

// ============================================================================
// 6. 🔍 التحقق من القنوات (مع Cache اختياري)
// ============================================================================

// تخزين مؤقت لحالة القنوات (لمدة 5 دقائق)
const channelStatusCache = new Map();

async function verifyChannelMembership(userId, channelUsername) {
    const cacheKey = `${userId}_${channelUsername}`;
    const cached = channelStatusCache.get(cacheKey);
    
    // Cache لمدة 5 دقائق
    if (cached && (Date.now() - cached.timestamp) < 300000) {
        return cached.isMember;
    }
    
    try {
        const chatMember = await bot.telegram.getChatMember(
            `@${channelUsername.replace('@', '')}`, 
            parseInt(userId)
        );
        const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
        
        channelStatusCache.set(cacheKey, { isMember, timestamp: Date.now() });
        return isMember;
    } catch {
        return false;
    }
}

async function getMissingChannels(userId) {
    const results = await Promise.all(REQUIRED_CHANNELS.map(async (channel) => ({
        channel,
        isMember: await verifyChannelMembership(userId, channel.username)
    })));
    return results.filter(r => !r.isMember).map(r => r.channel);
}

async function isUserVerifiedInChannels(userId) {
    const missing = await getMissingChannels(userId);
    return missing.length === 0;
}

// ============================================================================
// 7. 🔗 نظام الإحالة (مع تحسينات)
// ============================================================================

async function processReferralAfterVerification(referrerId, newUserId, newUserName) {
    if (!checkDb()) return false;
    if (referrerId === newUserId) return false;

    try {
        const referrer = await getUser(referrerId);
        if (!referrer) return false;

        const currentReferrals = referrer.referrals || [];

        if (currentReferrals.includes(newUserId)) {
            return false;
        }

        // تحديث فوري (لأنها عملية حساسة)
        await updateUser(referrerId, {
            referrals: [...currentReferrals, newUserId],
            inviteCount: (referrer.inviteCount || 0) + 1,
            balance: (referrer.balance || 0) + APP_CONFIG.referralBonus,
            totalEarned: (referrer.totalEarned || 0) + APP_CONFIG.referralBonus,
            lastReferralAt: new Date().toISOString()
        }, true); // Immediate sync

        const newInviteCount = (referrer.inviteCount || 0) + 1;

        const referralMessage = formatProfessionalMessage(
            '🎉 NEW REFERRAL!',
            `👤 <b>${escapeHtml(newUserName)}</b> joined and verified!\n\n💰 <b>+${formatAXC(APP_CONFIG.referralBonus)}</b>\n\n👥 <b>Total Referrals:</b> ${newInviteCount}`,
            `💡 Keep inviting to unlock milestone rewards!`
        );

        await bot.telegram.sendMessage(referrerId, referralMessage, { parse_mode: 'HTML' }).catch(() => {});
        await checkMilestoneAchievement(referrerId);

        console.log(`✅ Referral processed: ${referrerId} → ${newUserId}`);
        return true;

    } catch (error) {
        console.error('Referral processing error:', error.message);
        return false;
    }
}

async function checkMilestoneAchievement(userId) {
    if (!checkDb()) return;
    
    try {
        const user = await getUser(userId);
        if (!user) return;
        
        const currentInvites = user.inviteCount || 0;
        const claimed = user.claimedMilestones || [];
        let updated = false;

        for (const milestone of REFERRAL_MILESTONES) {
            if (currentInvites >= milestone.count && !claimed.includes(milestone.count)) {
                await updateUser(userId, {
                    usdtBalance: (user.usdtBalance || 0) + milestone.reward,
                    claimedMilestones: [...claimed, milestone.count]
                }, true); // Immediate sync

                const milestoneMessage = formatProfessionalMessage(
                    '🏆 MILESTONE UNLOCKED!',
                    `🎉 ${milestone.name}\n👥 ${milestone.count} referrals\n💰 +${formatUSD(milestone.reward)} USDT added!`,
                    `✨ You're on fire! Keep going!`
                );

                await bot.telegram.sendMessage(userId, milestoneMessage, { parse_mode: 'HTML' }).catch(() => {});
                updated = true;
            }
        }
        
        if (updated) {
            console.log(`✅ Milestones checked for ${userId}`);
        }
    } catch (error) {
        console.error('Milestone error:', error.message);
    }
}

// ============================================================================
// 8. 💸 نظام السحب (مع إدخال المبلغ)
// ============================================================================

// تخزين جلسات السحب المؤقتة
const withdrawSessions = new Map();

async function createWithdrawalRequest(userId, amount, currency, walletAddress) {
    if (!checkDb()) return { success: false, error: 'Database error' };

    try {
        const user = await getUser(userId);
        if (!user) return { success: false, error: 'User not found' };

        // التحقق من الكول داون
        const lastWithdraw = withdrawCooldownTracker.get(userId);
        if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
            const hours = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
            return { success: false, error: `Please wait ${hours} hour(s) before next withdrawal` };
        }

        // التحقق من المبلغ
        if (currency === 'AXC') {
            if (amount < APP_CONFIG.minWithdrawAXC) {
                return { success: false, error: `Minimum withdrawal is ${formatAXC(APP_CONFIG.minWithdrawAXC)}` };
            }
            if (amount > APP_CONFIG.maxWithdrawAXC) {
                return { success: false, error: `Maximum withdrawal is ${formatAXC(APP_CONFIG.maxWithdrawAXC)}` };
            }
            if (amount > (user.balance || 0)) {
                return { success: false, error: 'Insufficient AXC balance' };
            }
        } else {
            if (amount < APP_CONFIG.minWithdrawUSDT) {
                return { success: false, error: `Minimum withdrawal is ${formatUSD(APP_CONFIG.minWithdrawUSDT)}` };
            }
            if (amount > APP_CONFIG.maxWithdrawUSDT) {
                return { success: false, error: `Maximum withdrawal is ${formatUSD(APP_CONFIG.maxWithdrawUSDT)}` };
            }
            if (amount > (user.usdtBalance || 0)) {
                return { success: false, error: 'Insufficient USDT balance' };
            }
        }

        // تحديث الرصيد (تحديث فوري)
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
            amount: amount,
            currency: currency,
            walletAddress: walletAddress,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        const userWithdrawals = user.withdrawals || [];
        userWithdrawals.push({
            id: requestId,
            amount: amount,
            currency: currency,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        await updateUser(userId, { withdrawals: userWithdrawals }, true);

        if (WITHDRAWAL_GROUP_ID) {
            const withdrawalMessage = formatProfessionalMessage(
                '💸 NEW WITHDRAWAL REQUEST',
                `👤 <b>User:</b> ${escapeHtml(user.userName)}\n🆔 <b>ID:</b> ${userId}\n💰 <b>Amount:</b> ${currency === 'AXC' ? formatAXC(amount) : formatUSD(amount)}\n💳 <b>Wallet:</b> <code>${walletAddress}</code>\n📅 <b>Request ID:</b> <code>${requestId}</code>`,
                `👇 Click Approve or Reject`
            );

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ APPROVE', callback_data: `approve_wd_${requestId}` },
                        { text: '❌ REJECT', callback_data: `reject_wd_${requestId}` }
                    ]
                ]
            };

            await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, withdrawalMessage, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
        }

        return { success: true, requestId: requestId };

    } catch (error) {
        console.error('Withdrawal error:', error);
        return { success: false, error: error.message };
    }
}

// تتبع الكول داون
const withdrawCooldownTracker = new Map();

// ============================================================================
// 9. 🎨 لوحات المفاتيح
// ============================================================================

function getMainKeyboard(userId) {
    const keyboard = [
        ['💰 BALANCE', '🔗 REFERRAL'],
        ['💸 WITHDRAW', '🔄 SWAP STATION'],
        ['⚙️ SETTINGS']
    ];
    if (isAdmin(userId)) keyboard.push(['👑 ADMIN PANEL']);
    return { keyboard, resize_keyboard: true, persistent: true };
}

function getSettingsKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '💳 CHANGE WALLET', callback_data: 'change_wallet' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

function getChannelsKeyboard() {
    const keyboard = [];
    for (const channel of REQUIRED_CHANNELS) {
        keyboard.push([{ text: `📢 ${channel.name}`, url: `https://t.me/${channel.username.substring(1)}` }]);
    }
    keyboard.push([{ text: '✅ VERIFY MEMBERSHIP', callback_data: 'verify_membership' }]);
    return { inline_keyboard: keyboard };
}

function getCancelKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '❌ CANCEL', callback_data: 'cancel_action' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

function getShareKeyboard(link) {
    return {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=Join%20Axion%20AI%20and%20earn%20crypto!` }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

function getWithdrawCurrencyKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '💰 WITHDRAW AXC', callback_data: 'withdraw_axc' }],
            [{ text: '💵 WITHDRAW USDT', callback_data: 'withdraw_usdt' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

function getWithdrawAmountKeyboard(currency, minAmount, maxAmount, balance) {
    const suggestions = [];
    
    if (currency === 'AXC') {
        suggestions.push(
            { text: `${minAmount.toLocaleString()} AXC (Min)`, callback_data: `withdraw_amount_${minAmount}` },
            { text: `${Math.floor(balance / 4).toLocaleString()} AXC (25%)`, callback_data: `withdraw_amount_${Math.floor(balance / 4)}` },
            { text: `${Math.floor(balance / 2).toLocaleString()} AXC (50%)`, callback_data: `withdraw_amount_${Math.floor(balance / 2)}` },
            { text: `${balance.toLocaleString()} AXC (100%)`, callback_data: `withdraw_amount_${balance}` }
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

// ============================================================================
// 10. 📝 دوال التنسيق
// ============================================================================

const DIVIDER = '═'.repeat(35);
const STAR_DIVIDER = '✧' + '═'.repeat(33) + '✧';
const MINI_DIVIDER = '•' + '─'.repeat(10) + '✧' + '─'.repeat(10) + '•';

function formatProfessionalMessage(title, content, footer = '') {
    return `
${STAR_DIVIDER}
✨ <b>${title}</b> ✨
${MINI_DIVIDER}

${content}

${footer ? footer + '\n' : ''}${STAR_DIVIDER}`;
}

function formatAXC(amount) {
    const usd = (amount * APP_CONFIG.axcPrice).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function formatUSD(amount) {
    return `$${amount.toFixed(2)} USD`;
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

// إدارة الرسائل
const userLastMessages = new Map();

async function deleteLastMessage(ctx) {
    const lastMsg = userLastMessages.get(ctx.from.id);
    if (lastMsg && lastMsg.id) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, lastMsg.id); } catch (e) {}
    }
}

async function sendAndTrack(ctx, message, keyboard = null) {
    await deleteLastMessage(ctx);
    const opts = { parse_mode: 'HTML', disable_web_page_preview: true };
    if (keyboard) opts.reply_markup = keyboard;
    const sentMsg = await ctx.reply(message, opts);
    userLastMessages.set(ctx.from.id, { id: sentMsg.message_id, timestamp: Date.now() });
    return sentMsg;
}

// ============================================================================
// 11. 🤖 أوامر البوت الأساسية
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);

bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => console.log('✅ Bot using polling mode'))
    .catch(err => console.error('Webhook delete error:', err.message));

bot.telegram.getMe().then((botInfo) => {
    BOT_USERNAME = botInfo.username;
    console.log(`📢 Bot username: @${BOT_USERNAME}`);
}).catch(err => console.error('Failed to get bot info:', err.message));

// بدء البوت
bot.start(async (ctx) => {
    const refCode = ctx.startPayload;
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name || 'Axion User';
    const userUsername = ctx.from.username || '';
    
    console.log(`🚀 /start from ${userId}, ref: ${refCode || 'none'}`);

    if (!checkDb()) {
        await ctx.reply('⚠️ Database is temporarily unavailable. Please try again later.');
        return;
    }

    let user = await getOrCreateUser(userId, userName, userUsername, refCode);
    if (!user) return;

    // معالجة الإحالة (مرة واحدة فقط)
    if (refCode && refCode !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: refCode }, true);
        console.log(`✅ Referral recorded: ${refCode} → ${userId}`);
    }

    // التحقق: هل المستخدم موثق سابقاً؟
    if (user.isVerified === true) {
        // التحقق من استمرارية العضوية في القنوات
        const isStillVerified = await isUserVerifiedInChannels(userId);
        
        if (!isStillVerified) {
            // المستخدم ترك القنوات - إلغاء التوثيق
            await updateUser(userId, { isVerified: false }, true);
            
            const reverifyMsg = formatProfessionalMessage(
                '⚠️ VERIFICATION REQUIRED',
                `You have left one or more required channels.\n\nPlease re-join all channels and click VERIFY again.`,
                `👇 Click the button below to verify:`
            );
            await sendAndTrack(ctx, reverifyMsg, getChannelsKeyboard());
            return;
        }
        
        // مستخدم موثق - رسالة ترحيب
        const welcomeBackMsg = formatProfessionalMessage(
            '✨ Welcome Back ✨',
            `👤 <b>${escapeHtml(userName)}</b>\n\n💰 <b>AXC Balance:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT Balance:</b> ${formatUSD(user.usdtBalance || 0)}\n👥 <b>Referrals:</b> ${user.inviteCount || 0}`,
            `👇 Choose an option:`
        );
        await sendAndTrack(ctx, welcomeBackMsg, getMainKeyboard(userId));
        return;
    }

    // مستخدم جديد أو غير موثق - يعرض القنوات
    const welcomeMsg = formatProfessionalMessage(
        '✨ WELCOME TO AXION AI ✨',
        `🎁 <b>Get ${formatAXC(APP_CONFIG.welcomeBonus)}</b> after verification\n👥 <b>Get ${formatAXC(APP_CONFIG.referralBonus)}</b> per referral\n💎 <b>Minimum Withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdrawAXC)}`,
        `👇 Please join our channels to continue:`
    );

    await sendAndTrack(ctx, welcomeMsg, getChannelsKeyboard());
});

// الرصيد
bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getUser(userId);
    if (!user) return;

    const progressBar = getProgressBar(user.balance || 0, APP_CONFIG.minWithdrawAXC);

    const balanceMsg = formatProfessionalMessage(
        '📊 YOUR BALANCE',
        `💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n🎁 <b>Earned:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}\n\n<b>📈 Progress to withdrawal:</b>\n${progressBar}`,
        `👇 Use the buttons below to manage your funds:`
    );

    await sendAndTrack(ctx, balanceMsg, getMainKeyboard(userId));
});

// نظام الإحالة
bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getUser(userId);
    if (!user) return;

    const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;

    let milestonesText = '';
    const claimed = user.claimedMilestones || [];
    for (const milestone of REFERRAL_MILESTONES) {
        const isClaimed = claimed.includes(milestone.count);
        const status = isClaimed ? '✅' : (user.inviteCount >= milestone.count ? '🎯' : `🔒 ${milestone.count - user.inviteCount} left`);
        milestonesText += `• ${milestone.name} (${milestone.count}) → ${formatUSD(milestone.reward)} ${status}\n`;
    }

    const referralMsg = formatProfessionalMessage(
        '🔗 YOUR REFERRAL LINK',
        `<code>${link}</code>\n\n<b>📊 Stats:</b>\n👥 Total: ${user.inviteCount || 0}\n🎁 Earned: ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}\n\n<b>🏆 Milestones:</b>\n${milestonesText}`,
        `Share your link and earn rewards!`
    );

    await sendAndTrack(ctx, referralMsg, getShareKeyboard(link));
});

// سحب - مع إدخال المبلغ
bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getUser(userId);
    if (!user) return;

    // التحقق من القنوات أولاً
    const isVerified = await isUserVerifiedInChannels(userId);
    
    if (!isVerified) {
        const missing = await getMissingChannels(userId);
        let list = '';
        for (const ch of missing) list += `📢 ${ch.name}\n`;
        
        const verifyMsg = formatProfessionalMessage(
            '⚠️ VERIFICATION REQUIRED',
            `You are not a member of all required channels.\n\n<b>Missing channels:</b>\n${list}`,
            `Please join all channels and click VERIFY.`
        );
        await sendAndTrack(ctx, verifyMsg, getChannelsKeyboard());
        return;
    }
    
    // تحديث حالة التوثيق إذا لم تكن محدثة
    if (!user.isVerified) {
        await updateUser(userId, { isVerified: true, verifiedAt: new Date().toISOString() }, true);
        
        // معالجة مكافأة الترحيب
        if (user.balance === 0) {
            await updateUser(userId, {
                balance: APP_CONFIG.welcomeBonus,
                totalEarned: APP_CONFIG.welcomeBonus
            }, true);
            
            // معالجة الإحالة
            if (user.referredBy) {
                await processReferralAfterVerification(user.referredBy, userId, user.userName);
            }
        }
    }

    if (user.withdrawBlocked) {
        await sendAndTrack(ctx, formatProfessionalMessage('🚫 ACCOUNT BLOCKED', 'Your account has been blocked from withdrawals.\nContact support for assistance.'), getMainKeyboard(userId));
        return;
    }

    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, formatProfessionalMessage('⏳ COOLDOWN ACTIVE', `You can request withdrawal once every 24 hours.\nPlease wait ${hoursLeft} hour(s).`), getMainKeyboard(userId));
        return;
    }

    if (!user.walletAddress) {
        const walletMsg = formatProfessionalMessage(
            '💳 SETUP WITHDRAWAL WALLET',
            `Please send your BEP20 wallet address to continue.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
            `📝 Send your address now:`
        );
        await sendAndTrack(ctx, walletMsg, getCancelKeyboard());
        withdrawSessions.set(userId, { step: 'waitingForWallet', createdAt: Date.now() });
        return;
    }

    const withdrawMsg = formatProfessionalMessage(
        '💸 WITHDRAWAL',
        `💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>`,
        `👇 Choose currency:`
    );

    await sendAndTrack(ctx, withdrawMsg, getWithdrawCurrencyKeyboard());
});

// اختيار العملة
bot.action('withdraw_axc', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const user = await getUser(userId);
    if (!user) return;
    
    const balance = user.balance || 0;
    
    if (balance < APP_CONFIG.minWithdrawAXC) {
        await ctx.reply(formatProfessionalMessage('❌ INSUFFICIENT BALANCE', `Minimum withdrawal is ${formatAXC(APP_CONFIG.minWithdrawAXC)}\nYour balance: ${formatAXC(balance)}`));
        return;
    }
    
    withdrawSessions.set(userId, { currency: 'AXC', step: 'waitingForAmount', createdAt: Date.now() });
    
    const msg = formatProfessionalMessage(
        '💰 ENTER WITHDRAWAL AMOUNT (AXC)',
        `💰 <b>Your balance:</b> ${formatAXC(balance)}\n📉 <b>Minimum:</b> ${formatAXC(APP_CONFIG.minWithdrawAXC)}\n📈 <b>Maximum:</b> ${formatAXC(APP_CONFIG.maxWithdrawAXC)}\n\n<i>Send a number or choose from options below:</i>`,
        `⚠️ Amount will be deducted from your balance after confirmation.`
    );
    
    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: getWithdrawAmountKeyboard('AXC', APP_CONFIG.minWithdrawAXC, APP_CONFIG.maxWithdrawAXC, balance) });
});

bot.action('withdraw_usdt', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const user = await getUser(userId);
    if (!user) return;
    
    const balance = user.usdtBalance || 0;
    
    if (balance < APP_CONFIG.minWithdrawUSDT) {
        await ctx.reply(formatProfessionalMessage('❌ INSUFFICIENT BALANCE', `Minimum withdrawal is ${formatUSD(APP_CONFIG.minWithdrawUSDT)}\nYour balance: ${formatUSD(balance)}`));
        return;
    }
    
    withdrawSessions.set(userId, { currency: 'USDT', step: 'waitingForAmount', createdAt: Date.now() });
    
    const msg = formatProfessionalMessage(
        '💵 ENTER WITHDRAWAL AMOUNT (USDT)',
        `💵 <b>Your balance:</b> ${formatUSD(balance)}\n📉 <b>Minimum:</b> ${formatUSD(APP_CONFIG.minWithdrawUSDT)}\n📈 <b>Maximum:</b> ${formatUSD(APP_CONFIG.maxWithdrawUSDT)}\n\n<i>Send a number or choose from options below:</i>`,
        `⚠️ Amount will be deducted from your balance after confirmation.`
    );
    
    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: getWithdrawAmountKeyboard('USDT', APP_CONFIG.minWithdrawUSDT, APP_CONFIG.maxWithdrawUSDT, balance) });
});

// معالجة اختيار المبلغ
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
    if (!user) return;
    
    const balance = session.currency === 'AXC' ? (user.balance || 0) : (user.usdtBalance || 0);
    const minAmount = session.currency === 'AXC' ? APP_CONFIG.minWithdrawAXC : APP_CONFIG.minWithdrawUSDT;
    const maxAmount = session.currency === 'AXC' ? APP_CONFIG.maxWithdrawAXC : APP_CONFIG.maxWithdrawUSDT;
    
    if (amount < minAmount || amount > maxAmount || amount > balance) {
        await ctx.reply(formatProfessionalMessage('❌ INVALID AMOUNT', `Amount must be between ${session.currency === 'AXC' ? formatAXC(minAmount) : formatUSD(minAmount)} and ${session.currency === 'AXC' ? formatAXC(maxAmount) : formatUSD(maxAmount)}\nYour balance: ${session.currency === 'AXC' ? formatAXC(balance) : formatUSD(balance)}`));
        return;
    }
    
    withdrawSessions.set(userId, { ...session, amount: amount, step: 'confirmWithdraw' });
    
    const confirmMsg = formatProfessionalMessage(
        '✅ CONFIRM WITHDRAWAL',
        `💰 <b>Currency:</b> ${session.currency}\n💵 <b>Amount:</b> ${session.currency === 'AXC' ? formatAXC(amount) : formatUSD(amount)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 15)}...</code>`,
        `⚠️ Click CONFIRM to submit your withdrawal request.`
    );
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw_final' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_withdraw' }]
        ]
    };
    
    await ctx.reply(confirmMsg, { parse_mode: 'HTML', reply_markup: keyboard });
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
    
    if (!session || !session.amount) {
        await ctx.reply(formatProfessionalMessage('❌ SESSION EXPIRED', 'Please start over by clicking WITHDRAW again.'));
        return;
    }
    
    const user = await getUser(userId);
    if (!user) return;
    
    // التحقق من القنوات مرة أخيرة
    const isVerified = await isUserVerifiedInChannels(userId);
    if (!isVerified) {
        await ctx.reply(formatProfessionalMessage('⚠️ VERIFICATION REQUIRED', 'You left one or more required channels. Please re-verify.'));
        return;
    }
    
    const result = await createWithdrawalRequest(userId, session.amount, session.currency, user.walletAddress);
    
    if (result.success) {
        await ctx.reply(formatProfessionalMessage('✅ WITHDRAWAL SUBMITTED!', `💰 ${session.currency === 'AXC' ? formatAXC(session.amount) : formatUSD(session.amount)}\n⏳ <b>Processing:</b> 24-48 hours\n\n<i>You will be notified once processed.</i>`));
    } else {
        await ctx.reply(formatProfessionalMessage('❌ WITHDRAWAL FAILED', `${result.error}`));
    }
    
    withdrawSessions.delete(userId);
});

bot.action('back_to_withdraw', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    withdrawSessions.delete(userId);
    
    const user = await getUser(userId);
    const withdrawMsg = formatProfessionalMessage(
        '💸 WITHDRAWAL',
        `💰 <b>AXC:</b> ${formatAXC(user?.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user?.usdtBalance || 0)}`,
        `👇 Choose currency:`
    );
    await ctx.reply(withdrawMsg, { parse_mode: 'HTML', reply_markup: getWithdrawCurrencyKeyboard() });
});

// التحقق من العضوية
bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery('جاري التحقق من القنوات...');
    
    console.log(`🔍 Verifying channels for user ${userId}...`);
    
    const missing = await getMissingChannels(userId);
    
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `📢 ${ch.name}\n`;
        
        const keyboard = {
            inline_keyboard: []
        };
        
        for (const ch of missing) {
            keyboard.inline_keyboard.push([
                { text: `📢 Join ${ch.name}`, url: `https://t.me/${ch.username.substring(1)}` }
            ]);
        }
        keyboard.inline_keyboard.push([{ text: '🔄 Try Again', callback_data: 'verify_membership' }]);
        keyboard.inline_keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
        
        await ctx.reply(formatProfessionalMessage('⚠️ VERIFICATION FAILED', `You are not a member of:\n\n${list}\n\nPlease join all channels and try again.`), { parse_mode: 'HTML', reply_markup: keyboard });
        return;
    }
    
    // التحقق ناجح
    const user = await getUser(userId);
    const wasVerified = user?.isVerified || false;
    
    await updateUser(userId, {
        isVerified: true,
        verifiedAt: new Date().toISOString()
    }, true);
    
    // مكافأة الترحيب فقط للمستخدمين الجدد
    if (!wasVerified && (user?.balance || 0) === 0) {
        await updateUser(userId, {
            balance: APP_CONFIG.welcomeBonus,
            totalEarned: APP_CONFIG.welcomeBonus
        }, true);
        
        // معالجة الإحالة
        if (user?.referredBy) {
            await processReferralAfterVerification(user.referredBy, userId, user.userName);
        }
    }
    
    const updatedUser = await getUser(userId);
    
    const successMsg = formatProfessionalMessage(
        '✅ VERIFICATION SUCCESSFUL!',
        `🎉 Welcome to Axion AI!\n\n💰 <b>Your Balance:</b> ${formatAXC(updatedUser?.balance || 0)}\n👥 <b>Referrals:</b> ${updatedUser?.inviteCount || 0}`,
        `You can now withdraw funds and invite friends!`
    );
    
    await ctx.reply(successMsg, { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
});

// Swap Station
bot.hears('🔄 SWAP STATION', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    const user = await getUser(userId);
    if (!user) return;
    
    const isVerified = await isUserVerifiedInChannels(userId);
    if (!isVerified) {
        await ctx.reply(formatProfessionalMessage('⚠️ VERIFICATION REQUIRED', 'Please verify your channel membership first.'));
        return;
    }
    
    const swapUrl = `${APP_URL}/swap.html?userId=${userId}`;
    
    const swapMsg = formatProfessionalMessage(
        '⚡ AXION SWAP STATION',
        `💰 <b>AXC Balance:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT Balance:</b> ${formatUSD(user.usdtBalance || 0)}\n\n${user.tonPaid ? '✅ Swap feature is activated!' : '🔒 One-time activation required: 0.05 TON'}`,
        `👇 Click below to open the Swap Station:`
    );
    
    await ctx.reply(swapMsg, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 OPEN SWAP STATION', web_app: { url: swapUrl } }],
                [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
            ]
        }
    });
});

// الإعدادات
bot.hears('⚙️ SETTINGS', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    const user = await getUser(userId);
    if (!user) return;
    
    const settingsMsg = formatProfessionalMessage(
        '⚙️ SETTINGS',
        `💳 <b>Wallet:</b> ${user.walletAddress ? `<code>${user.walletAddress}</code>` : 'Not set'}\n\n🔐 <b>Verified:</b> ${user.isVerified ? '✅ Yes' : '❌ No'}\n\n🔄 <b>Swap:</b> ${user.tonPaid ? '✅ Activated' : '❌ Not activated'}`,
        `👇 Select an option:`
    );
    
    await ctx.reply(settingsMsg, { parse_mode: 'HTML', reply_markup: getSettingsKeyboard() });
});

bot.action('change_wallet', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const changeWalletMsg = formatProfessionalMessage(
        '💳 CHANGE WALLET',
        `Send your new BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
        `📝 Send your new address now:`
    );
    
    await ctx.reply(changeWalletMsg, { parse_mode: 'HTML', reply_markup: getCancelKeyboard() });
    withdrawSessions.set(userId, { step: 'waitingForWalletUpdate', createdAt: Date.now() });
});

bot.action('cancel_action', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    withdrawSessions.delete(userId);
    await ctx.reply(formatProfessionalMessage('❌ ACTION CANCELLED', 'Returning to main menu.'), { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    withdrawSessions.delete(userId);
    const user = await getUser(userId);
    await ctx.reply(formatProfessionalMessage('🎯 MAIN MENU', `💰 <b>Balance:</b> ${formatAXC(user?.balance || 0)}`), { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
});

// ============================================================================
// 12. 👑 لوحة المشرف
// ============================================================================

// جلسات المشرف (في الذاكرة مؤقتاً)
const adminSessions = new Map();

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ <b>Access Denied</b>', { parse_mode: 'HTML' });
        return;
    }
    
    const session = adminSessions.get(userId);
    
    if (session?.authenticated) {
        const stats = await getBotStats();
        const cacheStats = userCache.getStats();
        const msg = formatProfessionalMessage(
            '👑 ADMIN PANEL',
            `✅ Authenticated\n\n👥 <b>Total Users:</b> ${stats.users}\n✅ <b>Verified:</b> ${stats.verified}\n⏳ <b>Pending:</b> ${stats.pendingWithdrawals}\n💰 <b>Total AXC:</b> ${formatAXC(stats.totalBalance)}\n💵 <b>Total USDT:</b> ${formatUSD(stats.totalUsdt)}\n\n📦 <b>Cache:</b> ${cacheStats.cacheSize} users (${cacheStats.dirtyCount} dirty)`,
            `📋 Click any button below:`
        );
        await ctx.reply(msg, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        return;
    }
    
    await ctx.reply(formatProfessionalMessage('🔐 ADMIN LOGIN', 'Please enter your admin password.'), { parse_mode: 'HTML' });
    adminSessions.set(userId, { waitingForPassword: true, createdAt: Date.now() });
});

// دوال المشرف
async function getBotStats() {
    if (!checkDb()) return { users: 0, pendingWithdrawals: 0, totalBalance: 0, totalUsdt: 0, verified: 0 };
    
    try {
        // استخدام الكاش إن أمكن
        let totalBalance = 0;
        let totalUsdt = 0;
        let verified = 0;
        
        // من الكاش
        for (const [_, user] of userCache.cache) {
            totalBalance += user.balance || 0;
            totalUsdt += user.usdtBalance || 0;
            if (user.isVerified) verified++;
        }
        
        const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
        
        return {
            users: userCache.cache.size,
            pendingWithdrawals: pendingSnapshot.size,
            totalBalance: totalBalance,
            totalUsdt: totalUsdt,
            verified: verified
        };
    } catch (error) {
        console.error('Get stats error:', error);
        return { users: 0, pendingWithdrawals: 0, totalBalance: 0, totalUsdt: 0, verified: 0 };
    }
}

async function getPendingWithdrawals() {
    if (!checkDb()) return [];
    try {
        const snapshot = await db.collection('withdrawals')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();
        const withdrawals = [];
        snapshot.forEach(doc => withdrawals.push({ id: doc.id, ...doc.data() }));
        return withdrawals;
    } catch (error) {
        console.error('Get pending withdrawals error:', error);
        return [];
    }
}

async function approveWithdrawal(withdrawalId, adminId) {
    if (!checkDb()) return { success: false, error: 'Database error' };
    try {
        const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
        const withdrawalDoc = await withdrawalRef.get();
        if (!withdrawalDoc.exists) return { success: false, error: 'Withdrawal not found' };
        const withdrawal = withdrawalDoc.data();
        if (withdrawal.status !== 'pending') return { success: false, error: `Already ${withdrawal.status}` };
        
        await withdrawalRef.update({
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: adminId
        });
        
        await bot.telegram.sendMessage(withdrawal.userId,
            formatProfessionalMessage('✅ WITHDRAWAL APPROVED',
                `💰 ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)}\n\nYour withdrawal request has been approved. Funds will be sent within 24 hours.`
            ), { parse_mode: 'HTML' }).catch(() => {});
        
        return { success: true };
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        return { success: false, error: error.message };
    }
}

async function rejectWithdrawal(withdrawalId, adminId, reason) {
    if (!checkDb()) return { success: false, error: 'Database error' };
    try {
        const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
        const withdrawalDoc = await withdrawalRef.get();
        if (!withdrawalDoc.exists) return { success: false, error: 'Withdrawal not found' };
        const withdrawal = withdrawalDoc.data();
        if (withdrawal.status !== 'pending') return { success: false, error: `Already ${withdrawal.status}` };
        
        // إعادة المبلغ للمستخدم
        if (withdrawal.currency === 'AXC') {
            await updateUser(withdrawal.userId, { balance: (withdrawal.balance || 0) + withdrawal.amount }, true);
        } else {
            await updateUser(withdrawal.userId, { usdtBalance: (withdrawal.usdtBalance || 0) + withdrawal.amount }, true);
        }
        
        await withdrawalRef.update({
            status: 'rejected',
            rejectReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: adminId
        });
        
        await bot.telegram.sendMessage(withdrawal.userId,
            formatProfessionalMessage('❌ WITHDRAWAL REJECTED',
                `💰 ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)}\n\nReason: ${reason}\n\nThe amount has been returned to your balance.`
            ), { parse_mode: 'HTML' }).catch(() => {});
        
        return { success: true };
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        return { success: false, error: error.message };
    }
}

async function broadcastToAllUsers(message) {
    if (!checkDb()) return { success: false, sent: 0, error: 'Database error' };
    try {
        let sent = 0;
        let failed = 0;
        
        for (const [userId, user] of userCache.cache) {
            try {
                await bot.telegram.sendMessage(userId,
                    formatProfessionalMessage('📢 ANNOUNCEMENT', message),
                    { parse_mode: 'HTML' }
                );
                sent++;
                await new Promise(r => setTimeout(r, 50));
            } catch (e) {
                failed++;
            }
        }
        
        console.log(`📢 Broadcast sent to ${sent} users (${failed} failed)`);
        return { success: true, sent: sent, failed: failed };
    } catch (error) {
        console.error('Broadcast error:', error);
        return { success: false, sent: 0, error: error.message };
    }
}

// أوامر المشرف (Action Handlers)
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    const stats = await getBotStats();
    const msg = formatProfessionalMessage('📊 STATISTICS', `👥 <b>Total Users:</b> ${stats.users}\n✅ <b>Verified:</b> ${stats.verified}\n💸 <b>Pending Withdrawals:</b> ${stats.pendingWithdrawals}\n💰 <b>Total AXC:</b> ${formatAXC(stats.totalBalance)}\n💵 <b>Total USDT:</b> ${formatUSD(stats.totalUsdt)}`);
    await ctx.reply(msg, { parse_mode: 'HTML' });
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
        await ctx.reply(formatProfessionalMessage('✅ NO PENDING', 'All withdrawals have been processed.'), { parse_mode: 'HTML' });
        return;
    }
    let msg = '';
    for (let i = 0; i < Math.min(withdrawals.length, 10); i++) {
        const w = withdrawals[i];
        msg += `${i + 1}. 👤 ${w.userName}\n   💰 ${w.currency === 'AXC' ? formatAXC(w.amount) : formatUSD(w.amount)}\n   🆔 <code>${w.id.substring(0, 8)}...</code>\n\n`;
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
    await ctx.reply(formatProfessionalMessage('💸 PENDING WITHDRAWALS', msg), { parse_mode: 'HTML', reply_markup: keyboard });
});

bot.action(/approve_wd_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const withdrawalId = ctx.match[1];
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery(`✅ Approving...`);
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
    await ctx.reply(`📝 Please send the reason for rejecting withdrawal #${withdrawalId.substring(0, 8)}:`);
});

bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    let verifiedCount = 0, withWalletCount = 0;
    for (const [_, user] of userCache.cache) {
        if (user.isVerified) verifiedCount++;
        if (user.walletAddress) withWalletCount++;
    }
    const msg = formatProfessionalMessage('👥 USERS', `📊 <b>Total:</b> ${userCache.cache.size}\n✅ <b>Verified:</b> ${verifiedCount}\n💳 <b>With Wallet:</b> ${withWalletCount}`);
    await ctx.reply(msg, { parse_mode: 'HTML' });
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
    await ctx.reply('💰 <b>ADD BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\n\nExample: <code>123456789 100 AXC</code>', { parse_mode: 'HTML' });
});

bot.action('admin_remove_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !adminSessions.get(userId)?.authenticated) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    adminSessions.get(userId).step = 'removing_balance';
    await ctx.reply('➖ <b>REMOVE BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\n\nExample: <code>123456789 50 AXC</code>', { parse_mode: 'HTML' });
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
    await ctx.reply('✅ Cache synced to Firebase successfully!');
});

bot.action('admin_logout', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    adminSessions.delete(userId);
    await ctx.reply(formatProfessionalMessage('🔓 LOGGED OUT', 'Admin session ended.'), { parse_mode: 'HTML' });
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
    const msg = formatProfessionalMessage('👑 ADMIN PANEL', `✅ Authenticated\n\n👥 <b>Total Users:</b> ${stats.users}\n✅ <b>Verified:</b> ${stats.verified}\n⏳ <b>Pending:</b> ${stats.pendingWithdrawals}\n📦 <b>Cache:</b> ${cacheStats.cacheSize} users`, `📋 Click any button below:`);
    await ctx.reply(msg, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
    try { await ctx.deleteMessage(); } catch(e) {}
});

// ============================================================================
// 13. 📝 معالج الرسائل النصية
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const messageText = ctx.message.text;
    
    console.log(`📩 [RECEIVED] from ${userId}: "${messageText.substring(0, 50)}"`);
    
    const buttons = ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '🔄 SWAP STATION', '⚙️ SETTINGS', '👑 ADMIN PANEL'];
    if (buttons.includes(messageText)) return;
    if (messageText.startsWith('/')) return;
    
    // جلسات المشرف
    const adminSession = adminSessions.get(userId);
    
    // معالجة كلمة سر المشرف
    if (adminSession?.waitingForPassword && isAdmin(userId)) {
        if (messageText === ADMIN_PASSWORD) {
            adminSessions.set(userId, { authenticated: true, createdAt: Date.now() });
            const stats = await getBotStats();
            const cacheStats = userCache.getStats();
            const msg = formatProfessionalMessage('✅ LOGIN SUCCESSFUL', `Welcome Admin.\n\n👥 Total Users: ${stats.users}\n📦 Cache: ${cacheStats.cacheSize} users`, `👇 Select an option:`);
            await ctx.reply(msg, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ LOGIN FAILED', 'Invalid password.'), { parse_mode: 'HTML' });
            adminSessions.delete(userId);
        }
        return;
    }
    
    // معالجة سبب رفض السحب
    if (adminSession?.step === 'awaiting_reject_reason' && isAdmin(userId)) {
        const withdrawalId = adminSession.withdrawalId;
        const reason = messageText;
        const result = await rejectWithdrawal(withdrawalId, userId, reason);
        await ctx.reply(result.success ? `✅ Withdrawal rejected.\nReason: ${reason}` : `❌ Error: ${result.error}`);
        adminSessions.delete(userId);
        return;
    }
    
    // معالجة البث الجماعي
    if (adminSession?.step === 'broadcasting' && isAdmin(userId)) {
        await ctx.reply(`⏳ Sending broadcast to ${userCache.cache.size} users...`);
        const result = await broadcastToAllUsers(messageText);
        await ctx.reply(`✅ Broadcast sent to ${result.sent} users${result.failed > 0 ? ` (${result.failed} failed)` : ''}`);
        adminSessions.delete(userId);
        return;
    }
    
    // معالجة إضافة رصيد
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
                await ctx.reply(`✅ Added ${formatAXC(amount)} to user ${targetUserId}`);
            } else if (currency === 'USDT') {
                const user = await getUser(targetUserId);
                await updateUser(targetUserId, { usdtBalance: (user?.usdtBalance || 0) + amount }, true);
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
    
    // معالجة خصم رصيد
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
                    await ctx.reply(`✅ Removed ${formatAXC(amount)} from user ${targetUserId}`);
                }
            } else if (currency === 'USDT') {
                const user = await getUser(targetUserId);
                if ((user?.usdtBalance || 0) < amount) {
                    await ctx.reply(`❌ User USDT balance is only ${formatUSD(user?.usdtBalance || 0)}`);
                } else {
                    await updateUser(targetUserId, { usdtBalance: (user?.usdtBalance || 0) - amount }, true);
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
    
    // معالجة البحث عن مستخدم
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
            const userMsg = formatProfessionalMessage('👤 USER FOUND', `🆔 <b>ID:</b> ${user.userId}\n👤 <b>Name:</b> ${escapeHtml(user.userName)}\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n✅ <b>Verified:</b> ${user.isVerified ? 'Yes' : 'No'}\n💳 <b>Wallet:</b> ${user.walletAddress ? user.walletAddress.substring(0, 15) + '...' : 'Not set'}\n\n📊 <b>Withdrawals:</b>\n   ✅ Approved: ${approved}\n   ⏳ Pending: ${pending}\n   ❌ Rejected: ${rejected}`);
            await ctx.reply(userMsg, { parse_mode: 'HTML' });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ NOT FOUND', 'User not found.'), { parse_mode: 'HTML' });
        }
        adminSessions.delete(userId);
        return;
    }
    
    // جلسات المستخدم العادي (السحب)
    const session = withdrawSessions.get(userId);
    
    if (session?.step === 'waitingForWallet') {
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText }, true);
            withdrawSessions.delete(userId);
            await ctx.reply(formatProfessionalMessage('✅ WALLET SAVED!', `💳 <code>${messageText}</code>\n\n<i>You can now withdraw funds.</i>`), { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ INVALID ADDRESS', `Please send a valid BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`), { parse_mode: 'HTML', reply_markup: getCancelKeyboard() });
        }
        return;
    }
    
    if (session?.step === 'waitingForWalletUpdate') {
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText }, true);
            withdrawSessions.delete(userId);
            await ctx.reply(formatProfessionalMessage('✅ WALLET UPDATED!', `💳 <code>${messageText}</code>`), { parse_mode: 'HTML', reply_markup: getMainKeyboard(userId) });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ INVALID ADDRESS', `Please send a valid BEP20 wallet address.`), { parse_mode: 'HTML', reply_markup: getCancelKeyboard() });
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
            await ctx.reply(formatProfessionalMessage('❌ INVALID AMOUNT', `Amount must be between ${session.currency === 'AXC' ? formatAXC(minAmount) : formatUSD(minAmount)} and ${session.currency === 'AXC' ? formatAXC(maxAmount) : formatUSD(maxAmount)}\nYour balance: ${session.currency === 'AXC' ? formatAXC(balance) : formatUSD(balance)}`));
            return;
        }
        
        withdrawSessions.set(userId, { ...session, amount: amount, step: 'confirmWithdraw' });
        
        const confirmMsg = formatProfessionalMessage('✅ CONFIRM WITHDRAWAL', `💰 <b>Currency:</b> ${session.currency}\n💵 <b>Amount:</b> ${session.currency === 'AXC' ? formatAXC(amount) : formatUSD(amount)}\n💳 <b>Wallet:</b> <code>${user?.walletAddress?.substring(0, 15)}...</code>`, `⚠️ Click CONFIRM to submit.`);
        
        const keyboard = { inline_keyboard: [[{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw_final' }], [{ text: '🔙 BACK', callback_data: 'back_to_withdraw' }]] };
        await ctx.reply(confirmMsg, { parse_mode: 'HTML', reply_markup: keyboard });
        return;
    }
});

// ============================================================================
// 14. 🌐 APIs للتطبيق
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    const cacheStats = userCache.getStats();
    res.json({ status: 'alive', timestamp: Date.now(), totalUsers: userCache.cache.size, firebase: !!db, cache: cacheStats });
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
        const userId = req.params.userId;
        const user = await getUser(userId);
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
            notifications: (user.notifications || []).slice(0, 30)
        }});
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/tonconnect-manifest.json', (req, res) => {
    res.json({ url: APP_URL, name: 'Axion AI', iconUrl: `${APP_URL}/icon.png`, termsOfUseUrl: `${APP_URL}/terms`, privacyPolicyUrl: `${APP_URL}/privacy` });
});

// ============================================================================
// 15. 🚀 إيقاف آمن وحفظ البيانات
// ============================================================================

async function gracefulShutdown() {
    console.log('🛑 Shutting down gracefully...');
    userCache.isShuttingDown = true;
    
    console.log('💾 Syncing all dirty users to Firebase...');
    await userCache.syncAllToFirebase(db);
    
    console.log('✅ All data saved. Goodbye!');
    process.exit(0);
}

process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown);

// ============================================================================
// 16. 🚀 تشغيل الخادم والبوت
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🚀 Axion AI Bot v10 Started Successfully'))
    .catch(err => console.error('❌ Bot error:', err));

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    AXION AI BOT - LEGENDARY EDITION v10.0                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  📍 Port: ${PORT}                                                              ║
║  🔥 Firebase: ${db ? '✅ Connected' : '❌ Disconnected'}                                             ║
║  👑 Admin ID: ${ADMIN_ID ? '✅ Loaded' : '❌ Missing'}                                               ║
║  🤖 Bot: ${BOT_TOKEN ? '✅ Running' : '❌ Missing'}                                                  ║
║  💸 Withdrawal Group: ${WITHDRAWAL_GROUP_ID ? '✅ Set' : '❌ Not set'}                              ║
║  📦 Cache: ${userCache.getStats().cacheSize} users (${userCache.getStats().dirtyCount} dirty)     ║
║  🔄 Sync Interval: ${APP_CONFIG.syncInterval / 3600000} hours                                      ║
║  🎁 Welcome Bonus: ${APP_CONFIG.welcomeBonus} AXC                                                 ║
║  👥 Referral Bonus: ${APP_CONFIG.referralBonus} AXC                                              ║
║  💎 Min/Max Withdraw AXC: ${APP_CONFIG.minWithdrawAXC} / ${APP_CONFIG.maxWithdrawAXC} AXC         ║
║  💵 Min/Max Withdraw USDT: $${APP_CONFIG.minWithdrawUSDT} / $${APP_CONFIG.maxWithdrawUSDT}        ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
});

// ============================================================================
// نهاية الملف 🎯
// ============================================================================
