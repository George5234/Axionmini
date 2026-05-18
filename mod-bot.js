// ============================================================================
// AXION AI - MODERATION BOT v2.0 (LEGENDARY EDITION)
// ============================================================================
// Smart moderation | Auto mute | Admin panel | Professional responses
// ============================================================================

const { Telegraf } = require('telegraf');

// ============================================================================
// 1. 🔐 CONFIGURATION
// ============================================================================

const MOD_BOT_TOKEN = process.env.MOD_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // من Render

if (!MOD_BOT_TOKEN) {
    console.error('❌ MOD_BOT_TOKEN not found in environment variables');
    process.exit(1);
}

const bot = new Telegraf(MOD_BOT_TOKEN);

// إعدادات البوت
let isBotActive = true;
let autoDeleteEnabled = true;
let autoMuteEnabled = true;
let welcomeEnabled = true;

// تخزين المستخدمين المكتومين
const mutedUsers = new Map();

// ============================================================================
// 2. 📋 KEYWORDS LISTS
// ============================================================================

// كلمات تستحق كتم فوري + حذف
const MUTE_IMMEDIATELY_WORDS = [
    "scam", "fake", "fuck", "bio", "sex", "porn", "nude", "naked", "xxx", "adult",
    "cum", "dick", "cock", "pussy", "ass", "bitch", "whore", "slut", "fag", "nigga", "nigger",
    "تسجيل دخول", "ضاعف رصيدك", "هيدروليك", "اختراق", "تحويل أموال", "سبام"
];

// كلمات تحذير + حذف
const WARN_WORDS = [
    "spam", "free money", "click here", "اربح بسرعة", "مجاني", "ربح سريع", "رابط"
];

// كلمات حذف فقط
const DELETE_ONLY_WORDS = [
    "http://", "https://", "www.", ".com", ".net", ".org", ".io", ".xyz"
];

// المعرفات المسموحة
const ALLOWED_USERNAMES = [
    "@AxionAiSignal", "@AxionAiSignals", "@Airdrop_MasterVIP", "@Daily_AirdropX",
    "@AxionAiSwap", "@AxionAiSupport"
];

// ============================================================================
// 3. 🧠 SMART AUTO-RESPONSES (Professional)
// ============================================================================

const SMART_RESPONSES = [
    {
        keywords: ["withdraw", "سحب", "withdrawal", "how to withdraw"],
        response: `💸 <b>Withdrawal Guide</b>\n\n• Open @AxionAiBot\n• Click WITHDRAW button\n• Choose AXC or USDT\n• Enter amount\n\n💰 Minimum: 1000 AXC or 10 USDT\n⏳ Processing: 1-12 hours`
    },
    {
        keywords: ["referral", "إحالة", "invite", "refer", "دعوة"],
        response: `🔗 <b>Referral Program</b>\n\n• Get 100 AXC per referral\n• Your referrals must verify channels\n• Milestone rewards up to 50 USDT\n\n📌 Get your link from @AxionAiBot → REFERRAL button`
    },
    {
        keywords: ["balance", "رصيد", "how much", "كم معي"],
        response: `💰 <b>Check Your Balance</b>\n\nOpen @AxionAiBot and click BALANCE button to see:\n• AXC balance\n• USDT balance\n• Referral count\n• Total earned`
    },
    {
        keywords: ["swap", "exchange", "convert", "تبديل", "سواب"],
        response: `🔄 <b>Swap AXC to USDT</b>\n\n1. Open @AxionAiBot\n2. Click SWAP STATION\n3. Connect TON wallet (one-time 0.05 TON)\n4. Enter amount and confirm\n\n⚡ Instant • Secure • Best rate`
    },
    {
        keywords: ["price", "سعر", "axc price", "token price"],
        response: `📈 <b>AXC Price</b>\n\n1 AXC = $0.0099 USDT\n\n💎 Total supply: 1,000,000 AXC\n🔥 Deflationary token with buyback mechanism`
    },
    {
        keywords: ["verify", "verification", "تحقق", "توثيق"],
        response: `✅ <b>Verification Guide</b>\n\n1️⃣ Join all required channels\n2️⃣ Click VERIFY button in @AxionAiBot\n3️⃣ Get 100 AXC bonus!\n\n🔓 Unlocks withdrawals and swaps`
    },
    {
        keywords: ["contract", "address", "عقد", "عنوان العقد", "ca"],
        response: `📜 <b>Axion AI Contract Address (BEP20)</b>\n\n<code>0x7aeA114ce8488B01f1254e1CA22786A8eea938a1</code>\n\n⚠️ Always verify the contract address before sending funds!`
    },
    {
        keywords: ["trust wallet", "trust", "wallet", "محفظة", "تريست"],
        response: `🔐 <b>Recommended Wallet: Trust Wallet</b>\n\n📥 Download: https://trustwallet.com\n\n✅ Supports BEP20 tokens (AXC, USDT)\n✅ Secure and easy to use\n✅ Built-in DApp browser`
    },
    {
        keywords: ["help", "مساعدة", "مشكلة", "issue", "problem"],
        response: `🆘 <b>Need Help?</b>\n\n📌 Common solutions:\n• Must verify channels first\n• Minimum withdrawal 1000 AXC\n• Swap requires 0.05 TON activation\n\n👑 Contact admin: Support will assist you`
    },
    {
        keywords: ["rules", "قوانين", "شروط"],
        response: `📜 <b>Community Rules</b>\n\n1️⃣ No spam or flood\n2️⃣ No external links\n3️⃣ No inappropriate content\n4️⃣ No mentions without reason\n5️⃣ Respect all members\n\n⚠️ Violations may result in mute or ban`
    },
    {
        keywords: ["سؤال", "استفسار", "question"],
        response: `💡 <b>Quick Answers</b>\n\n• Withdrawal: Click WITHDRAW in @AxionAiBot\n• Check balance: BALANCE button\n• Get referral link: REFERRAL button\n• Swap AXC: SWAP STATION button\n\n📖 Type "help" for more info`
    }
];

// ============================================================================
// 4. 🛠️ HELPER FUNCTIONS
// ============================================================================

// البحث عن كلمة داخل النص
function containsWord(text, words) {
    const lowerText = text.toLowerCase();
    return words.some(word => lowerText.includes(word.toLowerCase()));
}

// البحث عن منشن غير مسموح
function containsBadMention(text) {
    const mentions = text.match(/@[a-zA-Z0-9_]+/g);
    if (!mentions) return false;
    return mentions.some(m => !ALLOWED_USERNAMES.includes(m));
}

// الحصول على رد تلقائي ذكي
function getSmartResponse(text) {
    const lowerText = text.toLowerCase();
    for (const item of SMART_RESPONSES) {
        for (const keyword of item.keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                return item.response;
            }
        }
    }
    return null;
}

// كتم مستخدم
async function muteUser(ctx, userId, duration = null) {
    try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false
        });
        
        if (duration) {
            mutedUsers.set(userId, setTimeout(() => {
                unmuteUser(ctx, userId);
            }, duration));
        }
        
        return true;
    } catch (error) {
        console.error('Mute error:', error.message);
        return false;
    }
}

// فك الكتم عن مستخدم
async function unmuteUser(ctx, userId) {
    try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true
        });
        mutedUsers.delete(userId);
        console.log(`🔓 Unmuted user ${userId}`);
    } catch (error) {
        console.error('Unmute error:', error.message);
    }
}

// ============================================================================
// 5. 🚫 PRIVATE CHAT HANDLER (للمستخدم العادي)
// ============================================================================

bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const isAdminUser = (userId === ADMIN_ID);
    
    if (isAdminUser) {
        // مشرف → لوحة تحكم كاملة
        const adminMenu = `
╔══════════════════════════════════╗
║      🛡️ <b>MODERATION PANEL</b>       ║
╠══════════════════════════════════╣
║                                    ║
║  📊 <b>Bot Status</b>               ║
║  • Moderation: ${isBotActive ? '🟢 ACTIVE' : '🔴 OFF'}     ║
║  • Auto-Delete: ${autoDeleteEnabled ? '🟢 ON' : '🔴 OFF'}   ║
║  • Auto-Mute: ${autoMuteEnabled ? '🟢 ON' : '🔴 OFF'}      ║
║  • Welcome: ${welcomeEnabled ? '🟢 ON' : '🔴 OFF'}        ║
║                                    ║
╠══════════════════════════════════╣
║  👇 <b>Click a button to control</b> ║
╚══════════════════════════════════╝
        `;
        
        const keyboard = {
            inline_keyboard: [
                [{ text: isBotActive ? '🔴 STOP BOT' : '🟢 START BOT', callback_data: 'toggle_bot' }],
                [{ text: autoDeleteEnabled ? '🚫 DISABLE AUTO-DELETE' : '✅ ENABLE AUTO-DELETE', callback_data: 'toggle_delete' }],
                [{ text: autoMuteEnabled ? '🔇 DISABLE AUTO-MUTE' : '🔊 ENABLE AUTO-MUTE', callback_data: 'toggle_mute' }],
                [{ text: welcomeEnabled ? '📢 DISABLE WELCOME' : '🎉 ENABLE WELCOME', callback_data: 'toggle_welcome' }],
                [{ text: '📊 STATISTICS', callback_data: 'stats' }],
                [{ text: '📋 RULES', callback_data: 'rules' }]
            ]
        };
        
        await ctx.reply(adminMenu, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
        // مستخدم عادي → رسالة رفض مهذبة
        const message = `
╔══════════════════════════════════╗
║         🤖 <b>Moderation Bot</b>        ║
╠══════════════════════════════════╣
║                                    ║
║  This bot is for group moderation  ║
║  only and does not support private ║
║  conversations.                    ║
║                                    ║
║  📌 Please join our group:         ║
║  @AxionAiOfficial                  ║
║                                    ║
║  ❤️ Thank you for understanding    ║
║                                    ║
╚══════════════════════════════════╝
        `;
        await ctx.reply(message, { parse_mode: 'HTML' });
    }
});

// ============================================================================
// 6. 👑 ADMIN PANEL CALLBACKS
// ============================================================================

bot.action('toggle_bot', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery('⛔ Unauthorized');
    
    isBotActive = !isBotActive;
    const status = isBotActive ? '🟢 Bot Activated' : '🔴 Bot Deactivated';
    await ctx.answerCbQuery(status);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [
        [{ text: isBotActive ? '🔴 STOP BOT' : '🟢 START BOT', callback_data: 'toggle_bot' }],
        [{ text: autoDeleteEnabled ? '🚫 DISABLE AUTO-DELETE' : '✅ ENABLE AUTO-DELETE', callback_data: 'toggle_delete' }],
        [{ text: autoMuteEnabled ? '🔇 DISABLE AUTO-MUTE' : '🔊 ENABLE AUTO-MUTE', callback_data: 'toggle_mute' }],
        [{ text: welcomeEnabled ? '📢 DISABLE WELCOME' : '🎉 ENABLE WELCOME', callback_data: 'toggle_welcome' }],
        [{ text: '📊 STATISTICS', callback_data: 'stats' }],
        [{ text: '📋 RULES', callback_data: 'rules' }]
    ] });
});

bot.action('toggle_delete', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery('⛔ Unauthorized');
    
    autoDeleteEnabled = !autoDeleteEnabled;
    const status = autoDeleteEnabled ? '✅ Auto-Delete Enabled' : '❌ Auto-Delete Disabled';
    await ctx.answerCbQuery(status);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [
        [{ text: isBotActive ? '🔴 STOP BOT' : '🟢 START BOT', callback_data: 'toggle_bot' }],
        [{ text: autoDeleteEnabled ? '🚫 DISABLE AUTO-DELETE' : '✅ ENABLE AUTO-DELETE', callback_data: 'toggle_delete' }],
        [{ text: autoMuteEnabled ? '🔇 DISABLE AUTO-MUTE' : '🔊 ENABLE AUTO-MUTE', callback_data: 'toggle_mute' }],
        [{ text: welcomeEnabled ? '📢 DISABLE WELCOME' : '🎉 ENABLE WELCOME', callback_data: 'toggle_welcome' }],
        [{ text: '📊 STATISTICS', callback_data: 'stats' }],
        [{ text: '📋 RULES', callback_data: 'rules' }]
    ] });
});

bot.action('toggle_mute', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery('⛔ Unauthorized');
    
    autoMuteEnabled = !autoMuteEnabled;
    const status = autoMuteEnabled ? '🔊 Auto-Mute Enabled' : '🔇 Auto-Mute Disabled';
    await ctx.answerCbQuery(status);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [
        [{ text: isBotActive ? '🔴 STOP BOT' : '🟢 START BOT', callback_data: 'toggle_bot' }],
        [{ text: autoDeleteEnabled ? '🚫 DISABLE AUTO-DELETE' : '✅ ENABLE AUTO-DELETE', callback_data: 'toggle_delete' }],
        [{ text: autoMuteEnabled ? '🔇 DISABLE AUTO-MUTE' : '🔊 ENABLE AUTO-MUTE', callback_data: 'toggle_mute' }],
        [{ text: welcomeEnabled ? '📢 DISABLE WELCOME' : '🎉 ENABLE WELCOME', callback_data: 'toggle_welcome' }],
        [{ text: '📊 STATISTICS', callback_data: 'stats' }],
        [{ text: '📋 RULES', callback_data: 'rules' }]
    ] });
});

bot.action('toggle_welcome', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery('⛔ Unauthorized');
    
    welcomeEnabled = !welcomeEnabled;
    const status = welcomeEnabled ? '🎉 Welcome Messages Enabled' : '📢 Welcome Messages Disabled';
    await ctx.answerCbQuery(status);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [
        [{ text: isBotActive ? '🔴 STOP BOT' : '🟢 START BOT', callback_data: 'toggle_bot' }],
        [{ text: autoDeleteEnabled ? '🚫 DISABLE AUTO-DELETE' : '✅ ENABLE AUTO-DELETE', callback_data: 'toggle_delete' }],
        [{ text: autoMuteEnabled ? '🔇 DISABLE AUTO-MUTE' : '🔊 ENABLE AUTO-MUTE', callback_data: 'toggle_mute' }],
        [{ text: welcomeEnabled ? '📢 DISABLE WELCOME' : '🎉 ENABLE WELCOME', callback_data: 'toggle_welcome' }],
        [{ text: '📊 STATISTICS', callback_data: 'stats' }],
        [{ text: '📋 RULES', callback_data: 'rules' }]
    ] });
});

bot.action('stats', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery('⛔ Unauthorized');
    
    const stats = `
📊 <b>Moderation Statistics</b>

🛡️ <b>Current Status:</b>
• Bot Active: ${isBotActive ? '✅' : '❌'}
• Auto-Delete: ${autoDeleteEnabled ? '✅' : '❌'}
• Auto-Mute: ${autoMuteEnabled ? '✅' : '❌'}
• Welcome: ${welcomeEnabled ? '✅' : '❌'}

👥 <b>Actions:</b>
• Muted users: ${mutedUsers.size}

📋 <b>Rules:</b>
• No spam or flood
• No external links
• No inappropriate content
• Respect all members
    `;
    
    await ctx.answerCbQuery();
    await ctx.reply(stats, { parse_mode: 'HTML' });
});

bot.action('rules', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery('⛔ Unauthorized');
    
    const rules = `
╔══════════════════════════════════╗
║         📜 <b>GROUP RULES</b>          ║
╠══════════════════════════════════╣
║                                    ║
║  1️⃣ <b>No Spam</b>                  ║
║     • Don't flood the chat         ║
║     • No repetitive messages       ║
║                                    ║
║  2️⃣ <b>No External Links</b>        ║
║     • No promotion                 ║
║     • No suspicious links          ║
║                                    ║
║  3️⃣ <b>No Inappropriate Content</b> ║
║     • No NSFW                      ║
║     • No offensive language        ║
║                                    ║
║  4️⃣ <b>Respect Members</b>           ║
║     • Be kind                      ║
║     • No harassment                ║
║                                    ║
║  5️⃣ <b>No Unauthorized Mentions</b>  ║
║     • Ask before tagging           ║
║                                    ║
╠══════════════════════════════════╣
║  ⚠️ Violations = Mute or Ban       ║
╚══════════════════════════════════╝
    `;
    
    await ctx.answerCbQuery();
    await ctx.reply(rules, { parse_mode: 'HTML' });
});

// ============================================================================
// 7. 🛡️ GROUP MODERATION (CORE)
// ============================================================================

bot.on('text', async (ctx) => {
    const isGroup = ctx.chat.type === 'supergroup' || ctx.chat.type === 'group';
    if (!isGroup) return;
    if (!isBotActive) return;
    if (ctx.message.text.startsWith('/')) return;
    
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const userFirstName = ctx.from.first_name;
    const username = ctx.from.username || userFirstName;
    
    // ========== 1. كلمات تستحق كتم فوري ==========
    if (autoMuteEnabled && containsWord(text, MUTE_IMMEDIATELY_WORDS)) {
        await ctx.deleteMessage();
        await muteUser(ctx, userId);
        await ctx.reply(`🔇 <b>User ${userFirstName} has been muted!</b>\n\nReason: Inappropriate content\n\n⏳ Muted permanently until admin unmutes.`, { parse_mode: 'HTML' });
        
        // إرسال تقرير للمشرف
        if (ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID, `🔴 <b>Moderation Alert</b>\n\nUser: ${userFirstName}\nID: ${userId}\nAction: Permanently muted\nReason: Inappropriate words\nGroup: ${ctx.chat.title}`, { parse_mode: 'HTML' });
        }
        return;
    }
    
    // ========== 2. كلمات تحذير + حذف ==========
    if (autoDeleteEnabled && containsWord(text, WARN_WORDS)) {
        await ctx.deleteMessage();
        await ctx.reply(`⚠️ <b>Warning!</b>\n\n@${username}, please avoid spam messages.\n\n📌 Read the group rules: /rules`, { parse_mode: 'HTML' });
        return;
    }
    
    // ========== 3. روابط خارجية ==========
    if (autoDeleteEnabled && containsWord(text, DELETE_ONLY_WORDS)) {
        await ctx.deleteMessage();
        await ctx.reply(`🚫 <b>Links are not allowed!</b>\n\n@${username}, please do not share external links.`, { parse_mode: 'HTML' });
        return;
    }
    
    // ========== 4. منشن غير مسموح ==========
    if (autoDeleteEnabled && containsBadMention(text)) {
        await ctx.deleteMessage();
        await ctx.reply(`🔇 <b>Mentions are not allowed!</b>\n\n@${username}, please do not mention other users unnecessarily.`, { parse_mode: 'HTML' });
        return;
    }
    
    // ========== 5. ردود تلقائية ذكية ==========
    const response = getSmartResponse(text);
    if (response) {
        await ctx.reply(response, { parse_mode: 'HTML' });
    }
});

// ============================================================================
// 8. 👋 WELCOME NEW MEMBERS
// ============================================================================

bot.on('new_chat_members', async (ctx) => {
    if (!welcomeEnabled) return;
    
    for (const member of ctx.message.new_chat_members) {
        if (member.id === bot.botInfo.id) continue;
        
        const welcomeMessage = `
╔══════════════════════════════════╗
║     ✨ <b>Welcome to Axion AI!</b> ✨     ║
╠══════════════════════════════════╣
║                                    ║
║  👤 <b>${member.first_name}</b> joined!     ║
║                                    ║
║  🚀 <b>Get Started:</b>              ║
║  • Join required channels          ║
║  • Verify in @AxionAiBot           ║
║  • Get 100 AXC bonus!              ║
║                                    ║
║  📌 <b>Rules:</b>                    ║
║  • No spam                         ║
║  • No links                        ║
║  • Respect everyone                ║
║                                    ║
║  💡 Type <b>help</b> for assistance    ║
║                                    ║
╚══════════════════════════════════╝
        `;
        
        await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
    }
});

// ============================================================================
// 9. 🚀 START BOT
// ============================================================================

bot.launch().then(() => {
    console.log(`
╔════════════════════════════════════════╗
║     AXION AI - MODERATION BOT v2.0     ║
╠════════════════════════════════════════╣
║  🛡️ Status: Active                     ║
║  🤖 Moderation: Ready                  ║
║  📊 Smart Responses: Ready             ║
║  👑 Admin Mode: ${ADMIN_ID ? 'Configured' : 'Not Set'}     ║
╚════════════════════════════════════════╝
    `);
}).catch(err => console.error('❌ Bot error:', err));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
