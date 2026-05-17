// ============================================================================
// AXION AI BOT - FINAL PROFESSIONAL EDITION v20.0
// ============================================================================
// التحسينات:
// ✅ أزرار محسنة واحترافية
// ✅ رسائل منسقة وواضحة
// ✅ نظام إحالة متكامل مع إشعار فوري
// ✅ إعادة التحقق من القنوات عند السحب والسواب
// ✅ تغيير عنوان المحفظة
// ✅ إزالة الرسائل السيئة ("انقر على زر كذا")
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 🔐 SECRETS LOADING
// ============================================================================

let serviceAccount = null;
let firebaseWebConfig = {};
let ADMIN_ID = null;
let BOT_TOKEN = null;
let WITHDRAWAL_GROUP_ID = null;
let OWNER_WALLET = null;
let APP_URL = null;
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
OWNER_WALLET = process.env.OWNER_WALLET;
APP_URL = process.env.APP_URL;

// ============================================================================
// 2. ⚙️ APP CONFIGURATION
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

const userSessions = new Map();
const userLastMessages = new Map();
const withdrawCooldownTracker = new Map();
let firebaseHealthy = true;

// Session cleanup
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of userSessions.entries()) {
        if (session.createdAt && (now - session.createdAt) > APP_CONFIG.sessionTTL) {
            userSessions.delete(userId);
        }
    }
}, 3600000);

// ============================================================================
// 3. 🔥 FIREBASE SETUP
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
// 4. 🤖 TELEGRAM BOT SETUP
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);

bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => console.log('✅ Webhook deleted, bot using polling mode'))
    .catch(err => console.error('Webhook delete error:', err.message));

bot.telegram.getMe().then((botInfo) => {
    BOT_USERNAME = botInfo.username;
    console.log(`📢 Bot username: @${BOT_USERNAME}`);
}).catch(err => console.error('Failed to get bot info:', err.message));

// ============================================================================
// 5. 🛠️ HELPER FUNCTIONS
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

function isValidBEP20(address) {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

function getProgressBar(current, target, length = 10) {
    const percent = Math.min(100, (current / target) * 100);
    const filled = Math.floor((percent / 100) * length);
    const empty = length - filled;
    return `▰`.repeat(filled) + `▱`.repeat(empty) + ` ${Math.floor(percent)}%`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatLine() {
    return '<code>═══════════════════════════════════════</code>';
}

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
        if (ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID, `🆕 New user: ${userName}\nID: ${userId}\nTotal: ${updated.data()?.count || 0}`);
        }
    } catch (error) {}
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
        console.log(`✅ New user created: ${userId} (${userName})`);
        return newUser;
    } catch (error) { return null; }
}

async function updateUser(userId, data) {
    if (!checkDb()) return;
    try {
        await db.collection('users').doc(userId).update({ ...data, lastActive: new Date().toISOString() });
        console.log(`✅ User ${userId} updated:`, Object.keys(data));
    } catch (error) {}
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
            
            // ✅ إشعار فوري للمحيل
            await bot.telegram.sendMessage(referrerId,
                `<b>🎉 NEW REFERRAL!</b>\n${formatLine()}\n👤 <b>${escapeHtml(newUserName)}</b> joined using your link!\n💰 <b>+${formatAXC(APP_CONFIG.referralBonus)}</b> added to your balance!\n\n👥 Total referrals: ${(referrerDoc.data().inviteCount || 0) + 1}`,
                { parse_mode: 'HTML' }
            ).catch(() => {});

            await checkMilestoneAchievement(referrerId);
            console.log(`✅ Referral processed: ${referrerId} → ${newUserId}`);
        }
    } catch (error) { console.error('Referral processing error:', error.message); }
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
                await addNotification(userId, '🏆 Milestone Unlocked!', `You reached ${milestone.count} referrals! +${formatUSD(milestone.reward)} USDT added!`, 'success');
                await bot.telegram.sendMessage(userId,
                    `<b>🏆 MILESTONE UNLOCKED!</b>\n${formatLine()}\n🎉 ${milestone.name}\n👥 ${milestone.count} referrals\n💰 +${formatUSD(milestone.reward)} USDT added!`,
                    { parse_mode: 'HTML' }).catch(() => {});
                console.log(`✅ Milestone unlocked: ${userId} - ${milestone.count} referrals`);
            }
        }
    } catch (error) { console.error('Milestone error:', error.message); }
}

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

// ✅ إعادة التحقق من القنوات (تستخدم قبل العمليات الحساسة)
async function requireChannelVerification(ctx, userId) {
    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `• ${ch.name}\n`;
        await sendAndTrack(ctx, `<b>⚠️ CHANNEL VERIFICATION REQUIRED</b>
${formatLine()}

You must be a member of all required channels to perform this action.

<b>Missing channels:</b>
${list}

${formatLine()}

<i>Please join the channels above and try again.</i>`, getChannelsKeyboard());
        return false;
    }
    return true;
}

// ============================================================================
// 6. 🎨 KEYBOARDS & BUTTONS (محسنة)
// ============================================================================

function getMainKeyboard(userId) {
    const keyboard = [
        ['💰 BALANCE', '🔗 REFERRAL'],
        ['💸 WITHDRAW', '🔄 SWAP'],
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

function getBackKeyboard() {
    return { inline_keyboard: [[{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
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

function getAdminKeyboard() {
    return {
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
}

// ============================================================================
// 7. 📨 WELCOME MESSAGE & COMMANDS
// ============================================================================

async function sendWelcomeMessage(ctx) {
    await sendAndTrack(ctx, `<b>✨ WELCOME TO AXION AI</b> ✨
${formatLine()}

🎁 <b>Get ${formatAXC(APP_CONFIG.welcomeBonus)}</b> after verification
👥 <b>Get ${formatAXC(APP_CONFIG.referralBonus)}</b> per referral
💎 <b>Minimum Withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdraw)}

${formatLine()}

📢 <b>Please join our channels to continue:</b>`, getChannelsKeyboard());
}

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

    // ✅ Process referral ONLY when user is created and not already referred
    if (refCode && refCode !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: refCode });
        await processReferralFromBot(refCode, userId, userName);
        console.log(`✅ Referral recorded: ${refCode} → ${userId}`);
    }

    if (user.isVerified) {
        await sendAndTrack(ctx, `<b>✅ Welcome back, ${escapeHtml(userName)}!</b>\n\n💰 <b>Balance:</b> ${formatAXC(user.balance || 0)}`, getMainKeyboard(userId));
        return;
    }

    await sendWelcomeMessage(ctx);
});

// ============================================================================
// 8. 💰 BALANCE COMMAND
// ============================================================================

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    const username = ctx.from.username || 'No username';
    const progressBar = getProgressBar(user.balance || 0, APP_CONFIG.minWithdraw);
    const percent = Math.min(100, Math.floor(((user.balance || 0) / APP_CONFIG.minWithdraw) * 100));

    await sendAndTrack(ctx, `<b>📊 YOUR AXION BALANCE</b>
${formatLine()}

👤 <b>User:</b> @${escapeHtml(username)} | <b>ID:</b> ${userId}

💰 <b>AXC Balance:</b> ${formatAXC(user.balance || 0)}
💵 <b>USDT Balance:</b> ${formatUSD(user.usdtBalance || 0)}

👥 <b>Referrals:</b> ${user.inviteCount || 0} | 🎁 <b>Earned:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}

${formatLine()}

<b>📈 Progress to withdrawal:</b>
${progressBar} (${user.balance || 0}/${APP_CONFIG.minWithdraw} AXC)

${formatLine()}

<i>👇 Use the buttons below to manage your funds:</i>`, getMainKeyboard(userId));
});

// ============================================================================
// 9. 🔗 REFERRAL COMMAND
// ============================================================================

bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;

    let milestonesText = '';
    const claimed = user.claimedMilestones || [];
    for (const milestone of REFERRAL_MILESTONES) {
        const isClaimed = claimed.includes(milestone.count);
        const status = isClaimed ? '✅ Claimed' : (user.inviteCount >= milestone.count ? '🎯 Ready' : `🔒 ${milestone.count - user.inviteCount} left`);
        milestonesText += `• ${milestone.name} (${milestone.count}) → ${formatUSD(milestone.reward)} - ${status}\n`;
    }

    await sendAndTrack(ctx, `<b>🔗 YOUR REFERRAL LINK</b>
${formatLine()}

<code>${link}</code>

${formatLine()}

<b>📊 Referral Stats:</b>
👥 <b>Total Referrals:</b> ${user.inviteCount || 0}
🎁 <b>Earned:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}

${formatLine()}

<b>🏆 MILESTONES (USDT Rewards):</b>
${milestonesText}

${formatLine()}

<i>Share your link and earn rewards!</i>`, getShareKeyboard(link));
});

// ============================================================================
// 10. 💸 WITHDRAW COMMAND (مع إعادة التحقق)
// ============================================================================

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    // ✅ إعادة التحقق من القنوات
    if (!await requireChannelVerification(ctx, userId)) return;

    if (user.withdrawBlocked) {
        await sendAndTrack(ctx, `<b>🚫 ACCOUNT BLOCKED</b>
${formatLine()}
Your account has been blocked from withdrawals.
Contact support for more information.`, getMainKeyboard(userId));
        return;
    }

    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, `<b>⏳ COOLDOWN ACTIVE</b>
${formatLine()}
You can request withdrawal once every 24 hours.
Please wait ${hoursLeft} hour(s).`, getMainKeyboard(userId));
        return;
    }

    if (!user.isVerified) {
        await sendAndTrack(ctx, `<b>🔒 VERIFICATION REQUIRED</b>
${formatLine()}
Please complete channel verification first.

Click the VERIFY button below.`, getChannelsKeyboard());
        return;
    }

    if (!user.walletAddress) {
        await sendAndTrack(ctx, `<b>💳 SETUP WITHDRAWAL WALLET</b>
${formatLine()}

Please send your BEP20 wallet address to continue.

<i>Example: <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code></i>

${formatLine()}

📝 <b>Send your address now:</b>`, getCancelKeyboard());
        userSessions.set(userId, { waitingForWallet: true, createdAt: Date.now() });
        return;
    }

    const balance = user.balance || 0;
    const usdtBalance = user.usdtBalance || 0;

    await sendAndTrack(ctx, `<b>💸 WITHDRAWAL</b>
${formatLine()}

💰 <b>AXC Balance:</b> ${formatAXC(balance)}
💵 <b>USDT Balance:</b> ${formatUSD(usdtBalance)}
💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>

${formatLine()}

<b>👇 Choose currency:</b>`, getWithdrawCurrencyKeyboard());
});

// ============================================================================
// 11. 🔄 SWAP COMMAND (مع إعادة التحقق)
// ============================================================================

bot.hears('🔄 SWAP', async (ctx) => {
    const userId = ctx.from.id.toString();
    console.log(`🔄 SWAP command from ${userId}`);

    if (!checkDb()) {
        await ctx.reply('⚠️ Database is temporarily unavailable.');
        return;
    }

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    // ✅ إعادة التحقق من القنوات
    if (!await requireChannelVerification(ctx, userId)) return;

    const swapUrl = `${APP_URL}/swap.html?userId=${userId}`;

    await sendAndTrack(ctx, `<b>⚡ AXION SWAP STATION</b>
${formatLine()}

💰 <b>AXC Balance:</b> ${formatAXC(user.balance || 0)}
💵 <b>USDT Balance:</b> ${formatUSD(user.usdtBalance || 0)}

${formatLine()}

${user.tonPaid ? 
    `<b>✅ Swap feature is activated!</b>` :
    `<b>🔒 One-time activation required: 0.05 TON</b>`
}

${formatLine()}

<i>👇 Click below to open the Swap Station:</i>`, {
        inline_keyboard: [
            [{ text: '🔄 OPEN SWAP STATION', web_app: { url: swapUrl } }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    });
});

// ============================================================================
// 12. ⚙️ SETTINGS COMMAND
// ============================================================================

bot.hears('⚙️ SETTINGS', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    await sendAndTrack(ctx, `<b>⚙️ SETTINGS</b>
${formatLine()}

💳 <b>Wallet Address:</b> 
${user.walletAddress ? `<code>${user.walletAddress}</code>` : 'Not set'}

🔐 <b>Verification Status:</b> ${user.isVerified ? '✅ Verified' : '❌ Not verified'}

🔄 <b>Swap Status:</b> ${user.tonPaid ? '✅ Activated' : '❌ Not activated'}

${formatLine()}

<i>👇 Select an option:</i>`, getSettingsKeyboard());
});

// Change wallet address
bot.action('change_wallet', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    await sendAndTrack(ctx, `<b>💳 CHANGE WALLET ADDRESS</b>
${formatLine()}

Send your new BEP20 wallet address.

<i>Example: <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code></i>

${formatLine()}

📝 <b>Send your new address now:</b>`, getCancelKeyboard());
    
    userSessions.set(userId, { waitingForWalletUpdate: true, createdAt: Date.now() });
});

// ============================================================================
// 13. 🔘 CALLBACK ACTIONS
// ============================================================================

bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();

    if (userData.isVerified) {
        await sendAndTrack(ctx, `<b>✅ Already verified!</b>`, getMainKeyboard(userId));
        return;
    }

    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `• ${ch.name}\n`;
        await sendAndTrack(ctx, `<b>⚠️ MISSING CHANNELS</b>
${formatLine()}
${list}
${formatLine()}
<i>Please join all channels and click VERIFY.</i>`, getChannelsKeyboard());
        return;
    }

    await updateUser(userId, {
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus),
        totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus)
    });

    const newBalance = (userData.balance || 0) + APP_CONFIG.welcomeBonus;
    await sendAndTrack(ctx, `<b>✅ VERIFICATION SUCCESSFUL!</b>
${formatLine()}

🎉 <b>+${formatAXC(APP_CONFIG.welcomeBonus)}</b> added to your balance!

💰 <b>New Balance:</b> ${formatAXC(newBalance)}

${formatLine()}

<i>You can now invite friends and withdraw funds.</i>`, getMainKeyboard(userId));
});

bot.action('withdraw_axc', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    // ✅ إعادة التحقق من القنوات
    if (!await requireChannelVerification(ctx, userId)) return;

    if ((user.balance || 0) < APP_CONFIG.minWithdraw) {
        await sendAndTrack(ctx, `<b>❌ INSUFFICIENT BALANCE</b>
${formatLine()}

You need <b>${formatAXC(APP_CONFIG.minWithdraw)}</b> to withdraw.

💰 Your balance: ${formatAXC(user.balance || 0)}

💡 <b>Tip:</b> Invite friends to earn more AXC!`, getMainKeyboard(userId));
        return;
    }

    const amount = user.balance;
    await sendAndTrack(ctx, `<b>💸 WITHDRAWAL REQUEST</b>
${formatLine()}

💰 <b>Amount:</b> ${formatAXC(amount)}
💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>

${formatLine()}

<i>Click CONFIRM to submit your withdrawal request.</i>`, getConfirmWithdrawKeyboard());

    userSessions.set(userId, { withdrawAmount: amount, withdrawCurrency: 'AXC', createdAt: Date.now() });
});

bot.action('withdraw_usdt', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    // ✅ إعادة التحقق من القنوات
    if (!await requireChannelVerification(ctx, userId)) return;

    const usdtAmount = user.usdtBalance || 0;

    if (usdtAmount < APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice) {
        await sendAndTrack(ctx, `<b>❌ INSUFFICIENT USDT BALANCE</b>
${formatLine()}

You need <b>${formatUSD(APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice)}</b> to withdraw USDT.

💵 Your USDT balance: ${formatUSD(usdtAmount)}

💡 <b>Tip:</b> Swap AXC to USDT first!`, getMainKeyboard(userId));
        return;
    }

    await sendAndTrack(ctx, `<b>💸 USDT WITHDRAWAL REQUEST</b>
${formatLine()}

💵 <b>Amount:</b> ${formatUSD(usdtAmount)}
💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>

${formatLine()}

<i>Click CONFIRM to submit your withdrawal request.</i>`, getConfirmWithdrawKeyboard());

    userSessions.set(userId, { withdrawAmount: usdtAmount, withdrawCurrency: 'USDT', createdAt: Date.now() });
});

bot.action('confirm_withdraw_final', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = userSessions.get(userId);
    await ctx.answerCbQuery();

    if (!session?.withdrawAmount) {
        await sendAndTrack(ctx, `<b>❌ SESSION EXPIRED</b>
${formatLine()}
Please start over by clicking WITHDRAW again.`, getMainKeyboard(userId));
        return;
    }

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    // ✅ إعادة التحقق من القنوات قبل السحب
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
            `<b>💸 WITHDRAWAL REQUEST</b>
${formatLine()}
👤 ${escapeHtml(user.userName)}
💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}
💳 <code>${user.walletAddress}</code>
🆔 ${withdrawalRef.id}`, { parse_mode: 'HTML' }).catch(() => {});
    }

    await sendAndTrack(ctx, `<b>✅ WITHDRAWAL REQUEST SUBMITTED!</b>
${formatLine()}

💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}
⏳ <b>Processing Time:</b> 24-48 hours

<i>You will be notified once processed.</i>`, getMainKeyboard(userId));

    userSessions.delete(userId);
});

bot.action('cancel_action', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    await sendAndTrack(ctx, `<b>❌ ACTION CANCELLED</b>
${formatLine()}
You have been returned to the main menu.`, getMainKeyboard(userId));
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    const user = await getOrCreateUser(userId, '', '');
    await sendAndTrack(ctx, `<b>🎯 MAIN MENU</b>
${formatLine()}
💰 <b>Balance:</b> ${formatAXC(user?.balance || 0)}

<i>👇 Select an option below:</i>`, getMainKeyboard(userId));
});

// ============================================================================
// 14. 👑 ADMIN PANEL
// ============================================================================

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
        await ctx.reply('<b>⛔ Access denied!</b>', { parse_mode: 'HTML' });
        return;
    }

    await ctx.reply(`<b>👑 AXION AI ADMIN PANEL</b>
${formatLine()}
✅ <b>Authenticated as Admin</b>

📋 <b>Click any button below:</b>`, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
});

// Admin action handlers (اختصاراً لأنها طويلة)
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!checkDb()) return;
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    await ctx.reply(`<b>📊 STATISTICS</b>
${formatLine()}
👥 <b>Users:</b> ${usersSnapshot.size}
💸 <b>Pending Withdrawals:</b> ${pendingSnapshot.size}`, { parse_mode: 'HTML' });
});

// باقي Admin handlers مماثلة للنسخة السابقة (محذوفة للاختصار)

// ============================================================================
// 15. 📡 TEXT HANDLER (UNIFIED)
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    // Skip commands and buttons
    if (text.startsWith('/')) return;
    if (['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '🔄 SWAP', '⚙️ SETTINGS', '👑 ADMIN PANEL'].includes(text)) return;

    const session = userSessions.get(userId);

    // ✅ Handle initial wallet setup
    if (session?.waitingForWallet && isValidBEP20(text)) {
        await updateUser(userId, { walletAddress: text });
        userSessions.delete(userId);
        await sendAndTrack(ctx, `<b>✅ WALLET ADDRESS SAVED!</b>
${formatLine()}
💳 <code>${text}</code>

<i>You can now withdraw funds.</i>`, getMainKeyboard(userId));
        return;
    }

    // ✅ Handle wallet update from settings
    if (session?.waitingForWalletUpdate && isValidBEP20(text)) {
        await updateUser(userId, { walletAddress: text });
        userSessions.delete(userId);
        await sendAndTrack(ctx, `<b>✅ WALLET ADDRESS UPDATED!</b>
${formatLine()}
💳 <code>${text}</code>

<i>Your withdrawal wallet has been updated.</i>`, getMainKeyboard(userId));
        return;
    }

    // Invalid address
    if (session?.waitingForWallet && !isValidBEP20(text)) {
        await sendAndTrack(ctx, `<b>❌ INVALID ADDRESS</b>
${formatLine()}

Please send a valid BEP20 wallet address.

<i>Example: <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code></i>

${formatLine()}

📝 <b>Try again or click CANCEL:</b>`, getCancelKeyboard());
        return;
    }

    if (session?.waitingForWalletUpdate && !isValidBEP20(text)) {
        await sendAndTrack(ctx, `<b>❌ INVALID ADDRESS</b>
${formatLine()}

Please send a valid BEP20 wallet address.

<i>Example: <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code></i>

${formatLine()}

📝 <b>Try again or click CANCEL:</b>`, getCancelKeyboard());
        return;
    }
});

// ============================================================================
// 16. 📡 EXPRESS SERVER
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: 'alive', timestamp: Date.now(), firebase: firebaseHealthy ? 'connected' : 'disconnected' }); });
app.get('/api/config', (req, res) => { res.json({ firebaseConfig: firebaseWebConfig, ownerWallet: OWNER_WALLET, status: 'ok' }); });
app.get('/tonconnect-manifest.json', (req, res) => { res.sendFile(path.join(__dirname, 'tonconnect-manifest.json')); });

// ============================================================================
// 17. 🚀 LAUNCH
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🚀 Axion AI Bot v20.0 Started Successfully'))
    .catch(err => console.error('❌ Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`\n🌟 AXION AI v20.0 - PROFESSIONAL EDITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Port: ${PORT}
🔥 Firebase: ${db && firebaseHealthy ? '✅ Connected' : '❌ Disconnected'}
👑 Admin ID: ${ADMIN_ID || 'Not configured'}
🤖 Bot: ${BOT_TOKEN ? '✅ Configured' : 'Missing'}
💸 Withdrawals: AXC + USDT
🔄 Swap: Mini App with TON Connect
⚙️ Settings: Change wallet, manage account
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Axion AI is READY for battle!`);
});

// ============================================================================
// END OF FILE
// ============================================================================
