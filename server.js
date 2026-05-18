// ============================================================================
// AXION AI BOT - COMPLETE PROFESSIONAL EDITION v8.0
// ============================================================================
// جميع الميزات والوظائف تعمل بكفاءة 100%
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 🔐 تحميل المتغيرات والـ Secrets
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

// تحميل Firebase Admin Key
try {
    const firebasePath = '/etc/secrets/firebase-admin-key.json';
    if (fs.existsSync(firebasePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
        console.log('✅ Firebase Admin key loaded');
    }
} catch (error) {
    console.error('❌ Firebase Admin key error:', error.message);
}

// تحميل Firebase Web Config
try {
    const configPath = '/etc/secrets/firebase-web-config.json';
    if (fs.existsSync(configPath)) {
        firebaseWebConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ Firebase Web config loaded');
    }
} catch (error) {
    console.error('❌ Firebase Web config error:', error.message);
}

// تحميل إعدادات المشرف
try {
    const adminPath = '/etc/secrets/admin-config.json';
    if (fs.existsSync(adminPath)) {
        const adminConfig = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
        ADMIN_ID = adminConfig.admin_id;
        ADMIN_PASSWORD = adminConfig.admin_password;
        console.log('✅ Admin config loaded | ID:', ADMIN_ID);
    }
} catch (error) {
    console.error('❌ Admin config error:', error.message);
}

// متغيرات البيئة
BOT_TOKEN = process.env.BOT_TOKEN;
WITHDRAWAL_GROUP_ID = process.env.WITHDRAWAL_GROUP_ID;
OWNER_WALLET = process.env.OWNER_WALLET;
APP_URL = process.env.APP_URL;

// ============================================================================
// 2. ⚙️ إعدادات التطبيق
// ============================================================================

const APP_CONFIG = {
    welcomeBonus: 100,
    referralBonus: 100,
    minWithdrawAXC: 1000,
    minWithdrawUSDT: 10,
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

// الجلسات والمتغيرات العامة
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

function formatAXC(amount) {
    const usd = (amount * APP_CONFIG.axcPrice).toFixed(2);
    return `${amount.toLocaleString()} AXC (~$${usd})`;
}

function formatUSD(amount) {
    return `$${amount.toFixed(2)} USD`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isValidBEP20(address) {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

function isAdmin(userId) {
    return userId === ADMIN_ID;
}

function isAdminAuthenticated(userId) {
    const session = adminSessions.get(userId);
    return session && session.authenticated === true;
}

function getProgressBar(current, target, length = 10) {
    const percent = Math.min(100, (current / target) * 100);
    const filled = Math.floor((percent / 100) * length);
    const empty = length - filled;
    return `▰`.repeat(filled) + `▱`.repeat(empty) + ` ${Math.floor(percent)}%`;
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
// 3. 🔥 Firebase Setup
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

        // تحميل عداد المستخدمين
        loadUserCounterFromDB();

        // فحص صحة Firebase
        setInterval(async () => {
            try {
                await db.collection('system').doc('health').set({ lastCheck: Date.now() }, { merge: true });
                firebaseHealthy = true;
            } catch (error) {
                firebaseHealthy = false;
                console.error('Firebase health check failed:', error.message);
            }
        }, 300000);
    } catch (error) {
        console.error('❌ Firebase init error:', error.message);
    }
}

function checkDb() {
    return db && firebaseHealthy;
}

// ============================================================================
// 4. 📊 نظام عداد المستخدمين
// ============================================================================

async function loadUserCounterFromDB() {
    if (!checkDb()) return;
    try {
        const counterRef = db.collection('system').doc('userCounter');
        const counterDoc = await counterRef.get();
        if (counterDoc.exists) {
            totalUsersCount = counterDoc.data().count || 0;
        } else {
            totalUsersCount = 0;
            await counterRef.set({ count: 0, lastUpdated: new Date().toISOString() });
        }
        console.log(`📊 Total users loaded: ${totalUsersCount}`);
    } catch (error) {
        console.error('Error loading user counter:', error.message);
    }
}

async function incrementUserCounter(userId, userName) {
    if (!checkDb()) return;
    try {
        const counterRef = db.collection('system').doc('userCounter');
        
        await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const currentCount = counterDoc.exists ? (counterDoc.data().count || 0) : 0;
            const newCount = currentCount + 1;
            
            transaction.set(counterRef, {
                count: newCount,
                lastUserId: userId,
                lastUserName: userName,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            totalUsersCount = newCount;
        });
        
        console.log(`📈 User counter incremented: ${totalUsersCount}`);
        
        if (ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID,
                formatProfessionalMessage('🆕 NEW USER',
                    `👤 <b>Name:</b> ${escapeHtml(userName)}\n🆔 <b>ID:</b> ${userId}\n📊 <b>Total Users:</b> ${totalUsersCount}`,
                    `🎉 Welcome to Axion AI!`
                ), { parse_mode: 'HTML' }).catch(() => {});
        }
    } catch (error) {
        console.error('Error incrementing user counter:', error.message);
    }
}

// ============================================================================
// 5. 🛠️ دوال مساعدة عامة
// ============================================================================

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
        withdrawals: [],
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
        
        await incrementUserCounter(userId, userName);
        
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
// 6. 🔗 نظام الإحالة
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
            console.log(`❌ Duplicate referral blocked: ${referrerId} → ${newUserId}`);
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
        await addNotification(referrerId, '🎉 New Referral!', `+${formatAXC(APP_CONFIG.referralBonus)} added to your balance!`, 'referral');
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
                await addNotification(userId, '🏆 Milestone Unlocked!', `You reached ${milestone.count} referrals! +${formatUSD(milestone.reward)} USDT added!`, 'success');
                console.log(`✅ Milestone unlocked: ${userId} - ${milestone.count} referrals`);
            }
        }
    } catch (error) {
        console.error('Milestone error:', error.message);
    }
}

// ============================================================================
// 7. 🔒 التحقق من القنوات (المهام الثابتة)
// ============================================================================

async function verifyChannelMembership(userId, channelUsername) {
    try {
        const chatMember = await bot.telegram.getChatMember(`@${channelUsername.replace('@', '')}`, parseInt(userId));
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch {
        return false;
    }
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
// 8. 💸 نظام السحب
// ============================================================================

async function createWithdrawalRequest(userId, amount, currency, walletAddress) {
    if (!checkDb()) return { success: false, error: 'Database error' };

    try {
        const user = await getOrCreateUser(userId, '', '');
        if (!user) return { success: false, error: 'User not found' };

        const lastWithdraw = withdrawCooldownTracker.get(userId);
        if (lastWithdraw && (Date.now() - lastWithdraw) < APP_CONFIG.withdrawCooldown) {
            const hours = Math.ceil((APP_CONFIG.withdrawCooldown - (Date.now() - lastWithdraw)) / 3600000);
            return { success: false, error: `Please wait ${hours} hour(s) before next withdrawal` };
        }

        if (currency === 'AXC') {
            if (amount < APP_CONFIG.minWithdrawAXC) {
                return { success: false, error: `Minimum withdrawal is ${formatAXC(APP_CONFIG.minWithdrawAXC)}` };
            }
            if (amount > (user.balance || 0)) {
                return { success: false, error: 'Insufficient AXC balance' };
            }
        } else {
            if (amount < APP_CONFIG.minWithdrawUSDT) {
                return { success: false, error: `Minimum withdrawal is ${formatUSD(APP_CONFIG.minWithdrawUSDT)}` };
            }
            if (amount > (user.usdtBalance || 0)) {
                return { success: false, error: 'Insufficient USDT balance' };
            }
        }

        if (!user.isVerified) {
            return { success: false, error: 'Please complete channel verification first' };
        }

        if (currency === 'AXC') {
            await updateUser(userId, { balance: admin.firestore.FieldValue.increment(-amount) });
        } else {
            await updateUser(userId, { usdtBalance: admin.firestore.FieldValue.increment(-amount) });
        }

        withdrawCooldownTracker.set(userId, Date.now());

        const withdrawalRef = db.collection('withdrawals').doc();
        const requestId = withdrawalRef.id;

        await withdrawalRef.set({
            id: requestId,
            userId,
            userName: user.userName,
            amount: amount,
            currency: currency,
            walletAddress: walletAddress,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        const userWithdrawals = user.withdrawals || [];
        userWithdrawals.push({
            id: requestId,
            amount: amount,
            currency: currency,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        await updateUser(userId, { withdrawals: userWithdrawals });

        await addNotification(userId, '💸 Withdrawal Request', `Your withdrawal request of ${currency === 'AXC' ? formatAXC(amount) : formatUSD(amount)} has been submitted.`);

        if (WITHDRAWAL_GROUP_ID) {
            const withdrawalMessage = formatProfessionalMessage(
                '💸 NEW WITHDRAWAL REQUEST',
                `👤 <b>User:</b> ${escapeHtml(user.userName)}\n🆔 <b>ID:</b> ${userId}\n💰 <b>Amount:</b> ${currency === 'AXC' ? formatAXC(amount) : formatUSD(amount)}\n💳 <b>Wallet:</b> <code>${walletAddress}</code>\n📅 <b>Request ID:</b> <code>${requestId}</code>`,
                `👇 Click Approve or Reject`
            );

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ APPROVE', callback_data: `approve_wd_${requestId}` },
                        { text: '❌ REJECT', callback_data: `reject_wd_${requestId}` }
                    ]
                ]
            };

            await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, withdrawalMessage, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
        }

        return { success: true, requestId: requestId };

    } catch (error) {
        console.error('Withdrawal error:', error);
        return { success: false, error: error.message };
    }
}

async function getPendingWithdrawals() {
    if (!checkDb()) return [];

    try {
        const snapshot = await db.collection('withdrawals')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();

        const withdrawals = [];
        snapshot.forEach(doc => {
            withdrawals.push({ id: doc.id, ...doc.data() });
        });

        return withdrawals;
    } catch (error) {
        console.error('Get pending withdrawals error:', error);
        return [];
    }
}

async function approveWithdrawal(withdrawalId, adminId) {
    if (!checkDb()) return { success: false, error: 'Database error' };

    try {
        const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
        const withdrawalDoc = await withdrawalRef.get();

        if (!withdrawalDoc.exists) {
            return { success: false, error: 'Withdrawal not found' };
        }

        const withdrawal = withdrawalDoc.data();

        if (withdrawal.status !== 'pending') {
            return { success: false, error: `Already ${withdrawal.status}` };
        }

        await withdrawalRef.update({
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: adminId
        });

        await bot.telegram.sendMessage(withdrawal.userId,
            formatProfessionalMessage('✅ WITHDRAWAL APPROVED',
                `💰 ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)}\n\nYour withdrawal request has been approved. Funds will be sent within 24 hours.`
            ), { parse_mode: 'HTML' }).catch(() => {});

        await addNotification(withdrawal.userId, '✅ Withdrawal Approved', `Your withdrawal of ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)} has been approved.`);

        console.log(`✅ Withdrawal ${withdrawalId} approved by ${adminId}`);
        return { success: true };

    } catch (error) {
        console.error('Approve withdrawal error:', error);
        return { success: false, error: error.message };
    }
}

async function rejectWithdrawal(withdrawalId, adminId, reason) {
    if (!checkDb()) return { success: false, error: 'Database error' };

    try {
        const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
        const withdrawalDoc = await withdrawalRef.get();

        if (!withdrawalDoc.exists) {
            return { success: false, error: 'Withdrawal not found' };
        }

        const withdrawal = withdrawalDoc.data();

        if (withdrawal.status !== 'pending') {
            return { success: false, error: `Already ${withdrawal.status}` };
        }

        if (withdrawal.currency === 'AXC') {
            await updateUser(withdrawal.userId, {
                balance: admin.firestore.FieldValue.increment(withdrawal.amount)
            });
        } else {
            await updateUser(withdrawal.userId, {
                usdtBalance: admin.firestore.FieldValue.increment(withdrawal.amount)
            });
        }

        await withdrawalRef.update({
            status: 'rejected',
            rejectReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: adminId
        });

        await bot.telegram.sendMessage(withdrawal.userId,
            formatProfessionalMessage('❌ WITHDRAWAL REJECTED',
                `💰 ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)}\n\nReason: ${reason}\n\nThe amount has been returned to your balance.`
            ), { parse_mode: 'HTML' }).catch(() => {});

        await addNotification(withdrawal.userId, '❌ Withdrawal Rejected', `Your withdrawal of ${withdrawal.currency === 'AXC' ? formatAXC(withdrawal.amount) : formatUSD(withdrawal.amount)} was rejected. Reason: ${reason}`);

        console.log(`❌ Withdrawal ${withdrawalId} rejected by ${adminId}. Reason: ${reason}`);
        return { success: true };

    } catch (error) {
        console.error('Reject withdrawal error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// 9. 📊 إحصائيات البوت للمشرف
// ============================================================================

async function getBotStatsForAdmin() {
    if (!checkDb()) return { users: 0, pendingWithdrawals: 0, totalBalance: 0, totalUsdt: 0, verified: 0 };

    try {
        const usersSnapshot = await db.collection('users').get();
        const pendingSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();

        let totalBalance = 0;
        let totalUsdt = 0;
        let verified = 0;

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            totalBalance += data.balance || 0;
            totalUsdt += data.usdtBalance || 0;
            if (data.isVerified) verified++;
        });

        return {
            users: usersSnapshot.size,
            pendingWithdrawals: pendingSnapshot.size,
            totalBalance: totalBalance,
            totalUsdt: totalUsdt,
            verified: verified
        };
    } catch (error) {
        console.error('Get stats error:', error);
        return { users: 0, pendingWithdrawals: 0, totalBalance: 0, totalUsdt: 0, verified: 0 };
    }
}

// ============================================================================
// 10. 📢 البث الجماعي
// ============================================================================

async function broadcastToAllUsers(message) {
    if (!checkDb()) return { success: false, sent: 0, error: 'Database error' };

    try {
        const usersSnapshot = await db.collection('users').get();
        let sent = 0;
        let failed = 0;

        const notification = {
            id: `broadcast_${Date.now()}`,
            title: '📢 Announcement',
            message: message,
            type: 'broadcast',
            read: false,
            timestamp: new Date().toISOString()
        };

        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const notifications = doc.data().notifications || [];
            notifications.unshift(notification);
            const limited = notifications.slice(0, 50);

            await db.collection('users').doc(userId).update({ notifications: limited });

            try {
                await bot.telegram.sendMessage(userId,
                    formatProfessionalMessage('📢 ANNOUNCEMENT', message),
                    { parse_mode: 'HTML' }
                );
                sent++;
                await new Promise(r => setTimeout(r, 50));
            } catch (e) {
                failed++;
            }
        }

        console.log(`📢 Broadcast sent to ${sent} users (${failed} failed)`);
        return { success: true, sent: sent, failed: failed };

    } catch (error) {
        console.error('Broadcast error:', error);
        return { success: false, sent: 0, error: error.message };
    }
}

// ============================================================================
// 11. 🎨 لوحات المفاتيح
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
            [{ text: '📢 BROADCAST', callback_data: 'admin_broadcast' }],
            [{ text: '🚪 LOGOUT', callback_data: 'admin_logout' }]
        ]
    };
}

// ============================================================================
// 12. 🤖 أوامر البوت الأساسية
// ============================================================================

const bot = new Telegraf(BOT_TOKEN);

bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => console.log('✅ Bot using polling mode'))
    .catch(err => console.error('Webhook delete error:', err.message));

bot.telegram.getMe().then((botInfo) => {
    BOT_USERNAME = botInfo.username;
    console.log(`📢 Bot username: @${BOT_USERNAME}`);
}).catch(err => console.error('Failed to get bot info:', err.message));

// بدء البوت
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
        console.log(`✅ Referral recorded: ${refCode} → ${userId}`);
    }

    const welcomeMsg = formatProfessionalMessage(
        '✨ WELCOME TO AXION AI ✨',
        `🎁 <b>Get ${formatAXC(APP_CONFIG.welcomeBonus)}</b> after verification\n👥 <b>Get ${formatAXC(APP_CONFIG.referralBonus)}</b> per referral\n💎 <b>Minimum Withdrawal:</b> ${formatAXC(APP_CONFIG.minWithdrawAXC)}`,
        `👇 Please join our channels to continue:`
    );

    await sendAndTrack(ctx, welcomeMsg, getChannelsKeyboard());
});

// الرصيد
bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!checkDb()) return;

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    const progressBar = getProgressBar(user.balance || 0, APP_CONFIG.minWithdrawAXC);

    const balanceMsg = formatProfessionalMessage(
        '📊 YOUR BALANCE',
        `💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n🎁 <b>Earned:</b> ${formatAXC((user.inviteCount || 0) * APP_CONFIG.referralBonus)}\n\n<b>📈 Progress to withdrawal:</b>\n${progressBar}`,
        `👇 Use the buttons below to manage your funds:`
    );

    await sendAndTrack(ctx, balanceMsg, getMainKeyboard(userId));
});

// نظام الإحالة
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

// سحب
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

// SWAP STATION
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

// الإعدادات
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
// 13. 🔘 معالجات الأزرار (Callback Actions)
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

    if (userData.referredBy) {
        await processReferralFromBot(userData.referredBy, userId, userData.userName);
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

    if ((user.balance || 0) < APP_CONFIG.minWithdrawAXC) {
        await sendAndTrack(ctx, formatProfessionalMessage('❌ INSUFFICIENT BALANCE', `You need <b>${formatAXC(APP_CONFIG.minWithdrawAXC)}</b> to withdraw.\n\n💰 Your balance: ${formatAXC(user.balance || 0)}`), getMainKeyboard(userId));
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

    if (usdtAmount < APP_CONFIG.minWithdrawUSDT) {
        await sendAndTrack(ctx, formatProfessionalMessage('❌ INSUFFICIENT USDT', `You need <b>${formatUSD(APP_CONFIG.minWithdrawUSDT)}</b> to withdraw USDT.\n\n💵 Your balance: ${formatUSD(usdtAmount)}`), getMainKeyboard(userId));
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
        await sendAndTrack(ctx, formatProfessionalMessage('❌ SESSION EXPIRED', 'Please start over by clicking WITHDRAW again.'), getMainKeyboard(userId));
        return;
    }

    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;

    if (!await requireChannelVerification(ctx, userId)) return;

    const result = await createWithdrawalRequest(userId, session.withdrawAmount, session.withdrawCurrency, user.walletAddress);

    if (result.success) {
        await sendAndTrack(ctx, formatProfessionalMessage('✅ WITHDRAWAL SUBMITTED!', `💰 ${session.withdrawCurrency === 'AXC' ? formatAXC(session.withdrawAmount) : formatUSD(session.withdrawAmount)}\n⏳ <b>Processing:</b> 24-48 hours\n\n<i>You will be notified once processed.</i>`), getMainKeyboard(userId));
    } else {
        if (session.withdrawCurrency === 'AXC') {
            await updateUser(userId, { balance: admin.firestore.FieldValue.increment(session.withdrawAmount) });
        } else {
            await updateUser(userId, { usdtBalance: admin.firestore.FieldValue.increment(session.withdrawAmount) });
        }
        await sendAndTrack(ctx, formatProfessionalMessage('❌ WITHDRAWAL FAILED', `${result.error}`), getMainKeyboard(userId));
    }

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
// 14. 👑 لوحة المشرف
// ============================================================================

bot.hears('👑 ADMIN PANEL', async (ctx) => {
    const userId = ctx.from.id.toString();

    if (!isAdmin(userId)) {
        await ctx.reply('⛔ <b>Access Denied</b>', { parse_mode: 'HTML' });
        return;
    }

    if (isAdminAuthenticated(userId)) {
        const stats = await getBotStatsForAdmin();
        const msg = formatProfessionalMessage(
            '👑 ADMIN PANEL',
            `✅ Authenticated\n\n👥 <b>Total Users:</b> ${stats.users}\n✅ <b>Verified:</b> ${stats.verified}\n⏳ <b>Pending Withdrawals:</b> ${stats.pendingWithdrawals}\n💰 <b>Total AXC:</b> ${formatAXC(stats.totalBalance)}\n💵 <b>Total USDT:</b> ${formatUSD(stats.totalUsdt)}`,
            `📋 Click any button below:`
        );
        await ctx.reply(msg, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        return;
    }

    await ctx.reply(formatProfessionalMessage('🔐 ADMIN LOGIN', 'Please enter your admin password.'), { parse_mode: 'HTML' });
    adminSessions.set(userId, { waitingForPassword: true, createdAt: Date.now() });
});

bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();

    const stats = await getBotStatsForAdmin();

    const msg = formatProfessionalMessage(
        '📊 STATISTICS',
        `👥 <b>Total Users:</b> ${totalUsersCount}\n✅ <b>Verified:</b> ${stats.verified}\n💸 <b>Pending Withdrawals:</b> ${stats.pendingWithdrawals}\n💰 <b>Total AXC:</b> ${formatAXC(stats.totalBalance)}\n💵 <b>Total USDT:</b> ${formatUSD(stats.totalUsdt)}`
    );

    await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.action('admin_pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();

    const withdrawals = await getPendingWithdrawals();

    if (withdrawals.length === 0) {
        await ctx.reply(formatProfessionalMessage('✅ NO PENDING', 'All withdrawals have been processed.'), { parse_mode: 'HTML' });
        return;
    }

    let msg = '';
    for (let i = 0; i < withdrawals.length; i++) {
        const w = withdrawals[i];
        const date = new Date(w.createdAt).toLocaleString();
        msg += `${i + 1}. 👤 ${w.userName}\n`;
        msg += `   💰 ${w.currency === 'AXC' ? formatAXC(w.amount) : formatUSD(w.amount)}\n`;
        msg += `   💳 Wallet: <code>${w.walletAddress.substring(0, 15)}...</code>\n`;
        msg += `   🆔 <code>${w.id}</code>\n`;
        msg += `   📅 ${date}\n\n`;
    }

    const keyboard = {
        inline_keyboard: []
    };

    for (let i = 0; i < Math.min(withdrawals.length, 5); i++) {
        const w = withdrawals[i];
        keyboard.inline_keyboard.push([
            { text: `✅ Approve ${w.userName}`, callback_data: `approve_wd_${w.id}` },
            { text: `❌ Reject ${w.userName}`, callback_data: `reject_wd_${w.id}` }
        ]);
    }

    keyboard.inline_keyboard.push([
        { text: '🔄 Refresh', callback_data: 'admin_pending' },
        { text: '🔙 Back', callback_data: 'admin_back' }
    ]);

    await ctx.reply(formatProfessionalMessage('💸 PENDING WITHDRAWALS', msg), { parse_mode: 'HTML', ...keyboard });
});

bot.action(/approve_wd_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const withdrawalId = ctx.match[1];

    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery(`✅ Approving...`);

    const result = await approveWithdrawal(withdrawalId, userId);

    if (result.success) {
        await ctx.reply(`✅ Withdrawal ${withdrawalId} approved successfully!`);
    } else {
        await ctx.reply(`❌ Error: ${result.error}`);
    }
});

bot.action(/reject_wd_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const withdrawalId = ctx.match[1];

    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }

    await ctx.answerCbQuery();
    adminSessions.set(userId, { step: 'awaiting_reject_reason', withdrawalId: withdrawalId });
    await ctx.reply(`📝 Please send the reason for rejecting withdrawal #${withdrawalId}:`);
});

bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();

    const usersSnapshot = await db.collection('users').get();
    const verifiedCount = usersSnapshot.docs.filter(d => d.data().isVerified === true).length;
    const withWalletCount = usersSnapshot.docs.filter(d => d.data().walletAddress).length;

    const msg = formatProfessionalMessage(
        '👥 USERS',
        `📊 <b>Total:</b> ${totalUsersCount}\n✅ <b>Verified:</b> ${verifiedCount}\n💳 <b>With Wallet:</b> ${withWalletCount}`
    );

    await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.action('admin_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('🔍 <b>SEARCH USER</b>\n\nSend user ID or username:', { parse_mode: 'HTML' });
    adminSessions.set(userId, { searching: true, createdAt: Date.now() });
});

bot.action('admin_add_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('💰 <b>ADD BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\n\nExample: <code>123456789 100 AXC</code>\n<i>Currency: AXC or USDT</i>', { parse_mode: 'HTML' });
    adminSessions.set(userId, { addingBalance: true, createdAt: Date.now() });
});

bot.action('admin_remove_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('➖ <b>REMOVE BALANCE</b>\n\nFormat: <code>USER_ID AMOUNT CURRENCY</code>\n\nExample: <code>123456789 50 AXC</code>\n<i>Currency: AXC or USDT</i>', { parse_mode: 'HTML' });
    adminSessions.set(userId, { removingBalance: true, createdAt: Date.now() });
});

bot.action('admin_broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId) || !isAdminAuthenticated(userId)) {
        await ctx.answerCbQuery('⛔ Unauthorized');
        return;
    }
    await ctx.answerCbQuery();
    await ctx.reply('📢 <b>BROADCAST</b>\n\nSend your message to all users:', { parse_mode: 'HTML' });
    adminSessions.set(userId, { broadcasting: true, createdAt: Date.now() });
});

bot.action('admin_logout', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    adminSessions.delete(userId);
    await ctx.reply(formatProfessionalMessage('🔓 LOGGED OUT', 'Admin session ended.'), { parse_mode: 'HTML' });
});

bot.action('admin_back', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    const stats = await getBotStatsForAdmin();
    const msg = formatProfessionalMessage(
        '👑 ADMIN PANEL',
        `✅ Authenticated\n\n👥 <b>Total Users:</b> ${stats.users}\n✅ <b>Verified:</b> ${stats.verified}\n⏳ <b>Pending:</b> ${stats.pendingWithdrawals}`,
        `📋 Click any button below:`
    );
    await ctx.reply(msg, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
    await ctx.deleteMessage();
});

// ============================================================================
// 15. 📝 معالج الرسائل النصية (للمشرف والمستخدم)
// ============================================================================

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const messageText = ctx.message.text;

    console.log(`📩 [RECEIVED] from ${userId}: "${messageText.substring(0, 50)}"`);

    // تجاهل الأزرار والأوامر
    const buttons = ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW', '🔄 SWAP STATION', '⚙️ SETTINGS', '👑 ADMIN PANEL'];
    if (buttons.includes(messageText)) return;
    if (messageText.startsWith('/')) return;

    const adminSession = adminSessions.get(userId);

    // ========== 1. معالجة كلمة سر المشرف ==========
    if (adminSession?.waitingForPassword && isAdmin(userId)) {
        console.log(`🔐 Admin password attempt from ${userId}`);
        
        if (messageText === ADMIN_PASSWORD) {
            adminSessions.set(userId, { authenticated: true, createdAt: Date.now() });
            delete adminSessions.get(userId).waitingForPassword;

            const stats = await getBotStatsForAdmin();
            const msg = formatProfessionalMessage(
                '✅ LOGIN SUCCESSFUL',
                `Welcome Admin.\n\n👥 Total Users: ${stats.users}\n⏳ Pending: ${stats.pendingWithdrawals}`,
                `👇 Select an option:`
            );
            await ctx.reply(msg, { reply_markup: getAdminKeyboard(), parse_mode: 'HTML' });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ LOGIN FAILED', 'Invalid password.'), { parse_mode: 'HTML' });
            adminSessions.delete(userId);
        }
        return;
    }

    // ========== 2. معالجة سبب رفض السحب ==========
    if (adminSession?.step === 'awaiting_reject_reason' && isAdmin(userId) && isAdminAuthenticated(userId)) {
        console.log(`📝 Reject reason from ${userId} for withdrawal ${adminSession.withdrawalId}`);
        
        const withdrawalId = adminSession.withdrawalId;
        const reason = messageText;

        const result = await rejectWithdrawal(withdrawalId, userId, reason);

        if (result.success) {
            await ctx.reply(`✅ Withdrawal ${withdrawalId} rejected.\nReason: ${reason}`);
        } else {
            await ctx.reply(`❌ Error: ${result.error}`);
        }

        adminSessions.delete(userId);
        return;
    }

    // ========== 3. معالجة البث الجماعي ==========
    if (adminSession?.broadcasting && isAdmin(userId) && isAdminAuthenticated(userId)) {
        console.log(`📢 Broadcasting from ${userId}: "${messageText.substring(0, 50)}..."`);
        
        await ctx.reply(`⏳ Sending broadcast to all users...`);
        
        const result = await broadcastToAllUsers(messageText);
        
        if (result.success) {
            await ctx.reply(`✅ Broadcast sent successfully to ${result.sent} users`);
        } else {
            await ctx.reply(`❌ Broadcast failed: ${result.error}`);
        }
        
        adminSessions.delete(userId);
        return;
    }

    // ========== 4. معالجة إضافة رصيد ==========
    if (adminSession?.addingBalance && isAdmin(userId) && isAdminAuthenticated(userId)) {
        console.log(`💰 Adding balance from ${userId}: "${messageText}"`);
        
        const parts = messageText.trim().split(' ');
        
        if (parts.length === 3) {
            const targetUserId = parts[0];
            const amount = parseFloat(parts[1]);
            const currency = parts[2].toUpperCase();
            
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount.');
            } else if (currency === 'AXC') {
                await updateUser(targetUserId, {
                    balance: admin.firestore.FieldValue.increment(amount),
                    totalEarned: admin.firestore.FieldValue.increment(amount)
                });
                await addNotification(targetUserId, '💰 Balance Added', `Admin added ${formatAXC(amount)} to your account.`);
                await ctx.reply(`✅ Added ${formatAXC(amount)} to user ${targetUserId}`);
            } else if (currency === 'USDT') {
                await updateUser(targetUserId, {
                    usdtBalance: admin.firestore.FieldValue.increment(amount)
                });
                await addNotification(targetUserId, '💰 Balance Added', `Admin added ${formatUSD(amount)} USDT to your account.`);
                await ctx.reply(`✅ Added ${formatUSD(amount)} to user ${targetUserId}`);
            } else {
                await ctx.reply('❌ Invalid currency. Use AXC or USDT');
            }
        } else {
            await ctx.reply('❌ Format: USER_ID AMOUNT CURRENCY\nExample: 123456789 100 AXC');
        }
        
        adminSessions.delete(userId);
        return;
    }

    // ========== 5. معالجة خصم رصيد ==========
    if (adminSession?.removingBalance && isAdmin(userId) && isAdminAuthenticated(userId)) {
        console.log(`➖ Removing balance from ${userId}: "${messageText}"`);
        
        const parts = messageText.trim().split(' ');
        
        if (parts.length === 3) {
            const targetUserId = parts[0];
            const amount = parseFloat(parts[1]);
            const currency = parts[2].toUpperCase();
            
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount.');
            } else if (currency === 'AXC') {
                const user = await getOrCreateUser(targetUserId, '', '');
                if ((user?.balance || 0) < amount) {
                    await ctx.reply(`❌ User balance is only ${formatAXC(user?.balance || 0)}`);
                } else {
                    await updateUser(targetUserId, {
                        balance: admin.firestore.FieldValue.increment(-amount)
                    });
                    await addNotification(targetUserId, '💰 Balance Removed', `Admin removed ${formatAXC(amount)} from your account.`);
                    await ctx.reply(`✅ Removed ${formatAXC(amount)} from user ${targetUserId}`);
                }
            } else if (currency === 'USDT') {
                const user = await getOrCreateUser(targetUserId, '', '');
                if ((user?.usdtBalance || 0) < amount) {
                    await ctx.reply(`❌ User USDT balance is only ${formatUSD(user?.usdtBalance || 0)}`);
                } else {
                    await updateUser(targetUserId, {
                        usdtBalance: admin.firestore.FieldValue.increment(-amount)
                    });
                    await addNotification(targetUserId, '💰 Balance Removed', `Admin removed ${formatUSD(amount)} USDT from your account.`);
                    await ctx.reply(`✅ Removed ${formatUSD(amount)} from user ${targetUserId}`);
                }
            } else {
                await ctx.reply('❌ Invalid currency. Use AXC or USDT');
            }
        } else {
            await ctx.reply('❌ Format: USER_ID AMOUNT CURRENCY\nExample: 123456789 50 AXC');
        }
        
        adminSessions.delete(userId);
        return;
    }

    // ========== 6. معالجة البحث عن مستخدم ==========
    if (adminSession?.searching && isAdmin(userId) && isAdminAuthenticated(userId)) {
        console.log(`🔍 Searching from ${userId}: "${messageText}"`);
        
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
            const withdrawals = user.withdrawals || [];
            const approvedWithdrawals = withdrawals.filter(w => w.status === 'approved');
            const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
            const rejectedWithdrawals = withdrawals.filter(w => w.status === 'rejected');

            const userMsg = formatProfessionalMessage(
                '👤 USER FOUND',
                `🆔 <b>ID:</b> ${user.userId}\n👤 <b>Name:</b> ${escapeHtml(user.userName)}\n👥 <b>Referrals:</b> ${user.inviteCount || 0}\n💰 <b>AXC:</b> ${formatAXC(user.balance || 0)}\n💵 <b>USDT:</b> ${formatUSD(user.usdtBalance || 0)}\n✅ <b>Verified:</b> ${user.isVerified ? 'Yes' : 'No'}\n💳 <b>Wallet:</b> ${user.walletAddress ? user.walletAddress.substring(0, 15) + '...' : 'Not set'}\n\n📊 <b>Withdrawals:</b>\n   ✅ Approved: ${approvedWithdrawals.length}\n   ⏳ Pending: ${pendingWithdrawals.length}\n   ❌ Rejected: ${rejectedWithdrawals.length}`
            );
            await ctx.reply(userMsg, { parse_mode: 'HTML' });
        } else {
            await ctx.reply(formatProfessionalMessage('❌ NOT FOUND', 'User not found.'), { parse_mode: 'HTML' });
        }
        
        adminSessions.delete(userId);
        return;
    }

    // ========== 7. معالجة المستخدم العادي ==========
    const session = userSessions.get(userId);

    if (session?.waitingForWallet) {
        console.log(`💳 Saving wallet for ${userId}`);
        
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText });
            userSessions.delete(userId);
            await sendAndTrack(ctx, formatProfessionalMessage('✅ WALLET SAVED!', `💳 <code>${messageText}</code>\n\n<i>You can now withdraw funds.</i>`), getMainKeyboard(userId));
        } else {
            await sendAndTrack(ctx, formatProfessionalMessage('❌ INVALID ADDRESS', `Please send a valid BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`), getCancelKeyboard());
        }
        return;
    }

    if (session?.waitingForWalletUpdate) {
        console.log(`💳 Updating wallet for ${userId}`);
        
        if (isValidBEP20(messageText)) {
            await updateUser(userId, { walletAddress: messageText });
            userSessions.delete(userId);
            await sendAndTrack(ctx, formatProfessionalMessage('✅ WALLET UPDATED!', `💳 <code>${messageText}</code>`), getMainKeyboard(userId));
        } else {
            await sendAndTrack(ctx, formatProfessionalMessage('❌ INVALID ADDRESS', `Please send a valid BEP20 wallet address.\n\n<i>Example:</i> <code>0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0</code>`), getCancelKeyboard());
        }
        return;
    }
});

// ============================================================================
// 16. 🌐 APIs للتطبيق (Mini App)
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'alive', timestamp: Date.now(), totalUsers: totalUsersCount, firebase: !!db });
});

app.get('/api/config', (req, res) => {
    res.json({
        firebaseConfig: firebaseWebConfig,
        appUrl: APP_URL,
        ownerWallet: OWNER_WALLET,
        config: {
            welcomeBonus: APP_CONFIG.welcomeBonus,
            referralBonus: APP_CONFIG.referralBonus,
            minWithdrawAXC: APP_CONFIG.minWithdrawAXC,
            minWithdrawUSDT: APP_CONFIG.minWithdrawUSDT,
            axcPrice: APP_CONFIG.axcPrice
        }
    });
});

app.get('/api/user/:userId', async (req, res) => {
    if (!checkDb()) return res.json({ success: false, error: 'Database not connected' });

    try {
        const userId = req.params.userId;
        const user = await getOrCreateUser(userId, '', '', null);

        if (!user) return res.json({ success: false, error: 'User not found' });

        res.json({
            success: true,
            user: {
                userId: user.userId,
                userName: user.userName,
                balance: user.balance || 0,
                usdtBalance: user.usdtBalance || 0,
                totalEarned: user.totalEarned || 0,
                inviteCount: user.inviteCount || 0,
                isVerified: user.isVerified || false,
                walletAddress: user.walletAddress || null,
                tonPaid: user.tonPaid || false,
                notifications: (user.notifications || []).slice(0, 30)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/tonconnect-manifest.json', (req, res) => {
    res.json({
        url: APP_URL,
        name: 'Axion AI',
        iconUrl: `${APP_URL}/icon.png`,
        termsOfUseUrl: `${APP_URL}/terms`,
        privacyPolicyUrl: `${APP_URL}/privacy`
    });
});

// ============================================================================
// 17. 🚀 تشغيل الخادم والبوت
// ============================================================================

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🚀 Axion AI Bot Started Successfully'))
    .catch(err => console.error('❌ Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║          AXION AI BOT - PROFESSIONAL v8.0 (COMPLETE)         ║
╠══════════════════════════════════════════════════════════════╣
║  📍 Port: ${PORT}                                             ║
║  🔥 Firebase: ${db ? '✅ Connected' : '❌ Disconnected'}                        ║
║  👑 Admin ID: ${ADMIN_ID ? '✅ Loaded' : '❌ Missing'}                          ║
║  🔐 Admin Password: ${ADMIN_PASSWORD ? '✅ Loaded' : '❌ Missing'}               ║
║  🤖 Bot: ${BOT_TOKEN ? '✅ Running' : '❌ Missing'}                             ║
║  📊 Total Users: ${totalUsersCount}                                    ║
║  💸 Withdrawal Group: ${WITHDRAWAL_GROUP_ID ? '✅ Set' : '❌ Not set'}                 ║
║  🎁 Welcome Bonus: ${APP_CONFIG.welcomeBonus} AXC                               ║
║  👥 Referral Bonus: ${APP_CONFIG.referralBonus} AXC                             ║
║  💎 Min Withdraw AXC: ${APP_CONFIG.minWithdrawAXC} AXC                          ║
║  💵 Min Withdraw USDT: $${APP_CONFIG.minWithdrawUSDT}                           ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// ============================================================================
// نهاية الملف 🎯
// ============================================================================
