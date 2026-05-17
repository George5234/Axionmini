// ============================================================================
// AXION AI BOT - ULTIMATE FINAL COMPLETE EDITION v12.0
// ============================================================================
// جميع الميزات المطلوبة:
// ✅ تحقق إجباري من 4 قنوات
// ✅ مكافأة ترحيب 100 AXC (~$1)
// ✅ مكافأة إحالة 100 AXC (~$1)
// ✅ حد سحب 1000 AXC (~$10)
// ✅ سحب AXC أو USDT
// ✅ نظام سواب AXC → USDT (داخلي)
// ✅ تفعيل السواب بدفع 5 Telegram Stars (مرة واحدة)
// ✅ نظام مراحل إحالة (Milestones) بمكافآت USDT
// ✅ لوحة مشرف متكاملة
// ✅ حذف ذكي للرسائل
// ✅ تنسيق HTML احترافي
// ✅ أزرار رجوع وإلغاء في كل خطوة
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
    swapFeeStars: 5, // 5 Stars = ~$0.10
    minSwap: 100,
    maxNotifications: 50,
    sessionTTL: 3600000,
    broadcastDelay: 100,
    withdrawCooldown: 86400000
};

// مراحل الإحالة
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
        tonPaid: false, swapActivated: false,
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
                `<b>🎉 NEW REFERRAL!</b>\n${formatLine()}\n👤 <b>${escapeHtml(newUserName)}</b> joined!\n💰 <b>+${formatAXC(APP_CONFIG.referralBonus)}</b> added!`, 
                { parse_mode: 'HTML' }).catch(() => {});
            
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
                `<b>🏆 MILESTONE UNLOCKED!</b>\n${formatLine()}\n🎉 ${milestone.name}\n👥 ${milestone.count} referrals\n💰 +${formatUSD(milestone.reward)} USDT added!`, 
                { parse_mode: 'HTML' }).catch(() => {});
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

function getCancelKeyboard() {
    return { inline_keyboard: [[{ text: '❌ CANCEL', callback_data: 'cancel_action' }], [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
}

function getShareKeyboard(link) {
    return {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=Join%20Axion%20AI%20and%20earn%20crypto!` }],
            [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
        ]
    };
}

function getSwapKeyboard() {
    return { inline_keyboard: [[{ text: '🔄 CONFIRM SWAP', callback_data: 'confirm_swap' }], [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]] };
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
    return { inline_keyboard: [[{ text: '✅ CONFIRM WITHDRAWAL', callback_data: 'confirm_withdraw_final' }], [{ text: '🔙 BACK', callback_data: 'back_to_menu' }]] };
}

async function sendWelcomeMessage(ctx) {
    await sendAndTrack(ctx, `<b>✨ WELCOME TO AXION AI</b> ✨
${formatLine()}

🎁 <b>Get ${formatAXC(APP_CONFIG.welcomeBonus)}</b> after verification
👥 <b>Get ${formatAXC(APP_CONFIG.referralBonus)}</b> per referral
💎 <b>Minimum Withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdraw)}

${formatLine()}

📢 <b>Please join our channels to continue:</b>`, getChannelsKeyboard());
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
        await sendAndTrack(ctx, `<b>✅ Welcome back, ${escapeHtml(userName)}!</b>\n\n💰 <b>Balance:</b> ${formatAXC(userData.balance || 0)}`, await getMainKeyboard(userId));
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
    const percent = Math.min(100, Math.floor(((data.balance || 0) / APP_CONFIG.minWithdraw) * 100));
    
    await sendAndTrack(ctx, `<b>📊 YOUR AXION BALANCE</b>
${formatLine()}

👤 <b>User:</b> @${escapeHtml(username)} | <b>ID:</b> ${userId}

💰 <b>AXC Balance:</b> ${formatAXC(data.balance || 0)}
💵 <b>USDT Balance:</b> ${formatUSD(data.usdtBalance || 0)}

👥 <b>Referrals:</b> ${data.inviteCount || 0} | 🎁 <b>Earned:</b> ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}

${formatLine()}

<b>📈 Progress to withdrawal:</b>
▰${'▰'.repeat(Math.floor(percent / 10))}${'▱'.repeat(10 - Math.floor(percent / 10))}▱ ${percent}% (${data.balance || 0}/${APP_CONFIG.minWithdraw} AXC)

${formatLine()}

<i>👇 Quick actions:</i>`, {
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
    
    await sendAndTrack(ctx, `<b>🔗 YOUR REFERRAL LINK</b>
${formatLine()}

<code>${link}</code>

${formatLine()}

<b>📊 Referral Stats:</b>
👥 <b>Total Referrals:</b> ${data.inviteCount || 0}
🎁 <b>Earned:</b> ${formatAXC((data.inviteCount || 0) * APP_CONFIG.referralBonus)}

${formatLine()}

<b>🏆 MILESTONES (USDT Rewards):</b>
${milestonesText}

${formatLine()}

💡 <b>Share your link and earn!</b>`, getShareKeyboard(link));
});

bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (userData.withdrawBlocked) {
        await sendAndTrack(ctx, `<b>🚫 ACCOUNT BLOCKED</b>
${formatLine()}
Your account has been blocked from withdrawals.
Contact support for more information.`, await getMainKeyboard(userId));
        return;
    }
    
    const lastWithdraw = withdrawCooldownTracker.get(userId);
    if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
        const hoursLeft = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
        await sendAndTrack(ctx, `<b>⏳ COOLDOWN ACTIVE</b>
${formatLine()}
You can request withdrawal once every 24 hours.
Please wait ${hoursLeft} hour(s).`, await getMainKeyboard(userId));
        return;
    }
    
    if (!userData.isVerified) {
        await sendAndTrack(ctx, `<b>🔒 WITHDRAWAL LOCKED</b>
${formatLine()}
Please verify first by joining channels.`, getBackKeyboard());
        return;
    }
    
    if (!userData.walletAddress) {
        await sendAndTrack(ctx, `<b>💸 SETUP WALLET</b>
${formatLine()}
Send your BEP20 address (0x...).

<i>Example: <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code></i>

${formatLine()}

📝 <b>Type or paste your address below:</b>`, getCancelKeyboard());
        userSessions.set(userId, { waitingForWallet: true, createdAt: Date.now() });
        return;
    }
    
    const balance = userData.balance || 0;
    const usdtBalance = userData.usdtBalance || 0;
    
    await sendAndTrack(ctx, `<b>💸 WITHDRAWAL</b>
${formatLine()}

💰 <b>AXC Balance:</b> ${formatAXC(balance)}
💵 <b>USDT Balance:</b> ${formatUSD(usdtBalance)}
💳 <b>Wallet:</b> <code>${userData.walletAddress.substring(0, 10)}...</code>

${formatLine()}

<b>👇 Choose currency:</b>`, getWithdrawCurrencyKeyboard());
});

bot.hears('🔄 SWAP', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    // إذا لم يدفع الرسوم من قبل
    if (!userData.tonPaid) {
        await sendAndTrack(ctx, `<b>🔄 ACTIVATE SWAP FEATURE</b>
${formatLine()}

⚠️ <b>One-time activation required</b>

To use the SWAP feature (AXC → USDT), you need to pay a one-time fee of <b>${APP_CONFIG.swapFeeStars} Telegram Stars</b>.

${formatLine()}

<b>✅ After activation:</b>
• Swap AXC to USDT anytime
• Withdraw USDT directly
• No more fees

${formatLine()}

💰 <b>Amount:</b> ${APP_CONFIG.swapFeeStars} Stars (~$${(APP_CONFIG.swapFeeStars * 0.02).toFixed(2)})
💡 <b>Note:</b> This prevents fake accounts

${formatLine()}

👇 <b>Click below to activate:</b>`, {
            inline_keyboard: [
                [{ text: '💎 ACTIVATE SWAP (5 Stars)', callback_data: 'activate_swap' }],
                [{ text: '🔙 BACK TO MENU', callback_data: 'back_to_menu' }]
            ]
        });
        return;
    }
    
    // إذا دفع مسبقاً، يظهر واجهة السواب
    await sendAndTrack(ctx, `<b>🔄 SWAP AXC TO USDT</b>
${formatLine()}

✅ <b>Swap activated!</b>

💰 <b>AXC Balance:</b> ${formatAXC(userData.balance || 0)}
💵 <b>USDT Balance:</b> ${formatUSD(userData.usdtBalance || 0)}

📊 <b>Rate:</b> 1 AXC = $${APP_CONFIG.axcPrice} USDT

${formatLine()}

✅ <b>Min swap:</b> ${APP_CONFIG.minSwap} AXC (~$${(APP_CONFIG.minSwap * APP_CONFIG.axcPrice).toFixed(2)})
🔄 <b>Max swap:</b> Your full balance

📝 <b>Enter amount in AXC below:</b>

<i>Example: 500</i>`, getCancelKeyboard());
    userSessions.set(userId, { waitingForSwapAmount: true, createdAt: Date.now() });
});

// ============================================================================
// 8. معالج الدفع عبر Telegram Stars
// ============================================================================

bot.action('activate_swap', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    
    if (userDoc.data().tonPaid) {
        await sendAndTrack(ctx, `<b>✅ Swap already activated!</b>\n${formatLine()}\nYou can already use the SWAP feature.`, await getMainKeyboard(userId));
        return;
    }
    
    try {
        // إرسال فاتورة Telegram Stars
        await ctx.telegram.sendInvoice(
            userId,
            'Axion AI - Activate Swap Feature',
            `One-time payment to enable AXC → USDT swap feature.\n\nAfter activation, you can swap AXC to USDT anytime with zero fees.`,
            `swap_activation_${userId}_${Date.now()}`,
            '', // provider_token فارغ لـ Stars
            'XTR', // عملة Telegram Stars
            [{ label: 'Activate Swap Feature', amount: APP_CONFIG.swapFeeStars }],
            {
                is_flexible: false,
                start_parameter: 'swap_activation',
                photo_url: 'https://axionmini.onrender.com/icon.png',
                photo_size: 100,
                photo_width: 100,
                photo_height: 100
            }
        );
    } catch (error) {
        console.error('Send invoice error:', error);
        await sendAndTrack(ctx, `<b>❌ Payment error</b>\n${formatLine()}\nCould not create invoice. Please try again later.`, await getMainKeyboard(userId));
    }
});

// معالج ما قبل الدفع (التحقق من صحة الفاتورة)
bot.on('pre_checkout_query', async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    const userId = ctx.preCheckoutQuery.from.id.toString();
    
    console.log(`💰 Pre-checkout query from ${userId}, payload: ${payload}`);
    
    if (payload.startsWith('swap_activation_')) {
        await ctx.telegram.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, true);
    } else {
        await ctx.telegram.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, false, 'Invalid payment');
    }
});

// معالج الدفع الناجح (تلقائي)
bot.on('successful_payment', async (ctx) => {
    const userId = ctx.from.id.toString();
    const payload = ctx.message.successful_payment.invoice_payload;
    const amount = ctx.message.successful_payment.total_amount / 100; // Telegram Stars
    
    console.log(`✅ Successful payment from ${userId}: ${amount} Stars, payload: ${payload}`);
    
    if (payload.startsWith('swap_activation_')) {
        await db.collection('users').doc(userId).update({
            tonPaid: true,
            swapActivated: true
        });
        
        await sendAndTrack(ctx, `<b>✅ SWAP ACTIVATED!</b>
${formatLine()}

🎉 Your swap feature has been successfully activated!

You can now use the <b>🔄 SWAP</b> feature to convert AXC to USDT.

${formatLine()}

<i>👇 Click SWAP to continue:</i>`, await getMainKeyboard(userId));
        
        await addNotification(userId, '✅ Swap Activated', `You can now swap AXC to USDT anytime!`, 'success');
    }
});

// ============================================================================
// 9. معالج النصوص
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
        await sendAndTrack(ctx, `<b>✅ Wallet saved!</b>
${formatLine()}
💳 <code>${text}</code>

<i>You can now withdraw funds.</i>`, await getMainKeyboard(userId));
        return;
    }
    
    if (session?.waitingForSwapAmount) {
        userSessions.delete(userId);
        const amount = parseInt(text);
        if (isNaN(amount) || amount < APP_CONFIG.minSwap) {
            await sendAndTrack(ctx, `<b>❌ Invalid amount!</b>
${formatLine()}
Minimum swap is ${APP_CONFIG.minSwap} AXC.`, await getMainKeyboard(userId));
            return;
        }
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        const balance = userDoc.data().balance || 0;
        if (amount > balance) {
            await sendAndTrack(ctx, `<b>❌ Insufficient balance!</b>
${formatLine()}
You have ${formatAXC(balance)}.`, await getMainKeyboard(userId));
            return;
        }
        const usdtAmount = amount * APP_CONFIG.axcPrice;
        userSessions.set(userId, { swapAmount: amount, swapUsdt: usdtAmount, createdAt: Date.now() });
        await sendAndTrack(ctx, `<b>🔄 CONFIRM SWAP</b>
${formatLine()}

📝 <b>Amount:</b> ${formatAXC(amount)}
💵 <b>You receive:</b> ${formatUSD(usdtAmount)}

${formatLine()}

<i>👇 Click confirm to complete swap</i>`, getSwapKeyboard());
        return;
    }
    
    if (session?.adminSearch) {
        userSessions.delete(userId);
        if (!checkDb()) return;
        const userDoc = await db.collection('users').doc(text).get();
        if (!userDoc.exists) return ctx.reply(`❌ User not found`);
        const data = userDoc.data();
        ctx.reply(`<b>👤 USER INFO</b>
${formatLine()}
🆔 ID: ${data.userId}
👤 Name: ${escapeHtml(data.userName)}
💰 Balance: ${formatAXC(data.balance || 0)}
💵 USDT: ${formatUSD(data.usdtBalance || 0)}
✅ Verified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'HTML' });
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
        await bot.telegram.sendMessage(targetId, `<b>💰 +${formatAXC(amount)} added by admin!</b>`, { parse_mode: 'HTML' }).catch(() => {});
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
        await bot.telegram.sendMessage(targetId, `<b>💰 -${formatAXC(amount)} removed by admin!</b>`, { parse_mode: 'HTML' }).catch(() => {});
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
        await bot.telegram.sendMessage(text, `<b>✅ Account verified by admin! +${formatAXC(APP_CONFIG.welcomeBonus)} added!</b>`, { parse_mode: 'HTML' }).catch(() => {});
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
// 10. معالج أزرار الـ Callback Query
// ============================================================================

bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    if (userData.isVerified) {
        await sendAndTrack(ctx, `<b>✅ Already verified!</b>`, await getMainKeyboard(userId));
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
    
    await db.collection('users').doc(userId).update({
        isVerified: true, verifiedAt: new Date().toISOString(),
        balance: APP_CONFIG.welcomeBonus, totalEarned: APP_CONFIG.welcomeBonus
    });
    
    await sendAndTrack(ctx, `<b>✅ VERIFIED!</b>
${formatLine()}
🎉 +${formatAXC(APP_CONFIG.welcomeBonus)}
💰 <b>Balance:</b> ${formatAXC(APP_CONFIG.welcomeBonus)}

<i>You can now invite friends and withdraw funds.</i>`, await getMainKeyboard(userId));
});

bot.action('swap_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    const keyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `<b>🔄 SWAP AXC TO USDT</b>
${formatLine()}
Click "SWAP" button in the main menu.`, keyboard);
});

bot.action('withdraw_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    const keyboard = await getMainKeyboard(userId);
    await sendAndTrack(ctx, `<b>💸 WITHDRAW</b>
${formatLine()}
Click "WITHDRAW" button in the main menu.`, keyboard);
});

bot.action('confirm_swap', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = userSessions.get(userId);
    await ctx.answerCbQuery();
    
    if (!session?.swapAmount) {
        await sendAndTrack(ctx, `<b>❌ Swap session expired.</b>\nPlease try again.`, await getMainKeyboard(userId));
        return;
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const balance = userDoc.data().balance || 0;
    
    if (session.swapAmount > balance) {
        await sendAndTrack(ctx, `<b>❌ Insufficient balance!</b>`, await getMainKeyboard(userId));
        userSessions.delete(userId);
        return;
    }
    
    await db.collection('users').doc(userId).update({
        balance: admin.firestore.FieldValue.increment(-session.swapAmount),
        usdtBalance: admin.firestore.FieldValue.increment(session.swapUsdt)
    });
    
    const newUserDoc = await db.collection('users').doc(userId).get();
    const newData = newUserDoc.data();
    
    await sendAndTrack(ctx, `<b>✅ SWAP COMPLETED!</b>
${formatLine()}

🔄 <b>Swapped:</b> ${formatAXC(session.swapAmount)} → ${formatUSD(session.swapUsdt)}

<b>📊 Updated Balances:</b>
💰 <b>AXC:</b> ${formatAXC(newData.balance || 0)}
💵 <b>USDT:</b> ${formatUSD(newData.usdtBalance || 0)}

${formatLine()}

💡 <b>What's next?</b>
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
        await sendAndTrack(ctx, `<b>❌ Insufficient AXC balance!</b>\nNeed ${formatAXC(APP_CONFIG.minWithdraw)}.`, await getMainKeyboard(userId));
        return;
    }
    
    const amount = userData.balance;
    await sendAndTrack(ctx, `<b>💸 WITHDRAWAL</b>
${formatLine()}

💰 <b>Amount:</b> ${formatAXC(amount)}
💳 <b>Wallet:</b> <code>${userData.walletAddress.substring(0, 10)}...</code>

${formatLine()}

<i>👇 Click CONFIRM to submit:</i>`, getConfirmWithdrawKeyboard());
    
    userSessions.set(userId, { withdrawAmount: amount, withdrawCurrency: 'AXC', createdAt: Date.now() });
});

bot.action('withdraw_usdt', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    const usdtAmount = userData.usdtBalance || 0;
    
    if (usdtAmount < APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice) {
        await sendAndTrack(ctx, `<b>❌ Insufficient USDT balance!</b>\nNeed ${formatUSD(APP_CONFIG.minWithdraw * APP_CONFIG.axcPrice)}.`, await getMainKeyboard(userId));
        return;
    }
    
    await sendAndTrack(ctx, `<b>💸 WITHDRAWAL (USDT)</b>
${formatLine()}

💵 <b>Amount:</b> ${formatUSD(usdtAmount)}
💳 <b>Wallet:</b> <code>${userData.walletAddress.substring(0, 10)}...</code>

${formatLine()}

<i>👇 Click CONFIRM to submit:</i>`, getConfirmWithdrawKeyboard());
    
    userSessions.set(userId, { withdrawAmount: usdtAmount, withdrawCurrency: 'USDT', createdAt: Date.now() });
});

bot.action('confirm_withdraw_final', async (ctx) => {
    const userId = ctx.from.id.toString();
    const session = userSessions.get(userId);
    await ctx.answerCbQuery();
    
    if (!session?.withdrawAmount) {
        await sendAndTrack(ctx, `<b>❌ Withdrawal session expired.</b>\nPlease try again.`, await getMainKeyboard(userId));
        return;
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    
    withdrawCooldownTracker.set(userId, Date.now());
    
    if (session.withdrawCurrency === 'AXC') {
        await db.collection('users').doc(userId).update({ balance: 0 });
    } else {
        await db.collection('users').doc(userId).update({ usdtBalance: 0 });
    }
    
    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
        id: withdrawalRef.id, userId, userName: userData.userName,
        amount: session.withdrawAmount, currency: session.withdrawCurrency,
        walletAddress: userData.walletAddress,
        status: 'pending', createdAt: new Date().toISOString()
    });
    
    if (WITHDRAWAL_GROUP_ID) {
        await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, 
            `<b>💸 WITHDRAWAL</b>
${formatLine()}
👤 ${escapeHtml(userData.userName)}
💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}
💳 <code>${userData.walletAddress}</code>
🆔 ${withdrawalRef.id}`, { parse_mode: 'HTML' }).catch(() => {});
    }
    
    await sendAndTrack(ctx, `<b>✅ WITHDRAWAL SUBMITTED!</b>
${formatLine()}

💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}
⏳ <b>Processing Time:</b> 24-48 hours

<i>You will be notified once processed.</i>`, await getMainKeyboard(userId));
    
    userSessions.delete(userId);
});

bot.action('cancel_action', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    await sendAndTrack(ctx, `<b>❌ Action cancelled.</b>\n\n<i>You have been returned to the main menu.</i>`, await getMainKeyboard(userId));
});

bot.action('back_to_menu', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userDoc = await db.collection('users').doc(userId).get();
    await ctx.answerCbQuery();
    userSessions.delete(userId);
    await sendAndTrack(ctx, `<b>🎯 MAIN MENU</b>
${formatLine()}
💰 <b>Balance:</b> ${formatAXC(userDoc.exists ? userDoc.data().balance || 0 : 0)}

<i>👇 Select an option below:</i>`, await getMainKeyboard(userId));
});

// ============================================================================
// 11. أوامر المشرف
// ============================================================================

bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.reply('<b>⛔ Access denied!</b>', { parse_mode: 'HTML' }); return; }
    
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
    await ctx.reply(`<b>👑 AXION AI ADMIN PANEL</b>
${formatLine()}
✅ <b>Authenticated as Admin</b>

📋 <b>Click any button below:</b>`, { reply_markup: adminKeyboard, parse_mode: 'HTML' });
});

bot.command('alimenfi', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.reply('<b>⛔ Access denied!</b>', { parse_mode: 'HTML' }); return; }
    
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
    await ctx.reply(`<b>👑 AXION AI ADMIN PANEL</b>
${formatLine()}
✅ <b>Authenticated as Admin</b>

📋 <b>Click any button below:</b>`, { reply_markup: adminKeyboard, parse_mode: 'HTML' });
});

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.reply('<b>⛔ Access denied!</b>', { parse_mode: 'HTML' }); return; }
    
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
    await ctx.reply(`<b>👑 AXION AI ADMIN PANEL</b>
${formatLine()}
✅ <b>Authenticated as Admin</b>

📋 <b>Click any button below:</b>`, { reply_markup: adminKeyboard, parse_mode: 'HTML' });
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
    
    await ctx.reply(`<b>📊 STATISTICS</b>
${formatLine()}
👥 <b>Users:</b> ${usersSnapshot.size}
💸 <b>Pending Withdrawals:</b> ${pendingSnapshot.size}
💰 <b>Total AXC:</b> ${formatAXC(totalBalance)}
💵 <b>Total USDT:</b> ${formatUSD(totalUsdt)}
💎 <b>Min Withdrawal:</b> ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'HTML' });
});

bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) { await ctx.reply('✅ No pending withdrawals'); return; }
    
    let message = `<b>💸 PENDING WITHDRAWALS</b> (${snapshot.size})\n${formatLine()}\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `🆔 <b>ID:</b> ${wd.id}\n👤 <b>User:</b> ${escapeHtml(wd.userName)}\n💰 <b>Amount:</b> ${wd.currency === 'USDT' ? formatUSD(wd.amount) : formatAXC(wd.amount)}\n${formatLine()}\n\n`;
    }
    await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    if (!checkDb()) { await ctx.reply('❌ Database error'); return; }
    const snapshot = await db.collection('users').get();
    await ctx.reply(`👥 <b>Total Users:</b> ${snapshot.size}`, { parse_mode: 'HTML' });
});

bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`🔍 <b>Search User</b>\n${formatLine()}\nSend user ID to search:`, { parse_mode: 'HTML' });
    userSessions.set(userId, { adminSearch: true, createdAt: Date.now() });
});

bot.action('admin_add', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`💰 <b>Add Balance</b>\n${formatLine()}\nSend: <code>USER_ID AMOUNT</code>\n\nExample: <code>1653918641 500</code>`, { parse_mode: 'HTML' });
    userSessions.set(userId, { adminAdd: true, createdAt: Date.now() });
});

bot.action('admin_remove', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`➖ <b>Remove Balance</b>\n${formatLine()}\nSend: <code>USER_ID AMOUNT</code>\n\nExample: <code>1653918641 200</code>`, { parse_mode: 'HTML' });
    userSessions.set(userId, { adminRemove: true, createdAt: Date.now() });
});

bot.action('admin_verify', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`✅ <b>Verify User</b>\n${formatLine()}\nSend user ID to verify manually:`, { parse_mode: 'HTML' });
    userSessions.set(userId, { adminVerify: true, createdAt: Date.now() });
});

bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) { await ctx.answerCbQuery('Access denied'); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`📢 <b>Broadcast</b>\n${formatLine()}\nSend your broadcast message:`, { parse_mode: 'HTML' });
    userSessions.set(userId, { adminBroadcast: true, createdAt: Date.now() });
});

// ============================================================================
// 12. أوامر المشرف النصية
// ============================================================================

bot.command('pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    if (!checkDb()) return;
    const snapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    if (snapshot.empty) return ctx.reply('✅ No pending withdrawals');
    let message = `<b>💸 PENDING WITHDRAWALS</b> (${snapshot.size})\n${formatLine()}\n\n`;
    for (const doc of snapshot.docs) {
        const wd = doc.data();
        message += `🆔 <b>ID:</b> ${wd.id}\n👤 <b>User:</b> ${escapeHtml(wd.userName)}\n💰 <b>Amount:</b> ${wd.currency === 'USDT' ? formatUSD(wd.amount) : formatAXC(wd.amount)}\n${formatLine()}\n\n`;
    }
    ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    if (!checkDb()) return;
    const usersSnapshot = await db.collection('users').get();
    const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    ctx.reply(`<b>📊 STATISTICS</b>\n${formatLine()}\n👥 <b>Users:</b> ${usersSnapshot.size}\n💸 <b>Pending:</b> ${pendingSnapshot.size}\n💎 <b>Min Withdrawal:</b> ${APP_CONFIG.minWithdraw} AXC`, { parse_mode: 'HTML' });
});

bot.command('users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return;
    if (!checkDb()) return;
    const snapshot = await db.collection('users').get();
    ctx.reply(`👥 <b>Total Users:</b> ${snapshot.size}`, { parse_mode: 'HTML' });
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
    await bot.telegram.sendMessage(targetId, `<b>💰 +${formatAXC(amount)} added by admin!</b>`, { parse_mode: 'HTML' }).catch(() => {});
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
    await bot.telegram.sendMessage(targetId, `<b>💰 -${formatAXC(amount)} removed by admin!</b>`, { parse_mode: 'HTML' }).catch(() => {});
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
    await bot.telegram.sendMessage(targetId, `<b>✅ Account verified by admin! +${formatAXC(APP_CONFIG.welcomeBonus)} added!</b>`, { parse_mode: 'HTML' }).catch(() => {});
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
    ctx.reply(`<b>👤 USER INFO</b>
${formatLine()}
🆔 ID: ${data.userId}
👤 Name: ${escapeHtml(data.userName)}
💰 AXC: ${formatAXC(data.balance || 0)}
💵 USDT: ${formatUSD(data.usdtBalance || 0)}
✅ Verified: ${data.isVerified ? 'Yes' : 'No'}`, { parse_mode: 'HTML' });
});

// ============================================================================
// 13. أوامر الموافقة والرفض
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
        await bot.telegram.sendMessage(withdrawal.data().userId, `<b>✅ Withdrawal approved!</b>`, { parse_mode: 'HTML' }).catch(() => {});
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
        await bot.telegram.sendMessage(data.userId, `<b>❌ Withdrawal rejected:</b> ${reason}`, { parse_mode: 'HTML' }).catch(() => {});
        return;
    }
});

// ============================================================================
// 14. دالة البث
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
                await bot.telegram.sendMessage(doc.id, `<b>📢 ANNOUNCEMENT</b>
${formatLine()}

${message}

${formatLine()}
<b>Axion AI Team</b>`, { parse_mode: 'HTML' });
                await new Promise(r => setTimeout(r, APP_CONFIG.broadcastDelay));
            } catch(e) {}
        }
        return { success: true, notifiedCount };
    } catch (error) { return { success: false }; }
}

// ============================================================================
// 15. إعدادات Express
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: 'alive', timestamp: Date.now(), firebase: firebaseHealthy ? 'connected' : 'disconnected' }); });
app.get('/api/config', (req, res) => { res.json({ firebaseConfig: firebaseWebConfig, status: 'ok' }); });

// ============================================================================
// 16. تشغيل البوت والسيرفر
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Telegram Bot started successfully'))
    .catch(err => console.error('Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`\n🌟 AXION AI SERVER - ULTIMATE FINAL COMPLETE EDITION v12.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Port: ${PORT}
🔥 Firebase: ${db && firebaseHealthy ? '✅ Connected' : '❌ Disconnected'}
👑 Admin ID: ${ADMIN_ID || 'Not configured'}
🤖 Bot: ${BOT_TOKEN ? '✅ Configured' : 'Missing'}
💸 Withdrawals: AXC + USDT
🔄 Swap: AXC ↔ USDT (5 Stars one-time fee)
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
// نهاية الملف
// ============================================================================
