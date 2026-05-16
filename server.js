// ============================================================================
// AXION AI BOT - THE LEGENDARY FINAL VERSION
// ============================================================================
// تم الإنشاء بواسطة: DeepSeek & George (الفريق الأسطوري)
// يشمل: تحقق من 4 قنوات، إحالات، سحب يدوي، حذف ذكي للرسائل، أزرار رجوع،
//        لوحة مشرف متكاملة، عداد إحالات منفصل، كل الأسرار من Render
// ============================================================================

// ============================================================================
// 1. المكتبات والتهيئة الأساسية
// ============================================================================
const express = require('express');
const { Telegraf } = require('telegraf');
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

async function isAdminAuthenticated(ctx) {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return false;
    const session = adminSessions.get(userId);
    if (!session || session.step !== 'authenticated') {
        await ctx.reply(`⚠️ *Authentication Required*\n━━━━━━━━━━━━━━━━━━━━━━\nPlease use /admin to login first.`, { parse_mode: 'Markdown' });
        return false;
    }
    if (Date.now() - session.authenticatedAt > 60 * 60 * 1000) {
        adminSessions.delete(userId);
        await ctx.reply(`⚠️ *Session Expired*\n━━━━━━━━━━━━━━━━━━━━━━\nPlease use /admin again.`, { parse_mode: 'Markdown' });
        return false;
    }
    return true;
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

function getMainKeyboard() {
    return {
        keyboard: [['💰 BALANCE', '🔗 REFERRAL'], ['💸 WITHDRAW']],
        resize_keyboard: true, persistent: true
    };
}

function getBackKeyboard() {
    return {
        inline_keyboard: [[{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]]
    };
}

// ============================================================================
// 8. رسالة الترحيب
// ============================================================================
async function sendWelcomeMessage(ctx) {
    const message = `✨ *WELCOME TO AXION AI* ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*The Future of AI-Powered Trading*

Axion is an advanced AI-driven ecosystem that analyzes market trends and delivers real-time trading signals.

🎁 *Get ${formatAXC(WELCOME_BONUS)}* after verification
👥 *Get ${formatAXC(REFERRAL_BONUS)}* per referral
💎 *Minimum Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

📢 *Please join our channels to continue:*`;
    await sendAndTrack(ctx, message, getChannelsKeyboard());
}

// ============================================================================
// 9. أوامر البوت العامة
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
    
    if (user.isVerified) {
        await sendAndTrack(ctx, `✅ *Welcome back, ${userName}!*\n\n💰 *Balance:* ${formatAXC(user.balance || 0)}`, getMainKeyboard());
        return;
    }
    await sendWelcomeMessage(ctx);
});

bot.hears('💰 BALANCE', async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id.toString(), '', '');
    if (!user) return;
    const message = `📊 *YOUR AXION BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *Balance:* ${formatAXC(user.balance || 0)}
👥 *Referrals:* ${user.inviteCount || 0}
🎁 *From Referrals:* ${formatAXC((user.inviteCount || 0) * REFERRAL_BONUS)}
💎 *Min Withdrawal:* ${formatAXC(MIN_WITHDRAW)}`;
    await sendAndTrack(ctx, message, getMainKeyboard());
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

👥 *Referrals:* ${user.inviteCount || 0}
🎁 *Earned:* ${formatAXC((user.inviteCount || 0) * REFERRAL_BONUS)}`;

    const referralKeyboard = {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=Join%20Axion%20AI%20and%20earn%20crypto!` }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
    await sendAndTrack(ctx, message, referralKeyboard);
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    
    if (!user.walletAddress) {
        const message = `💸 *WITHDRAWAL SETUP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *No wallet address found*

Send your *BEP20 wallet address*.

📝 *Type or paste your address below:*`;
        await sendAndTrack(ctx, message, getBackKeyboard());
        userSessions.set(userId, { waitingForWallet: true });
        return;
    }
    
    if ((user.balance || 0) < MIN_WITHDRAW) {
        const needed = MIN_WITHDRAW - (user.balance || 0);
        const message = `❌ *Insufficient Balance*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Your: ${formatAXC(user.balance || 0)}
💰 Min: ${formatAXC(MIN_WITHDRAW)}
🔄 Need: ${formatAXC(needed)}`;
        await sendAndTrack(ctx, message, getMainKeyboard());
        return;
    }
    
    const message = `✅ *Ready to withdraw!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Amount: ${formatAXC(user.balance || 0)}
💳 Wallet: \`${user.walletAddress}\`

👉 *Click CONFIRM to submit:*`;
    
    const confirmKeyboard = {
        inline_keyboard: [
            [{ text: '✅ CONFIRM WITHDRAWAL', callback_data: `confirm_withdraw` }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
    await sendAndTrack(ctx, message, confirmKeyboard);
});

// ============================================================================
// 10. معالجة النصوص (عنوان المحفظة)
// ============================================================================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    if (text.startsWith('/') || ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW'].includes(text)) return;
    
    const session = userSessions.get(userId);
    if (session?.waitingForWallet && text.startsWith('0x') && text.length === 42) {
        await updateUser(userId, { walletAddress: text });
        userSessions.delete(userId);
        const message = `✅ *Wallet saved!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 \`${text}\`

Now click *WITHDRAW* to continue.`;
        await sendAndTrack(ctx, message, getMainKeyboard());
    } else if (session?.waitingForWallet) {
        await sendAndTrack(ctx, `❌ *Invalid address!* Send a valid BEP20 address (0x...).`);
    }
});

// ============================================================================
// 11. نظام التحقق من القنوات
// ============================================================================
bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    if (!user) return;
    
    if (user.isVerified) {
        await sendAndTrack(ctx, `✅ *Already verified!*\n💰 ${formatAXC(user.balance || 0)}`, getMainKeyboard());
        return;
    }
    
    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `• ${ch.name} (@${ch.username.substring(1)})\n`;
        const message = `⚠️ *VERIFICATION INCOMPLETE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Missing channels:
${list}
Join and click VERIFY.`;
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
    const message = `✅ *VERIFICATION SUCCESSFUL* ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 *Welcome to the Axion AI family!*

💰 *+${formatAXC(WELCOME_BONUS)}* added to your balance

📊 *Your Balance:* ${formatAXC(newBalance)}
👥 *Referrals:* 0
💎 *Min Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

👇 *Use the buttons below to navigate:*`;
    await sendAndTrack(ctx, message, getMainKeyboard());
});

// ============================================================================
// 12. نظام السحب ومعالجة الطلبات
// ============================================================================
bot.action('confirm_withdraw', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    
    if (!user?.walletAddress) {
        await sendAndTrack(ctx, `❌ *No wallet address!* Set wallet first.`, getMainKeyboard());
        return;
    }
    
    if ((user.balance || 0) < MIN_WITHDRAW) {
        await sendAndTrack(ctx, `❌ *Insufficient balance!* Need ${formatAXC(MIN_WITHDRAW)}`, getMainKeyboard());
        return;
    }
    
    const amount = user.balance;
    await updateUser(userId, { balance: 0 });
    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
        id: withdrawalRef.id, userId, userName: user.userName,
        amount, walletAddress: user.walletAddress,
        status: 'pending', createdAt: new Date().toISOString()
    });
    
    if (WITHDRAWAL_GROUP_ID) {
        try {
            await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, 
                `💸 *NEW WITHDRAWAL REQUEST*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 *User:* ${user.userName} (${userId})
💰 *Amount:* ${formatAXC(amount)}
💳 *Wallet:* \`${user.walletAddress}\`
🆔 *ID:* ${withdrawalRef.id}
📅 *Date:* ${new Date().toLocaleString()}

/approve_${withdrawalRef.id}
/reject_${withdrawalRef.id} [reason]`,
                { parse_mode: 'Markdown' }
            ).catch(() => {});
        } catch(e) { console.error('Failed to send to group:', e.message); }
    }
    
    const message = `✅ *WITHDRAWAL REQUEST SUBMITTED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *Amount:* ${formatAXC(amount)}
🆔 *Request ID:* ${withdrawalRef.id}
⏳ *Processing Time:* 24-48 hours

*You will be notified once processed.*`;
    await sendAndTrack(ctx, message, getMainKeyboard());
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    await sendAndTrack(ctx, `🎯 *Main Menu*\n\n💰 Balance: ${formatAXC(user?.balance || 0)}`, getMainKeyboard());
});

// ============================================================================
// 13. أوامر المشرف (مع مصادقة كلمة المرور)
// ============================================================================

// أمر بدء جلسة المشرف
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    console.log(`🔐 Admin command from ${userId}`);
    
    if (userId !== ADMIN_ID) {
        await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' });
        return;
    }
    
    await ctx.reply(`🔐 *Admin Authentication*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please enter your admin password.

*Password is stored in Render Secrets.*`, { parse_mode: 'Markdown' });
    
    adminSessions.set(userId, { step: 'awaiting_password' });
});

// معالجة كلمة المرور
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = adminSessions.get(userId);
    const text = ctx.message.text;
    
    if (text.startsWith('/')) return;
    
    if (session?.step === 'awaiting_password') {
        if (text === ADMIN_PASSWORD) {
            adminSessions.set(userId, { step: 'authenticated', authenticatedAt: Date.now() });
            await ctx.reply(`✅ *Authentication Successful!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👑 *Axion AI Admin Panel*

📋 *Available Commands:*

/pending - View pending withdrawals
/stats - View bot statistics
/users - Total users count
/search [user_id] - Search user
/verify [user_id] - Manually verify user
/add [user_id] [amount] - Add balance
/remove [user_id] [amount] - Remove balance

🔐 *Session expires in 1 hour*`, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`❌ *Wrong password!* Access denied.`, { parse_mode: 'Markdown' });
            adminSessions.delete(userId);
        }
        return;
    }
});

// أوامر المشرف المحمية
bot.command('pending', async (ctx) => {
    if (!await isAdminAuthenticated(ctx)) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) { await ctx.reply('✅ *No pending withdrawals*', { parse_mode: 'Markdown' }); return; }
    
    let message = `💸 *PENDING WITHDRAWALS* (${snapshot.size})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `🆔 *ID:* ${wd.id}\n👤 *User:* ${wd.userName}\n💰 *Amount:* ${formatAXC(wd.amount)}\n📅 *Date:* ${new Date(wd.createdAt).toLocaleString()}\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    message += `\n📝 *To process:*\n/approve_[ID]\n/reject_[ID] [reason]`;
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
    if (!await isAdminAuthenticated(ctx)) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const usersSnapshot = await db.collection('users').get();
    const verifiedUsers = usersSnapshot.docs.filter(doc => doc.data().isVerified === true).length;
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    
    await ctx.reply(`📊 *AXION AI STATISTICS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👥 *Total Users:* ${usersSnapshot.size}
✅ *Verified Users:* ${verifiedUsers}
💸 *Pending Withdrawals:* ${pendingSnapshot.size}
💰 *Token Price:* $${AXC_PRICE}
💎 *Min Withdrawal:* ${MIN_WITHDRAW} AXC

🤖 *Status:* ✅ Online`, { parse_mode: 'Markdown' });
});

bot.command('users', async (ctx) => {
    if (!await isAdminAuthenticated(ctx)) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const snapshot = await db.collection('users').get();
    await ctx.reply(`👥 *Total Registered Users:* ${snapshot.size}`, { parse_mode: 'Markdown' });
});

bot.command('search', async (ctx) => {
    if (!await isAdminAuthenticated(ctx)) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) { await ctx.reply('Usage: /search [user_id]'); return; }
    
    const userDoc = await db.collection('users').doc(targetId).get();
    if (!userDoc.exists) { await ctx.reply(`❌ User ${targetId} not found.`); return; }
    
    const user = userDoc.data();
    await ctx.reply(`👤 *USER INFO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🆔 *ID:* ${user.userId}
👤 *Name:* ${user.userName}
💰 *Balance:* ${formatAXC(user.balance || 0)}
👥 *Referrals:* ${user.inviteCount || 0}
✅ *Verified:* ${user.isVerified ? 'Yes' : 'No'}
💳 *Wallet:* ${user.walletAddress ? user.walletAddress.substring(0, 10) + '...' : 'Not set'}
📅 *Joined:* ${new Date(user.createdAt).toLocaleDateString()}`, { parse_mode: 'Markdown' });
});

bot.command('verify', async (ctx) => {
    if (!await isAdminAuthenticated(ctx)) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    if (!targetId) { await ctx.reply('Usage: /verify [user_id]'); return; }
    
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { await ctx.reply(`❌ User ${targetId} not found.`); return; }
    
    const user = userDoc.data();
    if (user.isVerified) { await ctx.reply(`✅ User ${targetId} is already verified.`); return; }
    
    await userRef.update({ isVerified: true, verifiedAt: new Date().toISOString(), balance: admin.firestore.FieldValue.increment(WELCOME_BONUS) });
    await ctx.reply(`✅ User ${targetId} verified successfully! +${formatAXC(WELCOME_BONUS)} added.`);
    
    await bot.telegram.sendMessage(targetId, `✅ *Account Verified by Admin!*\n\n+${formatAXC(WELCOME_BONUS)} added to your balance!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('add', async (ctx) => {
    if (!await isAdminAuthenticated(ctx)) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) { await ctx.reply('Usage: /add [user_id] [amount]'); return; }
    
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) { await ctx.reply('❌ Invalid amount.'); return; }
    
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { await ctx.reply(`❌ User ${targetId} not found.`); return; }
    
    await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
    await ctx.reply(`✅ Added ${formatAXC(amount)} to user ${targetId}`);
    
    await bot.telegram.sendMessage(targetId, `💰 *Admin Added Balance!*\n\n+${formatAXC(amount)} added to your account!`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command('remove', async (ctx) => {
    if (!await isAdminAuthenticated(ctx)) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) { await ctx.reply('Usage: /remove [user_id] [amount]'); return; }
    
    const targetId = args[1];
    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) { await ctx.reply('❌ Invalid amount.'); return; }
    
    const userRef = db.collection('users').doc(targetId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { await ctx.reply(`❌ User ${targetId} not found.`); return; }
    
    await userRef.update({ balance: admin.firestore.FieldValue.increment(-amount) });
    await ctx.reply(`✅ Removed ${formatAXC(amount)} from user ${targetId}`);
    
    await bot.telegram.sendMessage(targetId, `💰 *Admin Removed Balance!*\n\n-${formatAXC(amount)} removed from your account.`, { parse_mode: 'Markdown' }).catch(() => {});
});

// ============================================================================
// 14. أوامر الموافقة والرفض من مجموعة السحب
// ============================================================================
bot.command(/approve_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const id = ctx.match[1];
    const withdrawal = await db.collection('withdrawals').doc(id).get();
    if (!withdrawal.exists || withdrawal.data().status !== 'pending') {
        await ctx.reply(`❌ Withdrawal ${id} not found or already processed.`);
        return;
    }
    
    await withdrawal.ref.update({ status: 'approved', approvedAt: new Date().toISOString() });
    await ctx.reply(`✅ Withdrawal ${id} approved.`);
    
    const data = withdrawal.data();
    await bot.telegram.sendMessage(data.userId, `✅ *WITHDRAWAL APPROVED!*\n💰 ${formatAXC(data.amount)}\nYour funds will arrive within 24 hours.`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.command(/reject_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    if (!db) { await ctx.reply('❌ Database not connected.'); return; }
    
    const id = ctx.match[1];
    const reason = ctx.message.text.split(' ').slice(2).join(' ') || 'No reason provided';
    const withdrawal = await db.collection('withdrawals').doc(id).get();
    if (!withdrawal.exists || withdrawal.data().status !== 'pending') {
        await ctx.reply(`❌ Withdrawal ${id} not found or already processed.`);
        return;
    }
    
    const data = withdrawal.data();
    await db.collection('users').doc(data.userId).update({ balance: admin.firestore.FieldValue.increment(data.amount) });
    await withdrawal.ref.update({ status: 'rejected', rejectReason: reason, rejectedAt: new Date().toISOString() });
    await ctx.reply(`❌ Withdrawal ${id} rejected. Reason: ${reason}`);
    await bot.telegram.sendMessage(data.userId, `❌ *WITHDRAWAL REJECTED*\nReason: ${reason}\nAmount returned to balance.`, { parse_mode: 'Markdown' }).catch(() => {});
});

// ============================================================================
// 15. تشغيل البوت
// ============================================================================
bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Axion AI Bot launched successfully'))
    .catch(err => console.error('Bot launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ============================================================================
// 16. إعدادات Express (السيرفر الخفيف)
// ============================================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ status: 'alive', timestamp: Date.now() }));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/api/config', (req, res) => res.json({ firebaseConfig: firebaseWebConfig, status: 'ok' }));

// ============================================================================
// 17. تشغيل السيرفر وعرض معلومات البوت النهائية
// ============================================================================
app.listen(PORT, () => {
    console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

bot.telegram.getMe().then((botInfo) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📢 Bot: @${botInfo.username}`);
    console.log(`✅ Axion AI Bot - Professional Edition Loaded`);
    console.log(`👑 Admin ID: ${ADMIN_ID}`);
    console.log(`💎 Withdraw: ${MIN_WITHDRAW} AXC ($${MIN_WITHDRAW * AXC_PRICE})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 Axion AI is READY for battle!`);
}).catch(err => console.error('Failed to get bot info:', err.message));

// ============================================================================
// نهاية الملف الأسطوري
// ============================================================================
