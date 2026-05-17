// ============================================================================
// AXION AI BOT - PROFESSIONAL EDITION v3.0
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. تحميل المتغيرات من Render
// ============================================================================

let serviceAccount = null;
let firebaseWebConfig = {};
let ADMIN_ID = null;
let ADMIN_PASSWORD = null;      // كلمة سر المشرف من Render
let BOT_TOKEN = null;
let WITHDRAWAL_GROUP_ID = null;
let OWNER_WALLET = null;
let APP_URL = null;
let BOT_USERNAME = null;

// تحميل ملفات Firebase
try {
    const firebasePath = '/etc/secrets/firebase-admin-key.json';
    if (fs.existsSync(firebasePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
        console.log('✅ Firebase Admin key loaded');
    }
} catch (error) { console.error('Firebase Admin key error:', error.message); }

try {
    const configPath = '/etc/secrets/firebase-web-config.json';
    if (fs.existsSync(configPath)) {
        firebaseWebConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ Firebase Web config loaded');
    }
} catch (error) { console.error('Firebase Web config error:', error.message); }

// تحميل المتغيرات من Render
BOT_TOKEN = process.env.BOT_TOKEN;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;
OWNER_WALLET = process.env.OWNER_WALLET;
APP_URL = process.env.APP_URL;
ADMIN_ID = process.env.ADMIN_ID;              // معرف المشرف من Render
ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;  // كلمة سر المشرف من Render

console.log('📌 Environment variables loaded');

// ============================================================================
// 2. إعدادات التطبيق
// ============================================================================

const APP_CONFIG = {
    welcomeBonus: 100,
    referralBonus: 100,
    minWithdraw: 1000,
    axcPrice: 0.0099,
    swapFeeTON: 0.05,
    minSwap: 100,
    maxNotifications: 50,
    withdrawCooldown: 86400000,
    sessionTTL: 3600000
};

const REFERRAL_MILESTONES = [
    { count: 5, reward: 1, name: 'Bronze', rewardUnit: 'USDT' },
    { count: 15, reward: 5, name: 'Silver', rewardUnit: 'USDT' },
    { count: 30, reward: 10, name: 'Gold', rewardUnit: 'USDT' },
    { count: 60, reward: 25, name: 'Platinum', rewardUnit: 'USDT' },
    { count: 100, reward: 50, name: 'Diamond', rewardUnit: 'USDT' }
];

const REQUIRED_CHANNELS = [
    { name: 'Axion AI Signal', username: '@AxionAiSignal' },
    { name: 'Axion AI Signals', username: '@AxionAiSignals' },
    { name: 'Airdrop Master VIP', username: '@Airdrop_MasterVIP' },
    { name: 'Daily Airdrop X', username: '@Daily_AirdropX' }
];

const userSessions = new Map();
const userLastMessages = new Map();
const withdrawCooldownTracker = new Map();
const adminSessions = new Map();     // جلسات المشرف المصادق عليها
let firebaseHealthy = true;
let totalUsersCount = 0;             // متغير لتخزين عدد المستخدمين

// تنظيف الجلسات
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of userSessions.entries()) {
        if (session.createdAt && (now - session.createdAt) > APP_CONFIG.sessionTTL) {
            userSessions.delete(userId);
        }
    }
    for (const [userId, session] of adminSessions.entries()) {
        if (now - session.createdAt > 3600000) {
            adminSessions.delete(userId);
        }
    }
}, 3600000);

// ============================================================================
// 3. إعداد Firebase
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
        
        // تحديث عدد المستخدمين عند بدء التشغيل
        updateTotalUsersCount();
        
        // تحديث العداد كل 5 دقائق
        setInterval(updateTotalUsersCount, 300000);
        
        // فحص صحة Firebase
        setInterval(async () => {
            try {
                await db.collection('system').doc('health').set({ lastCheck: Date.now() }, { merge: true });
                firebaseHealthy = true;
            } catch (error) {
                firebaseHealthy = false;
                console.error('Firebase health check failed:', error.message);
            }
        }, 300000);
    } catch (error) { console.error('Firebase init error:', error.message); }
}

function checkDb() { return db && firebaseHealthy; }

// ============================================================================
// 4. دالة تحديث عدد المستخدمين - الحل الصحيح للمشكلة
// ============================================================================

async function updateTotalUsersCount() {
    if (!checkDb()) return;
    try {
        // استخدام Aggregation query للحصول على العدد الدقيق
        const snapshot = await db.collection('users').count().get();
        totalUsersCount = snapshot.data().count;
        
        // حفظ العداد في system للمرجعية
        await db.collection('system').doc('stats').set({
            totalUsers: totalUsersCount,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`📊 Total users count updated: ${totalUsersCount}`);
    } catch (error) {
        console.error('Error counting users:', error.message);
        // محاولة طريقة بديلة
        try {
            const snapshot = await db.collection('users').get();
            totalUsersCount = snapshot.size;
            console.log(`📊 Alternative count: ${totalUsersCount}`);
        } catch (e) {
            console.error('Alternative count also failed:', e.message);
        }
    }
}

// ============================================================================
// 5. دوال مساعدة
// ============================================================================

function formatAXC(amount) {
    const usd = (amount * APP_CONFIG.axcPrice).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function formatUSD(amount) {
    return `$${amount.toFixed(2)} USD`;
}

function isAdmin(userId) {
    return userId === ADMIN_ID;
}

function isAdminAuthenticated(userId) {
    const session = adminSessions.get(userId);
    return session && session.authenticated === true;
}

function isValidBEP20(address) {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// خطوط زخرفية للرسائل الاحترافية
const DIVIDER = '─━━━━━━━━━━━━━━━━━━━━─';
const STAR_DIVIDER = '✧══════════════════════════════✧';
const MINI_DIVIDER = '•──────•✧•──────•';

async function deleteLastMessage(ctx) {
    const lastMsg = userLastMessages.get(ctx.from.id);
    if (lastMsg && lastMsg.id) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, lastMsg.id); } catch (e) {}
    }
}

async function sendAndTrack(ctx, message, keyboard = null) {
    await deleteLastMessage(ctx);
    const opts = { parse_mode: 'HTML' };
    if (keyboard) opts.reply_markup = keyboard;
    const sentMsg = await ctx.reply(message, opts);
    userLastMessages.set(ctx.from.id, { id: sentMsg.message_id, timestamp: Date.now() });
    return sentMsg;
}

async function addNotification(targetUserId, title, message, type = 'info') {
    if (!checkDb()) return;
    try {
        const notifData = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            type, title, message, read: false,
            timestamp: new Date().toISOString()
        };
        const userRef = db.collection('users').doc(targetUserId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            const currentNotifs = userDoc.data().notifications || [];
            const newNotifs = [notifData, ...currentNotifs].slice(0, APP_CONFIG.maxNotifications);
            await userRef.update({ notifications: newNotifs });
        }
    } catch (error) {}
}

// دالة تسجيل مستخدم جديد مع تحديث العداد
async function updateNewUserCounter(userId, userName) {
    if (!checkDb()) return;
    try {
        // زيادة العداد المحلي
        totalUsersCount++;
        
        // تحديث العداد في قاعدة البيانات
        const counterRef = db.collection('system').doc('userCounter');
        await counterRef.set({
            count: admin.firestore.FieldValue.increment(1),
            lastUserId: userId,
            lastUserName: userName,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // تحديث إحصائيات النظام
        await db.collection('system').doc('stats').set({
            totalUsers: totalUsersCount,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`📈 New user counter incremented. Total: ${totalUsersCount}`);
        
        // إرسال إشعار للمشرف
        if (ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID, 
                `✨ <b>New User Joined!</b>\n\n👤 Name: ${escapeHtml(userName)}\n🆔 ID: ${userId}\n📊 Total Users: ${totalUsersCount}`,
                { parse_mode: 'HTML' });
        }
    } catch (error) {
        console.error('Error updating user counter:', error.message);
    }
}

function createNewUser(userId, userName, userUsername, refCode) {
    return {
        userId,
        userName: userName || 'Axion User',
        userUsername: userUsername || '',
        balance: 0,
        usdtBalance: 0,
        totalEarned: 0,
        inviteCount: 0,
        referredBy: refCode || null,
        referrals: [],
        walletAddress: null,
        tonWallet: null,
        tonPaid: false,
        withdrawBlocked: false,
        isVerified: false,
        verifiedAt: null,
        claimedMilestones: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        notifications: [{
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'welcome',
            title: '🎉 Welcome to Axion AI!',
            message: `Complete verification to get ${formatAXC(APP_CONFIG.welcomeBonus)} bonus!`,
            read: false,
            timestamp: new Date().toISOString()
        }]
    };
}

async function getOrCreateUser(userId, userName, username, referredBy = null) {
    if (!checkDb()) return null;
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (userDoc.exists) return userDoc.data();

        const newUser = createNewUser(userId, userName, username, referredBy);
        await userRef.set(newUser);
        
        // تحديث عداد المستخدمين عند إنشاء مستخدم جديد
        await updateNewUserCounter(userId, userName);
        
        console.log(`✅ New user created: ${userId} (${userName})`);
        return newUser;
    } catch (error) { 
        console.error('Error creating user:', error.message);
        return null; 
    }
}

async function updateUser(userId, data) {
    if (!checkDb()) return;
    try {
        await db.collection('users').doc(userId).update({ ...data, lastActive: new Date().toISOString() });
        console.log(`✅ User ${userId} updated`);
    } catch (error) {
        console.error('Update user error:', error.message);
    }
}

// ============================================================================
// 6. نظام الإحالة المحمي
// ============================================================================

async function processReferralFromBot(referrerId, newUserId, newUserName) {
    if (!checkDb()) return false;
    
    // منع الإحالة الذاتية
    if (referrerId === newUserId) return false;
    
    try {
        const referrerRef = db.collection('users').doc(referrerId);
        const referrerDoc = await referrerRef.get();
        
        if (!referrerDoc.exists) return false;
        
        const currentReferrals = referrerDoc.data().referrals || [];
        
        // منع الإحالة المكررة
        if (currentReferrals.includes(newUserId)) {
            console.log(`⚠️ Duplicate referral prevented: ${referrerId} → ${newUserId}`);
            return false;
        }
        
        // استخدام transaction لمنع التلاعب
        await db.runTransaction(async (transaction) => {
            const refDoc = await transaction.get(referrerRef);
            const refData = refDoc.data();
            
            transaction.update(referrerRef, {
                referrals: [...currentReferrals, newUserId],
                inviteCount: (refData.inviteCount || 0) + 1,
                balance: (refData.balance || 0) + APP_CONFIG.referralBonus,
                totalEarned: (refData.totalEarned || 0) + APP_CONFIG.referralBonus
            });
        });
        
        // إشعار احترافي للمحيل
        const newInviteCount = (referrerDoc.data().inviteCount || 0) + 1;
        const notificationMsg = `
${STAR_DIVIDER}
🎉 <b>NEW REFERRAL!</b> 🎉
${MINI_DIVIDER}

👤 <b>${escapeHtml(newUserName)}</b> joined using your link

💰 <b>+${formatAXC(APP_CONFIG.referralBonus)}</b> added to your balance

📊 <b>Total Referrals:</b> ${newInviteCount}

${MINI_DIVIDER}
💡 <i>Invite more friends to unlock milestone rewards!</i>
${STAR_DIVIDER}`;
        
        await bot.telegram.sendMessage(referrerId, notificationMsg, { parse_mode: 'HTML' }).catch(() => {});
        
        // التحقق من المكافآت
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
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data();
        const currentInvites = userData.inviteCount || 0;
        const claimed = userData.claimedMilestones || [];

        for (const milestone of REFERRAL_MILESTONES) {
            if (currentInvites >= milestone.count && !claimed.includes(milestone.count)) {
                await updateUser(userId, {
                    usdtBalance: admin.firestore.FieldValue.increment(milestone.reward),
                    claimedMilestones: admin.firestore.FieldValue.arrayUnion(milestone.count)
                });
                
                const milestoneMsg = `
${STAR_DIVIDER}
🏆 <b>MILESTONE UNLOCKED!</b> 🏆
${MINI_DIVIDER}

🎉 ${milestone.name}
👥 ${milestone.count} referrals
💰 +${formatUSD(milestone.reward)} USDT added!

${MINI_DIVIDER}
✨ <i>You're on fire! Keep going!</i>
${STAR_DIVIDER}`;
                
                await bot.telegram.sendMessage(userId, milestoneMsg, { parse_mode: 'HTML' }).catch(() => {});
                console.log(`✅ Milestone unlocked: ${userId} - ${milestone.count} referrals`);
            }
        }
    } catch (error) { console.error('Milestone error:', error.message); }
}

// ============================================================================
// 7. التحقق من القنوات
// ============================================================================

async function verifyChannelMembership(userId, channelUsername) {
    try {
        const chatMember = await bot.telegram.getChatMember(`@${channelUsername.replace('@', '')}`, parseInt(userId));
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch { return false; }
}

async function getMissingChannels(userId) {
    const results = await Promise.all(REQUIRED_CHANNELS.map(async (channel) => ({
        channel,
        isMember: await verifyChannelMembership(userId, channel.username)
    })));
    return results.filter(r => !r.isMember).map(r => r.channel);
}

async function requireChannelVerification(ctx, userId) {
    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `📢 ${ch.name}\n`;
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
⚠️ <b>CHANNEL VERIFICATION REQUIRED</b> ⚠️
${MINI_DIVIDER}

You must join all required channels:

${list}
${MINI_DIVIDER}

<i>Please join and click VERIFY</i>
${STAR_DIVIDER}`, getChannelsKeyboard());
        return false;
    }
    return true;
}

// ============================================================================
// 8. لوحات المفاتيح الاحترافية
// ============================================================================

function getMainKeyboard(userId) {
    const keyboard = [
        ['💰 MY BALANCE', '🔗 REFERRAL SYSTEM'],
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

function getConfirmWithdrawKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw_final' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]
        ]
    };
}

// لوحة المشرف المحمية بكلمة سر
function getAdminPasswordKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🔐 ENTER PASSWORD', callback_data: 'admin_enter_password' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]
        ]
    };
}

function getSecureAdminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '📊 STATISTICS', callback_data: 'admin_stats' }],
            [{ text: '💸 PENDING WITHDRAWALS', callback_data: 'admin_pending' }],
            [{ text: '👥 TOTAL USERS', callback_data: 'admin_users' }],
            [{ text: '🔍 SEARCH USER', callback_data: 'admin_search' }],
            [{ text: '💰 ADD BALANCE', callback_data: 'admin_add' }],
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }],
            [{ text: '🚪 LOGOUT', callback_data: 'admin_logout' }]
        ]
    };
}

// ============================================================================
// 9. أوامر البوت
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);

bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => console.log('✅ Bot started in polling mode'))
    .catch(err => console.error('Webhook error:', err.message));

bot.telegram.getMe().then((botInfo) => {
    BOT_USERNAME = botInfo.username;
    console.log(`📢 Bot: @${BOT_USERNAME}`);
});

// رسالة الترحيب الاحترافية
bot.start(async (ctx) => {
    const refCode = ctx.startPayload;
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name || 'Axion User';
    const userUsername = ctx.from.username || '';
    
    console.log(`🚀 /start from ${userId}, ref: ${refCode || 'none'}`);

    if (!checkDb()) {
        await ctx.reply('⚠️ System is temporarily unavailable. Please try again later.');
        return;
    }

    let user = await getOrCreateUser(userId, userName, userUsername, refCode);
    if (!user) return;

    // معالجة الإحالة
    if (refCode && refCode !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: refCode });
        await processReferralFromBot(refCode, userId, userName);
    }

    const welcomeMsg = `
${STAR_DIVIDER}
✨ <b>WELCOME TO AXION AI</b> ✨
${MINI_DIVIDER}

🎁 <b>Get ${formatAXC(APP_CONFIG.welcomeBonus)}</b> after verification
👥 <b>Get ${formatAXC(APP_CONFIG.referralBonus)}</b> per referral
💎 <b>Minimum Withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdraw)}

${MINI_DIVIDER}

📢 <b>Please join our channels to continue</b>
${STAR_DIVIDER}`;

    if (user.isVerified) {
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
✅ <b>Welcome back, ${escapeHtml(userName)}!</b>
${MINI_DIVIDER}
💰 <b>Balance:</b> ${formatAXC(user.balance || 0)}
${STAR_DIVIDER}`, getMainKeyboard(userId));
        return;
    }

    await sendAndTrack(ctx, welcomeMsg, getChannelsKeyboard());
});

// رصيد
bot.hears('💰 MY BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    await sendAndTrack(ctx, `
${STAR_DIVIDER}
📊 <b>YOUR BALANCE</b>
${MINI_DIVIDER}

💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}
💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}

👥 <b>Referrals:</b> ${user.inviteCount || 0}
🎁 <b>Earned:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}

${MINI_DIVIDER}
📈 <b>Next withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdraw - (user.balance || 0))} needed
${STAR_DIVIDER}`, getMainKeyboard(userId));
});

// نظام الإحالة
bot.hears('🔗 REFERRAL SYSTEM', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;

    let milestonesText = '';
    const claimed = user.claimedMilestones || [];
    for (const milestone of REFERRAL_MILESTONES) {
        const isClaimed = claimed.includes(milestone.count);
        const status = isClaimed ? '✅' : (user.inviteCount >= milestone.count ? '🎯' : `🔒 ${milestone.count - user.inviteCount} left`);
        milestonesText += `• ${milestone.name} (${milestone.count}) → +${milestone.reward} USDT ${status}\n`;
    }

    await sendAndTrack(ctx, `
${STAR_DIVIDER}
🔗 <b>YOUR REFERRAL LINK</b>
${MINI_DIVIDER}

<code>${link}</code>

${MINI_DIVIDER}

👥 <b>Total Referrals:</b> ${user.inviteCount || 0}
🎁 <b>Earned from referrals:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}

${MINI_DIVIDER}
🏆 <b>Milestones:</b>
${milestonesText}
${STAR_DIVIDER}

<i>Share your link and earn rewards!</i>`, getShareKeyboard(link));
});

// سحب
bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    if (!await requireChannelVerification(ctx, userId)) return;

    if (user.withdrawBlocked) {
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
🚫 <b>ACCOUNT BLOCKED</b>
${MINI_DIVIDER}
Contact support for assistance.
${STAR_DIVIDER}`, getMainKeyboard(userId));
        return;
    }

    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
⏳ <b>COOLDOWN ACTIVE</b>
${MINI_DIVIDER}
Please wait ${hoursLeft} hour(s) before next withdrawal.
${STAR_DIVIDER}`, getMainKeyboard(userId));
        return;
    }

    if (!user.isVerified) {
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
🔒 <b>VERIFICATION REQUIRED</b>
${MINI_DIVIDER}
Please complete channel verification first.
${STAR_DIVIDER}`, getChannelsKeyboard());
        return;
    }

    if (!user.walletAddress) {
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
💳 <b>SETUP WITHDRAWAL WALLET</b>
${MINI_DIVIDER}

Please send your BEP20 wallet address.

<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>

${MINI_DIVIDER}
📝 <b>Send your address now</b>
${STAR_DIVIDER}`, getCancelKeyboard());
        userSessions.set(userId, { waitingForWallet: true, createdAt: Date.now() });
        return;
    }

    await sendAndTrack(ctx, `
${STAR_DIVIDER}
💸 <b>WITHDRAWAL</b>
${MINI_DIVIDER}

💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}
💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}
💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>

${MINI_DIVIDER}
👇 <b>Choose currency</b>
${STAR_DIVIDER}`, getWithdrawCurrencyKeyboard());
});

// الإعدادات
bot.hears('⚙️ SETTINGS', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    await sendAndTrack(ctx, `
${STAR_DIVIDER}
⚙️ <b>SETTINGS</b>
${MINI_DIVIDER}

💳 <b>Wallet:</b> ${user.walletAddress ? `<code>${user.walletAddress.substring(0, 10)}...</code>` : 'Not set'}
🔐 <b>Verified:</b> ${user.isVerified ? '✅ Yes' : '❌ No'}
🔄 <b>Swap:</b> ${user.tonPaid ? '✅ Activated' : '❌ Not activated'}

${MINI_DIVIDER}
👇 Select an option
${STAR_DIVIDER}`, getSettingsKeyboard());
});

// تبديل المحفظة
bot.action('change_wallet', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    await sendAndTrack(ctx, `
${STAR_DIVIDER}
💳 <b>CHANGE WALLET</b>
${MINI_DIVIDER}

Send your new BEP20 wallet address.

<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>

${MINI_DIVIDER}
📝 Send your new address
${STAR_DIVIDER}`, getCancelKeyboard());
    
    userSessions.set(userId, { waitingForWalletUpdate: true, createdAt: Date.now() });
});

// التحقق من القنوات
bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();

    if (userData.isVerified) {
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
✅ <b>Already verified!</b>
${STAR_DIVIDER}`, getMainKeyboard(userId));
        return;
    }

    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `📢 ${ch.name}\n`;
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
⚠️ <b>MISSING CHANNELS</b>
${MINI_DIVIDER}
${list}
${MINI_DIVIDER}
<i>Join all channels and click VERIFY</i>
${STAR_DIVIDER}`, getChannelsKeyboard());
        return;
    }

    await updateUser(userId, {
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus),
        totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus)
    });

    const newBalance = (userData.balance || 0) + APP_CONFIG.welcomeBonus;
    await sendAndTrack(ctx, `
${STAR_DIVIDER}
✅ <b>VERIFICATION SUCCESSFUL!</b>
${MINI_DIVIDER}

🎉 <b>+${formatAXC(APP_CONFIG.welcomeBonus)}</b> added!

💰 <b>New Balance:</b> ${formatAXC(newBalance)}

${MINI_DIVIDER}
<i>You can now withdraw and invite friends</i>
${STAR_DIVIDER}`, getMainKeyboard(userId));
});

// تأكيد السحب
bot.action('confirm_withdraw_final', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = userSessions.get(userId);
    await ctx.answerCbQuery();

    if (!session?.withdrawAmount) {
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
❌ <b>SESSION EXPIRED</b>
${MINI_DIVIDER}
Please start over by clicking WITHDRAW again.
${STAR_DIVIDER}`, getMainKeyboard(userId));
        return;
    }

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    if (!await requireChannelVerification(ctx, userId)) return;

    withdrawCooldownTracker.set(userId, Date.now());

    if (session.withdrawCurrency === 'AXC') {
        await updateUser(userId, { balance: 0 });
    } else {
        await updateUser(userId, { usdtBalance: 0 });
    }

    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
        id: withdrawalRef.id,
        userId,
        userName: user.userName,
        amount: session.withdrawAmount,
        currency: session.withdrawCurrency,
        walletAddress: user.walletAddress,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    if (WITHDRAWAL_GROUP_ID) {
        await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID,
            `${STAR_DIVIDER}
💸 <b>WITHDRAWAL REQUEST</b>
${MINI_DIVIDER}
👤 ${escapeHtml(user.userName)}
💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}
💳 <code>${user.walletAddress}</code>
🆔 ${withdrawalRef.id}
${STAR_DIVIDER}`, { parse_mode: 'HTML' }).catch(() => {});
    }

    await sendAndTrack(ctx, `
${STAR_DIVIDER}
✅ <b>WITHDRAWAL SUBMITTED!</b>
${MINI_DIVIDER}

💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}
⏳ <b>Processing:</b> 24-48 hours

<i>You will be notified when processed</i>
${STAR_DIVIDER}`, getMainKeyboard(userId));

    userSessions.delete(userId);
});

// ============================================================================
// 10. لوحة المشرف المحمية بكلمة سر
// ============================================================================

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ <b>Access Denied</b>', { parse_mode: 'HTML' });
        return;
    }
    
    // التحقق مما إذا كان المشرف مصادقاً بالفعل
    if (isAdminAuthenticated(userId)) {
        await ctx.reply(`
${STAR_DIVIDER}
👑 <b>ADMIN CONTROL PANEL</b>
${MINI_DIVIDER}
✅ Authenticated
${STAR_DIVIDER}`, { reply_markup: getSecureAdminKeyboard(), parse_mode: 'HTML' });
        return;
    }
    
    // طلب كلمة السر
    await ctx.reply(`
${STAR_DIVIDER}
👑 <b>ADMIN AUTHENTICATION</b>
${MINI_DIVIDER}

🔐 Please enter your admin password to continue

<i>Type the password in this chat</i>
${STAR_DIVIDER}`, { parse_mode: 'HTML' });
    
    // انتظار كلمة السر من المشرف
    adminSessions.set(userId, { waitingForPassword: true, createdAt: Date.now() });
});

// معالجة كلمة السر
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = adminSessions.get(userId);
    
    // معالجة كلمة سر المشرف
    if (session && session.waitingForPassword && isAdmin(userId)) {
        const enteredPassword = ctx.message.text;
        
        if (enteredPassword === ADMIN_PASSWORD) {
            adminSessions.set(userId, { authenticated: true, createdAt: Date.now() });
            delete adminSessions.get(userId).waitingForPassword;
            
            await ctx.reply(`
${STAR_DIVIDER}
✅ <b>Authentication Successful!</b>
${MINI_DIVIDER}

Welcome to the Admin Panel
${STAR_DIVIDER}`, { reply_markup: getSecureAdminKeyboard(), parse_mode: 'HTML' });
        } else {
            await ctx.reply(`
${STAR_DIVIDER}
❌ <b>Invalid Password</b>
${MINI_DIVIDER}
Access denied. Contact system administrator.
${STAR_DIVIDER}`, { parse_mode: 'HTML' });
            adminSessions.delete(userId);
        }
        return;
    }
});

// تسجيل خروج المشرف
bot.action('admin_logout', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    adminSessions.delete(userId);
    await ctx.reply(`
${STAR_DIVIDER}
🔓 <b>Logged out successfully</b>
${MINI_DIVIDER}
You have been logged out of the admin panel.
${STAR_DIVIDER}`, { parse_mode: 'HTML' });
});

// إحصائيات المشرف
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    if (!checkDb()) return;
    
    // استخدام العداد المخزن للحصول على العدد الدقيق
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    
    await ctx.reply(`
${STAR_DIVIDER}
📊 <b>LIVE STATISTICS</b>
${MINI_DIVIDER}

👥 <b>Total Users:</b> ${totalUsersCount || usersSnapshot.size}
💸 <b>Pending Withdrawals:</b> ${pendingSnapshot.size}
💰 <b>Active Users (30d):</b> Calculating...

${MINI_DIVIDER}
📅 Last updated: ${new Date().toLocaleString()}
${STAR_DIVIDER}`, { parse_mode: 'HTML' });
});

bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    const usersSnapshot = await db.collection('users').get();
    await ctx.reply(`
${STAR_DIVIDER}
👥 <b>USER MANAGEMENT</b>
${MINI_DIVIDER}

📊 <b>Total Users:</b> ${totalUsersCount || usersSnapshot.size}

<i>Use /search [username] to find users</i>
${STAR_DIVIDER}`, { parse_mode: 'HTML' });
});

bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    
    if (pendingSnapshot.empty) {
        await ctx.reply(`
${STAR_DIVIDER}
✅ <b>No pending withdrawals</b>
${STAR_DIVIDER}`, { parse_mode: 'HTML' });
        return;
    }
    
    let msg = `${STAR_DIVIDER}\n💸 <b>PENDING WITHDRAWALS</b>\n${MINI_DIVIDER}\n\n`;
    pendingSnapshot.forEach(doc => {
        const data = doc.data();
        msg += `👤 ${data.userName}\n💰 ${data.currency === 'AXC' ? formatAXC(data.amount) : formatUSD(data.amount)}\n🆔 ${doc.id}\n${MINI_DIVIDER}\n`;
    });
    msg += `${STAR_DIVIDER}`;
    
    await ctx.reply(msg, { parse_mode: 'HTML' });
});

// باقي أوامر المشرف (اختصاراً)
bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('📢 Send the message you want to broadcast to all users:', { parse_mode: 'HTML' });
    adminSessions.set(userId, { broadcasting: true });
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    const user = await getOrCreateUser(userId, '', '');
    await sendAndTrack(ctx, `
${STAR_DIVIDER}
🎯 <b>MAIN MENU</b>
${MINI_DIVIDER}
💰 <b>Balance:</b> ${formatAXC(user?.balance || 0)}
${STAR_DIVIDER}`, getMainKeyboard(userId));
});

bot.action('cancel_action', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    await sendAndTrack(ctx, `
${STAR_DIVIDER}
❌ <b>Action Cancelled</b>
${MINI_DIVIDER}
Returning to main menu...
${STAR_DIVIDER}`, getMainKeyboard(userId));
});

// ============================================================================
// 11. معالجة النصوص (المحفظة)
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    if (text.startsWith('/')) return;
    
    const adminSession = adminSessions.get(userId);
    if (adminSession?.broadcasting && isAdmin(userId) && isAdminAuthenticated(userId)) {
        // إرسال رسالة جماعية
        const usersSnapshot = await db.collection('users').get();
        let sent = 0;
        for (const doc of usersSnapshot.docs) {
            try {
                await bot.telegram.sendMessage(doc.id, text, { parse_mode: 'HTML' });
                sent++;
                await new Promise(r => setTimeout(r, 50));
            } catch(e) {}
        }
        await ctx.reply(`✅ Broadcast sent to ${sent} users`);
        adminSessions.delete(userId);
        return;
    }

    const session = userSessions.get(userId);

    if (session?.waitingForWallet && isValidBEP20(text)) {
        await updateUser(userId, { walletAddress: text });
        userSessions.delete(userId);
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
✅ <b>WALLET SAVED!</b>
${MINI_DIVIDER}
💳 <code>${text}</code>
${MINI_DIVIDER}
<i>You can now withdraw funds</i>
${STAR_DIVIDER}`, getMainKeyboard(userId));
        return;
    }

    if (session?.waitingForWalletUpdate && isValidBEP20(text)) {
        await updateUser(userId, { walletAddress: text });
        userSessions.delete(userId);
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
✅ <b>WALLET UPDATED!</b>
${MINI_DIVIDER}
💳 <code>${text}</code>
${STAR_DIVIDER}`, getMainKeyboard(userId));
        return;
    }

    if ((session?.waitingForWallet || session?.waitingForWalletUpdate) && !isValidBEP20(text)) {
        await sendAndTrack(ctx, `
${STAR_DIVIDER}
❌ <b>INVALID ADDRESS</b>
${MINI_DIVIDER}

Please send a valid BEP20 wallet address.

<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>

${MINI_DIVIDER}
📝 Try again or click CANCEL
${STAR_DIVIDER}`, getCancelKeyboard());
        return;
    }
});

// ============================================================================
// 12. خادم Express
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: 'alive', timestamp: Date.now(), totalUsers: totalUsersCount, firebase: firebaseHealthy ? 'connected' : 'disconnected' }); });
app.get('/api/config', (req, res) => { res.json({ firebaseConfig: firebaseWebConfig, ownerWallet: OWNER_WALLET, status: 'ok' }); });
app.get('/tonconnect-manifest.json', (req, res) => { res.sendFile(path.join(__dirname, 'tonconnect-manifest.json')); });

// ============================================================================
// 13. تشغيل البوت
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🚀 Axion AI Bot Started Successfully'))
    .catch(err => console.error('❌ Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║     AXION AI v3.0 - PROFESSIONAL       ║
╠════════════════════════════════════════╣
║  📍 Port: ${PORT}                              ║
║  🔥 Firebase: ${db && firebaseHealthy ? '✅' : '❌'}                            ║
║  👑 Admin: ${ADMIN_ID ? '✅' : '❌'}                               ║
║  🔐 Admin Password: ${ADMIN_PASSWORD ? '✅' : '❌'}                       ║
║  📊 User Counter: ${totalUsersCount} active              ║
╚════════════════════════════════════════╝
    `);
});

// ============================================================================
// END OF FILE
// ============================================================================
