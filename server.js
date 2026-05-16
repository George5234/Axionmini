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
        console.log('⚠️ Admin config not found, checking environment...');
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
    } else {
        console.log('⚠️ Firebase Admin key not found, checking environment...');
        const firebaseKey = process.env.FIREBASE_ADMIN_KEY;
        if (firebaseKey) serviceAccount = JSON.parse(firebaseKey);
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

if (WITHDRAWAL_GROUP_ID) {
    console.log(`✅ WITHDRAWAL_GROUP_ID loaded: ${WITHDRAWAL_GROUP_ID}`);
} else {
    console.log('⚠️ WITHDRAWAL_GROUP_ID not set - withdrawals will be logged only');
}

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
} else {
    console.log('⚠️ Firebase not configured - running in limited mode');
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

async function checkAllChannels(userId) {
    for (const channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.telegram.getChatMember(channel.username, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) return false;
        } catch { return false; }
    }
    return true;
}

async function getMissingChannels(userId) {
    const missing = [];
    for (const channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.telegram.getChatMember(channel.username, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) missing.push(channel);
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

function getWithdrawConfirmKeyboard(requestId) {
    return {
        inline_keyboard: [
            [{ text: '✅ CONFIRM WITHDRAWAL', callback_data: `confirm_withdraw_${requestId}` }],
            [{ text: '❌ CANCEL', callback_data: 'cancel_withdraw' }]
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
    const shareKeyboard = { inline_keyboard: [[{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=Join%20Axion%20AI%20and%20earn%20crypto!` }]] };
    await sendAndTrack(ctx, message, shareKeyboard);
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    
    if (!user.walletAddress) {
        await sendAndTrack(ctx, `💸 *WITHDRAWAL SETUP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *No wallet address found*

Send your *BEP20 wallet address*.

📝 *Type or paste your address below:*`);
        userSessions.set(userId, { waitingForWallet: true });
        return;
    }
    
    if ((user.balance || 0) < MIN_WITHDRAW) {
        const needed = MIN_WITHDRAW - (user.balance || 0);
        await sendAndTrack(ctx, `❌ *Insufficient Balance*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Your: ${formatAXC(user.balance || 0)}
💰 Min: ${formatAXC(MIN_WITHDRAW)}
🔄 Need: ${formatAXC(needed)}`, getMainKeyboard());
        return;
    }
    
    const requestId = `WD_${userId}_${Date.now()}`;
    await sendAndTrack(ctx, `✅ *Ready to withdraw!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Amount: ${formatAXC(user.balance || 0)}
💳 Wallet: \`${user.walletAddress}\`

👉 *Click CONFIRM to submit:*`, getWithdrawConfirmKeyboard(requestId));
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
        await sendAndTrack(ctx, `✅ *Wallet saved!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 \`${text}\`

Now click *WITHDRAW* to continue.`, getMainKeyboard());
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
        await sendAndTrack(ctx, `⚠️ *VERIFICATION INCOMPLETE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Missing channels:
${list}
Join and click VERIFY.`, getChannelsKeyboard());
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
    await sendAndTrack(ctx, `✅ *VERIFICATION SUCCESSFUL* ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 *Welcome to the Axion AI family!*

💰 *+${formatAXC(WELCOME_BONUS)}* added to your balance

📊 *Your Balance:* ${formatAXC(newBalance)}
👥 *Referrals:* 0
💎 *Min Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

👇 *Use the buttons below to navigate:*`, getMainKeyboard());
});

// ============================================================================
// 12. نظام السحب ومعالجة الطلبات
// ============================================================================
bot.action(/confirm_withdraw_(.+)/, async (ctx) => {
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
    
    await sendAndTrack(ctx, `✅ *WITHDRAWAL REQUEST SUBMITTED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *Amount:* ${formatAXC(amount)}
🆔 *Request ID:* ${withdrawalRef.id}
⏳ *Processing Time:* 24-48 hours

*You will be notified once processed.*`, getMainKeyboard());
});

bot.action('cancel_withdraw', async (ctx) => {
    await ctx.answerCbQuery();
    await sendAndTrack(ctx, `❌ *Withdrawal cancelled.*\n\nYour balance remains unchanged.`, getMainKeyboard());
});

// ============================================================================
// 13. أوامر المشرف
// ============================================================================
bot.command('admin', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' });
        return;
    }
    await ctx.reply(`👑 *AXION AI ADMIN PANEL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *Available Commands:*

/pending - View pending withdrawals
/stats - View bot statistics
/users - Total users count
/verify [user_id] - Manually verify user
/add [user_id] [amount] - Add balance
/remove [user_id] [amount] - Remove balance
/search [user_id] - Search user

🔐 *Authenticated*`, { parse_mode: 'Markdown' });
});

bot.command('pending', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
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
    if (ctx.from.id.toString() !== ADMIN_ID) return;
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

bot.command(/approve_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
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
    if (ctx.from.id.toString() !== ADMIN_ID) return;
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
// 14. تشغيل البوت
// ============================================================================
bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Axion AI Bot launched successfully'))
    .catch(err => console.error('Bot launch error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ============================================================================
// 15. إعدادات Express (السيرفر الخفيف للميني أب المستقبلي)
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

// جلب معلومات البوت بشكل غير متزامن
bot.telegram.getMe().then((botInfo) => {
    console.log(`📢 Bot: @${botInfo.username}`);
    console.log(`✅ Axion AI Bot - Professional Edition Loaded`);
    console.log(`👑 Admin ID: ${ADMIN_ID}`);
    console.log(`💎 Withdraw: ${MIN_WITHDRAW} AXC ($${MIN_WITHDRAW * AXC_PRICE})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 Axion AI is READY for battle!`);
}).catch(err => console.error('Failed to get bot info:', err.message));
