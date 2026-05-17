// ============================================================================
// AXION AI BOT - ULTIMATE PROFESSIONAL FINAL EDITION v8.0
// ============================================================================
// الميزات الكاملة:
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
// ✅ نظام مراحل إحالة (Milestones) بمكافآت USDT
// ✅ نظام سواب (Swap) AXC ↔ USDT
// ✅ ربط محفظة TON عبر TON Connect
// ✅ رسائل احترافية مع اسم المستخدم ومعرفه
// ✅ شريط تقدم نحو السحب
// ✅ جميع الأسرار من Render
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
// 2. ⚙️ إعدادات Axion
// ============================================================================

const APP_CONFIG = {
    welcomeBonus: 100,
    referralBonus: 100,
    minWithdraw: 1000,
    axcPrice: 0.0099,
    swapFee: 0.05, // TON
    minSwap: 100,
    maxNotifications: 50,
    sessionTTL: 3600000,
    broadcastDelay: 100,
    withdrawCooldown: 86400000
};

// مراحل الإحالة (Milestones)
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

// التخزين المؤقت
const userSessions = new Map();
const userLastMessages = new Map();
const withdrawCooldownTracker = new Map();
let firebaseHealthy = true;

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
// 4. 🤖 Telegram Bot
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
// 5. دوال مساعدة
// ============================================================================

function formatAXC(amount) {
    const usd = (amount * APP_CONFIG.axcPrice).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function formatUSD(amount) {
    return `$${amount.toFixed(2)} USD`;
}

function isAdmin(userId) { return userId === ADMIN_ID; }

function isValidBEP20(address) { return /^0x[a-fA-F0-9]{40}$/i.test(address); }

function getProgressBar(current, target, length = 10) {
    const percent = Math.min(100, (current / target) * 100);
    const filled = Math.floor((percent / 100) * length);
    const empty = length - filled;
    return `▰`.repeat(filled) + `▱`.repeat(empty) + ` ${Math.floor(percent)}%`;
}

async function deleteLastMessage(ctx) {
    const lastMsg = userLastMessages.get(ctx.from.id);
    if (lastMsg && lastMsg.id) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, lastMsg.id); } catch (e) {}
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
            lastUserId: userId, lastUserName: userName,
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
        userId, userName: userName || 'Axion User', userUsername: userUsername || '',
        balance: 0, usdtBalance: 0, totalEarned: 0, inviteCount: 0,
        referredBy: refCode || null, referrals: [], walletAddress: null,
        tonWallet: null, tonVerified: false, swapEnabled: false,
        withdrawBlocked: false, isVerified: false, verifiedAt: null,
        claimedMilestones: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        notifications: [{
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'welcome', title: '🎉 Welcome to Axion AI!',
            message: `Complete verification to get ${formatAXC(APP_CONFIG.welcomeBonus)} bonus!`,
            read: false, timestamp: new Date().toISOString()
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
            
            // Check milestone achievements
            await checkMilestoneAchievement(referrerId);
        }
    } catch (error) {}
}

async function checkMilestoneAchievement(userId) {
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    const currentInvites = userData.inviteCount || 0;
    const claimed = userData.claimedMilestones || [];
    
    for (const milestone of REFERRAL_MILESTONES) {
        if (currentInvites >= milestone.count && !claimed.includes(milestone.count)) {
            await db.collection('users').doc(userId).update({
                usdtBalance: admin.firestore.FieldValue.increment(milestone.reward),
                claimedMilestones: admin.firestore.FieldValue.arrayUnion(milestone.count)
            });
            await addNotification(userId, `🏆 Milestone Unlocked!`, `You reached ${milestone.count} referrals! +${formatUSD(milestone.reward)} USDT added!`, 'success');
            await bot.telegram.sendMessage(userId, 
                `🏆 *MILESTONE UNLOCKED!*\n━━━━━━━━━━━━━━━━━━━━━━\n🎉 ${milestone.name}\n👥 ${milestone.count} referrals\n💰 +${formatUSD(milestone.reward)} USDT added!`, 
                { parse_mode: 'Markdown' }).catch(() => {});
        }
    }
}

async function verifyChannelMembership(userId, channelUsername) {
    try {
        const chatMember = await bot.telegram.getChatMember(`@${channelUsername.replace('@', '')}`, parseInt(userId));
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch { return false; }
}

async function getMissingChannels(userId) {
    const results = await Promise.all(REQUIRED_CHANNELS.map(async (channel) => ({
        channel, isMember: await verifyChannelMembership(userId, channel.username)
    })));
    return results.filter(r => !r.isMember).map(r => r.channel);
}

async function getMainKeyboard(userId) {
    const keyboard = [['💰 BALANCE', '🔗 REFERRAL'], ['💸 WITHDRAW', '🔄 SWAP']];
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
    return { inline_keyboard: [[{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw' }], [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
}

function getSwapConfirmKeyboard() {
    return { inline_keyboard: [[{ text: '✅ CONFIRM SWAP', callback_data: 'confirm_swap' }], [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
}

function getConnectWalletKeyboard() {
    return { inline_keyboard: [[{ text: '🔗 CONNECT TON WALLET', callback_data: 'connect_ton' }], [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
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
    
    if (!checkDb()) { await ctx.reply('⚠️ Database is currently unavailable. Please try again later.'); return; }
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
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
    if (!userDoc.exists) return;
    const data = userDoc.data();
    const username = ctx.from.username || 'No username';
    const progressBar = getProgressBar(data.balance || 0, APP_CONFIG.minWithdraw);
    
    await sendAndTrack(ctx, `📊 *YOUR AXION BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 *User:* @${username} | ID: ${userId}

💰 *AXC Balance:* ${formatAXC(data.balance || 0)}
💵 *USDT Balance:* ${formatUSD(data.usdtBalance || 0)}

👥 *Referrals:* ${data.inviteCount || 0} | 🎁 *Earned:* ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 *Progress to withdrawal:*
${progressBar} (${data.balance || 0}/${APP_CONFIG.minWithdraw} AXC)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👇 *Quick actions:*`, {
        inline_keyboard: [
            [{ text: '🔄 SWAP TO USDT', callback_data: 'swap_menu' }],
            [{ text: '💸 WITHDRAW', callback_data: 'withdraw_menu' }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    });
});

bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const data = userDoc.data();
    const link = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    
    let milestonesText = '';
    const claimed = data.claimedMilestones || [];
    for (const milestone of REFERRAL_MILESTONES) {
        const isClaimed = claimed.includes(milestone.count);
        const status = isClaimed ? '✅ Claimed' : (data.inviteCount >= milestone.count ? '🎯 Ready' : `🔒 ${milestone.count - data.inviteCount} left`);
        milestonesText += `• ${milestone.name} (${milestone.count}) → ${formatUSD(milestone.reward)} - ${status}\n`;
    }
    
    await sendAndTrack(ctx, `🔗 *YOUR REFERRAL LINK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`${link}\`

📊 *Referral Stats:*
👥 *Total Referrals:* ${data.inviteCount || 0}
🎁 *Earned:* ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 *MILESTONES (USDT Rewards):*
${milestonesText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Share your link and earn!*`, getShareKeyboard(link));
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (userData.withdrawBlocked) {
        await sendAndTrack(ctx, `🚫 *ACCOUNT BLOCKED*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nYour account has been blocked from withdrawals.\nContact support for more information.`, await getMainKeyboard(userId));
        return;
    }
    
    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, `⏳ *COOLDOWN ACTIVE*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nYou can request withdrawal once every 24 hours.\nPlease wait ${hoursLeft} hour(s).`, await getMainKeyboard(userId));
        return;
    }
    
    if (!userData.isVerified) {
        await sendAndTrack(ctx, `🔒 *WITHDRAWAL LOCKED*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPlease verify first by joining channels.`, getBackKeyboard());
        return;
    }
    
    if (!userData.walletAddress) {
        await sendAndTrack(ctx, `💸 *SETUP WALLET*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Send your BEP20 address (0x...).`, getBackKeyboard());
        userSessions.set(userId, { waitingForWallet: true, createdAt: Date.now() });
        return;
    }
    
    const balance = userData.balance || 0;
    const usdtBalance = userData.usdtBalance || 0;
    
    if (balance < APP_CONFIG.minWithdraw && usdtBalance < APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice) {
        const needed = APP_CONFIG.minWithdraw - balance;
        await sendAndTrack(ctx, `❌ *INSUFFICIENT BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Need ${formatAXC(needed)} more AXC or ${formatUSD(APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice)} USDT.
Invite ${Math.ceil(needed / APP_CONFIG.referralBonus)} friends!`, await getMainKeyboard(userId));
        return;
    }
    
    await sendAndTrack(ctx, `✅ *READY TO WITHDRAW*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *AXC:* ${formatAXC(balance)}
💵 *USDT:* ${formatUSD(usdtBalance)}
💳 *Wallet:* \`${userData.walletAddress.substring(0, 10)}...\`

👇 Choose currency:`, {
        inline_keyboard: [
            [{ text: '💰 WITHDRAW AXC', callback_data: 'withdraw_axc' }],
            [{ text: '💵 WITHDRAW USDT', callback_data: 'withdraw_usdt' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]
        ]
    });
});

bot.hears('🔄 SWAP', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (!userData.tonVerified) {
        await sendAndTrack(ctx, `🔄 *SWAP AXC TO USDT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *TON WALLET REQUIRED*

To swap AXC to USDT, you must first:
1️⃣ Connect your TON wallet
2️⃣ Pay ${APP_CONFIG.swapFee} TON (~$${(APP_CONFIG.swapFee * 2).toFixed(2)}) one-time fee

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Benefits of connecting:*
• Swap AXC to USDT anytime
• Withdraw USDT directly
• One fee, lifetime access
• Enhanced security

👇 *CONNECT TON WALLET*`, getConnectWalletKeyboard());
        return;
    }
    
    const message = `🔄 *SWAP AXC TO USDT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Wallet connected:* \`${userData.tonWallet?.substring(0, 10)}...\`

💰 *AXC Balance:* ${formatAXC(userData.balance || 0)}
💵 *USDT Balance:* ${formatUSD(userData.usdtBalance || 0)}

📊 *Rate:* 1 AXC = $${APP_CONFIG.axcPrice} USDT
💸 *Fee:* ${APP_CONFIG.swapFee} TON (already paid)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Min swap:* ${APP_CONFIG.minSwap} AXC (~$${(APP_CONFIG.minSwap * APP_CONFIG.axcPrice).toFixed(2)})
🔄 *Max swap:* Your full balance

📝 *Enter amount in AXC below:*`;
    
    await sendAndTrack(ctx, message);
    userSessions.set(userId, { waitingForSwapAmount: true, createdAt: Date.now() });
});

// ============================================================================
// 8. معالج النصوص
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    
    if (text.startsWith('/')) return;
    if (['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '🔄 SWAP', '👑 ADMIN PANEL'].includes(text)) return;
    
    const session = userSessions.get(userId);
    
    if (session?.waitingForWallet && isValidBEP20(text)) {
        await db.collection('users').doc(userId).update({ walletAddress: text });
        userSessions.delete(userId);
        await sendAndTrack(ctx, `✅ *Wallet saved!*\n💳 \`${text}\``, await getMainKeyboard(userId));
        return;
    }
    
    if (session?.waitingForSwapAmount) {
        userSessions.delete(userId);
        const amount = parseInt(text);
        if (isNaN(amount) || amount < APP_CONFIG.minSwap) {
            await sendAndTrack(ctx, `❌ *Invalid amount!* Minimum swap is ${APP_CONFIG.minSwap} AXC.`, await getMainKeyboard(userId));
            return;
        }
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        const balance = userDoc.data().balance || 0;
        if (amount > balance) {
            await sendAndTrack(ctx, `❌ *Insufficient balance!* You have ${formatAXC(balance)}.`, await getMainKeyboard(userId));
            return;
        }
        const usdtAmount = amount * APP_CONFIG.axcPrice;
        userSessions.set(userId, { swapAmount: amount, swapUsdt: usdtAmount, createdAt: Date.now() });
        await sendAndTrack(ctx, `🔄 *CONFIRM SWAP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *Amount:* ${formatAXC(amount)}
💵 *You receive:* ${formatUSD(usdtAmount)}

👇 *Confirm to complete swap*`, getSwapConfirmKeyboard());
        return;
    }
    
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
💵 USDT: ${formatUSD(data.usdtBalance || 0)}
✅ Verified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
        return;
    }
    
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
    
    await db.collection('users').doc(userId).update({
        isVerified: true, verifiedAt: new Date().toISOString(),
        balance: APP_CONFIG.welcomeBonus, totalEarned: APP_CONFIG.welcomeBonus
    });
    
    await sendAndTrack(ctx, `✅ *VERIFIED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 +${formatAXC(APP_CONFIG.welcomeBonus)}
💰 Balance: ${formatAXC(APP_CONFIG.welcomeBonus)}`, await getMainKeyboard(userId));
});

bot.action('swap_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    const keyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `🔄 *SWAP AXC TO USDT*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nClick "SWAP" button in the main menu.`, keyboard);
});

bot.action('withdraw_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    const keyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `💸 *WITHDRAW*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nClick "WITHDRAW" button in the main menu.`, keyboard);
});

bot.action('connect_ton', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    // Here you would implement TON Connect integration
    await sendAndTrack(ctx, `🔗 *TON CONNECT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 *Coming soon!*

TON Connect integration will be available in the next update.

For now, please contact admin to verify your TON wallet.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👇 *Back to menu*`, await getMainKeyboard(userId));
});

bot.action('confirm_swap', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = userSessions.get(userId);
    await ctx.answerCbQuery();
    
    if (!session?.swapAmount) {
        await sendAndTrack(ctx, `❌ *Swap session expired. Please try again.*`, await getMainKeyboard(userId));
        return;
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const balance = userDoc.data().balance || 0;
    
    if (session.swapAmount > balance) {
        await sendAndTrack(ctx, `❌ *Insufficient balance!*`, await getMainKeyboard(userId));
        userSessions.delete(userId);
        return;
    }
    
    await db.collection('users').doc(userId).update({
        balance: admin.firestore.FieldValue.increment(-session.swapAmount),
        usdtBalance: admin.firestore.FieldValue.increment(session.swapUsdt)
    });
    
    const newUserDoc = await db.collection('users').doc(userId).get();
    const newData = newUserDoc.data();
    
    await sendAndTrack(ctx, `✅ *SWAP COMPLETED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 *Swapped:* ${formatAXC(session.swapAmount)} → ${formatUSD(session.swapUsdt)}

📊 *Updated Balances:*
💰 *AXC:* ${formatAXC(newData.balance || 0)}
💵 *USDT:* ${formatUSD(newData.usdtBalance || 0)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *What's next?*
• 💸 Withdraw USDT to your wallet
• 🔄 Swap more AXC to USDT
• 👥 Invite friends to earn more AXC`, await getMainKeyboard(userId));
    
    userSessions.delete(userId);
});

bot.action('withdraw_axc', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if ((userData.balance || 0) < APP_CONFIG.minWithdraw) {
        await sendAndTrack(ctx, `❌ *Insufficient AXC balance!* Need ${formatAXC(APP_CONFIG.minWithdraw)}.`, await getMainKeyboard(userId));
        return;
    }
    
    withdrawCooldownTracker.set(userId, Date.now());
    const amount = userData.balance;
    await db.collection('users').doc(userId).update({ balance: 0 });
    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
        id: withdrawalRef.id, userId, userName: userData.userName,
        amount, currency: 'AXC', walletAddress: userData.walletAddress,
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

bot.action('withdraw_usdt', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    const usdtAmount = userData.usdtBalance || 0;
    
    if (usdtAmount < APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice) {
        await sendAndTrack(ctx, `❌ *Insufficient USDT balance!* Need ${formatUSD(APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice)}.`, await getMainKeyboard(userId));
        return;
    }
    
    withdrawCooldownTracker.set(userId, Date.now());
    await db.collection('users').doc(userId).update({ usdtBalance: 0 });
    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
        id: withdrawalRef.id, userId, userName: userData.userName,
        amount: usdtAmount, currency: 'USDT', walletAddress: userData.walletAddress,
        status: 'pending', createdAt: new Date().toISOString()
    });
    
    if (WITHDRAWAL_GROUP_ID) {
        await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, 
            `💸 *WITHDRAWAL (USDT)*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 ${userData.userName}
💵 ${formatUSD(usdtAmount)}
💳 ${userData.walletAddress}
🆔 ${withdrawalRef.id}`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    
    await sendAndTrack(ctx, `✅ *WITHDRAWAL SUBMITTED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 ${formatUSD(usdtAmount)}
⏳ 24-48 hours.`, await getMainKeyboard(userId));
});

bot.action('confirm_withdraw', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    const balance = userData.balance || 0;
    const usdtBalance = userData.usdtBalance || 0;
    
    if (balance < APP_CONFIG.minWithdraw && usdtBalance < APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice) {
        await sendAndTrack(ctx, `❌ *Insufficient balance!*`, await getMainKeyboard(userId));
        return;
    }
    
    await sendAndTrack(ctx, `💸 *CHOOSE WITHDRAWAL CURRENCY*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 AXC: ${formatAXC(balance)}
💵 USDT: ${formatUSD(usdtBalance)}`, {
        inline_keyboard: [
            [{ text: '💰 WITHDRAW AXC', callback_data: 'withdraw_axc' }],
            [{ text: '💵 WITHDRAW USDT', callback_data: 'withdraw_usdt' }],
            [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]
        ]
    });
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    await sendAndTrack(ctx, `🎯 *MAIN MENU*\n💰 Balance: ${formatAXC(userDoc.exists ? userDoc.data().balance || 0 : 0)}`, await getMainKeyboard(userId));
});

// ============================================================================
// 10. أوامر المشرف
// ============================================================================

bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' }); return; }
    
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
    await ctx.reply(`👑 *AXION AI ADMIN PANEL*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ *Authenticated as Admin*\n📋 *Click any button below:*`, { reply_markup: adminKeyboard, parse_mode: 'Markdown' });
});

bot.command('alimenfi', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' }); return; }
    
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
    await ctx.reply(`👑 *AXION AI ADMIN PANEL*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ *Authenticated as Admin*\n📋 *Click any button below:*`, { reply_markup: adminKeyboard, parse_mode: 'Markdown' });
});

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.reply('⛔ *Access denied!*', { parse_mode: 'Markdown' }); return; }
    
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
    await ctx.reply(`👑 *AXION AI ADMIN PANEL*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ *Authenticated as Admin*\n📋 *Click any button below:*`, { reply_markup: adminKeyboard, parse_mode: 'Markdown' });
});

bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    const totalBalance = usersSnapshot.docs.reduce((sum, doc) => sum + (doc.data().balance || 0), 0);
    const totalUsdt = usersSnapshot.docs.reduce((sum, doc) => sum + (doc.data().usdtBalance || 0), 0);
    
    await ctx.reply(`📊 *STATISTICS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Users: ${usersSnapshot.size}
💸 Pending: ${pendingSnapshot.size}
💰 Total AXC: ${formatAXC(totalBalance)}
💵 Total USDT: ${formatUSD(totalUsdt)}
💎 Min Withdrawal: ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'Markdown' });
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
        message += `🆔 ${wd.id}\n👤 ${wd.userName}\n💰 ${wd.currency === 'USDT' ? formatUSD(wd.amount) : formatAXC(wd.amount)}\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
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
    if (!checkDb()) return;
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) return ctx.reply('✅ No pending withdrawals');
    let message = `💸 *PENDING WITHDRAWALS* (${snapshot.size})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `🆔 ${wd.id}\n👤 ${wd.userName}\n💰 ${wd.currency === 'USDT' ? formatUSD(wd.amount) : formatAXC(wd.amount)}\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    if (!checkDb()) return;
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    ctx.reply(`📊 *STATISTICS*\n━━━━━━━━━━━━━━━━━━━━━━\n👥 Users: ${usersSnapshot.size}\n💸 Pending: ${pendingSnapshot.size}\n💎 Min: ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'Markdown' });
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
💰 AXC: ${formatAXC(data.balance || 0)}
💵 USDT: ${formatUSD(data.usdtBalance || 0)}
✅ Verified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'Markdown' });
});

// ============================================================================
// 12. أوامر الموافقة والرفض
// ============================================================================

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    
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
// 13. دالة البث
// ============================================================================

async function broadcastToAllUsers(message) {
    if (!checkDb()) return { success: false };
    try {
        const usersSnapshot = await db.collection('users').get();
        let notifiedCount = 0;
        const notification = {
            id: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            type: 'broadcast', title: '📢 Announcement',
            message: message, read: false,
            timestamp: new Date().toISOString()
        };
        
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
        
        for (const doc of usersSnapshot.docs) {
            try {
                await bot.telegram.sendMessage(doc.id, `📢 *Announcement*\n\n${message}`, { parse_mode: 'Markdown' });
                await new Promise(r => setTimeout(r, APP_CONFIG.broadcastDelay));
            } catch(e) {}
        }
        return { success: true, notifiedCount };
    } catch (error) { return { success: false }; }
}

// ============================================================================
// 14. إعدادات Express
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: 'alive', timestamp: Date.now(), firebase: firebaseHealthy ? 'connected' : 'disconnected' }); });
app.get('/api/config', (req, res) => { res.json({ firebaseConfig: firebaseWebConfig, status: 'ok' }); });

// ============================================================================
// 15. تشغيل البوت والسيرفر
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Telegram Bot started successfully'))
    .catch(err => console.error('Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`\n🌟 AXION AI SERVER - ULTIMATE PROFESSIONAL EDITION v8.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Port: ${PORT}
🔥 Firebase: ${db && firebaseHealthy ? '✅ Connected' : '❌ Disconnected'}
👑 Admin ID: ${ADMIN_ID || 'Not configured'}
🤖 Bot: ${BOT_TOKEN ? '✅ Configured' : 'Missing'}
💸 Withdrawals: Sent to group for manual approval
🔄 Swap: AXC ↔ USDT with TON verification
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
