// ============================================================================
// AXION AI BOT - COMPLETE PROFESSIONAL EDITION v22.0
// ============================================================================
// جميع الميزات والوظائف تعمل بكفاءة:
// ✅ نظام حفظ وتغيير المحفظة
// ✅ لوحة مشرف متكاملة (إحصائيات - بث - إضافة رصيد - بحث)
// ✅ نظام إحالة متطور
// ✅ عداد مستخدمين دقيق
// ✅ إشعارات احترافية
// ✅ أزرار عائمة تستجيب بشكل فوري
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
        console.log('🔐 Admin password:', ADMIN_PASSWORD ? '✅ Loaded' : '❌ Missing');
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
// 4. 📊 USER COUNTER SYSTEM
// ============================================================================

async function updateTotalUsersCount() {
    if (!checkDb()) return;
    try {
        const snapshot = await db.collection('users').count().get();
        totalUsersCount = snapshot.data().count;
        await db.collection('system').doc('stats').set({
            totalUsers: totalUsersCount,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`📊 Total users count: ${totalUsersCount}`);
    } catch (error) {
        console.error('Error counting users:', error.message);
    }
}

// ============================================================================
// 5. 🤖 TELEGRAM BOT SETUP
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
// 6. 🛠️ HELPER FUNCTIONS
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

function formatLine() {
    return `<code>${DIVIDER}</code>`;
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
        console.log(`✅ User ${userId} updated:`, Object.keys(data));
    } catch (error) {
        console.error('Update user error:', error.message);
    }
}

// ============================================================================
// 7. 🔗 REFERRAL SYSTEM
// ============================================================================

async function processReferralFromBot(referrerId, newUserId, newUserName) {
    if (!checkDb()) return false;
    if (referrerId === newUserId) return false;
    
    try {
        const referrerRef = db.collection('users').doc(referrerId);
        const referrerDoc = await referrerRef.get();
        
        if (!referrerDoc.exists) return false;
        
        const currentReferrals = referrerDoc.data().referrals || [];
        
        if (currentReferrals.includes(newUserId)) {
            console.log(`❌ Duplicate referral blocked`);
            return false;
        }
        
        await db.runTransaction(async (transaction) => {
            const refDoc = await transaction.get(referrerRef);
            const refData = refDoc.data();
            
            transaction.update(referrerRef, {
                referrals: [...currentReferrals, newUserId],
                inviteCount: (refData.inviteCount || 0) + 1,
                balance: (refData.balance || 0) + APP_CONFIG.referralBonus,
                totalEarned: (refData.totalEarned || 0) + APP_CONFIG.referralBonus,
                lastReferralAt: new Date().toISOString()
            });
        });
        
        const newInviteCount = (referrerDoc.data().inviteCount || 0) + 1;
        
        const referralMessage = formatProfessionalMessage(
            '🎉 NEW REFERRAL!',
            `👤 <b>${escapeHtml(newUserName)}</b> joined using your link!\n\n💰 <b>+${formatAXC(APP_CONFIG.referralBonus)}</b>\n\n👥 <b>Total Referrals:</b> ${newInviteCount}`,
            `💡 Keep inviting to unlock milestone rewards!`
        );
        
        await bot.telegram.sendMessage(referrerId, referralMessage, { parse_mode: 'HTML' }).catch(() => {});
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
// 8. 🔒 CHANNEL VERIFICATION
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
            `You must be a member of all required channels to perform this action.\n\n<b>Missing channels:</b>\n${list}`,
            `Please join the channels above and click VERIFY.`
        );
        
        await sendAndTrack(ctx, verifyMessage, getChannelsKeyboard());
        return false;
    }
    return true;
}

// ============================================================================
// 9. 🎨 KEYBOARDS & BUTTONS
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
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }],
            [{ text: '🚪 LOGOUT', callback_data: 'admin_logout' }]
        ]
    };
}

// ============================================================================
// 10. 📨 BOT COMMANDS
// ============================================================================

async function sendWelcomeMessage(ctx) {
    const welcomeMsg = formatProfessionalMessage(
        '✨ WELCOME TO AXION AI ✨',
        `🎁 <b>Get ${formatAXC(APP_CONFIG.welcomeBonus)}</b> after verification\n👥 <b>Get ${formatAXC(APP_CONFIG.referralBonus)}</b> per referral\n💎 <b>Minimum Withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdraw)}`,
        `📢 Please join our channels to continue:`
    );
    await sendAndTrack(ctx, welcomeMsg, getChannelsKeyboard());
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

    if (refCode && refCode !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: refCode });
        await processReferralFromBot(refCode, userId, userName);
        console.log(`✅ Referral recorded: ${refCode} → ${userId}`);
    }

    if (user.isVerified) {
        const welcomeBackMsg = formatProfessionalMessage(
            '✅ Welcome Back!',
            `👤 <b>${escapeHtml(userName)}</b>\n\n💰 <b>Balance:</b> ${formatAXC(user.balance || 0)}`,
            `👇 Select an option below:`
        );
        await sendAndTrack(ctx, welcomeBackMsg, getMainKeyboard(userId));
        return;
    }

    await sendWelcomeMessage(ctx);
});

bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    const username = ctx.from.username || 'No username';
    const progressBar = getProgressBar(user.balance || 0, APP_CONFIG.minWithdraw);

    const balanceMsg = formatProfessionalMessage(
        '📊 YOUR BALANCE',
        `👤 <b>User:</b> @${escapeHtml(username)}\n\n💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n🎁 <b>Earned:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}\n\n<b>📈 Progress:</b>\n${progressBar}`,
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
        await sendAndTrack(ctx, formatProfessionalMessage('🚫 ACCOUNT BLOCKED', 'Your account has been blocked from withdrawals.\nContact support for assistance.'), getMainKeyboard(userId));
        return;
    }

    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, formatProfessionalMessage('⏳ COOLDOWN ACTIVE', `You can request withdrawal once every 24 hours.\nPlease wait ${hoursLeft} hour(s).`), getMainKeyboard(userId));
        return;
    }

    if (!user.isVerified) {
        await sendAndTrack(ctx, formatProfessionalMessage('🔒 VERIFICATION REQUIRED', 'Please complete channel verification first.\n\nClick the VERIFY button below.'), getChannelsKeyboard());
        return;
    }

    if (!user.walletAddress) {
        const walletMsg = formatProfessionalMessage(
            '💳 SETUP WITHDRAWAL WALLET',
            `Please send your BEP20 wallet address to continue.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
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
    console.log(`🔄 SWAP STATION command from ${userId}`);

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
// 11. 🔘 CALLBACK ACTIONS
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

    await updateUser(userId, {
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        balance: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus),
        totalEarned: admin.firestore.FieldValue.increment(APP_CONFIG.welcomeBonus)
    });

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
        await sendAndTrack(ctx, formatProfessionalMessage('❌ INSUFFICIENT BALANCE', `You need <b>${formatAXC(APP_CONFIG.minWithdraw)}</b> to withdraw.\n\n💰 Your balance: ${formatAXC(user.balance || 0)}\n\n💡 Invite friends to earn more AXC!`), getMainKeyboard(userId));
        return;
    }

    const amount = user.balance;
    await sendAndTrack(ctx, formatProfessionalMessage('💸 WITHDRAWAL REQUEST', `💰 <b>Amount:</b> ${formatAXC(amount)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>`, `Click CONFIRM to submit your withdrawal request.`), getConfirmWithdrawKeyboard());

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
        await sendAndTrack(ctx, formatProfessionalMessage('❌ INSUFFICIENT USDT', `You need <b>${formatUSD(APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice)}</b> to withdraw USDT.\n\n💵 Your balance: ${formatUSD(usdtAmount)}\n\n💡 Swap AXC to USDT first!`), getMainKeyboard(userId));
        return;
    }

    await sendAndTrack(ctx, formatProfessionalMessage('💸 USDT WITHDRAWAL REQUEST', `💵 <b>Amount:</b> ${formatUSD(usdtAmount)}\n💳 <b>Wallet:</b> <code>${user.walletAddress.substring(0, 10)}...</code>`, `Click CONFIRM to submit your withdrawal request.`), getConfirmWithdrawKeyboard());

    userSessions.set(userId, { withdrawAmount: usdtAmount, withdrawCurrency: 'USDT', createdAt: Date.now() });
});

bot.action('confirm_withdraw_final', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = userSessions.get(userId);
    await ctx.answerCbQuery();

    if (!session?.withdrawAmount) {
        await sendAndTrack(ctx, formatProfessionalMessage('❌ SESSION EXPIRED', 'Please start over by clicking WITHDRAW again.'), getMainKeyboard(userId));
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
            formatProfessionalMessage('💸 WITHDRAWAL REQUEST',
                `👤 ${escapeHtml(user.userName)}\n💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}\n💳 <code>${user.walletAddress}</code>\n🆔 ${withdrawalRef.id}`
            ), { parse_mode: 'HTML' }).catch(() => {});
    }

    await sendAndTrack(ctx, formatProfessionalMessage('✅ WITHDRAWAL SUBMITTED!', `💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}\n⏳ <b>Processing:</b> 24-48 hours\n\n<i>You will be notified once processed.</i>`), getMainKeyboard(userId));

    userSessions.delete(userId);
});

bot.action('cancel_action', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    await sendAndTrack(ctx, formatProfessionalMessage('❌ ACTION CANCELLED', 'You have been returned to the main menu.'), getMainKeyboard(userId));
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    const user = await getOrCreateUser(userId, '', '');
    await sendAndTrack(ctx, formatProfessionalMessage('🎯 MAIN MENU', `💰 <b>Balance:</b> ${formatAXC(user?.balance || 0)}`, `👇 Select an option below:`), getMainKeyboard(userId));
});

// ============================================================================
// 12. 👑 ADMIN PANEL - مع جميع الوظائف
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
    
    await ctx.reply(formatProfessionalMessage('🔐 ADMIN LOGIN', 'Please enter your admin password to continue.\n\n<i>Type the password in this chat</i>'), { parse_mode: 'HTML' });
    adminSessions.set(userId, { waitingForPassword: true, createdAt: Date.now() });
});

// معالجة كلمة السر
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = adminSessions.get(userId);
    
    if (session && session.waitingForPassword && isAdmin(userId)) {
        const enteredPassword = ctx.message.text.trim();
        
        if (enteredPassword === ADMIN_PASSWORD) {
            adminSessions.set(userId, { authenticated: true, createdAt: Date.now() });
            delete adminSessions.get(userId).waitingForPassword;
            
            await ctx.reply(formatProfessionalMessage('✅ LOGIN SUCCESSFUL', 'Welcome to Admin Panel.'), { parse_mode: 'HTML' });
            await ctx.reply(formatProfessionalMessage('👑 ADMIN PANEL', '📋 Click any button below:'), { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ LOGIN FAILED', 'Invalid password.\nAccess denied.'), { parse_mode: 'HTML' });
            adminSessions.delete(userId);
        }
        return;
    }
});

// إحصائيات
bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    if (!checkDb()) return;
    
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    const verifiedSnapshot = await db.collection('users').where('isVerified', '==', true).get();
    
    let totalBalance = 0;
    let totalUsdt = 0;
    usersSnapshot.forEach(doc => {
        totalBalance += doc.data().balance || 0;
        totalUsdt += doc.data().usdtBalance || 0;
    });
    
    const statsMsg = formatProfessionalMessage(
        '📊 STATISTICS',
        `👥 <b>Total Users:</b> ${totalUsersCount || usersSnapshot.size}\n✅ <b>Verified:</b> ${verifiedSnapshot.size}\n💸 <b>Pending Withdrawals:</b> ${pendingSnapshot.size}\n\n💰 <b>Total AXC:</b> ${formatAXC(totalBalance)}\n💵 <b>Total USDT:</b> ${formatUSD(totalUsdt)}`
    );
    
    await ctx.reply(statsMsg, { parse_mode: 'HTML' });
});

// المستخدمين
bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    await ctx.reply(formatProfessionalMessage('👥 TOTAL USERS', `📊 <b>Total:</b> ${totalUsersCount}\n\n<i>Use /search [username] to find users</i>`), { parse_mode: 'HTML' });
});

// السحوبات المعلقة
bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    
    if (pendingSnapshot.empty) {
        await ctx.reply(formatProfessionalMessage('✅ NO PENDING', 'All withdrawals have been processed.'), { parse_mode: 'HTML' });
        return;
    }
    
    let msg = '';
    pendingSnapshot.forEach(doc => {
        const data = doc.data();
        msg += `👤 ${data.userName}\n💰 ${data.currency === 'AXC' ? formatAXC(data.amount) : formatUSD(data.amount)}\n🆔 ${doc.id}\n${MINI_DIVIDER}\n`;
    });
    
    await ctx.reply(formatProfessionalMessage('💸 PENDING WITHDRAWALS', msg), { parse_mode: 'HTML' });
});

// البحث عن مستخدم
bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    await ctx.reply('🔍 <b>Send the user ID or username to search:</b>', { parse_mode: 'HTML' });
    adminSessions.set(userId, { searching: true });
});

// معالجة البحث
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const adminSession = adminSessions.get(userId);
    
    if (adminSession?.searching && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const searchTerm = ctx.message.text.trim();
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
});

// إضافة رصيد
bot.action('admin_add_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    await ctx.reply('💰 <b>ADD BALANCE</b>\n\nSend: <code>USER_ID AMOUNT CURRENCY</code>\n\nExample: <code>123456789 100 AXC</code>\n<i>Currency: AXC or USDT</i>', { parse_mode: 'HTML' });
    adminSessions.set(userId, { addingBalance: true });
});

// معالجة إضافة الرصيد
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const adminSession = adminSessions.get(userId);
    
    if (adminSession?.addingBalance && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const parts = ctx.message.text.trim().split(' ');
        if (parts.length === 3) {
            const targetUserId = parts[0];
            const amount = parseFloat(parts[1]);
            const currency = parts[2].toUpperCase();
            
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount.', { parse_mode: 'HTML' });
                adminSessions.delete(userId);
                return;
            }
            
            if (currency === 'AXC') {
                await updateUser(targetUserId, {
                    balance: admin.firestore.FieldValue.increment(amount),
                    totalEarned: admin.firestore.FieldValue.increment(amount)
                });
                await ctx.reply(formatProfessionalMessage('✅ BALANCE ADDED', `Added ${formatAXC(amount)} to user ${targetUserId}`), { parse_mode: 'HTML' });
            } else if (currency === 'USDT') {
                await updateUser(targetUserId, {
                    usdtBalance: admin.firestore.FieldValue.increment(amount)
                });
                await ctx.reply(formatProfessionalMessage('✅ BALANCE ADDED', `Added ${formatUSD(amount)} to user ${targetUserId}`), { parse_mode: 'HTML' });
            } else {
                await ctx.reply('❌ Invalid currency. Use AXC or USDT', { parse_mode: 'HTML' });
            }
        } else {
            await ctx.reply('❌ Invalid format. Use: USER_ID AMOUNT CURRENCY', { parse_mode: 'HTML' });
        }
        
        adminSessions.delete(userId);
        return;
    }
});

// البث الجماعي
bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    
    await ctx.reply('📢 <b>BROADCAST MESSAGE</b>\n\nSend the message you want to broadcast to all users:', { parse_mode: 'HTML' });
    adminSessions.set(userId, { broadcasting: true });
});

// معالجة البث
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const adminSession = adminSessions.get(userId);
    
    if (adminSession?.broadcasting && isAdmin(userId) && isAdminAuthenticated(userId)) {
        const message = ctx.message.text;
        const usersSnapshot = await db.collection('users').get();
        let sent = 0;
        let failed = 0;
        
        await ctx.reply(`⏳ Sending broadcast to ${usersSnapshot.size} users...`, { parse_mode: 'HTML' });
        
        for (const doc of usersSnapshot.docs) {
            try {
                await bot.telegram.sendMessage(doc.id, formatProfessionalMessage('📢 ANNOUNCEMENT', message), { parse_mode: 'HTML' });
                sent++;
                await new Promise(r => setTimeout(r, 50));
            } catch(e) {
                failed++;
            }
        }
        
        await ctx.reply(formatProfessionalMessage('✅ BROADCAST COMPLETE', `📤 Sent: ${sent}\n❌ Failed: ${failed}`), { parse_mode: 'HTML' });
        adminSessions.delete(userId);
        return;
    }
});

// تسجيل الخروج
bot.action('admin_logout', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    adminSessions.delete(userId);
    await ctx.reply(formatProfessionalMessage('🔓 LOGGED OUT', 'You have been logged out of the admin panel.'), { parse_mode: 'HTML' });
});

// ============================================================================
// 13. 📝 TEXT HANDLER FOR WALLET (يأتي بعد كل المعالجات الأخرى)
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    if (text.startsWith('/')) return;
    
    const buttons = ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '🔄 SWAP STATION', '⚙️ SETTINGS', '👑 ADMIN PANEL'];
    if (buttons.includes(text)) return;
    
    const adminSession = adminSessions.get(userId);
    if (adminSession?.waitingForPassword || adminSession?.broadcasting || adminSession?.searching || adminSession?.addingBalance) return;
    
    const session = userSessions.get(userId);
    
    if (session?.waitingForWallet) {
        if (isValidBEP20(text)) {
            await updateUser(userId, { walletAddress: text });
            userSessions.delete(userId);
            
            const successMsg = formatProfessionalMessage(
                '✅ WALLET SAVED!',
                `💳 <code>${text}</code>\n\n<i>You can now withdraw funds.</i>`
            );
            await sendAndTrack(ctx, successMsg, getMainKeyboard(userId));
        } else {
            const errorMsg = formatProfessionalMessage(
                '❌ INVALID ADDRESS',
                `Please send a valid BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
                `📝 Try again or click CANCEL:`
            );
            await sendAndTrack(ctx, errorMsg, getCancelKeyboard());
        }
        return;
    }
    
    if (session?.waitingForWalletUpdate) {
        if (isValidBEP20(text)) {
            await updateUser(userId, { walletAddress: text });
            userSessions.delete(userId);
            
            const successMsg = formatProfessionalMessage(
                '✅ WALLET UPDATED!',
                `💳 <code>${text}</code>`
            );
            await sendAndTrack(ctx, successMsg, getMainKeyboard(userId));
        } else {
            const errorMsg = formatProfessionalMessage(
                '❌ INVALID ADDRESS',
                `Please send a valid BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`,
                `📝 Try again or click CANCEL:`
            );
            await sendAndTrack(ctx, errorMsg, getCancelKeyboard());
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
app.get('/health', (req, res) => { res.json({ status: 'alive', timestamp: Date.now(), totalUsers: totalUsersCount, firebase: firebaseHealthy ? 'connected' : 'disconnected' }); });
app.get('/api/config', (req, res) => { res.json({ firebaseConfig: firebaseWebConfig, ownerWallet: OWNER_WALLET, status: 'ok' }); });
app.get('/tonconnect-manifest.json', (req, res) => { res.sendFile(path.join(__dirname, 'tonconnect-manifest.json')); });

// ============================================================================
// 15. 🚀 LAUNCH
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🚀 Axion AI Bot v22.0 Started Successfully'))
    .catch(err => console.error('❌ Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║     AXION AI v22.0 - COMPLETE EDITION           ║
╠══════════════════════════════════════════════════╣
║  📍 Port: ${PORT}                                       ║
║  🔥 Firebase: ${db && firebaseHealthy ? '✅ Connected' : '❌ Disconnected'}                    ║
║  👑 Admin: ${ADMIN_ID ? '✅ Loaded' : '❌ Missing'}                                    ║
║  🔐 Admin Password: ${ADMIN_PASSWORD ? '✅ Loaded' : '❌ Missing'}                         ║
║  📊 Users: ${totalUsersCount}                                    ║
║  🤖 Bot: ${BOT_TOKEN ? '✅ Running' : '❌ Missing'}                                 ║
║  💸 Withdrawals: AXC + USDT                           ║
║  🔄 Swap: Mini App                                    ║
╚══════════════════════════════════════════════════════╝
    `);
});

// ============================================================================
// END OF FILE
// ============================================================================
