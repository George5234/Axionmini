// ============================================================================
// AXION AI BOT - ULTIMATE PROFESSIONAL EDITION v4.0
// ============================================================================
// تم الإنشاء بواسطة: DeepSeek & George (الفريق الأسطوري)
// ============================================================================
// الميزات المحسّنة:
// ✅ تحقق إجباري من 4 قنوات
// ✅ مكافأة ترحيب 100 AXC (~$1)
// ✅ مكافأة إحالة 100 AXC (~$1)
// ✅ حد سحب 1000 AXC (~$10)
// ✅ سحب تلقائي (بدون موافقة) - إشعار فقط للمجموعة
// ✅ أمر بث احترافي (/broadcast)
// ✅ لوحة مشرف متكاملة (أزرار، إحصائيات، بحث، إضافة/خصم رصيد)
// ✅ رسائل نصح للمستخدم (Trust Wallet، BEP20)
// ✅ حذف ذكي للرسائل
// ✅ أزرار رجوع ومشاركة
// ✅ عداد إحالات منفصل (توفير هائل)
// ✅ جميع الأسرار من Render
// ============================================================================

// ============================================================================
// 1. المكتبات والتهيئة الأساسية
// ============================================================================
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 2. قراءة الأسرار من Render Secrets ومتغيرات البيئة
// ============================================================================
let ADMIN_ID = null;
let ADMIN_PASSWORD = null;
let BOT_TOKEN = null;
let WITHDRAWAL_GROUP_ID = null;
let serviceAccount = null;
let firebaseWebConfig = {};

console.log('🔍 Loading secrets...');

try {
    const adminPath = '/etc/secrets/admin-config.json';
    if (fs.existsSync(adminPath)) {
        const adminConfig = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
        ADMIN_ID = adminConfig.admin_id;
        ADMIN_PASSWORD = adminConfig.admin_password;
        console.log('✅ Admin config loaded from secrets');
    } else {
        ADMIN_ID = process.env.ADMIN_ID;
        ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
        if (ADMIN_ID) console.log('✅ Admin ID loaded from environment');
    }
} catch (error) { console.error('Admin config error:', error.message); }

try {
    const firebasePath = '/etc/secrets/firebase-admin-key.json';
    if (fs.existsSync(firebasePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
        console.log('✅ Firebase Admin key loaded from secrets');
    }
} catch (error) { console.error('Firebase Admin key error:', error.message); }

try {
    const configPath = '/etc/secrets/firebase-web-config.json';
    if (fs.existsSync(configPath)) {
        firebaseWebConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ Firebase Web config loaded');
    }
} catch (error) { console.error('Firebase Web config error:', error.message); }

BOT_TOKEN = process.env.BOT_TOKEN;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is required!');
    process.exit(1);
}
console.log(`✅ BOT_TOKEN loaded (length: ${BOT_TOKEN.length})`);
console.log(`✅ WITHDRAWAL_GROUP_ID: ${WITHDRAWAL_GROUP_ID || 'Not set'}`);

// ============================================================================
// 3. تهيئة Firebase Admin SDK
// ============================================================================
let db = null;
if (serviceAccount) {
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        db = admin.firestore();
        console.log('🔥 Firebase Admin SDK initialized');
    } catch (error) { console.error('Firebase init error:', error.message); }
}

// ============================================================================
// 4. إعدادات البوت الأساسية
// ============================================================================
const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 90000 });

const REQUIRED_CHANNELS = [
    { name: 'Axion AI Signal', username: '@AxionAiSignal' },
    { name: 'Axion AI Signals', username: '@AxionAiSignals' },
    { name: 'Airdrop Master VIP', username: '@Airdrop_MasterVIP' },
    { name: 'Daily Airdrop X', username: '@Daily_AirdropX' }
];

const WELCOME_BONUS = 100;
const REFERRAL_BONUS = 100;
const MIN_WITHDRAW = 1000;
const AXC_PRICE = 0.0099;

const userLastMessages = new Map();
const userSessions = new Map();
const adminSessions = new Map();

// ============================================================================
// 5. دوال مساعدة أساسية
// ============================================================================
function formatAXC(amount) {
    const usd = (amount * AXC_PRICE).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function isAdmin(userId) {
    return userId === ADMIN_ID;
}

async function deleteLastMessage(ctx) {
    const lastMsgId = userLastMessages.get(ctx.from.id);
    if (lastMsgId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastMsgId);
        } catch (e) { /* تجاهل */ }
    }
}

async function sendAndTrack(ctx, message, keyboard = null, parseMode = 'Markdown') {
    await deleteLastMessage(ctx);
    const opts = { parse_mode: parseMode };
    if (keyboard) opts.reply_markup = keyboard;
    const sentMsg = await ctx.reply(message, opts);
    userLastMessages.set(ctx.from.id, sentMsg.message_id);
    return sentMsg;
}

async function getMissingChannels(userId) {
    const missing = [];
    for (const channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.telegram.getChatMember(channel.username, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) {
                missing.push(channel);
            }
        } catch { missing.push(channel); }
    }
    return missing;
}

async function incrementReferralCount(referrerId) {
    if (!db) return;
    try {
        const counterRef = db.collection('referral_counts').doc('global');
        await counterRef.set({
            total: admin.firestore.FieldValue.increment(1),
            lastUpdated: new Date().toISOString()
        }, { merge: true });
        
        const userRef = db.collection('user_referrals').doc(referrerId);
        await userRef.set({
            count: admin.firestore.FieldValue.increment(1),
            lastReferral: new Date().toISOString()
        }, { merge: true });
    } catch (error) { console.error('Referral count error:', error); }
}

async function getMainKeyboard(userId) {
    const isAdminUser = isAdmin(userId);
    
    const keyboard = [
        ['💰 BALANCE', '🔗 REFERRAL'],
        ['💸 WITHDRAW']
    ];
    
    if (isAdminUser) {
        keyboard.push(['👑 ADMIN PANEL']);
    }
    
    return {
        keyboard: keyboard,
        resize_keyboard: true,
        persistent: true
    };
}

// ============================================================================
// 6. نظام المستخدمين والتسجيل في Firebase
// ============================================================================
async function getOrCreateUser(userId, userName, username, referredBy = null) {
    if (!db) {
        return {
            userId, userName: userName || 'Axion User', username: username || '',
            balance: 0, totalEarned: 0, inviteCount: 0,
            referredBy, referrals: [], walletAddress: null,
            isVerified: false, verifiedAt: null,
            createdAt: new Date().toISOString(), lastActive: new Date().toISOString()
        };
    }
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (userDoc.exists) return userDoc.data();
        
        const newUser = {
            userId, userName: userName || 'Axion User', username: username || '',
            balance: 0, totalEarned: 0, inviteCount: 0,
            referredBy: referredBy, referrals: [], walletAddress: null,
            isVerified: false, verifiedAt: null,
            createdAt: new Date().toISOString(), lastActive: new Date().toISOString()
        };
        await userRef.set(newUser);
        console.log(`✅ New user created: ${userId} (${userName})`);
        return newUser;
    } catch (error) { console.error('GetOrCreateUser error:', error); return null; }
}

async function updateUser(userId, data) {
    if (!db) return;
    try {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({ ...data, lastActive: new Date().toISOString() });
    } catch (error) { console.error('UpdateUser error:', error); }
}

// ============================================================================
// 7. الأزرار ولوحات المفاتيح
// ============================================================================
function getChannelsKeyboard() {
    const keyboard = [];
    for (const channel of REQUIRED_CHANNELS) {
        keyboard.push([{ text: `📢 ${channel.name}`, url: `https://t.me/${channel.username.substring(1)}` }]);
    }
    keyboard.push([{ text: '✅ VERIFY MEMBERSHIP', callback_data: 'verify_membership' }]);
    return { inline_keyboard: keyboard };
}

function getBackKeyboard() {
    return {
        inline_keyboard: [[{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]]
    };
}

function getShareKeyboard(link) {
    const shareText = encodeURIComponent(`🚀 Join me on Axion AI! 🚀\n\nAxion is an AI-powered trading platform that gives real-time crypto signals.\n\n💰 Get 100 AXC bonus (~$1) after verification!\n👥 Earn 100 AXC (~$1) per referral!\n💎 Minimum withdrawal: 1000 AXC (~$10)\n\nJoin now: ${link}`);
    return {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${shareText}` }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

// ============================================================================
// 8. رسالة الترحيب
// ============================================================================
async function sendWelcomeMessage(ctx) {
    const message = `✨ *WELCOME TO AXION AI* ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*The Future of AI-Powered Trading*

Axion is an advanced AI-driven ecosystem that analyzes market trends and delivers real-time trading signals to maximize your crypto profits.

*Why Axion?*
🤖 *AI Analysis* - 24/7 market monitoring
📊 *Real-time Signals* - Trade with confidence
🚀 *Early Access* - Be among the first 10,000 users
💰 *Passive Income* - Grow your AXC tokens daily

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎁 *Get ${formatAXC(WELCOME_BONUS)}* after verification
👥 *Get ${formatAXC(REFERRAL_BONUS)}* per referral
💎 *Minimum Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📢 *Please join our channels to continue:*`;
    await sendAndTrack(ctx, message, getChannelsKeyboard());
}

// ============================================================================
// 9. أمر البث (Broadcast) - احترافي
// ============================================================================
bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ *Access denied!* Only admin can broadcast.', { parse_mode: 'Markdown' });
        return;
    }
    
    const session = adminSessions.get(userId);
    if (!session || session.step !== 'authenticated') {
        await ctx.reply('⚠️ *Authentication Required*\n━━━━━━━━━━━━━━━━━━━━━━\nPlease use /alimenfi first.', { parse_mode: 'Markdown' });
        return;
    }
    
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) {
        await ctx.reply(`📢 *BROADCAST INSTRUCTIONS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: /broadcast [your message]

*Example:*
/broadcast 🎉 New update! Check the app for bonuses.

*Tips:*
• You can use emojis
• Message will be sent to ALL users
• Supports Markdown formatting

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *Warning:* This will notify every user.`, { parse_mode: 'Markdown' });
        return;
    }
    
    await ctx.reply(`📢 *Broadcasting...*\n━━━━━━━━━━━━━━━━━━━━━━\nSending to all users.`, { parse_mode: 'Markdown' });
    
    if (!db) {
        await ctx.reply('❌ Database not connected.');
        return;
    }
    
    const usersSnapshot = await db.collection('users').get();
    let sentCount = 0;
    let failedCount = 0;
    
    const notification = {
        id: `broadcast_${Date.now()}`,
        type: 'broadcast',
        title: '📢 Announcement',
        message: message,
        read: false,
        timestamp: new Date().toISOString()
    };
    
    for (const doc of usersSnapshot.docs) {
        try {
            const userRef = db.collection('users').doc(doc.id);
            await userRef.update({
                notifications: admin.firestore.FieldValue.arrayUnion(notification)
            });
            sentCount++;
        } catch (e) { failedCount++; }
        
        // إرسال رسالة مباشرة أيضاً
        try {
            await bot.telegram.sendMessage(doc.id, `📢 *ANNOUNCEMENT*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${message}\n\n━━━━━━━━━━━━━━━━━━━━━━\n*Axion AI Team*`, { parse_mode: 'Markdown' });
        } catch(e) { /* المستخدم قد يكون حظر البوت */ }
    }
    
    await ctx.reply(`✅ *BROADCAST COMPLETED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *Statistics:*
✅ Sent: ${sentCount} users
❌ Failed: ${failedCount} users

📝 *Message:* 
${message.substring(0, 200)}${message.length > 200 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Broadcast has been delivered.*`, { parse_mode: 'Markdown' });
});

// ============================================================================
// 10. أوامر المشرف (نظام المصادقة)
// ============================================================================

// أمر المصادقة
bot.command('alimenfi', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ Access denied!');
        return;
    }
    await ctx.reply('🔐 *Admin Authentication*\n━━━━━━━━━━━━━━━━━━━━━━\nPlease enter your admin password:', { parse_mode: 'Markdown' });
    adminSessions.set(userId, { step: 'awaiting_password' });
});

// التحقق من صلاحية المشرف
async function isAdminAuthenticated(ctx) {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return false;
    const session = adminSessions.get(userId);
    if (!session || session.step !== 'authenticated') {
        await ctx.reply('⚠️ *Authentication Required*\n━━━━━━━━━━━━━━━━━━━━━━\nPlease use /alimenfi first.', { parse_mode: 'Markdown' });
        return false;
    }
    if (Date.now() - session.authenticatedAt > 60 * 60 * 1000) {
        adminSessions.delete(userId);
        await ctx.reply('⚠️ *Session Expired*\n━━━━━━━━━━━━━━━━━━━━━━\nPlease use /alimenfi again.', { parse_mode: 'Markdown' });
        return false;
    }
    return true;
}

// لوحة المشرف الرئيسية (أزرار تفاعلية)
async function showAdminPanel(ctx) {
    const adminKeyboard = {
        inline_keyboard: [
            [{ text: '📊 STATISTICS', callback_data: 'admin_stats' }],
            [{ text: '💸 PENDING WITHDRAWALS', callback_data: 'admin_pending' }],
            [{ text: '👥 TOTAL USERS', callback_data: 'admin_users' }],
            [{ text: '🔍 SEARCH USER', callback_data: 'admin_search' }],
            [{ text: '💰 ADD BALANCE', callback_data: 'admin_add' }],
            [{ text: '➖ REMOVE BALANCE', callback_data: 'admin_remove' }],
            [{ text: '✅ VERIFY USER', callback_data: 'admin_verify' }],
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
    
    await sendAndTrack(ctx, `👑 *AXION AI ADMIN PANEL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Welcome, Administrator!*

📋 *Click any button below to execute commands*

📊 *Quick Stats:*
• ${new Date().toLocaleString()}
• Admin ID: ${ADMIN_ID}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Tip:* Use /broadcast [message] for announcements`, adminKeyboard);
}

// زر ADMIN PANEL
bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' });
        return;
    }
    if (!await isAdminAuthenticated(ctx)) return;
    await showAdminPanel(ctx);
});

// معالج أزرار لوحة المشرف
bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const usersSnapshot = await db.collection('users').get();
    const verifiedUsers = usersSnapshot.docs.filter(doc => doc.data().isVerified === true).length;
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    const totalBalance = usersSnapshot.docs.reduce((sum, doc) => sum + (doc.data().balance || 0), 0);
    
    await ctx.reply(`📊 *AXION AI STATISTICS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👥 *Total Users:* ${usersSnapshot.size}
✅ *Verified Users:* ${verifiedUsers}
💸 *Pending Withdrawals:* ${pendingSnapshot.size}
💰 *Total Balance:* ${formatAXC(totalBalance)}
💎 *Min Withdrawal:* ${formatAXC(MIN_WITHDRAW)}
📈 *Token Price:* $${AXC_PRICE}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 *Status:* ✅ Online
📅 *Last Updated:* ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
});

bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) {
        await ctx.reply('✅ *No pending withdrawals*\n━━━━━━━━━━━━━━━━━━━━━━\nAll withdrawal requests have been processed.', { parse_mode: 'Markdown' });
        return;
    }
    
    let message = `💸 *PENDING WITHDRAWALS* (${snapshot.size})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `🆔 *ID:* ${wd.id}\n👤 *User:* ${wd.userName}\n💰 *Amount:* ${formatAXC(wd.amount)}\n💳 *Wallet:* ${wd.walletAddress.substring(0, 10)}...\n📅 *Date:* ${new Date(wd.createdAt).toLocaleString()}\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('admin_users', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const snapshot = await db.collection('users').get();
    await ctx.reply(`👥 *TOTAL REGISTERED USERS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *Count:* ${snapshot.size} users

📈 *Growth:* +${snapshot.size} since launch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Use /search [user_id] to find specific users*`, { parse_mode: 'Markdown' });
});

bot.action('admin_search', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`🔍 *SEARCH USER*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please send the user ID to search.

*Example:* \`1653918641\`

📝 *Type or paste the user ID below:*`, { parse_mode: 'Markdown' });
    adminSessions.set(ctx.from.id.toString(), { step: 'awaiting_search_id' });
});

bot.action('admin_add', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`💰 *ADD BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please send the user ID and amount.

*Format:* \`USER_ID AMOUNT\`
*Example:* \`1653918641 500\`

📝 *Type or paste below:*`, { parse_mode: 'Markdown' });
    adminSessions.set(ctx.from.id.toString(), { step: 'awaiting_add_data' });
});

bot.action('admin_remove', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`➖ *REMOVE BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please send the user ID and amount.

*Format:* \`USER_ID AMOUNT\`
*Example:* \`1653918641 200\`

📝 *Type or paste below:*`, { parse_mode: 'Markdown' });
    adminSessions.set(ctx.from.id.toString(), { step: 'awaiting_remove_data' });
});

bot.action('admin_verify', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`✅ *VERIFY USER*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please send the user ID to verify manually.

*Example:* \`1653918641\`

📝 *Type or paste below:*`, { parse_mode: 'Markdown' });
    adminSessions.set(ctx.from.id.toString(), { step: 'awaiting_verify_id' });
});

bot.action('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString()) || !await isAdminAuthenticated(ctx)) {
        await ctx.answerCbQuery('Access denied!');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`📢 *BROADCAST MESSAGE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please send the message you want to broadcast.

*Format:* /broadcast [your message]
*Example:* /broadcast 🎉 New update!

📝 *Type or paste below:*`, { parse_mode: 'Markdown' });
});

// معالج أوامر المشرف النصية
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    const session = adminSessions.get(userId);
    
    // تجاهل الأزرار
    if (['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '👑 ADMIN PANEL'].includes(text)) return;
    
    // معالج كلمة مرور المشرف
    if (session?.step === 'awaiting_password') {
        if (text === ADMIN_PASSWORD) {
            adminSessions.set(userId, { step: 'authenticated', authenticatedAt: Date.now() });
            await ctx.reply(`✅ *Authentication Successful!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👑 *Axion AI Admin Panel*

📋 *Available Commands:*

/pending - View pending withdrawals
/stats - View bot statistics
/search [id] - Search user
/verify [id] - Manually verify user
/add [id] [amount] - Add balance
/remove [id] [amount] - Remove balance
/broadcast [message] - Send announcement

🔐 *Session expires in 1 hour*

👇 *Click ADMIN PANEL button to start*`, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`❌ *Wrong password!* Access denied.`, { parse_mode: 'Markdown' });
            adminSessions.delete(userId);
        }
        return;
    }
    
    // معالج البحث عن مستخدم
    if (session?.step === 'awaiting_search_id') {
        adminSessions.delete(userId);
        if (!db) { await ctx.reply('❌ Database not connected.'); return; }
        
        const targetId = text.trim();
        const userDoc = await db.collection('users').doc(targetId).get();
        if (!userDoc.exists) {
            await ctx.reply(`❌ User ${targetId} not found.`);
            return;
        }
        
        const user = userDoc.data();
        await ctx.reply(`👤 *USER INFO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🆔 *ID:* ${user.userId}
👤 *Name:* ${user.userName}
💰 *Balance:* ${formatAXC(user.balance || 0)}
👥 *Referrals:* ${user.inviteCount || 0}
✅ *Verified:* ${user.isVerified ? 'Yes' : 'No'}
💳 *Wallet:* ${user.walletAddress ? user.walletAddress.substring(0, 10) + '...' : 'Not set'}
📅 *Joined:* ${new Date(user.createdAt).toLocaleDateString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Use admin panel for more actions*`, { parse_mode: 'Markdown' });
        return;
    }
    
    // معالج إضافة رصيد
    if (session?.step === 'awaiting_add_data') {
        adminSessions.delete(userId);
        const parts = text.trim().split(' ');
        if (parts.length < 2) {
            await ctx.reply('❌ Invalid format. Use: USER_ID AMOUNT');
            return;
        }
        
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Invalid amount.');
            return;
        }
        
        if (!db) { await ctx.reply('❌ Database not connected.'); return; }
        
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            await ctx.reply(`❌ User ${targetId} not found.`);
            return;
        }
        
        await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
        await ctx.reply(`✅ Added ${formatAXC(amount)} to user ${targetId}`);
        
        await bot.telegram.sendMessage(targetId, `💰 *Admin Added Balance!*\n\n+${formatAXC(amount)} added to your account!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // معالج خصم رصيد
    if (session?.step === 'awaiting_remove_data') {
        adminSessions.delete(userId);
        const parts = text.trim().split(' ');
        if (parts.length < 2) {
            await ctx.reply('❌ Invalid format. Use: USER_ID AMOUNT');
            return;
        }
        
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Invalid amount.');
            return;
        }
        
        if (!db) { await ctx.reply('❌ Database not connected.'); return; }
        
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            await ctx.reply(`❌ User ${targetId} not found.`);
            return;
        }
        
        await userRef.update({ balance: admin.firestore.FieldValue.increment(-amount) });
        await ctx.reply(`✅ Removed ${formatAXC(amount)} from user ${targetId}`);
        
        await bot.telegram.sendMessage(targetId, `💰 *Admin Removed Balance!*\n\n-${formatAXC(amount)} removed from your account.`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // معالج التحقق اليدوي
    if (session?.step === 'awaiting_verify_id') {
        adminSessions.delete(userId);
        const targetId = text.trim();
        
        if (!db) { await ctx.reply('❌ Database not connected.'); return; }
        
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            await ctx.reply(`❌ User ${targetId} not found.`);
            return;
        }
        
        const user = userDoc.data();
        if (user.isVerified) {
            await ctx.reply(`✅ User ${targetId} is already verified.`);
            return;
        }
        
        await userRef.update({ isVerified: true, verifiedAt: new Date().toISOString(), balance: admin.firestore.FieldValue.increment(WELCOME_BONUS) });
        await ctx.reply(`✅ User ${targetId} verified successfully! +${formatAXC(WELCOME_BONUS)} added.`);
        
        await bot.telegram.sendMessage(targetId, `✅ *Account Verified by Admin!*\n\n+${formatAXC(WELCOME_BONUS)} added to your balance!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // معالج عنوان المحفظة
    const userSession = userSessions.get(userId);
    if (userSession?.waitingForWallet && text.startsWith('0x') && text.length === 42) {
        await updateUser(userId, { walletAddress: text });
        userSessions.delete(userId);
        const mainKeyboard = await getMainKeyboard(userId);
        const message = `✅ *Wallet saved!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 \`${text}\`

⚠️ *Important:*
• Send only BEP20 tokens to this address
• Minimum withdrawal: ${formatAXC(MIN_WITHDRAW)}
• Use Trust Wallet or any BSC-compatible wallet

Now click *WITHDRAW* to continue.`;
        await sendAndTrack(ctx, message, mainKeyboard);
    } else if (userSession?.waitingForWallet) {
        await sendAndTrack(ctx, `❌ *Invalid address!* 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please send a valid *BEP20 wallet address*.

*Example:* \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0\`

*Where to get it?*
• Open Trust Wallet
• Click "Receive"
• Select BSC (BEP20)
• Copy your address

📝 *Try again:*`);
    }
});

// ============================================================================
// 11. أوامر البوت العامة (للمستخدمين)
// ============================================================================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name || 'Axion User';
    const username = ctx.from.username || '';
    const referrerId = ctx.startPayload;
    
    let user = await getOrCreateUser(userId, userName, username, referrerId);
    if (!user) return;
    
    if (referrerId && referrerId !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: referrerId });
    }
    
    const mainKeyboard = await getMainKeyboard(userId);
    
    if (user.isVerified) {
        await sendAndTrack(ctx, `✅ *Welcome back, ${userName}!*\n\n💰 *Balance:* ${formatAXC(user.balance || 0)}`, mainKeyboard);
        return;
    }
    await sendWelcomeMessage(ctx);
});

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    const mainKeyboard = await getMainKeyboard(userId);
    const message = `📊 *YOUR AXION BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *Balance:* ${formatAXC(user.balance || 0)}
👥 *Referrals:* ${user.inviteCount || 0}
🎁 *From Referrals:* ${formatAXC((user.inviteCount || 0) * REFERRAL_BONUS)}
💎 *Min Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Need more?*
• Invite friends → ${formatAXC(REFERRAL_BONUS)} each
• Complete verification if not done yet

👇 *Use the buttons below*`;
    await sendAndTrack(ctx, message, mainKeyboard);
});

bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    const botInfo = await bot.telegram.getMe();
    const link = `https://t.me/${botInfo.username}?start=${userId}`;
    const message = `🔗 *YOUR REFERRAL LINK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`${link}\`

📊 *Referral Stats:*
👥 *Total Referrals:* ${user.inviteCount || 0}
🎁 *Earned:* ${formatAXC((user.inviteCount || 0) * REFERRAL_BONUS)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *How it works:*
1. Share your link with friends
2. They join and verify
3. You get ${formatAXC(REFERRAL_BONUS)} instantly

👇 *Share your link now*`;
    
    await sendAndTrack(ctx, message, getShareKeyboard(link));
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    
    if (!user.isVerified) {
        const message = `🔒 *WITHDRAWAL LOCKED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *You haven't completed verification yet!*

To unlock withdrawals, you must:
✅ Join all required channels
✅ Click VERIFY button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *After verification, you'll get ${formatAXC(WELCOME_BONUS)} bonus!*

👇 *Go back to main menu*`;
        await sendAndTrack(ctx, message, getBackKeyboard());
        return;
    }
    
    if (!user.walletAddress) {
        const message = `💸 *WITHDRAWAL SETUP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *No wallet address found*

📝 *How to set up Trust Wallet:*
1. Download Trust Wallet app
2. Create new wallet (save recovery phrase!)
3. Tap "Receive"
4. Select "Smart Chain (BSC/BEP20)"
5. Copy your wallet address (starts with 0x)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✏️ *Send your BEP20 address below:*`;
        await sendAndTrack(ctx, message, getBackKeyboard());
        userSessions.set(userId, { waitingForWallet: true });
        return;
    }
    
    if ((user.balance || 0) < MIN_WITHDRAW) {
        const needed = MIN_WITHDRAW - (user.balance || 0);
        const mainKeyboard = await getMainKeyboard(userId);
        const message = `❌ *INSUFFICIENT BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *Your Balance:* ${formatAXC(user.balance || 0)}
💰 *Minimum Required:* ${formatAXC(MIN_WITHDRAW)}
🔄 *Need:* ${formatAXC(needed)} more

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *How to reach minimum?*
• Invite ${Math.ceil(needed / REFERRAL_BONUS)} friends → ${formatAXC(REFERRAL_BONUS)} each
• Each referral gives ${formatAXC(REFERRAL_BONUS)}

👇 *Keep going! You're almost there*`;
        await sendAndTrack(ctx, message, mainKeyboard);
        return;
    }
    
    const amount = user.balance;
    
    // خصم الرصيد فوراً
    await updateUser(userId, { balance: 0 });
    
    // تسجيل طلب السحب
    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
        id: withdrawalRef.id, userId, userName: user.userName,
        amount, walletAddress: user.walletAddress,
        status: 'approved',  // تمت الموافقة تلقائياً
        createdAt: new Date().toISOString()
    });
    
    // إرسال إشعار لمجموعة السحب (للمتابعة فقط)
    if (WITHDRAWAL_GROUP_ID) {
        try {
            await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, 
                `💸 *WITHDRAWAL PROCESSED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 *User:* ${user.userName} (${userId})
💰 *Amount:* ${formatAXC(amount)}
💳 *Wallet:* \`${user.walletAddress}\`
🆔 *ID:* ${withdrawalRef.id}
📅 *Date:* ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Status:* ✅ Auto-approved
*Processing:* 24-48 hours`, { parse_mode: 'Markdown' }
            ).catch(() => {});
        } catch(e) { console.error('Failed to send to group:', e.message); }
    }
    
    const mainKeyboard = await getMainKeyboard(userId);
    const message = `✅ *WITHDRAWAL REQUEST SUBMITTED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *Amount:* ${formatAXC(amount)}
💳 *Wallet:* \`${user.walletAddress.substring(0, 10)}...\`
🆔 *Request ID:* ${withdrawalRef.id}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏳ *Processing Time:* 24-48 hours
📱 *Wallet:* Trust Wallet / BSC-compatible

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *Important:*
• Funds will be sent to your BEP20 address
• Double-check your wallet address
• Contact support if not received within 48 hours

*Thank you for being part of Axion AI!* 🚀`;
    
    await sendAndTrack(ctx, message, mainKeyboard);
});

// ============================================================================
// 12. نظام التحقق من القنوات
// ============================================================================
bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    if (!user) return;
    
    if (user.isVerified) {
        const mainKeyboard = await getMainKeyboard(userId);
        await sendAndTrack(ctx, `✅ *Already verified!*\n💰 ${formatAXC(user.balance || 0)}`, mainKeyboard);
        return;
    }
    
    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `• ${ch.name} (@${ch.username.substring(1)})\n`;
        const message = `⚠️ *VERIFICATION INCOMPLETE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📢 *Missing channels:*
${list}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👉 *Please join all required channels first*
👉 *Then click VERIFY again*

🎁 *Your ${formatAXC(WELCOME_BONUS)} reward awaits!*`;
        await sendAndTrack(ctx, message, getChannelsKeyboard());
        return;
    }
    
    let newBalance = WELCOME_BONUS;
    if (user.referredBy && user.referredBy !== userId) {
        try {
            const referrerRef = db.collection('users').doc(user.referredBy);
            const referrerDoc = await referrerRef.get();
            if (referrerDoc.exists) {
                await referrerRef.update({
                    balance: admin.firestore.FieldValue.increment(REFERRAL_BONUS),
                    inviteCount: admin.firestore.FieldValue.increment(1),
                    totalEarned: admin.firestore.FieldValue.increment(REFERRAL_BONUS)
                });
                await incrementReferralCount(user.referredBy);
                await bot.telegram.sendMessage(user.referredBy, `🎉 *New Referral!* +${formatAXC(REFERRAL_BONUS)}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
        } catch (e) { console.error('Referral bonus error:', e); }
    }
    
    await updateUser(userId, { isVerified: true, verifiedAt: new Date().toISOString(), balance: newBalance, totalEarned: newBalance });
    
    const mainKeyboard = await getMainKeyboard(userId);
    const message = `✅ *VERIFICATION SUCCESSFUL* ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 *Welcome to the Axion AI family!*

💰 *+${formatAXC(WELCOME_BONUS)}* added to your balance

📊 *Your Balance:* ${formatAXC(newBalance)}
👥 *Referrals:* 0
💎 *Min Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 *What's next?*
1. Invite friends to earn more
2. Build your balance to ${formatAXC(MIN_WITHDRAW)}
3. Withdraw to your Trust Wallet

👇 *Use the buttons below to start*`;
    await sendAndTrack(ctx, message, mainKeyboard);
});

// ============================================================================
// 13. أزرار التنقل العامة
// ============================================================================
bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    const mainKeyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `🎯 *MAIN MENU*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *Balance:* ${formatAXC(user?.balance || 0)}
👥 *Referrals:* ${user?.inviteCount || 0}

👇 *Select an option below*`, mainKeyboard);
});

// ============================================================================
// 14. تشغيل البوت
// ============================================================================
bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Axion AI Bot launched successfully'))
    .catch(err => console.error('Bot launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ============================================================================
// 15. إعدادات Express (السيرفر الخفيف)
// ============================================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ status: 'alive', timestamp: Date.now() }));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/api/config', (req, res) => res.json({ firebaseConfig: firebaseWebConfig, status: 'ok' }));

// ============================================================================
// 16. تشغيل السيرفر وعرض معلومات البوت النهائية
// ============================================================================
app.listen(PORT, () => {
    console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

bot.telegram.getMe().then((botInfo) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📢 Bot: @${botInfo.username}`);
    console.log(`✅ Axion AI Bot - Ultimate Professional Edition v4.0`);
    console.log(`👑 Admin ID: ${ADMIN_ID}`);
    console.log(`💎 Withdraw: ${MIN_WITHDRAW} AXC ($${MIN_WITHDRAW * AXC_PRICE})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 Axion AI is READY for battle!`);
    console.log(`🔐 Admin auth: /alimenfi`);
    console.log(`📢 Broadcast: /broadcast [message]`);
    console.log(`💸 Withdrawals: Auto-approved, sent to group`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}).catch(err => console.error('Failed to get bot info:', err.message));

// ============================================================================
// نهاية الملف الأسطوري المحسّن
// ============================================================================
