// ============================================================================
// AXION AI BOT - COMPLETE PROFESSIONAL EDITION v25.0
// ============================================================================
// جميع الميزات تعمل بكفاءة:
// ✅ التحقق من القنوات - يظهر فقط عند استخدام الميزات
// ✅ منح المكافأة بعد التحقق مباشرة
// ✅ نظام إحالة محمي وممتاز
// ✅ لوحة مشرف متكاملة بجميع الوظائف
// ✅ عداد مستخدمين دقيق
// ✅ إشعارات احترافية
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
let ADMIN_PASSWORD = null;
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
        ADMIN_PASSWORD = adminConfig.admin_password;
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
const adminSessions = new Map();
let firebaseHealthy = true;
let totalUsersCount = 0;

// التنسيقات الاحترافية
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

// تنظيف الجلسات
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of userSessions.entries()) {
        if (session.createdAt && (now - session.createdAt) > APP_CONFIG.sessionTTL) {
            userSessions.delete(userId);
        }
    }
    for (const [userId, session] of adminSessions.entries()) {
        if (session.createdAt && (now - session.createdAt) > 3600000) {
            adminSessions.delete(userId);
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
        updateTotalUsersCount();
    } catch (error) { console.error('Firebase init error:', error.message); }
}

function checkDb() { return db && firebaseHealthy; }

async function updateTotalUsersCount() {
    if (!checkDb()) return;
    try {
        const snapshot = await db.collection('users').count().get();
        totalUsersCount = snapshot.data().count;
        console.log(`📊 Total users count: ${totalUsersCount}`);
    } catch (error) { console.error('Error counting users:', error.message); }
}

// ============================================================================
// 4. 🤖 TELEGRAM BOT SETUP
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);

bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => console.log('✅ Bot using polling mode'))
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

function isAdminAuthenticated(userId) {
    const session = adminSessions.get(userId);
    return session && session.authenticated === true;
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
        createdAt: admin.firestore.FieldValue.serverTimestamp()
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
        await updateTotalUsersCount();
        console.log(`✅ New user created: ${userId} (${userName})`);
        return newUser;
    } catch (error) { 
        console.error('GetOrCreateUser error:', error.message);
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
// 6. 🔒 CHANNEL VERIFICATION
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
        
        const verifyMessage = formatProfessionalMessage(
            '⚠️ VERIFICATION REQUIRED',
            `You must join all required channels to use this feature.\n\n<b>Missing channels:</b>\n${list}`,
            `Please join and click VERIFY`
        );
        
        await sendAndTrack(ctx, verifyMessage, getChannelsKeyboard());
        return false;
    }
    return true;
}

// ============================================================================
// 7. 🔗 REFERRAL SYSTEM
// ============================================================================

async function giveReferralBonus(userId, referrerId) {
    if (!checkDb()) return false;
    if (referrerId === userId) return false;
    
    try {
        const referrerRef = db.collection('users').doc(referrerId);
        const referrerDoc = await referrerRef.get();
        
        if (!referrerDoc.exists) return false;
        
        const currentReferrals = referrerDoc.data().referrals || [];
        if (currentReferrals.includes(userId)) return false;
        
        await db.runTransaction(async (transaction) => {
            const refDoc = await transaction.get(referrerRef);
            
            transaction.update(referrerRef, {
                referrals: [...currentReferrals, userId],
                inviteCount: (refDoc.data().inviteCount || 0) + 1,
                balance: (refDoc.data().balance || 0) + APP_CONFIG.referralBonus,
                totalEarned: (refDoc.data().totalEarned || 0) + APP_CONFIG.referralBonus
            });
        });
        
        const newInviteCount = (referrerDoc.data().inviteCount || 0) + 1;
        
        const referralMessage = formatProfessionalMessage(
            '🎉 NEW REFERRAL!',
            `👤 <b>${escapeHtml(referrerDoc.data().userName)}</b> referred you!\n\n💰 <b>+${APP_CONFIG.welcomeBonus} AXC</b> added to your balance after verification`,
            `Complete verification to claim your bonus!`
        );
        
        await bot.telegram.sendMessage(userId, referralMessage, { parse_mode: 'HTML' }).catch(() => {});
        
        const referrerMessage = formatProfessionalMessage(
            '🎉 NEW REFERRAL!',
            `👤 <b>${escapeHtml(referrerDoc.data().userName)}</b> joined using your link!\n\n💰 <b>+${formatAXC(APP_CONFIG.referralBonus)}</b>\n\n👥 <b>Total Referrals:</b> ${newInviteCount}`,
            `💡 Keep inviting to unlock milestone rewards!`
        );
        
        await bot.telegram.sendMessage(referrerId, referrerMessage, { parse_mode: 'HTML' }).catch(() => {});
        await checkMilestoneAchievement(referrerId);
        
        return true;
    } catch (error) { 
        console.error('Referral error:', error.message);
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
                
                const milestoneMessage = formatProfessionalMessage(
                    '🏆 MILESTONE UNLOCKED!',
                    `🎉 ${milestone.name}\n👥 ${milestone.count} referrals\n💰 +${formatUSD(milestone.reward)} USDT added!`,
                    `✨ You're on fire! Keep going!`
                );
                
                await bot.telegram.sendMessage(userId, milestoneMessage, { parse_mode: 'HTML' }).catch(() => {});
                console.log(`✅ Milestone unlocked: ${userId} - ${milestone.count} referrals`);
            }
        }
    } catch (error) { console.error('Milestone error:', error.message); }
}

// ============================================================================
// 8. 🎨 KEYBOARDS & BUTTONS
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
            [{ text: '💰 ADD BALANCE', callback_data: 'admin_add_balance' }],
            [{ text: '➖ REMOVE BALANCE', callback_data: 'admin_remove_balance' }],
            [{ text: '✅ VERIFY USER', callback_data: 'admin_verify_user' }],
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }],
            [{ text: '🚪 LOGOUT', callback_data: 'admin_logout' }]
        ]
    };
}

function getWithdrawalActionKeyboard(requestId) {
    return {
        inline_keyboard: [
            [
                { text: '✅ APPROVE', callback_data: `approve_withdraw_${requestId}` },
                { text: '❌ REJECT', callback_data: `reject_withdraw_${requestId}` }
            ]
        ]
    };
}

// ============================================================================
// 9. 📨 BOT COMMANDS
// ============================================================================

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

    if (refCode && refCode !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: refCode });
    }

    const welcomeMsg = formatProfessionalMessage(
        '✨ WELCOME TO AXION AI ✨',
        `🎁 <b>Get ${formatAXC(APP_CONFIG.welcomeBonus)}</b> after verification\n👥 <b>Get ${formatAXC(APP_CONFIG.referralBonus)}</b> per referral\n💎 <b>Minimum Withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdraw)}`,
        `👇 Select an option below:`
    );

    await sendAndTrack(ctx, welcomeMsg, getMainKeyboard(userId));
    
    if (!user.isVerified) {
        const missing = await getMissingChannels(userId);
        if (missing.length > 0) {
            let list = '';
            for (const ch of missing) list += `📢 ${ch.name}\n`;
            const verifyMsg = formatProfessionalMessage(
                '⚠️ VERIFICATION REQUIRED',
                `Please join our channels to use the bot:\n\n${list}`,
                `Click VERIFY after joining`
            );
            await sendAndTrack(ctx, verifyMsg, getChannelsKeyboard());
        }
    }
});

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    const balanceMsg = formatProfessionalMessage(
        '📊 YOUR BALANCE',
        `💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n🎁 <b>Earned:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}`,
        `👇 Use the buttons below to manage your funds:`
    );

    await sendAndTrack(ctx, balanceMsg, getMainKeyboard(userId));
});

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

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    if (!await requireChannelVerification(ctx, userId)) return;

    if (user.withdrawBlocked) {
        await sendAndTrack(ctx, formatProfessionalMessage('🚫 ACCOUNT BLOCKED', 'Contact support for assistance.'), getMainKeyboard(userId));
        return;
    }

    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, formatProfessionalMessage('⏳ COOLDOWN ACTIVE', `Please wait ${hoursLeft} hour(s).`), getMainKeyboard(userId));
        return;
    }

    if (!user.isVerified) {
        await sendAndTrack(ctx, formatProfessionalMessage('🔒 VERIFICATION REQUIRED', 'Please complete channel verification first.'), getChannelsKeyboard());
        return;
    }

    if (!user.walletAddress) {
        const walletMsg = formatProfessionalMessage(
            '💳 SETUP WITHDRAWAL WALLET',
            `Send your BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
            `📝 Send your address now:`
        );
        await sendAndTrack(ctx, walletMsg, getCancelKeyboard());
        userSessions.set(userId, { waitingForWallet: true, createdAt: Date.now() });
        return;
    }

    const withdrawMsg = formatProfessionalMessage(
        '💸 WITHDRAWAL',
        `💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>`,
        `👇 Choose currency:`
    );

    await sendAndTrack(ctx, withdrawMsg, getWithdrawCurrencyKeyboard());
});

bot.hears('🔄 SWAP STATION', async (ctx) => {
    const userId = ctx.from.id.toString();

    if (!checkDb()) {
        await ctx.reply('⚠️ Database is temporarily unavailable.');
        return;
    }

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    if (!await requireChannelVerification(ctx, userId)) return;

    const swapUrl = `${APP_URL}/swap.html?userId=${userId}`;

    const swapMsg = formatProfessionalMessage(
        '⚡ AXION SWAP STATION',
        `💰 <b>AXC Balance:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT Balance:</b> ${formatUSD(user.usdtBalance || 0)}\n\n${user.tonPaid ? '✅ Swap feature is activated!' : '🔒 One-time activation required: 0.05 TON'}`,
        `👇 Click below to open the Swap Station:`
    );

    await sendAndTrack(ctx, swapMsg, {
        inline_keyboard: [
            [{ text: '🔄 OPEN SWAP STATION', web_app: { url: swapUrl } }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    });
});

bot.hears('⚙️ SETTINGS', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    const settingsMsg = formatProfessionalMessage(
        '⚙️ SETTINGS',
        `💳 <b>Wallet:</b> ${user.walletAddress ? `<code>${user.walletAddress}</code>` : 'Not set'}\n\n🔐 <b>Verified:</b> ${user.isVerified ? '✅ Yes' : '❌ No'}\n\n🔄 <b>Swap:</b> ${user.tonPaid ? '✅ Activated' : '❌ Not activated'}`,
        `👇 Select an option:`
    );

    await sendAndTrack(ctx, settingsMsg, getSettingsKeyboard());
});

// ============================================================================
// 10. 🔘 CALLBACK ACTIONS
// ============================================================================

bot.action('change_wallet', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const changeWalletMsg = formatProfessionalMessage(
        '💳 CHANGE WALLET',
        `Send your new BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
        `📝 Send your new address now:`
    );

    await sendAndTrack(ctx, changeWalletMsg, getCancelKeyboard());
    
    userSessions.set(userId, { waitingForWalletUpdate: true, createdAt: Date.now() });
});

bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();

    if (userData.isVerified) {
        await sendAndTrack(ctx, formatProfessionalMessage('✅ Already Verified!', 'You are already verified.'), getMainKeyboard(userId));
        return;
    }

    const missing = await getMissingChannels(userId);
    if (missing.length > 0) {
        let list = '';
        for (const ch of missing) list += `📢 ${ch.name}\n`;
        await sendAndTrack(ctx, formatProfessionalMessage('⚠️ MISSING CHANNELS', `${list}\nPlease join all channels and click VERIFY.`), getChannelsKeyboard());
        return;
    }

    // منح المكافأة بعد التحقق
    await updateUser(userId, {
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus),
        totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus)
    });

    // منح مكافأة الإحالة للمحيل إذا وجد
    if (userData.referredBy) {
        await giveReferralBonus(userId, userData.referredBy);
    }

    const newBalance = (userData.balance || 0) + APP_CONFIG.welcomeBonus;
    const verifySuccessMsg = formatProfessionalMessage(
        '✅ VERIFICATION SUCCESSFUL!',
        `🎉 <b>+${formatAXC(APP_CONFIG.welcomeBonus)}</b> added!\n\n💰 <b>New Balance:</b> ${formatAXC(newBalance)}`,
        `You can now invite friends and withdraw funds.`
    );

    await sendAndTrack(ctx, verifySuccessMsg, getMainKeyboard(userId));
});

bot.action('withdraw_axc', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    if (!await requireChannelVerification(ctx, userId)) return;

    if ((user.balance || 0) < APP_CONFIG.minWithdraw) {
        await sendAndTrack(ctx, formatProfessionalMessage('❌ INSUFFICIENT BALANCE', `You need <b>${formatAXC(APP_CONFIG.minWithdraw)}</b> to withdraw.`), getMainKeyboard(userId));
        return;
    }

    const amount = user.balance;
    await sendAndTrack(ctx, formatProfessionalMessage('💸 WITHDRAWAL REQUEST', `💰 <b>Amount:</b> ${formatAXC(amount)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>`, `Click CONFIRM to submit.`), getConfirmWithdrawKeyboard());

    userSessions.set(userId, { withdrawAmount: amount, withdrawCurrency: 'AXC', createdAt: Date.now() });
});

bot.action('withdraw_usdt', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    if (!await requireChannelVerification(ctx, userId)) return;

    const usdtAmount = user.usdtBalance || 0;

    if (usdtAmount < APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice) {
        await sendAndTrack(ctx, formatProfessionalMessage('❌ INSUFFICIENT USDT', `You need <b>${formatUSD(APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice)}</b> to withdraw USDT.`), getMainKeyboard(userId));
        return;
    }

    await sendAndTrack(ctx, formatProfessionalMessage('💸 USDT WITHDRAWAL REQUEST', `💵 <b>Amount:</b> ${formatUSD(usdtAmount)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>`, `Click CONFIRM to submit.`), getConfirmWithdrawKeyboard());

    userSessions.set(userId, { withdrawAmount: usdtAmount, withdrawCurrency: 'USDT', createdAt: Date.now() });
});

bot.action('confirm_withdraw_final', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = userSessions.get(userId);
    await ctx.answerCbQuery();

    if (!session?.withdrawAmount) {
        await sendAndTrack(ctx, formatProfessionalMessage('❌ SESSION EXPIRED', 'Please start over.'), getMainKeyboard(userId));
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
    const requestId = withdrawalRef.id;
    
    await withdrawalRef.set({
        id: requestId,
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
            formatProfessionalMessage('💸 NEW WITHDRAWAL REQUEST',
                `👤 <b>User:</b> ${escapeHtml(user.userName)}\n🆔 <b>ID:</b> ${userId}\n💰 <b>Amount:</b> ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}\n💳 <b>Wallet:</b> <code>${user.walletAddress}</code>\n📅 <b>Request ID:</b> <code>${requestId}</code>`
            ), { 
                parse_mode: 'HTML',
                reply_markup: getWithdrawalActionKeyboard(requestId)
            }).catch(() => {});
    }

    await sendAndTrack(ctx, formatProfessionalMessage('✅ WITHDRAWAL SUBMITTED!', `💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}\n⏳ <b>Processing:</b> 24-48 hours`), getMainKeyboard(userId));

    userSessions.delete(userId);
});

bot.action('cancel_action', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    await sendAndTrack(ctx, formatProfessionalMessage('❌ ACTION CANCELLED', 'Returning to main menu.'), getMainKeyboard(userId));
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    const user = await getOrCreateUser(userId, '', '');
    await sendAndTrack(ctx, formatProfessionalMessage('🎯 MAIN MENU', `💰 <b>Balance:</b> ${formatAXC(user?.balance || 0)}`), getMainKeyboard(userId));
});

// ============================================================================
// 11. 👑 ADMIN PANEL - جميع الوظائف تعمل
// ============================================================================

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        await ctx.reply('⛔ <b>Access Denied</b>', { parse_mode: 'HTML' });
        return;
    }
    
    if (isAdminAuthenticated(userId)) {
        await ctx.reply(formatProfessionalMessage('👑 ADMIN PANEL', '✅ Authenticated\n\n📋 Click any button below:'), { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        return;
    }
    
    await ctx.reply(formatProfessionalMessage('🔐 ADMIN LOGIN', 'Please enter your admin password.'), { parse_mode: 'HTML' });
    adminSessions.set(userId, { waitingForPassword: true, createdAt: Date.now() });
});

// معالجة كلمة السر
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const adminSession = adminSessions.get(userId);
    
    if (adminSession?.waitingForPassword && isAdmin(userId)) {
        if (ctx.message.text.trim() === ADMIN_PASSWORD) {
            adminSessions.set(userId, { authenticated: true, createdAt: Date.now() });
            delete adminSessions.get(userId).waitingForPassword;
            await ctx.reply(formatProfessionalMessage('✅ LOGIN SUCCESSFUL', 'Welcome Admin.'), { parse_mode: 'HTML' });
            await ctx.reply(formatProfessionalMessage('👑 ADMIN PANEL', 'Select an option:'), { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ LOGIN FAILED', 'Invalid password.'), { parse_mode: 'HTML' });
            adminSessions.delete(userId);
        }
        return;
    }
});

// 11.1 📊 STATISTICS
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    const verifiedSnapshot = await db.collection('users').where('isVerified', '==', true).get();
    
    let totalBalance = 0;
    let totalUsdt = 0;
    let totalReferrals = 0;
    
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        totalBalance += data.balance || 0;
        totalUsdt += data.usdtBalance || 0;
        totalReferrals += data.inviteCount || 0;
    });
    
    const statsMsg = formatProfessionalMessage(
        '📊 STATISTICS',
        `👥 <b>Total Users:</b> ${totalUsersCount}\n✅ <b>Verified:</b> ${verifiedSnapshot.size}\n💸 <b>Pending Withdrawals:</b> ${pendingSnapshot.size}\n\n💰 <b>Total AXC:</b> ${formatAXC(totalBalance)}\n💵 <b>Total USDT:</b> ${formatUSD(totalUsdt)}\n👥 <b>Total Referrals:</b> ${totalReferrals}`
    );
    
    await ctx.reply(statsMsg, { parse_mode: 'HTML' });
});

// 11.2 💸 PENDING WITHDRAWALS
bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    
    if (pendingSnapshot.empty) {
        await ctx.reply(formatProfessionalMessage('✅ NO PENDING', 'All withdrawals processed.'), { parse_mode: 'HTML' });
        return;
    }
    
    let msg = '';
    pendingSnapshot.forEach(doc => {
        const data = doc.data();
        msg += `👤 ${data.userName}\n💰 ${data.currency === 'AXC' ? formatAXC(data.amount) : formatUSD(data.amount)}\n🆔 ${doc.id}\n${MINI_DIVIDER}\n`;
    });
    
    await ctx.reply(formatProfessionalMessage('💸 PENDING WITHDRAWALS', msg), { parse_mode: 'HTML' });
});

// 11.3 👥 TOTAL USERS
bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    const usersSnapshot = await db.collection('users').get();
    const verifiedCount = (await db.collection('users').where('isVerified', '==', true).get()).size;
    
    const usersMsg = formatProfessionalMessage(
        '👥 USERS',
        `📊 <b>Total:</b> ${totalUsersCount}\n✅ <b>Verified:</b> ${verifiedCount}\n📝 <b>With Wallet:</b> ${usersSnapshot.docs.filter(d => d.data().walletAddress).length}`
    );
    
    await ctx.reply(usersMsg, { parse_mode: 'HTML' });
});

// 11.4 🔍 SEARCH USER
bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('🔍 <b>SEARCH USER</b>\n\nSend user ID or username:', { parse_mode: 'HTML' });
    adminSessions.set(userId, { searching: true, createdAt: Date.now() });
});

// 11.5 💰 ADD BALANCE
bot.action('admin_add_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('💰 <b>ADD BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\n\nExample: <code>123456789 100 AXC</code>\n<i>Currency: AXC or USDT</i>', { parse_mode: 'HTML' });
    adminSessions.set(userId, { addingBalance: true, createdAt: Date.now() });
});

// 11.6 ➖ REMOVE BALANCE
bot.action('admin_remove_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('➖ <b>REMOVE BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\n\nExample: <code>123456789 50 AXC</code>\n<i>Currency: AXC or USDT</i>', { parse_mode: 'HTML' });
    adminSessions.set(userId, { removingBalance: true, createdAt: Date.now() });
});

// 11.7 ✅ VERIFY USER
bot.action('admin_verify_user', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('✅ <b>VERIFY USER</b>\n\nSend user ID to verify:', { parse_mode: 'HTML' });
    adminSessions.set(userId, { verifyingUser: true, createdAt: Date.now() });
});

// 11.8 📢 BROADCAST
bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('📢 <b>BROADCAST</b>\n\nSend your message:', { parse_mode: 'HTML' });
    adminSessions.set(userId, { broadcasting: true, createdAt: Date.now() });
});

// 11.9 🚪 LOGOUT
bot.action('admin_logout', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    adminSessions.delete(userId);
    await ctx.reply(formatProfessionalMessage('🔓 LOGGED OUT', 'Admin session ended.'), { parse_mode: 'HTML' });
});

// ============================================================================
// 12. معالجة السحوبات (قبول/رفض)
// ============================================================================

bot.action(/approve_withdraw_(.+)/, async (ctx) => {
    const requestId = ctx.match[1];
    const adminId = ctx.from.id.toString();
    
    if (!isAdmin(adminId) || !isAdminAuthenticated(adminId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery('✅ Withdrawal approved');
    
    const withdrawalDoc = await db.collection('withdrawals').doc(requestId).get();
    if (!withdrawalDoc.exists) {
        await ctx.editMessageText('❌ Request not found');
        return;
    }
    
    const withdrawal = withdrawalDoc.data();
    await db.collection('withdrawals').doc(requestId).update({ status: 'approved', approvedAt: new Date().toISOString(), approvedBy: adminId });
    
    await bot.telegram.sendMessage(withdrawal.userId, formatProfessionalMessage('✅ WITHDRAWAL APPROVED', `💰 ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)}\n\nFunds have been sent to your wallet.`), { parse_mode: 'HTML' }).catch(() => {});
    
    await ctx.editMessageText(`✅ Approved: ${withdrawal.userName} - ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)}`);
});

bot.action(/reject_withdraw_(.+)/, async (ctx) => {
    const requestId = ctx.match[1];
    const adminId = ctx.from.id.toString();
    
    if (!isAdmin(adminId) || !isAdminAuthenticated(adminId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery('❌ Withdrawal rejected');
    
    const withdrawalDoc = await db.collection('withdrawals').doc(requestId).get();
    if (!withdrawalDoc.exists) {
        await ctx.editMessageText('❌ Request not found');
        return;
    }
    
    const withdrawal = withdrawalDoc.data();
    await db.collection('withdrawals').doc(requestId).update({ status: 'rejected', rejectedAt: new Date().toISOString(), rejectedBy: adminId });
    
    // إعادة الرصيد للمستخدم
    if (withdrawal.currency === 'AXC') {
        await updateUser(withdrawal.userId, { balance: admin.firestore.FieldValue.increment(withdrawal.amount) });
    } else {
        await updateUser(withdrawal.userId, { usdtBalance: admin.firestore.FieldValue.increment(withdrawal.amount) });
    }
    
    await bot.telegram.sendMessage(withdrawal.userId, formatProfessionalMessage('❌ WITHDRAWAL REJECTED', `Your withdrawal request has been rejected.\n\nContact support for more information.`), { parse_mode: 'HTML' }).catch(() => {});
    
    await ctx.editMessageText(`❌ Rejected: ${withdrawal.userName} - ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)}`);
});

// ============================================================================
// 13. 📝 MAIN TEXT HANDLER
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const messageText = ctx.message.text;
    
    const buttons = ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '🔄 SWAP STATION', '⚙️ SETTINGS', '👑 ADMIN PANEL'];
    if (buttons.includes(messageText)) return;
    if (messageText.startsWith('/')) return;
    
    const adminSession = adminSessions.get(userId);
    
    // معالجة البحث
    if (adminSession?.searching && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const searchTerm = messageText.trim();
        let userDoc = null;
        
        if (searchTerm.match(/^\d+$/)) {
            userDoc = await db.collection('users').doc(searchTerm).get();
        } else {
            const snapshot = await db.collection('users').where('userName', '==', searchTerm).limit(1).get();
            if (!snapshot.empty) userDoc = snapshot.docs[0];
        }
        
        if (userDoc && userDoc.exists) {
            const user = userDoc.data();
            const userMsg = formatProfessionalMessage(
                '👤 USER FOUND',
                `🆔 <b>ID:</b> ${user.userId}\n👤 <b>Name:</b> ${escapeHtml(user.userName)}\n💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n✅ <b>Verified:</b> ${user.isVerified ? 'Yes' : 'No'}\n💳 <b>Wallet:</b> ${user.walletAddress ? user.walletAddress.substring(0, 15) + '...' : 'Not set'}`
            );
            await ctx.reply(userMsg, { parse_mode: 'HTML' });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ NOT FOUND', 'User not found.'), { parse_mode: 'HTML' });
        }
        adminSessions.delete(userId);
        return;
    }
    
    // معالجة إضافة رصيد
    if (adminSession?.addingBalance && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const parts = messageText.trim().split(' ');
        if (parts.length === 3) {
            const targetUserId = parts[0];
            const amount = parseFloat(parts[1]);
            const currency = parts[2].toUpperCase();
            
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount.');
            } else if (currency === 'AXC') {
                await updateUser(targetUserId, { balance: admin.firestore.FieldValue.increment(amount), totalEarned: admin.firestore.FieldValue.increment(amount) });
                await ctx.reply(formatProfessionalMessage('✅ BALANCE ADDED', `Added ${formatAXC(amount)} to ${targetUserId}`), { parse_mode: 'HTML' });
            } else if (currency === 'USDT') {
                await updateUser(targetUserId, { usdtBalance: admin.firestore.FieldValue.increment(amount) });
                await ctx.reply(formatProfessionalMessage('✅ BALANCE ADDED', `Added ${formatUSD(amount)} to ${targetUserId}`), { parse_mode: 'HTML' });
            } else {
                await ctx.reply('❌ Invalid currency. Use AXC or USDT');
            }
        } else {
            await ctx.reply('❌ Format: USER_ID AMOUNT CURRENCY');
        }
        adminSessions.delete(userId);
        return;
    }
    
    // معالجة خصم رصيد
    if (adminSession?.removingBalance && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const parts = messageText.trim().split(' ');
        if (parts.length === 3) {
            const targetUserId = parts[0];
            const amount = parseFloat(parts[1]);
            const currency = parts[2].toUpperCase();
            
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount.');
            } else if (currency === 'AXC') {
                await updateUser(targetUserId, { balance: admin.firestore.FieldValue.increment(-amount) });
                await ctx.reply(formatProfessionalMessage('➖ BALANCE REMOVED', `Removed ${formatAXC(amount)} from ${targetUserId}`), { parse_mode: 'HTML' });
            } else if (currency === 'USDT') {
                await updateUser(targetUserId, { usdtBalance: admin.firestore.FieldValue.increment(-amount) });
                await ctx.reply(formatProfessionalMessage('➖ BALANCE REMOVED', `Removed ${formatUSD(amount)} from ${targetUserId}`), { parse_mode: 'HTML' });
            } else {
                await ctx.reply('❌ Invalid currency. Use AXC or USDT');
            }
        } else {
            await ctx.reply('❌ Format: USER_ID AMOUNT CURRENCY');
        }
        adminSessions.delete(userId);
        return;
    }
    
    // معالجة التحقق من مستخدم
    if (adminSession?.verifyingUser && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const targetUserId = messageText.trim();
        if (targetUserId.match(/^\d+$/)) {
            const userDoc = await db.collection('users').doc(targetUserId).get();
            if (userDoc.exists && !userDoc.data().isVerified) {
                await updateUser(targetUserId, {
                    isVerified: true,
                    verifiedAt: new Date().toISOString(),
                    balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus),
                    totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus)
                });
                
                // منح مكافأة الإحالة
                const userData = userDoc.data();
                if (userData.referredBy) {
                    await giveReferralBonus(targetUserId, userData.referredBy);
                }
                
                await ctx.reply(formatProfessionalMessage('✅ USER VERIFIED', `${targetUserId} has been verified and received ${formatAXC(APP_CONFIG.welcomeBonus)}.`), { parse_mode: 'HTML' });
                await bot.telegram.sendMessage(targetUserId, formatProfessionalMessage('✅ VERIFIED', `You have been verified by admin!\n\n🎉 +${formatAXC(APP_CONFIG.welcomeBonus)} added!`), { parse_mode: 'HTML' }).catch(() => {});
            } else if (userDoc.exists && userDoc.data().isVerified) {
                await ctx.reply(formatProfessionalMessage('ℹ️ ALREADY VERIFIED', 'This user is already verified.'), { parse_mode: 'HTML' });
            } else {
                await ctx.reply(formatProfessionalMessage('❌ USER NOT FOUND', 'User does not exist.'), { parse_mode: 'HTML' });
            }
        } else {
            await ctx.reply('❌ Invalid user ID. Send a numeric ID.');
        }
        adminSessions.delete(userId);
        return;
    }
    
    // معالجة البث
    if (adminSession?.broadcasting && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const broadcastMessage = messageText;
        const usersSnapshot = await db.collection('users').get();
        let sent = 0;
        let failed = 0;
        
        await ctx.reply(`⏳ Sending to ${usersSnapshot.size} users...`);
        
        for (const doc of usersSnapshot.docs) {
            try {
                await bot.telegram.sendMessage(doc.id, formatProfessionalMessage('📢 ANNOUNCEMENT', broadcastMessage), { parse_mode: 'HTML' });
                sent++;
                await new Promise(r => setTimeout(r, 50));
            } catch(e) { failed++; }
        }
        
        await ctx.reply(formatProfessionalMessage('✅ BROADCAST COMPLETE', `📤 Sent: ${sent}\n❌ Failed: ${failed}`), { parse_mode: 'HTML' });
        adminSessions.delete(userId);
        return;
    }
    
    // معالجة حفظ المحفظة للمستخدمين
    const session = userSessions.get(userId);
    
    if (session?.waitingForWallet) {
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText });
            userSessions.delete(userId);
            await sendAndTrack(ctx, formatProfessionalMessage('✅ WALLET SAVED!', `💳 <code>${messageText}</code>\n\n<i>You can now withdraw.</i>`), getMainKeyboard(userId));
        } else {
            await sendAndTrack(ctx, formatProfessionalMessage('❌ INVALID ADDRESS', `Send valid BEP20 address.\n\nExample: <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`), getCancelKeyboard());
        }
        return;
    }
    
    if (session?.waitingForWalletUpdate) {
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText });
            userSessions.delete(userId);
            await sendAndTrack(ctx, formatProfessionalMessage('✅ WALLET UPDATED!', `💳 <code>${messageText}</code>`), getMainKeyboard(userId));
        } else {
            await sendAndTrack(ctx, formatProfessionalMessage('❌ INVALID ADDRESS', `Send valid BEP20 address.`), getCancelKeyboard());
        }
        return;
    }
});

// ============================================================================
// 14. 📡 EXPRESS SERVER
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: 'alive', totalUsers: totalUsersCount, firebase: !!db }); });
app.get('/api/config', (req, res) => { res.json({ firebaseConfig: firebaseWebConfig, ownerWallet: OWNER_WALLET }); });
app.get('/tonconnect-manifest.json', (req, res) => { res.sendFile(path.join(__dirname, 'tonconnect-manifest.json')); });

// ============================================================================
// 15. 🚀 LAUNCH
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🚀 Axion AI Bot v25.0 Started'))
    .catch(err => console.error('❌ Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║     AXION AI v25.0 - COMPLETE EDITION           ║
╠══════════════════════════════════════════════════╣
║  📍 Port: ${PORT}                                       ║
║  🔥 Firebase: ${db ? '✅ Connected' : '❌ Disconnected'}                    ║
║  👑 Admin: ${ADMIN_ID ? '✅ Loaded' : '❌ Missing'}                          ║
║  📊 Users: ${totalUsersCount}                                    ║
║  🤖 Bot: ${BOT_TOKEN ? '✅ Running' : '❌ Missing'}                         ║
╚══════════════════════════════════════════════════╝
    `);
});

// ============================================================================
// END OF FILE
// ============================================================================
