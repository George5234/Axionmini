// ============================================================================
// AXION AI BOT - PROFESSIONAL EDITION v5.0
// مستوحى من AdNova ومحسّن لـ Axion
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
// 1. قراءة الأسرار
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
        console.log('✅ Admin config loaded');
    }
} catch (error) { console.error('Admin config error:', error.message); }

try {
    const firebasePath = '/etc/secrets/firebase-admin-key.json';
    if (fs.existsSync(firebasePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
        console.log('✅ Firebase Admin key loaded');
    }
} catch (error) { console.error('Firebase Admin key error:', error.message); }

BOT_TOKEN = process.env.BOT_TOKEN;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN required');
    process.exit(1);
}

// ============================================================================
// 2. تهيئة Firebase
// ============================================================================
let db = null;
if (serviceAccount) {
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        db = admin.firestore();
        console.log('🔥 Firebase initialized');
    } catch (error) { console.error('Firebase error:', error.message); }
}

// ============================================================================
// 3. إعدادات البوت
// ============================================================================
const bot = new Telegraf(BOT_TOKEN);

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
// 4. دوال مساعدة
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
        } catch (e) {}
    }
}

async function sendAndTrack(ctx, message, keyboard = null) {
    await deleteLastMessage(ctx);
    const opts = { parse_mode: 'Markdown' };
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

// ============================================================================
// 5. نظام المستخدمين
// ============================================================================
async function getOrCreateUser(userId, userName, username, referredBy = null) {
    if (!db) return null;
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (userDoc.exists) return userDoc.data();
        
        const newUser = {
            userId, userName: userName || 'Axion User', username: username || '',
            balance: 0, totalEarned: 0, inviteCount: 0,
            referredBy, referrals: [], walletAddress: null,
            isVerified: false, verifiedAt: null,
            createdAt: new Date().toISOString(), lastActive: new Date().toISOString()
        };
        await userRef.set(newUser);
        console.log(`✅ New user: ${userId}`);
        return newUser;
    } catch (error) { return null; }
}

async function updateUser(userId, data) {
    if (!db) return;
    try {
        await db.collection('users').doc(userId).update({ ...data, lastActive: new Date().toISOString() });
    } catch (error) {}
}

// ============================================================================
// 6. الأزرار ولوحات المفاتيح
// ============================================================================
function getChannelsKeyboard() {
    const keyboard = [];
    for (const channel of REQUIRED_CHANNELS) {
        keyboard.push([{ text: `📢 ${channel.name}`, url: `https://t.me/${channel.username.substring(1)}` }]);
    }
    keyboard.push([{ text: '✅ VERIFY MEMBERSHIP', callback_data: 'verify_membership' }]);
    return { inline_keyboard: keyboard };
}

function getMainKeyboard(userId) {
    const keyboard = [
        ['💰 BALANCE', '🔗 REFERRAL'],
        ['💸 WITHDRAW']
    ];
    
    if (isAdmin(userId)) {
        keyboard.push(['👑 ADMIN PANEL']);
    }
    
    return { keyboard, resize_keyboard: true, persistent: true };
}

function getBackKeyboard() {
    return { inline_keyboard: [[{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
}

function getShareKeyboard(link) {
    const shareText = encodeURIComponent(`Join Axion AI! Get 100 AXC bonus! ${link}`);
    return {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${link}&text=${shareText}` }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

// ============================================================================
// 7. رسالة الترحيب
// ============================================================================
async function sendWelcomeMessage(ctx) {
    const message = `✨ *WELCOME TO AXION AI* ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*The Future of AI-Powered Trading*

🎁 Get ${formatAXC(WELCOME_BONUS)} after verification
👥 Get ${formatAXC(REFERRAL_BONUS)} per referral
💎 Minimum withdrawal: ${formatAXC(MIN_WITHDRAW)}

📢 *Please join our channels to continue:*`;
    await sendAndTrack(ctx, message, getChannelsKeyboard());
}

// ============================================================================
// 8. أوامر المشرف (أزرار فقط للمعرف الوحيد)
// ============================================================================

// أمر المصادقة
bot.command('alimenfi', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    await ctx.reply('🔐 Please enter admin password:');
    adminSessions.set(userId, { step: 'awaiting_password' });
});

// زر ADMIN PANEL (يظهر فقط للمشرف)
bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    
    const session = adminSessions.get(userId);
    if (!session || session.step !== 'authenticated') {
        await ctx.reply('⚠️ Please use /alimenfi first.');
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
// 9. معالج أزرار المشرف
// ============================================================================
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    
    if (!db) { await ctx.reply('❌ Database error'); return; }
    
    const usersSnapshot = await db.collection('users').get();
    const verifiedUsers = usersSnapshot.docs.filter(d => d.data().isVerified === true).length;
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    
    await ctx.reply(`📊 *STATISTICS*
━━━━━━━━━━━━━━━━━━━━━━
👥 Users: ${usersSnapshot.size}
✅ Verified: ${verifiedUsers}
💸 Pending: ${pendingSnapshot.size}
💎 Min: ${MIN_WITHDRAW} AXC`, { parse_mode: 'Markdown' });
});

bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    
    if (!db) { await ctx.reply('❌ Database error'); return; }
    
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) { await ctx.reply('✅ No pending withdrawals'); return; }
    
    let message = `💸 *PENDING WITHDRAWALS* (${snapshot.size})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `👤 ${wd.userName}\n💰 ${formatAXC(wd.amount)}\n🆔 ${wd.id}\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    
    if (!db) { await ctx.reply('❌ Database error'); return; }
    
    const snapshot = await db.collection('users').get();
    await ctx.reply(`👥 *Total Users:* ${snapshot.size}`, { parse_mode: 'Markdown' });
});

bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`🔍 Send the user ID to search:`);
    adminSessions.set(userId, { step: 'search' });
});

bot.action('admin_add', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`💰 Send: USER_ID AMOUNT\nExample: 123456789 500`);
    adminSessions.set(userId, { step: 'add' });
});

bot.action('admin_remove', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`➖ Send: USER_ID AMOUNT\nExample: 123456789 200`);
    adminSessions.set(userId, { step: 'remove' });
});

bot.action('admin_verify', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`✅ Send user ID to verify manually:`);
    adminSessions.set(userId, { step: 'verify' });
});

bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`📢 Send your broadcast message:`);
    adminSessions.set(userId, { step: 'broadcast' });
});

// ============================================================================
// 10. معالج النصوص (كلمة المرور، أوامر المشرف، عنوان المحفظة)
// ============================================================================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    
    // تجاهل الأزرار والأوامر
    if (text.startsWith('/') || ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '👑 ADMIN PANEL'].includes(text)) return;
    
    // ===== معالج كلمة مرور المشرف =====
    const authSession = adminSessions.get(userId);
    if (authSession?.step === 'awaiting_password') {
        if (text === ADMIN_PASSWORD) {
            adminSessions.set(userId, { step: 'authenticated', authenticatedAt: Date.now() });
            await ctx.reply(`✅ Authentication successful!\n\nClick ADMIN PANEL to start.`);
        } else {
            await ctx.reply(`❌ Wrong password!`);
            adminSessions.delete(userId);
        }
        return;
    }
    
    // ===== معالج البحث =====
    if (authSession?.step === 'search') {
        adminSessions.delete(userId);
        if (!db) { await ctx.reply('❌ Database error'); return; }
        const userDoc = await db.collection('users').doc(text).get();
        if (!userDoc.exists) { await ctx.reply(`❌ User ${text} not found`); return; }
        const user = userDoc.data();
        await ctx.reply(`👤 *USER INFO*\n🆔 ${user.userId}\n👤 ${user.userName}\n💰 ${formatAXC(user.balance || 0)}\n👥 Referrals: ${user.inviteCount || 0}\n✅ Verified: ${user.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
        return;
    }
    
    // ===== معالج إضافة رصيد =====
    if (authSession?.step === 'add') {
        adminSessions.delete(userId);
        const parts = text.split(' ');
        if (parts.length < 2) { await ctx.reply('❌ Format: USER_ID AMOUNT'); return; }
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) { await ctx.reply('❌ Invalid amount'); return; }
        if (!db) { await ctx.reply('❌ Database error'); return; }
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) { await ctx.reply(`❌ User ${targetId} not found`); return; }
        await userRef.update({ balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
        await ctx.reply(`✅ Added ${formatAXC(amount)} to ${targetId}`);
        await bot.telegram.sendMessage(targetId, `💰 +${formatAXC(amount)} added by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // ===== معالج خصم رصيد =====
    if (authSession?.step === 'remove') {
        adminSessions.delete(userId);
        const parts = text.split(' ');
        if (parts.length < 2) { await ctx.reply('❌ Format: USER_ID AMOUNT'); return; }
        const targetId = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) { await ctx.reply('❌ Invalid amount'); return; }
        if (!db) { await ctx.reply('❌ Database error'); return; }
        const userRef = db.collection('users').doc(targetId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) { await ctx.reply(`❌ User ${targetId} not found`); return; }
        await userRef.update({ balance: admin.firestore.FieldValue.increment(-amount) });
        await ctx.reply(`✅ Removed ${formatAXC(amount)} from ${targetId}`);
        await bot.telegram.sendMessage(targetId, `💰 -${formatAXC(amount)} removed by admin!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // ===== معالج التحقق اليدوي =====
    if (authSession?.step === 'verify') {
        adminSessions.delete(userId);
        if (!db) { await ctx.reply('❌ Database error'); return; }
        const userRef = db.collection('users').doc(text);
        const userDoc = await userRef.get();
        if (!userDoc.exists) { await ctx.reply(`❌ User ${text} not found`); return; }
        const user = userDoc.data();
        if (user.isVerified) { await ctx.reply(`✅ User already verified`); return; }
        await userRef.update({ isVerified: true, verifiedAt: new Date().toISOString(), balance: admin.firestore.FieldValue.increment(WELCOME_BONUS) });
        await ctx.reply(`✅ User ${text} verified! +${formatAXC(WELCOME_BONUS)} added`);
        await bot.telegram.sendMessage(text, `✅ Account verified by admin! +${formatAXC(WELCOME_BONUS)} added!`, { parse_mode: 'Markdown' }).catch(() => {});
        return;
    }
    
    // ===== معالج البث =====
    if (authSession?.step === 'broadcast') {
        adminSessions.delete(userId);
        if (!db) { await ctx.reply('❌ Database error'); return; }
        await ctx.reply(`📢 Broadcasting...`);
        const usersSnapshot = await db.collection('users').get();
        let sent = 0;
        for (const doc of usersSnapshot.docs) {
            try {
                await bot.telegram.sendMessage(doc.id, `📢 *ANNOUNCEMENT*\n\n${text}\n\n- Axion AI Team`, { parse_mode: 'Markdown' });
                sent++;
            } catch(e) {}
        }
        await ctx.reply(`✅ Broadcast sent to ${sent} users`);
        return;
    }
    
    // ===== معالج عنوان المحفظة =====
    const userSession = userSessions.get(userId);
    if (userSession?.waitingForWallet && text.startsWith('0x') && text.length === 42) {
        await updateUser(userId, { walletAddress: text });
        userSessions.delete(userId);
        const mainKeyboard = getMainKeyboard(userId);
        await sendAndTrack(ctx, `✅ Wallet saved!\n💳 \`${text}\`\n\nNow click WITHDRAW.`, mainKeyboard);
    } else if (userSession?.waitingForWallet) {
        await sendAndTrack(ctx, `❌ Invalid address! Send a valid BEP20 address (0x...).`);
    }
});

// ============================================================================
// 11. أوامر المستخدم (bot.hears)
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
    
    const mainKeyboard = getMainKeyboard(userId);
    
    if (user.isVerified) {
        await sendAndTrack(ctx, `✅ Welcome back, ${userName}!\n💰 Balance: ${formatAXC(user.balance || 0)}`, mainKeyboard);
        return;
    }
    await sendWelcomeMessage(ctx);
});

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    const mainKeyboard = getMainKeyboard(userId);
    await sendAndTrack(ctx, `📊 *YOUR BALANCE*\n💰 ${formatAXC(user.balance || 0)}\n👥 Referrals: ${user.inviteCount || 0}\n💎 Min: ${formatAXC(MIN_WITHDRAW)}`, mainKeyboard);
});

bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    const botInfo = await bot.telegram.getMe();
    const link = `https://t.me/${botInfo.username}?start=${userId}`;
    await sendAndTrack(ctx, `🔗 *YOUR LINK*\n\`${link}\`\n👥 Referrals: ${user.inviteCount || 0}\n🎁 Earned: ${formatAXC((user.inviteCount || 0) * REFERRAL_BONUS)}`, getShareKeyboard(link));
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    
    if (!user.isVerified) {
        await sendAndTrack(ctx, `🔒 *WITHDRAWAL LOCKED*\nPlease verify first by joining channels.`, getBackKeyboard());
        return;
    }
    
    if (!user.walletAddress) {
        await sendAndTrack(ctx, `💸 *SETUP WALLET*\nSend your BEP20 address (0x...).\n\n*Trust Wallet* → Receive → Smart Chain (BSC)`, getBackKeyboard());
        userSessions.set(userId, { waitingForWallet: true });
        return;
    }
    
    if ((user.balance || 0) < MIN_WITHDRAW) {
        const needed = MIN_WITHDRAW - (user.balance || 0);
        const mainKeyboard = getMainKeyboard(userId);
        await sendAndTrack(ctx, `❌ *INSUFFICIENT BALANCE*\nNeed ${formatAXC(needed)} more.\nInvite ${Math.ceil(needed / REFERRAL_BONUS)} friends!`, mainKeyboard);
        return;
    }
    
    const amount = user.balance;
    await updateUser(userId, { balance: 0 });
    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({ id: withdrawalRef.id, userId, userName: user.userName, amount, walletAddress: user.walletAddress, status: 'approved', createdAt: new Date().toISOString() });
    
    if (WITHDRAWAL_GROUP_ID) {
        await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, `💸 *WITHDRAWAL*\n👤 ${user.userName}\n💰 ${formatAXC(amount)}\n💳 ${user.walletAddress}\n✅ Auto-approved`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    
    const mainKeyboard = getMainKeyboard(userId);
    await sendAndTrack(ctx, `✅ *WITHDRAWAL SUBMITTED*\n💰 ${formatAXC(amount)}\n⏳ 24-48 hours to your wallet.`, mainKeyboard);
});

// ============================================================================
// 12. معالج الأزرار التفاعلية
// ============================================================================
bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    
    if (user.isVerified) {
        await sendAndTrack(ctx, `✅ Already verified!`, getMainKeyboard(userId));
        return;
    }
    
    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `• ${ch.name}\n`;
        await sendAndTrack(ctx, `⚠️ *MISSING CHANNELS*\n${list}\nJoin and click VERIFY.`, getChannelsKeyboard());
        return;
    }
    
    let newBalance = WELCOME_BONUS;
    if (user.referredBy && user.referredBy !== userId) {
        try {
            const referrerRef = db.collection('users').doc(user.referredBy);
            const referrerDoc = await referrerRef.get();
            if (referrerDoc.exists) {
                await referrerRef.update({ balance: admin.firestore.FieldValue.increment(REFERRAL_BONUS), inviteCount: admin.firestore.FieldValue.increment(1) });
                await bot.telegram.sendMessage(user.referredBy, `🎉 New referral! +${formatAXC(REFERRAL_BONUS)}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
        } catch (e) {}
    }
    
    await updateUser(userId, { isVerified: true, verifiedAt: new Date().toISOString(), balance: newBalance, totalEarned: newBalance });
    await sendAndTrack(ctx, `✅ *VERIFIED!*\n🎉 +${formatAXC(WELCOME_BONUS)}\n💰 Balance: ${formatAXC(newBalance)}`, getMainKeyboard(userId));
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    await sendAndTrack(ctx, `🎯 *Main Menu*\n💰 Balance: ${formatAXC(user?.balance || 0)}`, getMainKeyboard(userId));
});

// ============================================================================
// 13. تشغيل البوت
// ============================================================================
bot.launch({ dropPendingUpdates: true }).then(() => console.log('🤖 Bot started')).catch(err => console.error('Bot error:', err));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ============================================================================
// 14. السيرفر
// ============================================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ status: 'alive' }));
app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, () => {
    console.log(`🌐 Server on port ${PORT}`);
});

bot.telegram.getMe().then((info) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📢 Bot: @${info.username}`);
    console.log(`✅ Axion AI Ready!`);
    console.log(`👑 Admin ID: ${ADMIN_ID}`);
    console.log(`💎 Withdraw: ${MIN_WITHDRAW} AXC`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━`);
}).catch(() => {});

// ============================================================================
// نهاية الملف
// ============================================================================
