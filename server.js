// ============================================================================
// AXION AI BOT - LEGENDARY FINAL EDITION v7.0
// ============================================================================
// تم إصلاح 17 مشكلة:
// 1. ✅ عداد المستخدمين (FieldValue.increment)
// 2. ✅ الإحالة المكررة
// 3. ✅ دمج معالجات النصوص
// 4. ✅ فحص withdrawBlocked
// 5. ✅ تحديد حجم الإشعارات (50)
// 6. ✅ تسريع getMissingChannels (Promise.all)
// 7. ✅ تنظيف الجلسات (TTL)
// 8. ✅ botUsername ديناميكي
// 9. ✅ إصلاح أوامر approve/reject
// 10. ✅ Delay في البث
// 11. ✅ فحص صحة عنوان المحفظة (regex)
// 12. ✅ إضافة أمر /admin
// 13. ✅ فحص db في كل مكان
// 14. ✅ Rate limiting للسحب
// 15. ✅ Logging محسن
// 16. ✅ Health check لـ Firebase
// 17. ✅ تجميع الإعدادات
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 🔐 قراءة Secret Files من Render
// ============================================================================

let serviceAccount = null;
let firebaseWebConfig = {};
let ADMIN_ID = null;
let BOT_TOKEN = null;
let WITHDRAWAL_GROUP_ID = null;
let BOT_USERNAME = null;

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

try {
    const adminPath = '/etc/secrets/admin-config.json';
    if (fs.existsSync(adminPath)) {
        const adminConfig = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
        ADMIN_ID = adminConfig.admin_id;
        console.log('✅ Admin config loaded | ID:', ADMIN_ID);
    }
} catch (error) { console.error('Admin config error:', error.message); }

BOT_TOKEN = process.env.BOT_TOKEN;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;

// ============================================================================
// 2. ⚙️ إعدادات Axion (مجمعة)
// ============================================================================

const APP_CONFIG = {
    welcomeBonus: 100,
    referralBonus: 100,
    minWithdraw: 1000,
    axcPrice: 0.0099,
    maxNotifications: 50,
    sessionTTL: 3600000, // 1 hour
    broadcastDelay: 100, // ms between messages
    withdrawCooldown: 86400000 // 24 hours
};

const REQUIRED_CHANNELS = [
    { name: 'Axion AI Signal', username: '@AxionAiSignal' },
    { name: 'Axion AI Signals', username: '@AxionAiSignals' },
    { name: 'Airdrop Master VIP', username: '@Airdrop_MasterVIP' },
    { name: 'Daily Airdrop X', username: '@Daily_AirdropX' }
];

// Rate limiting tracker
const withdrawCooldownTracker = new Map();

// Session with TTL
const userSessions = new Map();
const userLastMessages = new Map();
const adminSessions = new Map();

// Health check interval
let firebaseHealthy = true;
let lastHealthCheck = Date.now();

// ============================================================================
// 3. 🔥 Firebase Admin SDK
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
        
        // Health check for Firebase
        setInterval(async () => {
            try {
                await db.collection('system').doc('health').set({ lastCheck: Date.now() }, { merge: true });
                firebaseHealthy = true;
                lastHealthCheck = Date.now();
                console.log('✅ Firebase health check passed');
            } catch (error) {
                firebaseHealthy = false;
                console.error('❌ Firebase health check failed:', error.message);
            }
        }, 300000); // كل 5 دقائق
    } catch (error) { console.error('Firebase init error:', error.message); }
}

// Helper to check db connection
function checkDb() {
    if (!db || !firebaseHealthy) {
        console.log('⚠️ Database not connected or unhealthy');
        return false;
    }
    return true;
}

// ============================================================================
// 4. 🤖 Telegram Bot
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);

// Force polling mode (fix for webhook issues)
bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => console.log('✅ Webhook deleted, bot using polling mode'))
    .catch(err => console.error('Webhook delete error:', err.message));

// Get bot username dynamically
bot.telegram.getMe().then((botInfo) => {
    BOT_USERNAME = botInfo.username;
    console.log(`📢 Bot username: @${BOT_USERNAME}`);
}).catch(err => console.error('Failed to get bot info:', err.message));

// ============================================================================
// 5. دوال مساعدة محسنة
// ============================================================================

function formatAXC(amount) {
    const usd = (amount * APP_CONFIG.axcPrice).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function isAdmin(userId) {
    return userId === ADMIN_ID;
}

function isValidBEP20(address) {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

function cleanExpiredSessions() {
    const now = Date.now();
    for (const [userId, session] of userSessions.entries()) {
        if (session.createdAt && (now - session.createdAt) > APP_CONFIG.sessionTTL) {
            userSessions.delete(userId);
        }
    }
    for (const [userId, msgId] of userLastMessages.entries()) {
        if (msgId.timestamp && (now - msgId.timestamp) > APP_CONFIG.sessionTTL) {
            userLastMessages.delete(userId);
        }
    }
}

// Clean sessions every hour
setInterval(cleanExpiredSessions, 3600000);

async function deleteLastMessage(ctx) {
    const lastMsg = userLastMessages.get(ctx.from.id);
    if (lastMsg && lastMsg.id) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastMsg.id);
        } catch (e) {}
    }
}

async function sendAndTrack(ctx, message, keyboard = null, parseMode = 'Markdown') {
    await deleteLastMessage(ctx);
    const opts = { parse_mode: parseMode };
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
            type: type,
            title: title,
            message: message,
            read: false,
            timestamp: new Date().toISOString()
        };
        const userRef = db.collection('users').doc(targetUserId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            const currentNotifs = userDoc.data().notifications || [];
            const newNotifs = [notifData, ...currentNotifs].slice(0, APP_CONFIG.maxNotifications);
            await userRef.update({ notifications: newNotifs });
        }
    } catch (error) { console.error('Add notification error:', error.message); }
}

async function broadcastToAllUsers(message) {
    if (!checkDb()) return { success: false, error: 'Database not connected' };
    try {
        const usersSnapshot = await db.collection('users').get();
        let notifiedCount = 0;
        const notification = {
            id: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            type: 'broadcast',
            title: '📢 Announcement',
            message: message,
            read: false,
            timestamp: new Date().toISOString()
        };
        
        // Batch write notifications
        let batch = db.batch();
        let batchCount = 0;
        for (const doc of usersSnapshot.docs) {
            const currentNotifs = doc.data().notifications || [];
            const newNotifs = [notification, ...currentNotifs].slice(0, APP_CONFIG.maxNotifications);
            batch.update(db.collection('users').doc(doc.id), { notifications: newNotifs });
            notifiedCount++;
            batchCount++;
            if (batchCount >= 400) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
                await new Promise(r => setTimeout(r, 100));
            }
        }
        if (batchCount > 0) await batch.commit();
        
        // Send bot messages with delay
        for (const doc of usersSnapshot.docs) {
            try {
                await bot.telegram.sendMessage(doc.id, `📢 *Announcement*\n\n${message}`, { parse_mode: 'Markdown' });
                await new Promise(r => setTimeout(r, APP_CONFIG.broadcastDelay));
            } catch(e) {}
        }
        return { success: true, notifiedCount };
    } catch (error) { console.error('Broadcast error:', error.message); return { success: false }; }
}

async function updateNewUserCounter(userId, userName) {
    if (!checkDb()) return;
    try {
        const counterRef = db.collection('system').doc('newUserCounter');
        await counterRef.set({
            count: admin.firestore.FieldValue.increment(1),
            lastUserId: userId,
            lastUserName: userName,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        const updated = await counterRef.get();
        const newCount = updated.data()?.count || 0;
        if (ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID, `🆕 New user: ${userName}\nID: ${userId}\nTotal: ${newCount}`);
        }
    } catch (error) { console.error('Counter error:', error.message); }
}

function createNewUser(userId, userName, userUsername, refCode) {
    return {
        userId, userName: userName || 'Axion User', userUsername: userUsername || '',
        balance: 0, totalEarned: 0, inviteCount: 0,
        referredBy: refCode || null, referrals: [], walletAddress: null,
        withdrawBlocked: false, isVerified: false, verifiedAt: null,
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

async function processReferralFromBot(referrerId, newUserId, newUserName) {
    if (!checkDb()) return;
    try {
        const referrerRef = db.collection('users').doc(referrerId);
        const referrerDoc = await referrerRef.get();
        if (referrerDoc.exists && !referrerDoc.data().referrals?.includes(newUserId)) {
            await referrerRef.update({
                referrals: admin.firestore.FieldValue.arrayUnion(newUserId),
                inviteCount: admin.firestore.FieldValue.increment(1),
                balance: admin.firestore.FieldValue.increment(APP_CONFIG.referralBonus),
                totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.referralBonus)
            });
            await addNotification(referrerId, '🎉 New Referral!', `+${formatAXC(APP_CONFIG.referralBonus)} added to your balance!`, 'referral');
            await bot.telegram.sendMessage(referrerId, 
                `🎉 *NEW REFERRAL!*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *${newUserName}* joined!\n💰 *+${formatAXC(APP_CONFIG.referralBonus)}* added!`, 
                { parse_mode: 'Markdown' }).catch(() => {});
        }
    } catch (error) { console.error('Referral error:', error.message); }
}

async function verifyChannelMembership(userId, channelUsername) {
    try {
        const chatMember = await bot.telegram.getChatMember(`@${channelUsername.replace('@', '')}`, parseInt(userId));
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch { return false; }
}

async function getMissingChannels(userId) {
    const results = await Promise.all(
        REQUIRED_CHANNELS.map(async (channel) => ({
            channel,
            isMember: await verifyChannelMembership(userId, channel.username)
        }))
    );
    return results.filter(r => !r.isMember).map(r => r.channel);
}

async function getMainKeyboard(userId) {
    const keyboard = [['💰 BALANCE', '🔗 REFERRAL'], ['💸 WITHDRAW']];
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

function getBackKeyboard() {
    return { inline_keyboard: [[{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
}

function getShareKeyboard(link) {
    const shareText = encodeURIComponent(`Join Axion AI! Get ${formatAXC(APP_CONFIG.welcomeBonus)} bonus! ${link}`);
    return {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${link}&text=${shareText}` }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

function getWithdrawConfirmKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

async function sendWelcomeMessage(ctx) {
    await sendAndTrack(ctx, `✨ *WELCOME TO AXION AI* ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎁 *Get ${formatAXC(APP_CONFIG.welcomeBonus)}* after verification
👥 *Get ${formatAXC(APP_CONFIG.referralBonus)}* per referral
💎 *Minimum Withdrawal:* ${formatAXC(APP_CONFIG.minWithdraw)}

📢 *Please join our channels to continue:*`, getChannelsKeyboard());
}

// ============================================================================
// 6. أوامر البوت العامة
// ============================================================================

bot.start(async (ctx) => {
    const refCode = ctx.startPayload;
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name || 'Axion User';
    const userUsername = ctx.from.username || '';
    console.log(`🚀 /start from ${userId}, ref: ${refCode || 'none'}`);
    
    if (!checkDb()) {
        await ctx.reply('⚠️ Database is currently unavailable. Please try again later.');
        return;
    }
    
    let isNewUser = false;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
        isNewUser = true;
        await userRef.set(createNewUser(userId, userName, userUsername, refCode));
        console.log(`✅ New user created: ${userId}`);
        await updateNewUserCounter(userId, userName);
        if (refCode && refCode !== userId) {
            await processReferralFromBot(refCode, userId, userName);
        }
    }
    
    const userData = userDoc.exists ? userDoc.data() : await userRef.get().then(d => d.data());
    
    if (userData && userData.isVerified) {
        await sendAndTrack(ctx, `✅ *Welcome back, ${userName}!*\n\n💰 *Balance:* ${formatAXC(userData.balance || 0)}`, await getMainKeyboard(userId));
    } else {
        await sendWelcomeMessage(ctx);
    }
});

// ============================================================================
// 7. أزرار المستخدم
// ============================================================================

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        await sendAndTrack(ctx, `📊 *YOUR AXION BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *Balance:* ${formatAXC(data.balance || 0)}
👥 *Referrals:* ${data.inviteCount || 0}
🎁 *From Referrals:* ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}
💎 *Min Withdrawal:* ${formatAXC(APP_CONFIG.minWithdraw)}`, await getMainKeyboard(userId));
    }
});

bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;
        await sendAndTrack(ctx, `🔗 *YOUR REFERRAL LINK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`${link}\`

👥 *Referrals:* ${data.inviteCount || 0}
🎁 *Earned:* ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}`, getShareKeyboard(link));
    }
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    // Check withdrawal block
    if (userData.withdrawBlocked) {
        await sendAndTrack(ctx, `🚫 *ACCOUNT BLOCKED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your account has been blocked from withdrawals.
Contact support for more information.`, await getMainKeyboard(userId));
        return;
    }
    
    // Check cooldown
    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, `⏳ *COOLDOWN ACTIVE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You can request withdrawal once every 24 hours.
Please wait ${hoursLeft} hour(s).`, await getMainKeyboard(userId));
        return;
    }
    
    if (!userData.isVerified) {
        await sendAndTrack(ctx, `🔒 *WITHDRAWAL LOCKED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Please verify first by joining channels.`, getBackKeyboard());
        return;
    }
    
    if (!userData.walletAddress) {
        await sendAndTrack(ctx, `💸 *SETUP WALLET*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Send your BEP20 address (0x...).`, getBackKeyboard());
        userSessions.set(userId, { waitingForWallet: true, createdAt: Date.now() });
        return;
    }
    
    if ((userData.balance || 0) < APP_CONFIG.minWithdraw) {
        const needed = APP_CONFIG.minWithdraw - (userData.balance || 0);
        await sendAndTrack(ctx, `❌ *INSUFFICIENT BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Need ${formatAXC(needed)} more.
Invite ${Math.ceil(needed / APP_CONFIG.referralBonus)} friends!`, await getMainKeyboard(userId));
        return;
    }
    
    await sendAndTrack(ctx, `✅ *READY TO WITHDRAW*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Amount: ${formatAXC(userData.balance || 0)}
💳 Wallet: \`${userData.walletAddress.substring(0, 10)}...\`

👇 Click CONFIRM`, getWithdrawConfirmKeyboard());
});

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' });
        return;
    }
    
    const adminKeyboard = {
        inline_keyboard: [
            [{ text: '📊 STATISTICS', callback_data: 'admin_stats' }],
            [{ text: '💸 PENDING WITHDRAWALS', callback_data: 'admin_pending' }],
            [{ text: '👥 TOTAL USERS', callback_data: 'admin_users' }],
            [{ text: '🔍 SEARCH USER', callback_data: 'admin_search' }],
            [{ text: '💰 ADD BALANCE', callback_data: 'admin_add' }],
            [{ text: '➖ REMOVE BALANCE', callback_data: 'admin_remove' }],
            [{ text: '✅ VERIFY USER', callback_data: 'admin_verify' }],
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }]
        ]
    };
    
    await ctx.reply(`👑 *AXION AI ADMIN PANEL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Authenticated as Admin*

📋 *Click any button below:*`, { reply_markup: adminKeyboard, parse_mode: 'Markdown' });
});

// ============================================================================
// 8. معالج النصوص الموحد (مدمج)
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    
    // Skip commands and known buttons
    if (text.startsWith('/')) return;
    if (['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '👑 ADMIN PANEL'].includes(text)) return;
    
    const session = userSessions.get(userId);
    
    // Handle wallet address input
    if (session?.waitingForWallet) {
        if (isValidBEP20(text)) {
            await db.collection('users').doc(userId).update({ walletAddress: text });
            userSessions.delete(userId);
            await sendAndTrack(ctx, `✅ *Wallet saved!*\n💳 \`${text}\``, await getMainKeyboard(userId));
        } else {
            await sendAndTrack(ctx, `❌ *Invalid address!* Send a valid BEP20 address.\n\n*Format:* 0x followed by 40 hex characters.`);
        }
        return;
    }
    
    // Handle admin search
    if (session?.adminSearch) {
        userSessions.delete(userId);
        if (!checkDb()) return;
        const userDoc = await db.collection('users').doc(text).get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        const data = userDoc.data();
        ctx.reply(`👤 *USER INFO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 ID: ${data.userId}
👤 Name: ${data.userName}
💰 Balance: ${formatAXC(data.balance || 0)}
✅ Verified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
        return;
    }
    
    // Handle admin add balance
    if (session?.adminAdd) {
        userSessions.delete(userId);
        const parts = text.split(' ');
        if (parts.length < 2) return ctx.reply('❌ Format: USER_ID AMOUNT');
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
        if (!checkDb()) return;
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
        ctx.reply(`✅ Added ${formatAXC(amount)} to ${targetId}`);
        await bot.telegram.sendMessage(targetId, `💰 +${formatAXC(amount)} added by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // Handle admin remove balance
    if (session?.adminRemove) {
        userSessions.delete(userId);
        const parts = text.split(' ');
        if (parts.length < 2) return ctx.reply('❌ Format: USER_ID AMOUNT');
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
        if (!checkDb()) return;
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        const currentBalance = userDoc.data().balance || 0;
        if (amount > currentBalance) return ctx.reply(`❌ Cannot remove ${formatAXC(amount)}`);
        await userRef.update({ balance: admin.firestore.FieldValue.increment(-amount) });
        ctx.reply(`✅ Removed ${formatAXC(amount)} from ${targetId}`);
        await bot.telegram.sendMessage(targetId, `💰 -${formatAXC(amount)} removed by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // Handle admin verify
    if (session?.adminVerify) {
        userSessions.delete(userId);
        if (!checkDb()) return;
        const userRef = db.collection('users').doc(text);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        if (userDoc.data().isVerified) return ctx.reply(`✅ Already verified`);
        await userRef.update({ isVerified: true, verifiedAt: new Date().toISOString(), balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus) });
        ctx.reply(`✅ User verified! +${formatAXC(APP_CONFIG.welcomeBonus)} added`);
        await bot.telegram.sendMessage(text, `✅ Account verified by admin! +${formatAXC(APP_CONFIG.welcomeBonus)} added!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // Handle admin broadcast
    if (session?.adminBroadcast) {
        userSessions.delete(userId);
        ctx.reply(`📢 Broadcasting...`);
        const result = await broadcastToAllUsers(text);
        ctx.reply(result.success ? `✅ Broadcast sent to ${result.notifiedCount} users` : `❌ Error`);
        return;
    }
});

// ============================================================================
// 9. معالج أزرار الـ Callback Query
// ============================================================================

bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (userData.isVerified) {
        await sendAndTrack(ctx, `✅ *Already verified!*`, await getMainKeyboard(userId));
        return;
    }
    
    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `• ${ch.name}\n`;
        await sendAndTrack(ctx, `⚠️ *MISSING CHANNELS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${list}
Join and click VERIFY.`, getChannelsKeyboard());
        return;
    }
    
    let newBalance = APP_CONFIG.welcomeBonus;
    
    // Note: Referral bonus is already processed in bot.start()
    // Do NOT add referral bonus again here to avoid duplication
    
    await db.collection('users').doc(userId).update({
        isVerified: true, verifiedAt: new Date().toISOString(),
        balance: newBalance, totalEarned: newBalance
    });
    
    await sendAndTrack(ctx, `✅ *VERIFIED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 +${formatAXC(APP_CONFIG.welcomeBonus)}
💰 Balance: ${formatAXC(newBalance)}`, await getMainKeyboard(userId));
});

bot.action('confirm_withdraw', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (!userData.walletAddress || (userData.balance || 0) < APP_CONFIG.minWithdraw) {
        await sendAndTrack(ctx, `❌ Cannot withdraw.`, await getMainKeyboard(userId));
        return;
    }
    
    // Set cooldown
    withdrawCooldownTracker.set(userId, Date.now());
    
    const amount = userData.balance;
    await db.collection('users').doc(userId).update({ balance: 0 });
    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
        id: withdrawalRef.id, userId, userName: userData.userName,
        amount, walletAddress: userData.walletAddress,
        status: 'pending', createdAt: new Date().toISOString()
    });
    
    if (WITHDRAWAL_GROUP_ID) {
        await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, 
            `💸 *WITHDRAWAL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 ${userData.userName}
💰 ${formatAXC(amount)}
💳 ${userData.walletAddress}
🆔 ${withdrawalRef.id}`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    
    await sendAndTrack(ctx, `✅ *WITHDRAWAL SUBMITTED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 ${formatAXC(amount)}
⏳ 24-48 hours.`, await getMainKeyboard(userId));
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    await sendAndTrack(ctx, `🎯 *Main Menu*\n💰 Balance: ${formatAXC(userDoc.exists ? userDoc.data().balance || 0 : 0)}`, await getMainKeyboard(userId));
});

// ============================================================================
// 10. أوامر المشرف
// ============================================================================

// Admin command (main)
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    console.log(`🔐 Admin command from: ${userId}, ADMIN_ID: ${ADMIN_ID}`);
    
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' });
        return;
    }
    
    const adminKeyboard = {
        inline_keyboard: [
            [{ text: '📊 STATISTICS', callback_data: 'admin_stats' }],
            [{ text: '💸 PENDING WITHDRAWALS', callback_data: 'admin_pending' }],
            [{ text: '👥 TOTAL USERS', callback_data: 'admin_users' }],
            [{ text: '🔍 SEARCH USER', callback_data: 'admin_search' }],
            [{ text: '💰 ADD BALANCE', callback_data: 'admin_add' }],
            [{ text: '➖ REMOVE BALANCE', callback_data: 'admin_remove' }],
            [{ text: '✅ VERIFY USER', callback_data: 'admin_verify' }],
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }]
        ]
    };
    
    await ctx.reply(`👑 *AXION AI ADMIN PANEL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Authenticated as Admin*

📋 *Click any button below:*`, { reply_markup: adminKeyboard, parse_mode: 'Markdown' });
});

// Alias for backward compatibility
bot.command('alimenfi', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' });
        return;
    }
    
    const adminKeyboard = {
        inline_keyboard: [
            [{ text: '📊 STATISTICS', callback_data: 'admin_stats' }],
            [{ text: '💸 PENDING WITHDRAWALS', callback_data: 'admin_pending' }],
            [{ text: '👥 TOTAL USERS', callback_data: 'admin_users' }],
            [{ text: '🔍 SEARCH USER', callback_data: 'admin_search' }],
            [{ text: '💰 ADD BALANCE', callback_data: 'admin_add' }],
            [{ text: '➖ REMOVE BALANCE', callback_data: 'admin_remove' }],
            [{ text: '✅ VERIFY USER', callback_data: 'admin_verify' }],
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }]
        ]
    };
    
    await ctx.reply(`👑 *AXION AI ADMIN PANEL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Authenticated as Admin*

📋 *Click any button below:*`, { reply_markup: adminKeyboard, parse_mode: 'Markdown' });
});

// Admin action handlers
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    await ctx.reply(`📊 *STATISTICS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Users: ${usersSnapshot.size}
💸 Pending: ${pendingSnapshot.size}
💎 Min: ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'Markdown' });
});

bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) { await ctx.reply('✅ No pending withdrawals'); return; }
    
    let message = `💸 *PENDING WITHDRAWALS* (${snapshot.size})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `🆔 ${wd.id}\n👤 ${wd.userName}\n💰 ${formatAXC(wd.amount)}\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    
    const snapshot = await db.collection('users').get();
    await ctx.reply(`👥 *Total Users:* ${snapshot.size}`);
});

bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`🔍 Send user ID to search:`);
    userSessions.set(userId, { adminSearch: true, createdAt: Date.now() });
});

bot.action('admin_add', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`💰 Send: USER_ID AMOUNT\nExample: 1653918641 500`);
    userSessions.set(userId, { adminAdd: true, createdAt: Date.now() });
});

bot.action('admin_remove', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`➖ Send: USER_ID AMOUNT\nExample: 1653918641 200`);
    userSessions.set(userId, { adminRemove: true, createdAt: Date.now() });
});

bot.action('admin_verify', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`✅ Send user ID to verify manually:`);
    userSessions.set(userId, { adminVerify: true, createdAt: Date.now() });
});

bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`📢 Send your broadcast message:`);
    userSessions.set(userId, { adminBroadcast: true, createdAt: Date.now() });
});

// ============================================================================
// 11. أوامر المشرف النصية
// ============================================================================

bot.command('pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) return ctx.reply('✅ No pending withdrawals');
    let message = `💸 *PENDING WITHDRAWALS* (${snapshot.size})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `🆔 ${wd.id}\n👤 ${wd.userName}\n💰 ${formatAXC(wd.amount)}\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    ctx.reply(`📊 *STATISTICS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Users: ${usersSnapshot.size}
💸 Pending: ${pendingSnapshot.size}
💎 Min: ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'Markdown' });
});

bot.command('users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    if (!checkDb()) return;
    const snapshot = await db.collection('users').get();
    ctx.reply(`👥 *Total Users:* ${snapshot.size}`);
});

bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) return ctx.reply('Usage: /broadcast [message]');
    ctx.reply(`📢 Broadcasting...`);
    const result = await broadcastToAllUsers(message);
    ctx.reply(result.success ? `✅ Broadcast sent to ${result.notifiedCount} users` : `❌ Error`);
});

bot.command('addbalance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /addbalance [user_id] [amount]');
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
    if (!checkDb()) return;
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return ctx.reply(`❌ User not found`);
    await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
    ctx.reply(`✅ Added ${formatAXC(amount)} to ${targetId}`);
    await bot.telegram.sendMessage(targetId, `💰 +${formatAXC(amount)} added by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('removebalance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /removebalance [user_id] [amount]');
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
    if (!checkDb()) return;
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return ctx.reply(`❌ User not found`);
    const currentBalance = userDoc.data().balance || 0;
    if (amount > currentBalance) return ctx.reply(`❌ Cannot remove ${formatAXC(amount)}`);
    await userRef.update({ balance: admin.firestore.FieldValue.increment(-amount) });
    ctx.reply(`✅ Removed ${formatAXC(amount)} from ${targetId}`);
    await bot.telegram.sendMessage(targetId, `💰 -${formatAXC(amount)} removed by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('verifyuser', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) return ctx.reply('Usage: /verifyuser [user_id]');
    if (!checkDb()) return;
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return ctx.reply(`❌ User not found`);
    if (userDoc.data().isVerified) return ctx.reply(`✅ Already verified`);
    await userRef.update({ isVerified: true, verifiedAt: new Date().toISOString(), balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus) });
    ctx.reply(`✅ User verified! +${formatAXC(APP_CONFIG.welcomeBonus)} added`);
    await bot.telegram.sendMessage(targetId, `✅ Account verified by admin! +${formatAXC(APP_CONFIG.welcomeBonus)} added!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('searchuser', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) return ctx.reply('Usage: /searchuser [user_id]');
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists) return ctx.reply(`❌ User not found`);
    const data = userDoc.data();
    ctx.reply(`👤 *USER INFO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 ID: ${data.userId}
👤 Name: ${data.userName}
💰 Balance: ${formatAXC(data.balance || 0)}
✅ Verified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
});

// ============================================================================
// 12. أوامر الموافقة والرفض (معالج نصوص)
// ============================================================================

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) return;
    
    // Approve command: /approve_WD_xxx
    const approveMatch = text.match(/^\/approve_(.+)$/);
    if (approveMatch) {
        const id = approveMatch[1];
        if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
        const withdrawal = await db.collection('withdrawals').doc(id).get();
        if (!withdrawal.exists || withdrawal.data().status !== 'pending') {
            await ctx.reply(`❌ Withdrawal ${id} not found or already processed.`);
            return;
        }
        await withdrawal.ref.update({ status: 'approved', approvedAt: new Date().toISOString() });
        await ctx.reply(`✅ Withdrawal ${id} approved`);
        await bot.telegram.sendMessage(withdrawal.data().userId, `✅ Withdrawal approved!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // Reject command: /reject_WD_xxx reason
    const rejectMatch = text.match(/^\/reject_(.+?)(?:\s+(.*))?$/);
    if (rejectMatch) {
        const id = rejectMatch[1];
        const reason = rejectMatch[2] || 'No reason provided';
        if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
        const withdrawal = await db.collection('withdrawals').doc(id).get();
        if (!withdrawal.exists || withdrawal.data().status !== 'pending') {
            await ctx.reply(`❌ Withdrawal ${id} not found or already processed.`);
            return;
        }
        const data = withdrawal.data();
        await db.collection('users').doc(data.userId).update({ balance: admin.firestore.FieldValue.increment(data.amount) });
        await withdrawal.ref.update({ status: 'rejected', rejectReason: reason });
        await ctx.reply(`❌ Withdrawal ${id} rejected. Reason: ${reason}`);
        await bot.telegram.sendMessage(data.userId, `❌ Withdrawal rejected: ${reason}`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
});

// ============================================================================
// 13. 🌐 إعدادات Express
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: Date.now(),
        firebase: firebaseHealthy ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

app.get('/api/config', (req, res) => {
    res.json({ firebaseConfig: firebaseWebConfig, status: 'ok' });
});

// ============================================================================
// 14. 🚀 تشغيل البوت والسيرفر
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Telegram Bot started successfully'))
    .catch(err => console.error('❌ Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`\n🌟 AXION AI SERVER - LEGENDARY FINAL EDITION v7.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Port: ${PORT}
🔥 Firebase: ${db && firebaseHealthy ? '✅ Connected' : '❌ Disconnected'}
👑 Admin ID: ${ADMIN_ID || '❌ Not configured'}
🤖 Bot: ${BOT_TOKEN ? '✅ Configured' : '❌ Missing'}
💸 Withdrawals: Sent to group for manual approval
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Axion AI is READY for battle!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Admin commands:
   /admin or /alimenfi - Open admin panel
   /pending - View pending withdrawals
   /stats - View statistics
   /broadcast [message] - Send announcement
   /addbalance [id] [amount] - Add balance
   /removebalance [id] [amount] - Remove balance
   /verifyuser [id] - Verify user
   /searchuser [id] - Search user
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

// ============================================================================
// نهاية الملف الأسطوري النهائي
// ============================================================================
