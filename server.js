// ============================================================================
// AXION AI BOT - COMPLETE FINAL VERSION
// ============================================================================
// جميع الميزات:
// ✅ تحقق إجباري من 4 قنوات
// ✅ مكافأة ترحيب 100 AXC (~$1)
// ✅ مكافأة إحالة 100 AXC (~$1)
// ✅ حد سحب 1000 AXC (~$10)
// ✅ سحب يدوي (إشعار للمجموعة)
// ✅ أمر بث احترافي (/broadcast)
// ✅ لوحة مشرف متكاملة (أزرار وأوامر)
// ✅ حذف ذكي للرسائل
// ✅ أزرار رجوع ومشاركة
// ✅ عداد إحالات منفصل
// ✅ جميع الأسرار من Render
// ✅ مصادقة مشرف مبسطة (بدون كلمة مرور)
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
// 2. ⚙️ إعدادات Axion
// ============================================================================

const APP_CONFIG = {
    welcomeBonus: 100,
    referralBonus: 100,
    minWithdraw: 1000,
    botUsername: "AxionBep20Airdropbot",
    axcPrice: 0.0099
};

const REQUIRED_CHANNELS = [
    { name: 'Axion AI Signal', username: '@AxionAiSignal' },
    { name: 'Axion AI Signals', username: '@AxionAiSignals' },
    { name: 'Airdrop Master VIP', username: '@Airdrop_MasterVIP' },
    { name: 'Daily Airdrop X', username: '@Daily_AirdropX' }
];

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
    } catch (error) { console.error('Firebase init error:', error.message); }
}

// ============================================================================
// 4. 🤖 Telegram Bot
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);
const botAdminSessions = new Map();
const userLastMessages = new Map();
const userSessions = new Map();

// ============================================================================
// 4.1 دوال مساعدة
// ============================================================================

function formatAXC(amount) {
    const usd = (amount * APP_CONFIG.axcPrice).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function isAdmin(userId) {
    return userId === ADMIN_ID;
}

async function deleteLastMessage(ctx) {
    const lastMsgId = userLastMessages.get(ctx.from.id);
    if (lastMsgId) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, lastMsgId); } catch (e) {}
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

async function addNotification(targetUserId, title, message, type = 'info') {
    if (!db) return;
    try {
        const notifData = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            type: type,
            title: title,
            message: message,
            read: false,
            timestamp: new Date().toISOString()
        };
        await db.collection('users').doc(targetUserId).update({
            notifications: admin.firestore.FieldValue.arrayUnion(notifData)
        });
    } catch (error) {}
}

async function broadcastToAllUsers(message) {
    if (!db) return { success: false };
    try {
        const usersSnapshot = await db.collection('users').get();
        let notifiedCount = 0;
        let batch = db.batch();
        let batchCount = 0;
        const notification = {
            id: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            type: 'broadcast',
            title: '📢 Announcement',
            message: message,
            read: false,
            timestamp: new Date().toISOString()
        };
        for (const doc of usersSnapshot.docs) {
            batch.update(db.collection('users').doc(doc.id), {
                notifications: admin.firestore.FieldValue.arrayUnion(notification)
            });
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
        for (const doc of usersSnapshot.docs) {
            try { await bot.telegram.sendMessage(doc.id, `📢 *Announcement*\n\n${message}`, { parse_mode: 'Markdown' }); } catch(e) {}
        }
        return { success: true, notifiedCount };
    } catch (error) { return { success: false }; }
}

async function updateNewUserCounter(userId, userName) {
    if (!db) return;
    try {
        const counterRef = db.collection('system').doc('newUserCounter');
        const doc = await counterRef.get();
        const newCount = (doc.data()?.count || 0) + 1;
        await counterRef.set({ count: newCount, lastUserId: userId, lastUserName: userName });
        if (ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID, `🆕 New user: ${userName}\nID: ${userId}\nTotal: ${newCount}`);
        }
    } catch (error) {}
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
    if (!db) return;
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
    } catch (error) {}
}

async function verifyChannelMembership(userId, channelUsername) {
    try {
        const chatMember = await bot.telegram.getChatMember(`@${channelUsername.replace('@', '')}`, parseInt(userId));
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch { return false; }
}

async function getMissingChannels(userId) {
    const missing = [];
    for (const channel of REQUIRED_CHANNELS) {
        if (!(await verifyChannelMembership(userId, channel.username))) missing.push(channel);
    }
    return missing;
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
// 4.2 أوامر البوت العامة
// ============================================================================

bot.start(async (ctx) => {
    const refCode = ctx.startPayload;
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name || 'Axion User';
    const userUsername = ctx.from.username || '';
    console.log(`🚀 /start from ${userId}, ref: ${refCode || 'none'}`);
    
    let isNewUser = false;
    if (db) {
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
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (userData && userData.isVerified) {
        await sendAndTrack(ctx, `✅ *Welcome back, ${userName}!*\n\n💰 *Balance:* ${formatAXC(userData.balance || 0)}`, await getMainKeyboard(userId));
    } else {
        await sendWelcomeMessage(ctx);
    }
});

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!db) return;
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
    if (!db) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        const link = `https://t.me/${APP_CONFIG.botUsername}?start=${userId}`;
        await sendAndTrack(ctx, `🔗 *YOUR REFERRAL LINK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`${link}\`

👥 *Referrals:* ${data.inviteCount || 0}
🎁 *Earned:* ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}`, getShareKeyboard(link));
    }
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!db) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (!userData.isVerified) {
        await sendAndTrack(ctx, `🔒 *WITHDRAWAL LOCKED*\nPlease verify first by joining channels.`, getBackKeyboard());
        return;
    }
    
    if (!userData.walletAddress) {
        await sendAndTrack(ctx, `💸 *SETUP WALLET*\nSend your BEP20 address (0x...).`, getBackKeyboard());
        userSessions.set(userId, { waitingForWallet: true });
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

// ============================================================================
// 4.3 معالج النصوص (عنوان المحفظة)
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    if (text.startsWith('/') || ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '👑 ADMIN PANEL'].includes(text)) return;
    
    const session = userSessions.get(userId);
    if (session?.waitingForWallet && text.startsWith('0x') && text.length === 42) {
        await db.collection('users').doc(userId).update({ walletAddress: text });
        userSessions.delete(userId);
        await sendAndTrack(ctx, `✅ *Wallet saved!*\n💳 \`${text}\``, await getMainKeyboard(userId));
    } else if (session?.waitingForWallet) {
        await sendAndTrack(ctx, `❌ *Invalid address!* Send a valid BEP20 address (0x...).`);
    }
});

// ============================================================================
// 4.4 معالج أزرار الـ Callback Query
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
    if (userData.referredBy && userData.referredBy !== userId) {
        try {
            const referrerRef = db.collection('users').doc(userData.referredBy);
            const referrerDoc = await referrerRef.get();
            if (referrerDoc.exists) {
                await referrerRef.update({
                    balance: admin.firestore.FieldValue.increment(APP_CONFIG.referralBonus),
                    inviteCount: admin.firestore.FieldValue.increment(1)
                });
                await bot.telegram.sendMessage(userData.referredBy, `🎉 *New Referral!* +${formatAXC(APP_CONFIG.referralBonus)}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
        } catch (e) {}
    }
    
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
// 4.5 أوامر المشرف (مبسطة وتعمل 100%)
// ============================================================================

bot.command('alimenfi', async (ctx) => {
    const userId = ctx.from.id.toString();
    console.log(`🔐 Admin command from: ${userId}, ADMIN_ID: ${ADMIN_ID}`);
    
    if (userId !== ADMIN_ID) {
        await ctx.reply('⛔ *Access denied!* You are not the admin.', { parse_mode: 'Markdown' });
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

// زر ADMIN PANEL
bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) {
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

// معالج أزرار المشرف
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!db) { await ctx.reply('❌ Database error'); return; }
    
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
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!db) { await ctx.reply('❌ Database error'); return; }
    
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
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!db) { await ctx.reply('❌ Database error'); return; }
    
    const snapshot = await db.collection('users').get();
    await ctx.reply(`👥 *Total Users:* ${snapshot.size}`);
});

bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`🔍 Send user ID to search:`);
    userSessions.set(userId, { adminSearch: true });
});

bot.action('admin_add', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`💰 Send: USER_ID AMOUNT\nExample: 1653918641 500`);
    userSessions.set(userId, { adminAdd: true });
});

bot.action('admin_remove', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`➖ Send: USER_ID AMOUNT\nExample: 1653918641 200`);
    userSessions.set(userId, { adminRemove: true });
});

bot.action('admin_verify', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`✅ Send user ID to verify manually:`);
    userSessions.set(userId, { adminVerify: true });
});

bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`📢 Send your broadcast message:`);
    userSessions.set(userId, { adminBroadcast: true });
});

// ============================================================================
// 4.6 معالج الأوامر الإدارية من النصوص
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    const session = userSessions.get(userId);
    
    if (session?.adminSearch) {
        userSessions.delete(userId);
        if (!db) return;
        const userDoc = await db.collection('users').doc(text).get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        const data = userDoc.data();
        ctx.reply(`👤 *USER INFO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 ID: ${data.userId}
👤 Name: ${data.userName}
💰 Balance: ${formatAXC(data.balance || 0)}
✅ Verified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
    }
    
    if (session?.adminAdd) {
        userSessions.delete(userId);
        const parts = text.split(' ');
        if (parts.length < 2) return ctx.reply('❌ Format: USER_ID AMOUNT');
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
        if (!db) return;
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
        ctx.reply(`✅ Added ${formatAXC(amount)} to ${targetId}`);
        await bot.telegram.sendMessage(targetId, `💰 +${formatAXC(amount)} added by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    
    if (session?.adminRemove) {
        userSessions.delete(userId);
        const parts = text.split(' ');
        if (parts.length < 2) return ctx.reply('❌ Format: USER_ID AMOUNT');
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
        if (!db) return;
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        const currentBalance = userDoc.data().balance || 0;
        if (amount > currentBalance) return ctx.reply(`❌ Cannot remove ${formatAXC(amount)}`);
        await userRef.update({ balance: admin.firestore.FieldValue.increment(-amount) });
        ctx.reply(`✅ Removed ${formatAXC(amount)} from ${targetId}`);
        await bot.telegram.sendMessage(targetId, `💰 -${formatAXC(amount)} removed by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    
    if (session?.adminVerify) {
        userSessions.delete(userId);
        if (!db) return;
        const userRef = db.collection('users').doc(text);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        if (userDoc.data().isVerified) return ctx.reply(`✅ Already verified`);
        await userRef.update({ isVerified: true, verifiedAt: new Date().toISOString(), balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus) });
        ctx.reply(`✅ User verified! +${formatAXC(APP_CONFIG.welcomeBonus)} added`);
        await bot.telegram.sendMessage(text, `✅ Account verified by admin! +${formatAXC(APP_CONFIG.welcomeBonus)} added!`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    
    if (session?.adminBroadcast) {
        userSessions.delete(userId);
        ctx.reply(`📢 Broadcasting...`);
        const result = await broadcastToAllUsers(text);
        ctx.reply(result.success ? `✅ Broadcast sent to ${result.notifiedCount} users` : `❌ Error`);
    }
});

// ============================================================================
// 4.7 أوامر المشرف النصية (للمشرف فقط)
// ============================================================================

bot.command('pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    if (!db) return;
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
    if (userId !== ADMIN_ID) return;
    if (!db) return;
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    ctx.reply(`📊 *STATISTICS*\n━━━━━━━━━━━━━━━━━━━━━━\n👥 Users: ${usersSnapshot.size}\n💸 Pending: ${pendingSnapshot.size}\n💎 Min: ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'Markdown' });
});

bot.command('users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    if (!db) return;
    const snapshot = await db.collection('users').get();
    ctx.reply(`👥 *Total Users:* ${snapshot.size}`);
});

bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) return ctx.reply('Usage: /broadcast [message]');
    ctx.reply(`📢 Broadcasting...`);
    const result = await broadcastToAllUsers(message);
    ctx.reply(result.success ? `✅ Broadcast sent to ${result.notifiedCount} users` : `❌ Error`);
});

bot.command('addbalance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /addbalance [user_id] [amount]');
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
    if (!db) return;
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return ctx.reply(`❌ User not found`);
    await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
    ctx.reply(`✅ Added ${formatAXC(amount)} to ${targetId}`);
    await bot.telegram.sendMessage(targetId, `💰 +${formatAXC(amount)} added by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('removebalance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /removebalance [user_id] [amount]');
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
    if (!db) return;
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
    if (userId !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) return ctx.reply('Usage: /verifyuser [user_id]');
    if (!db) return;
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
    if (userId !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) return ctx.reply('Usage: /searchuser [user_id]');
    if (!db) return;
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
// 4.8 أوامر الموافقة والرفض من مجموعة السحب
// ============================================================================

bot.command(/approve_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const id = ctx.match[1];
    const withdrawal = await db.collection('withdrawals').doc(id).get();
    if (!withdrawal.exists || withdrawal.data().status !== 'pending') return ctx.reply(`❌ Not found`);
    await withdrawal.ref.update({ status: 'approved', approvedAt: new Date().toISOString() });
    ctx.reply(`✅ Withdrawal ${id} approved`);
    await bot.telegram.sendMessage(withdrawal.data().userId, `✅ Withdrawal approved!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command(/reject_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const id = ctx.match[1];
    const reason = ctx.message.text.split(' ').slice(2).join(' ') || 'No reason';
    const withdrawal = await db.collection('withdrawals').doc(id).get();
    if (!withdrawal.exists || withdrawal.data().status !== 'pending') return ctx.reply(`❌ Not found`);
    const data = withdrawal.data();
    await db.collection('users').doc(data.userId).update({ balance: admin.firestore.FieldValue.increment(data.amount) });
    await withdrawal.ref.update({ status: 'rejected', rejectReason: reason });
    ctx.reply(`❌ Withdrawal ${id} rejected`);
    await bot.telegram.sendMessage(data.userId, `❌ Withdrawal rejected: ${reason}`, { parse_mode: 'Markdown' }).catch(() => {});
});

// ============================================================================
// 5. 🌐 إعدادات Express (السيرفر الخفيف)
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'alive', timestamp: Date.now() });
});

app.get('/api/config', (req, res) => {
    res.json({ firebaseConfig: firebaseWebConfig, status: 'ok' });
});

// ============================================================================
// 6. 🚀 تشغيل البوت والسيرفر
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Telegram Bot started successfully'))
    .catch(err => console.error('❌ Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`\n🌟 AXION AI SERVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Port: ${PORT}
🔥 Firebase: ${db ? '✅ Connected' : '❌ Disconnected'}
👑 Admin ID: ${ADMIN_ID || '❌ Not configured'}
🤖 Bot: ${BOT_TOKEN ? '✅ Configured' : '❌ Missing'}
💸 Withdrawals: Sent to group for manual approval
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Axion AI is READY for battle!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

// ============================================================================
// نهاية الملف
// ============================================================================
