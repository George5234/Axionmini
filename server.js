// ============================================================================
// AXION AI BOT - THE ULTIMATE PROFESSIONAL EDITION (النسخة العاملة)
// ============================================================================
// هذا الملف يعتمد على الكود الذي أرسلته لي من قبل وكان يعمل بشكل طبيعي
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 🔐 قراءة Secret Files من Render
// ============================================================================

let serviceAccount = null;
let firebaseWebConfig = {};
let ADMIN_ID = null;
let ADMIN_PASSWORD = null;
let BOT_TOKEN = null;
let APP_URL = null;
let WITHDRAWAL_GROUP_ID = null;

try {
    const firebasePath = '/etc/secrets/firebase-admin-key.json';
    if (fs.existsSync(firebasePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
        console.log('✅ Firebase Admin key loaded');
    }
} catch (error) {
    console.error('❌ Firebase Admin key error:', error.message);
}

try {
    const configPath = '/etc/secrets/firebase-web-config.json';
    firebaseWebConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('✅ Firebase Web config loaded');
} catch (error) {
    console.error('❌ Firebase Web config error:', error.message);
}

try {
    const adminPath = '/etc/secrets/admin-config.json';
    const adminConfig = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
    ADMIN_ID = adminConfig.admin_id;
    ADMIN_PASSWORD = adminConfig.admin_password;
    console.log('✅ Admin config loaded | ID:', ADMIN_ID);
} catch (error) {
    console.error('❌ Admin config error:', error.message);
}

BOT_TOKEN = process.env.BOT_TOKEN;
APP_URL = process.env.APP_URL;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;

// ============================================================================
// 2. ⚙️ إعدادات التطبيق
// ============================================================================

const APP_CONFIG = {
    welcomeBonus: 100,
    referralBonus: 100,
    minWithdraw: 1000,
    requiredReferrals: 0,
    requiredReferralsForVerify: 0,
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
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        db = admin.firestore();
        console.log('🔥 Firebase Admin SDK initialized');
    } catch (error) {
        console.error('❌ Firebase init error:', error.message);
    }
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
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastMsgId);
        } catch (e) {}
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

async function addNotification(targetUserId, notification) {
    if (!db) return false;
    try {
        const notifData = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            type: notification.type || 'info',
            title: notification.title || 'Notification',
            message: notification.message,
            read: false,
            timestamp: new Date().toISOString()
        };
        const userRef = db.collection('users').doc(targetUserId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            await userRef.update({
                notifications: admin.firestore.FieldValue.arrayUnion(notifData)
            });
        }
        return true;
    } catch (error) {
        return false;
    }
}

async function broadcastToAllUsers(message) {
    if (!db) return { success: false, error: 'Database not connected' };
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
        let botSentCount = 0;
        for (const doc of usersSnapshot.docs) {
            try {
                await bot.telegram.sendMessage(doc.id, `📢 *Announcement*\n\n${message}`, { parse_mode: 'Markdown' });
                botSentCount++;
                if (botSentCount % 30 === 0) await new Promise(r => setTimeout(r, 2000));
                else await new Promise(r => setTimeout(r, 50));
            } catch(e) {}
        }
        return { success: true, notifiedCount, botSentCount };
    } catch (error) {
        return { success: false, error: error.message };
    }
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
        userId: userId,
        userName: userName || 'Axion User',
        userUsername: userUsername || '',
        balance: 0,
        totalEarned: 0,
        inviteCount: 0,
        referredBy: refCode || null,
        referrals: [],
        withdrawals: [],
        walletAddress: null,
        withdrawBlocked: false,
        isVerified: false,
        verifiedAt: null,
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
        if (referrerDoc.exists) {
            const referrerData = referrerDoc.data();
            if (!referrerData.referrals?.includes(newUserId)) {
                await referrerRef.update({
                    referrals: admin.firestore.FieldValue.arrayUnion(newUserId),
                    inviteCount: admin.firestore.FieldValue.increment(1),
                    balance: admin.firestore.FieldValue.increment(APP_CONFIG.referralBonus),
                    totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.referralBonus)
                });
                await addNotification(referrerId, {
                    type: 'referral',
                    title: '🎉 New Referral!',
                    message: `+${formatAXC(APP_CONFIG.referralBonus)} added to your balance!`
                });
                await bot.telegram.sendMessage(referrerId, 
                    `🎉 *NEW REFERRAL!*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *${newUserName}* joined!\n💰 *+${formatAXC(APP_CONFIG.referralBonus)}* added!`, 
                    { parse_mode: 'Markdown' }
                ).catch(() => {});
            }
        }
    } catch (error) {}
}

async function verifyChannelMembership(userId, channelUsername) {
    try {
        const chatMember = await bot.telegram.getChatMember(`@${channelUsername.replace('@', '')}`, parseInt(userId));
        const status = chatMember.status;
        return ['member', 'administrator', 'creator'].includes(status);
    } catch (error) {
        return false;
    }
}

async function checkAllChannels(userId) {
    for (const channel of REQUIRED_CHANNELS) {
        const isMember = await verifyChannelMembership(userId, channel.username);
        if (!isMember) return false;
    }
    return true;
}

async function getMissingChannels(userId) {
    const missing = [];
    for (const channel of REQUIRED_CHANNELS) {
        const isMember = await verifyChannelMembership(userId, channel.username);
        if (!isMember) missing.push(channel);
    }
    return missing;
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
    const message = `✨ *WELCOME TO AXION AI* ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎁 *Get ${formatAXC(APP_CONFIG.welcomeBonus)}* after verification
👥 *Get ${formatAXC(APP_CONFIG.referralBonus)}* per referral
💎 *Minimum Withdrawal:* ${formatAXC(APP_CONFIG.minWithdraw)}

📢 *Please join our channels to continue:*`;
    await sendAndTrack(ctx, message, getChannelsKeyboard());
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
            const userData = createNewUser(userId, userName, userUsername, refCode);
            await userRef.set(userData);
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
        const mainKeyboard = await getMainKeyboard(userId);
        await sendAndTrack(ctx, `✅ *Welcome back, ${userName}!*\n\n💰 *Balance:* ${formatAXC(userData.balance || 0)}`, mainKeyboard);
        return;
    }
    
    await sendWelcomeMessage(ctx);
});

// ============================================================================
// 4.3 أوامر المستخدم (الأزرار)
// ============================================================================

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!db) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        const mainKeyboard = await getMainKeyboard(userId);
        await sendAndTrack(ctx,
            `📊 *YOUR AXION BALANCE*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 *Balance:* ${formatAXC(data.balance || 0)}\n` +
            `👥 *Referrals:* ${data.inviteCount || 0}\n` +
            `🎁 *From Referrals:* ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}\n` +
            `💎 *Min Withdrawal:* ${formatAXC(APP_CONFIG.minWithdraw)}`,
            mainKeyboard
        );
    }
});

bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!db) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        const link = `https://t.me/${APP_CONFIG.botUsername}?start=${userId}`;
        await sendAndTrack(ctx,
            `🔗 *YOUR REFERRAL LINK*\n━━━━━━━━━━━━━━━━━━━━━━\n\`${link}\`\n\n` +
            `👥 *Referrals:* ${data.inviteCount || 0}\n` +
            `🎁 *Earned:* ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}`,
            getShareKeyboard(link)
        );
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
        const mainKeyboard = await getMainKeyboard(userId);
        await sendAndTrack(ctx, `❌ *INSUFFICIENT BALANCE*\nNeed ${formatAXC(needed)} more.\nInvite ${Math.ceil(needed / APP_CONFIG.referralBonus)} friends!`, mainKeyboard);
        return;
    }
    
    await sendAndTrack(ctx, `✅ *READY TO WITHDRAW*\n💰 Amount: ${formatAXC(userData.balance || 0)}\n💳 Wallet: \`${userData.walletAddress.substring(0, 10)}...\`\n\n👇 Click CONFIRM`, getWithdrawConfirmKeyboard());
});

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' });
        return;
    }
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') {
        await ctx.reply('⚠️ *Please authenticate first*\nUse /alimenfi to login.', { parse_mode: 'Markdown' });
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
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
    await sendAndTrack(ctx, `👑 *ADMIN PANEL*`, adminKeyboard);
});

// ============================================================================
// 4.4 معالج النصوص
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    
    if (text.startsWith('/')) return;
    if (['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '👑 ADMIN PANEL'].includes(text)) return;
    
    const session = userSessions.get(userId);
    if (session?.waitingForWallet && text.startsWith('0x') && text.length === 42) {
        await db.collection('users').doc(userId).update({ walletAddress: text });
        userSessions.delete(userId);
        const mainKeyboard = await getMainKeyboard(userId);
        await sendAndTrack(ctx, `✅ *Wallet saved!*\n💳 \`${text}\``, mainKeyboard);
    } else if (session?.waitingForWallet) {
        await sendAndTrack(ctx, `❌ *Invalid address!* Send a valid BEP20 address (0x...).`);
    }
});

// ============================================================================
// 4.5 معالج أزرار الـ Callback Query
// ============================================================================

bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (userData.isVerified) {
        const mainKeyboard = await getMainKeyboard(userId);
        await sendAndTrack(ctx, `✅ *Already verified!*`, mainKeyboard);
        return;
    }
    
    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `• ${ch.name}\n`;
        await sendAndTrack(ctx, `⚠️ *MISSING CHANNELS*\n${list}\nJoin and click VERIFY.`, getChannelsKeyboard());
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
                    inviteCount: admin.firestore.FieldValue.increment(1),
                    totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.referralBonus)
                });
                await bot.telegram.sendMessage(userData.referredBy, `🎉 *New Referral!* +${formatAXC(APP_CONFIG.referralBonus)}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
        } catch (e) {}
    }
    
    await db.collection('users').doc(userId).update({
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        balance: newBalance,
        totalEarned: newBalance
    });
    
    const mainKeyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `✅ *VERIFIED!*\n🎉 +${formatAXC(APP_CONFIG.welcomeBonus)}\n💰 Balance: ${formatAXC(newBalance)}`, mainKeyboard);
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
            `💸 *WITHDRAWAL*\n👤 ${userData.userName}\n💰 ${formatAXC(amount)}\n💳 ${userData.walletAddress}\n🆔 ${withdrawalRef.id}`,
            { parse_mode: 'Markdown' }
        ).catch(() => {});
    }
    
    const mainKeyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `✅ *WITHDRAWAL SUBMITTED!*\n💰 ${formatAXC(amount)}\n⏳ 24-48 hours.`, mainKeyboard);
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    const mainKeyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `🎯 *Main Menu*\n💰 Balance: ${formatAXC(userDoc.exists ? userDoc.data().balance || 0 : 0)}`, mainKeyboard);
});

// ============================================================================
// 4.6 أوامر المشرف
// ============================================================================

bot.command('alimenfi', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return ctx.reply('⛔ *Access denied!*');
    ctx.reply('🔐 Please enter admin password:');
    botAdminSessions.set(userId, { step: 'awaiting_password' });
});

bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) return ctx.reply('Usage: /broadcast [message]');
    ctx.reply(`📢 Broadcasting...`);
    const result = await broadcastToAllUsers(message);
    ctx.reply(result.success ? `✅ Broadcast sent to ${result.notifiedCount} users` : `❌ Error`);
});

bot.command('pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
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
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
    if (!db) return;
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    ctx.reply(`📊 *STATISTICS*\n👥 Users: ${usersSnapshot.size}\n💸 Pending: ${pendingSnapshot.size}\n💎 Min: ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'Markdown' });
});

bot.command('users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
    if (!db) return;
    const snapshot = await db.collection('users').get();
    ctx.reply(`👥 *Total Users:* ${snapshot.size}`);
});

bot.command('searchuser', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) return ctx.reply('Usage: /searchuser [user_id]');
    if (!db) return;
    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists) return ctx.reply(`❌ User ${targetId} not found`);
    const data = userDoc.data();
    ctx.reply(`👤 *USER INFO*\nID: ${data.userId}\nName: ${data.userName}\nBalance: ${formatAXC(data.balance || 0)}\nVerified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
});

bot.command('addbalance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /addbalance [user_id] [amount]');
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
    if (!db) return;
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return ctx.reply(`❌ User ${targetId} not found`);
    await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
    ctx.reply(`✅ Added ${formatAXC(amount)} to ${targetId}`);
    await bot.telegram.sendMessage(targetId, `💰 +${formatAXC(amount)} added by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('removebalance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /removebalance [user_id] [amount]');
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount');
    if (!db) return;
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return ctx.reply(`❌ User ${targetId} not found`);
    const currentBalance = userDoc.data().balance || 0;
    if (amount > currentBalance) return ctx.reply(`❌ Cannot remove ${formatAXC(amount)}. Balance is ${formatAXC(currentBalance)}`);
    await userRef.update({ balance: admin.firestore.FieldValue.increment(-amount) });
    ctx.reply(`✅ Removed ${formatAXC(amount)} from ${targetId}`);
    await bot.telegram.sendMessage(targetId, `💰 -${formatAXC(amount)} removed by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('verifyuser', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    const session = botAdminSessions.get(userId);
    if (!session || session.step !== 'authenticated') return ctx.reply('⚠️ Use /alimenfi first.');
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) return ctx.reply('Usage: /verifyuser [user_id]');
    if (!db) return;
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return ctx.reply(`❌ User ${targetId} not found`);
    if (userDoc.data().isVerified) return ctx.reply(`✅ User ${targetId} already verified`);
    await userRef.update({ isVerified: true, verifiedAt: new Date().toISOString(), balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus) });
    ctx.reply(`✅ User ${targetId} verified! +${formatAXC(APP_CONFIG.welcomeBonus)} added`);
    await bot.telegram.sendMessage(targetId, `✅ Account verified by admin! +${formatAXC(APP_CONFIG.welcomeBonus)} added!`, { parse_mode: 'Markdown' }).catch(() => {});
});

// أوامر الموافقة والرفض من مجموعة السحب
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
// 4.7 معالج كلمة المرور
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    const authSession = botAdminSessions.get(userId);
    
    if (authSession && authSession.step === 'awaiting_password') {
        if (text === ADMIN_PASSWORD) {
            botAdminSessions.set(userId, { step: 'authenticated' });
            ctx.reply(`✅ Authentication Successful!\n\n📋 Admin Commands:\n/pending - View withdrawals\n/stats - Statistics\n/users - Total users\n/searchuser [id] - Search user\n/addbalance [id] [amount] - Add balance\n/removebalance [id] [amount] - Remove balance\n/verifyuser [id] - Verify user\n/broadcast [message] - Send announcement`);
        } else {
            ctx.reply(`❌ Wrong password!`);
            botAdminSessions.delete(userId);
        }
    }
});

// ============================================================================
// 4.8 معالج أزرار المشرف
// ============================================================================

bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    if (!db) return;
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    await ctx.reply(`📊 *STATISTICS*\n👥 Users: ${usersSnapshot.size}\n💸 Pending: ${pendingSnapshot.size}`, { parse_mode: 'Markdown' });
});

bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    if (!db) return;
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
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    if (!db) return;
    const snapshot = await db.collection('users').get();
    await ctx.reply(`👥 *Total Users:* ${snapshot.size}`);
});

bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`🔍 Send user ID to search:`);
    userSessions.set(userId, { adminSearch: true });
});

bot.action('admin_add', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`💰 Send: USER_ID AMOUNT`);
    userSessions.set(userId, { adminAdd: true });
});

bot.action('admin_remove', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`➖ Send: USER_ID AMOUNT`);
    userSessions.set(userId, { adminRemove: true });
});

bot.action('admin_verify', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`✅ Send user ID to verify:`);
    userSessions.set(userId, { adminVerify: true });
});

bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !botAdminSessions.get(userId)?.step === 'authenticated') {
        await ctx.answerCbQuery('Access denied');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply(`📢 Send broadcast message:`);
    userSessions.set(userId, { adminBroadcast: true });
});

// معالج الأوامر الإدارية من النصوص
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
        ctx.reply(`👤 *USER*\nID: ${data.userId}\nName: ${data.userName}\nBalance: ${formatAXC(data.balance || 0)}\nVerified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
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
    console.log(`\n🌟 AXION AI SERVER`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔥 Firebase: ${db ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`👑 Admin ID: ${ADMIN_ID || '❌ Not configured'}`);
    console.log(`🤖 Bot: ${BOT_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`💸 Withdrawals: Sent to group for manual approval`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 Axion AI is READY for battle!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

// ============================================================================
// نهاية الملف
// ============================================================================
