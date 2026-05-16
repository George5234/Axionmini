// ==================== 1. المكتبات والتهيئة الأساسية ====================
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fs = require('fs');

// ==================== 2. تحميل الأسرار من Render Secrets ====================
let ADMIN_ID = null;
let ADMIN_PASSWORD = null;
let BOT_TOKEN = null;
let WITHDRAWAL_GROUP_ID = null;
let serviceAccount = null;

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

// ==================== 3. تهيئة Firebase ====================
let db = null;
if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log('🔥 Firebase Admin SDK initialized');
}

// ==================== 4. إعدادات البوت الأساسية ====================
const bot = new Telegraf(BOT_TOKEN);

// القنوات الإجبارية (يجب أن يكون البوت مشرفاً فيها)
const REQUIRED_CHANNELS = [
    { name: 'Axion AI Signal', username: '@AxionAiSignal' },
    { name: 'Axion AI Signals', username: '@AxionAiSignals' },
    { name: 'Airdrop Master VIP', username: '@Airdrop_MasterVIP' },
    { name: 'Daily Airdrop X', username: '@Daily_AirdropX' }
];

const WELCOME_BONUS = 100;      // 100 AXC (~$1)
const REFERRAL_BONUS = 100;     // 100 AXC (~$1)
const MIN_WITHDRAW = 1000;      // 1000 AXC (~$10)
const AXC_PRICE = 0.0099;       // السعر بالدولار

// كاش آخر رسالة لكل مستخدم (لحذفها لاحقاً)
const userLastMessages = new Map();

// ==================== 5. دوال مساعدة أساسية ====================
function formatAXC(amount) {
    const usd = (amount * AXC_PRICE).toFixed(2);
    return `${amount} AXC (~$${usd})`;
}

// عداد إحالات منفصل (لمسة توفير التكاليف)
async function incrementReferralCount(referrerId) {
    if (!db) return;
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
}

// حذف آخر رسالة للمستخدم (اللمسة الاحترافية)
async function deleteLastMessage(ctx) {
    const lastMsgId = userLastMessages.get(ctx.from.id);
    if (lastMsgId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastMsgId);
        } catch (e) { /* تجاهل */ }
    }
}

// إرسال رسالة وتخزين معرفها للحذف لاحقاً
async function sendAndTrack(ctx, message, keyboard = null) {
    await deleteLastMessage(ctx);
    const opts = { parse_mode: 'Markdown' };
    if (keyboard) opts.reply_markup = keyboard;
    const sentMsg = await ctx.reply(message, opts);
    userLastMessages.set(ctx.from.id, sentMsg.message_id);
    return sentMsg;
}

// التحقق من عضوية القنوات
async function checkAllChannels(userId) {
    for (const channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.telegram.getChatMember(channel.username, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) {
                return false;
            }
        } catch { return false; }
    }
    return true;
}

// الحصول على القنوات التي لم ينضم إليها المستخدم
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

// ==================== 6. نظام المستخدمين والتسجيل ====================
async function getOrCreateUser(userId, userName, username, referredBy = null) {
    if (!db) return null;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
        return userDoc.data();
    }
    
    // مستخدم جديد
    const newUser = {
        userId: userId,
        userName: userName,
        username: username,
        balance: 0,
        totalEarned: 0,
        inviteCount: 0,
        referredBy: referredBy,
        referrals: [],
        walletAddress: null,
        isVerified: false,
        verifiedAt: null,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };
    
    await userRef.set(newUser);
    console.log(`✅ New user created: ${userId} (${userName})`);
    return newUser;
}

async function updateUser(userId, data) {
    if (!db) return;
    const userRef = db.collection('users').doc(userId);
    await userRef.update(data);
}

// ==================== 7. الأزرار ولوحات المفاتيح ====================
// أزرار القنوات والتحقق (تظهر قبل التحقق)
function getChannelsKeyboard() {
    const keyboard = [];
    for (const channel of REQUIRED_CHANNELS) {
        keyboard.push([{ text: `📢 ${channel.name}`, url: `https://t.me/${channel.username.substring(1)}` }]);
    }
    keyboard.push([{ text: '✅ VERIFY MEMBERSHIP', callback_data: 'verify_membership' }]);
    return { inline_keyboard: keyboard };
}

// لوحة المفاتيح الرئيسية (تظهر بعد التحقق)
function getMainKeyboard() {
    return {
        keyboard: [
            ['💰 BALANCE', '🔗 REFERRAL'],
            ['💸 WITHDRAW']
        ],
        resize_keyboard: true,
        persistent: true
    };
}

// أزرار تأكيد السحب
function getWithdrawConfirmKeyboard(requestId) {
    return {
        inline_keyboard: [
            [{ text: '✅ CONFIRM WITHDRAWAL', callback_data: `confirm_withdraw_${requestId}` }],
            [{ text: '❌ CANCEL', callback_data: 'cancel_withdraw' }]
        ]
    };
}

// ==================== 8. رسالة الترحيب ====================
async function sendWelcomeMessage(ctx, isNewUser = false) {
    const message = `✨ *WELCOME TO AXION AI* ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*The Future of AI-Powered Trading*

Axion is an advanced AI-driven ecosystem that analyzes market trends and delivers real-time trading signals to maximize your crypto profits.

*Why Axion?*
🤖 *AI Analysis* - 24/7 market monitoring
📊 *Real-time Signals* - Trade with confidence
🚀 *Early Access* - Be among the first 10,000 users
💰 *Passive Income* - Grow your AXC tokens daily

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎁 *Get ${formatAXC(WELCOME_BONUS)}* after verification
👥 *Get ${formatAXC(REFERRAL_BONUS)}* per referral
💎 *Minimum Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📢 *Please join our channels to continue:*`;

    await sendAndTrack(ctx, message, getChannelsKeyboard());
}

// ==================== 9. أوامر البوت الأساسية ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name || 'Axion User';
    const username = ctx.from.username || '';
    const referrerId = ctx.startPayload;
    
    // تسجيل أو جلب المستخدم
    let user = await getOrCreateUser(userId, userName, username, referrerId);
    
    // التحقق من وجود إحالة جديدة
    if (referrerId && referrerId !== userId && !user.referredBy) {
        await updateUser(userId, { referredBy: referrerId });
        
        // منح مكافأة الإحالة (بعد التحقق فقط، لذا ننتظر)
        // سنمنحها لاحقاً بعد التحقق الناجح
        user.referredBy = referrerId;
    }
    
    // إذا كان المستخدم قد تحقق مسبقاً، نعرض له اللوحة الرئيسية
    if (user.isVerified) {
        await sendAndTrack(ctx, `✅ *Welcome back, ${userName}!*\n\n💰 *Balance:* ${formatAXC(user.balance)}`, getMainKeyboard());
        return;
    }
    
    // مستخدم جديد أو غير متحقق، نعرض رسالة الترحيب مع أزرار القنوات
    await sendWelcomeMessage(ctx, false);
});

// أمر إحضار الرصيد
bot.hears('💰 BALANCE', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    
    const message = `📊 *YOUR AXION BALANCE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *Total Balance:* ${formatAXC(user.balance || 0)}

👥 *Referrals:* ${user.inviteCount || 0}
🎁 *From Referrals:* ${formatAXC((user.inviteCount || 0) * REFERRAL_BONUS)}

💎 *Minimum Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 *Current AXC Price:* $${AXC_PRICE} USD

👉 *Invite friends to earn more!*`;

    await sendAndTrack(ctx, message, getMainKeyboard());
});

// أمر الإحالة
bot.hears('🔗 REFERRAL', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    
    const link = `https://t.me/${ctx.botInfo.username}?start=${userId}`;
    const message = `🔗 *YOUR REFERRAL LINK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`${link}\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *Referral Stats:*
👥 *Total Referrals:* ${user.inviteCount || 0}
🎁 *Earned:* ${formatAXC((user.inviteCount || 0) * REFERRAL_BONUS)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Share your link and get ${formatAXC(REFERRAL_BONUS)} for each friend who joins!*

👇 *Share on Telegram:*`;

    const shareKeyboard = {
        inline_keyboard: [
            [{ text: '📤 SHARE LINK', url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=Join%20Axion%20AI%20and%20get%20${WELCOME_BONUS}%20AXC%20bonus!` }]
        ]
    };
    
    await sendAndTrack(ctx, message, shareKeyboard);
});

// أمر السحب الرئيسي
bot.hears('💸 WITHDRAW', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    if (!user) return;
    
    // التحقق من وجود عنوان محفظة
    if (!user.walletAddress) {
        const message = `💸 *WITHDRAWAL SETUP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *No wallet address found*

Please send your *BEP20 (BSC) wallet address* to continue.

*Example:* \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *Type or paste your address below:*`;
        
        await sendAndTrack(ctx, message);
        // ندخل في حالة انتظار عنوان المحفظة
        ctx.session = { waitingForWallet: true };
        return;
    }
    
    // التحقق من الرصيد
    if ((user.balance || 0) < MIN_WITHDRAW) {
        const needed = MIN_WITHDRAW - (user.balance || 0);
        const message = `💸 *WITHDRAWAL REQUEST*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ *Insufficient Balance*

📊 *Your Balance:* ${formatAXC(user.balance || 0)}
💰 *Minimum Required:* ${formatAXC(MIN_WITHDRAW)}
🔄 *Need:* ${formatAXC(needed)} more

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Invite ${Math.ceil(needed / REFERRAL_BONUS)} friends to reach the minimum!*`;
        
        await sendAndTrack(ctx, message, getMainKeyboard());
        return;
    }
    
    // كل شيء جاهز، نرسل طلب السحب للمجموعة
    const requestId = `WD_${userId}_${Date.now()}`;
    const message = `💸 *WITHDRAWAL REQUEST*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Request ready for submission!*

📊 *Amount:* ${formatAXC(user.balance || 0)}
💳 *Wallet:* \`${user.walletAddress}\`

⏳ *Processing Time:* 24-48 hours

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👉 *Click CONFIRM to submit your request:*`;

    await sendAndTrack(ctx, message, getWithdrawConfirmKeyboard(requestId));
});

// ==================== 10. معالجة النصوص (عنوان المحفظة) ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    
    // تجاهل الأوامر والأزرار
    if (text.startsWith('/') || ['💰 BALANCE', '🔗 REFERRAL', '💸 WITHDRAW'].includes(text)) return;
    
    // معالجة عنوان المحفظة (إذا كنا في وضع الانتظار)
    if (ctx.session?.waitingForWallet) {
        // تحقق بسيط من صيغة عنوان BSC
        if (text.startsWith('0x') && text.length === 42) {
            await updateUser(userId, { walletAddress: text });
            ctx.session.waitingForWallet = false;
            
            const message = `✅ *Wallet address saved!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💳 *Address:* \`${text}\`

You can now request withdrawals from the main menu.

👇 *Click WITHDRAW to continue:*`;
            
            await sendAndTrack(ctx, message, getMainKeyboard());
        } else {
            const message = `❌ *Invalid wallet address!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please send a valid *BEP20 (BSC) wallet address*.

*Example:* \`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *Try again or type /cancel:*`;
            
            await sendAndTrack(ctx, message);
        }
        return;
    }
});

// ==================== 11. نظام التحقق من القنوات ====================
bot.action('verify_membership', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    
    // إذا كان متحققاً مسبقاً
    if (user.isVerified) {
        await sendAndTrack(ctx, `✅ *Already verified!*\n\n💰 *Balance:* ${formatAXC(user.balance)}`, getMainKeyboard());
        return;
    }
    
    const missingChannels = await getMissingChannels(userId);
    
    if (missingChannels.length > 0) {
        // بناء رسالة القنوات الناقصة
        let missingList = '';
        for (const ch of missingChannels) {
            missingList += `• ${ch.name}\n`;
        }
        
        const message = `⚠️ *VERIFICATION INCOMPLETE* ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*You haven't joined all required channels.*

📢 *Missing channels:*
${missingList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👉 *Please join the missing channels above*
👉 *Then click the VERIFY button again*

*Your ${formatAXC(WELCOME_BONUS)} reward is waiting!*`;

        await sendAndTrack(ctx, message, getChannelsKeyboard());
        return;
    }
    
    // التحقق ناجح!
    // منح المكافآت
    let newBalance = WELCOME_BONUS;
    let referredBy = user.referredBy;
    
    // منح مكافأة الإحالة للمُحيل (إذا وجد)
    if (referredBy && referredBy !== userId) {
        const referrerRef = db.collection('users').doc(referredBy);
        const referrerDoc = await referrerRef.get();
        if (referrerDoc.exists) {
            const referrerData = referrerDoc.data();
            const newReferrerBalance = (referrerData.balance || 0) + REFERRAL_BONUS;
            await referrerRef.update({
                balance: newReferrerBalance,
                inviteCount: admin.firestore.FieldValue.increment(1),
                totalEarned: admin.firestore.FieldValue.increment(REFERRAL_BONUS)
            });
            await incrementReferralCount(referredBy);
            
            // إشعار للمُحيل
            try {
                await bot.telegram.sendMessage(referredBy, 
                    `🎉 *NEW REFERRAL!*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *${user.userName}* joined!\n💰 *+${formatAXC(REFERRAL_BONUS)}* added!`,
                    { parse_mode: 'Markdown' }
                );
            } catch(e) {}
        }
    }
    
    // تحديث بيانات المستخدم
    await updateUser(userId, {
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        balance: newBalance,
        totalEarned: newBalance
    });
    
    const message = `✅ *VERIFICATION SUCCESSFUL* ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 *Welcome to the Axion AI family!*

💰 *+${formatAXC(WELCOME_BONUS)}* added to your balance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *Your Balance:* ${formatAXC(newBalance)}
👥 *Your Referrals:* 0
💎 *Min. Withdrawal:* ${formatAXC(MIN_WITHDRAW)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👇 *Use the buttons below to navigate:*`;

    await sendAndTrack(ctx, message, getMainKeyboard());
});

// ==================== 12. نظام السحب ومعالجة الطلبات ====================
bot.action(/confirm_withdraw_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    const requestId = ctx.match[1];
    const user = await getOrCreateUser(userId, '', '');
    await ctx.answerCbQuery();
    
    if (!user || !user.walletAddress) {
        await sendAndTrack(ctx, `❌ *No wallet address found!*\n\nPlease set your wallet first by clicking WITHDRAW.`, getMainKeyboard());
        return;
    }
    
    const amount = user.balance || 0;
    if (amount < MIN_WITHDRAW) {
        await sendAndTrack(ctx, `❌ *Insufficient balance!*\n\nMinimum required: ${formatAXC(MIN_WITHDRAW)}`, getMainKeyboard());
        return;
    }
    
    // خصم الرصيد مؤقتاً
    await updateUser(userId, { balance: 0 });
    
    // تسجيل طلب السحب في Firebase
    const withdrawalRef = db.collection('withdrawals').doc();
    const withdrawalData = {
        id: withdrawalRef.id,
        userId: userId,
        userName: user.userName,
        amount: amount,
        walletAddress: user.walletAddress,
        status: 'pending',
        requestId: requestId,
        createdAt: new Date().toISOString()
    };
    await withdrawalRef.set(withdrawalData);
    
    // إرسال إشعار لمجموعة السحب
    if (WITHDRAWAL_GROUP_ID) {
        const groupMessage = `💸 *NEW WITHDRAWAL REQUEST*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 *User:* ${user.userName} (${userId})
💰 *Amount:* ${formatAXC(amount)}
💳 *Wallet:* \`${user.walletAddress}\`
🆔 *Request ID:* ${withdrawalRef.id}
📅 *Date:* ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Use these commands to process:*
/approve_${withdrawalRef.id}
/reject_${withdrawalRef.id} [reason]`;
        
        try {
            await bot.telegram.sendMessage(WITHDRAWAL_GROUP_ID, groupMessage, { parse_mode: 'Markdown' });
        } catch(e) { console.error('Failed to send to group:', e.message); }
    }
    
    const message = `✅ *WITHDRAWAL REQUEST SUBMITTED!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *Amount:* ${formatAXC(amount)}
💳 *Wallet:* \`${user.walletAddress}\`
🆔 *Request ID:* ${withdrawalRef.id}

⏳ *Processing Time:* 24-48 hours

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*You will be notified once processed.*`;

    await sendAndTrack(ctx, message, getMainKeyboard());
});

bot.action('cancel_withdraw', async (ctx) => {
    await ctx.answerCbQuery();
    await sendAndTrack(ctx, `❌ *Withdrawal cancelled.*\n\nYour balance remains unchanged.`, getMainKeyboard());
});

// ==================== 13. أوامر المشرف (للتحكم اليدوي) ====================
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    const message = `👑 *ADMIN PANEL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *Available Commands:*
/pending - View pending withdrawals
/broadcast [message] - Send announcement
/stats - View bot statistics
/users - Total users count
/verify [user_id] - Manually verify user
/add [user_id] [amount] - Add balance
/remove [user_id] [amount] - Remove balance
/search [user_id] - Search user

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 *To execute commands, authenticate first:*`;
    
    await ctx.reply(message);
});

// معالجة الموافقة والرفض من المجموعة (أوامر مباشرة)
bot.command(/approve_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    const withdrawalId = ctx.match[1];
    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
    const withdrawal = await withdrawalRef.get();
    
    if (!withdrawal.exists || withdrawal.data().status !== 'pending') {
        await ctx.reply(`❌ Withdrawal ${withdrawalId} not found or already processed.`);
        return;
    }
    
    await withdrawalRef.update({ status: 'approved', approvedAt: new Date().toISOString() });
    await ctx.reply(`✅ Withdrawal ${withdrawalId} approved.`);
    
    // إشعار المستخدم
    const data = withdrawal.data();
    try {
        await bot.telegram.sendMessage(data.userId, 
            `✅ *WITHDRAWAL APPROVED!*\n━━━━━━━━━━━━━━━━━━━━━━\n💰 *Amount:* ${formatAXC(data.amount)}\n📅 *Date:* ${new Date().toLocaleString()}\n━━━━━━━━━━━━━━━━━━━━━━\n*Your funds will arrive within 24 hours.*`,
            { parse_mode: 'Markdown' }
        );
    } catch(e) {}
});

bot.command(/reject_(.+)/, async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    
    const withdrawalId = ctx.match[1];
    const reason = ctx.message.text.split(' ').slice(1).join(' ') || 'No reason provided';
    
    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
    const withdrawal = await withdrawalRef.get();
    
    if (!withdrawal.exists || withdrawal.data().status !== 'pending') {
        await ctx.reply(`❌ Withdrawal ${withdrawalId} not found or already processed.`);
        return;
    }
    
    const data = withdrawal.data();
    
    // إعادة الرصيد للمستخدم
    const userRef = db.collection('users').doc(data.userId);
    await userRef.update({ balance: admin.firestore.FieldValue.increment(data.amount) });
    
    await withdrawalRef.update({ status: 'rejected', rejectReason: reason, rejectedAt: new Date().toISOString() });
    await ctx.reply(`❌ Withdrawal ${withdrawalId} rejected. Reason: ${reason}`);
    
    // إشعار المستخدم
    try {
        await bot.telegram.sendMessage(data.userId, 
            `❌ *WITHDRAWAL REJECTED!*\n━━━━━━━━━━━━━━━━━━━━━━\n💰 *Amount:* ${formatAXC(data.amount)}\n📝 *Reason:* ${reason}\n━━━━━━━━━━━━━━━━━━━━━━\n*The amount has been returned to your balance.*`,
            { parse_mode: 'Markdown' }
        );
    } catch(e) {}
});

// ==================== 14. تشغيل البوت ====================
bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Axion AI Bot is running...'))
    .catch(err => console.error('Bot error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('✅ Axion AI Bot - Professional Edition Loaded');
