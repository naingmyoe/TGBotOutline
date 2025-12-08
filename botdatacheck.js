const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

// ================================================================
// ⚠️ CONFIGURATION (ဒီနေရာကို ပြင်ဆင်ပါ)
// ================================================================

// 1. Outline Manager API URL
const OUTLINE_API_URL = "https://77.83.241.86:14394/V1IZp0KCiiMSph2ROMAxSQ"; 

// 2. Telegram Bot Token
const TELEGRAM_TOKEN = "8085635848:AAFoonUAG2JwDfymgMAp2keb2lJzTRAWDeQ"; 

// 3. Admin User ID
const ADMIN_ID = 1372269701; 

// 4. Plans
const PLANS = {
    'plan_1': { name: '1 Month - 10 GB', days: 30, gb: 10, price: '3,000 MMK' },
    'plan_2': { name: '1 Month - 30 GB', days: 30, gb: 30, price: '7,000 MMK' },
    'plan_3': { name: 'Unlimited Time - 50 GB', days: 999, gb: 50, price: '12,000 MMK' },
    'plan_4': { name: 'Test 1 Day', days: 1, gb: 1, price: '0 MMK' }
};

const PAYMENT_INFO = `
💸 **Payment Methods:**
1️⃣ Kpay: 09253402855 (Naing Myo Zaw)
2️⃣ Wave: 09253402855 (Naing Myo Zaw)

⚠️ ငွေလွှဲပြီးပါက ပြေစာ (Screenshot) ပို့ပေးပါ။
`;

const CHECK_INTERVAL = 10000; 
// ================================================================

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const client = axios.create({ 
    httpsAgent: agent, 
    timeout: 30000, 
    headers: { 'Content-Type': 'application/json' } 
});

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userStates = {}; 

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

function getFutureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// ================================================================
// 👮‍♂️ PART 1: ADMIN MANAGEMENT COMMANDS (New Features)
// ================================================================

// 1. Admin Panel (/admin)
bot.onText(/\/admin/, (msg) => {
    if (msg.chat.id !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, "👮‍♂️ **Admin Control Panel**", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "👥 List All Users", callback_data: 'admin_list_users' }],
                [{ text: "📊 Server Status", callback_data: 'admin_server_status' }]
            ]
        }
    });
});

// 2. List All Users Command (/users)
bot.onText(/\/users/, async (msg) => {
    if (msg.chat.id !== ADMIN_ID) return;
    await sendUserList(msg.chat.id);
});

// 3. Manage Specific User (/manage [ID])
bot.onText(/\/manage (.+)/, async (msg, match) => {
    if (msg.chat.id !== ADMIN_ID) return;
    const keyId = match[1].trim();
    await sendKeyDetails(msg.chat.id, keyId);
});

// Helper: Send User List
async function sendUserList(chatId) {
    bot.sendMessage(chatId, "⏳ Fetching users...");
    try {
        const res = await client.get(`${OUTLINE_API_URL}/access-keys`);
        const keys = res.data.accessKeys;
        
        let message = "👥 **User List**\n(Copy ID to manage)\n\n";
        keys.forEach(k => {
            // ID ကိုနှိပ်လိုက်ရင် /manage ID ဆိုပြီး Auto ဖြစ်အောင်လုပ်ထားသည်
            message += `🆔 \`${k.id}\` : ${k.name}\n👉 /manage_${k.id}\n\n`;
        });

        // Message ရှည်လွန်းရင် Error တက်နိုင်လို့ Split လုပ်သင့်ပေမယ့် အခုလောလောဆယ် Simple ထားပါမယ်
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, "❌ Error fetching list.");
    }
}

// Helper: Send Key Details & Delete Button
async function sendKeyDetails(chatId, keyId) {
    try {
        const [keysRes, metricsRes] = await Promise.all([
            client.get(`${OUTLINE_API_URL}/access-keys`),
            client.get(`${OUTLINE_API_URL}/metrics/transfer`)
        ]);
        
        const key = keysRes.data.accessKeys.find(k => k.id == keyId);
        if (!key) {
            return bot.sendMessage(chatId, "❌ Key ID not found.");
        }

        const usage = metricsRes.data.bytesTransferredByUserId[keyId] || 0;
        const limit = key.dataLimit ? key.dataLimit.bytes : 0;

        const msg = `
👮‍♂️ **Manage User**
-------------------
🆔 ID: \`${key.id}\`
👤 Name: ${key.name}
📊 Used: ${formatBytes(usage)}
💾 Limit: ${formatBytes(limit)}
-------------------
`;
        bot.sendMessage(chatId, msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🗑️ DELETE KEY", callback_data: `confirm_delete_${key.id}` }]
                ]
            }
        });

    } catch (e) {
        bot.sendMessage(chatId, "❌ Error fetching details.");
    }
}

// ================================================================
// 🤖 PART 2: SHOP & USER INTERACTION
// ================================================================

bot.onText(/\/start/, (msg) => {
    // Admin အတွက် Button ပိုပြပေးမယ်
    const buttons = [
        [{ text: "🛒 Buy VPN Key", callback_data: 'buy_vpn' }],
        [{ text: "👤 My Account", callback_data: 'check_status' }],
        [{ text: "🆘 Contact Admin", url: 'https://t.me/unpatchpos' }]
    ];
    
    if (msg.chat.id === ADMIN_ID) {
        buttons.push([{ text: "👮‍♂️ Admin Panel", callback_data: 'admin_panel' }]);
    }

    bot.sendMessage(msg.chat.id, "👋 Welcome to VPN Shop!", {
        reply_markup: { inline_keyboard: buttons }
    });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    const userFirstName = callbackQuery.from.first_name;

    // --- ADMIN ACTIONS ---
    if (chatId === ADMIN_ID) {
        if (data === 'admin_panel' || data === 'admin_list_users') {
            await sendUserList(chatId);
        }
        
        // Handle /manage_ID clicks (From list)
        if (data.startsWith('confirm_delete_')) {
            const keyId = data.split('_')[2];
            // Ask for Double Confirmation
            bot.editMessageText(`⚠️ **Are you sure you want to delete Key ID: ${keyId}?**\nThis action cannot be undone.`, {
                chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ YES, DELETE", callback_data: `do_delete_${keyId}` }],
                        [{ text: "❌ Cancel", callback_data: `cancel_delete` }]
                    ]
                }
            });
        }

        if (data.startsWith('do_delete_')) {
            const keyId = data.split('_')[2];
            try {
                await client.delete(`${OUTLINE_API_URL}/access-keys/${keyId}`);
                bot.editMessageText(`✅ **Key ID ${keyId} deleted successfully.**`, {
                    chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown'
                });
            } catch (e) {
                bot.sendMessage(chatId, "❌ Failed to delete key.");
            }
        }

        if (data === 'cancel_delete') {
            bot.deleteMessage(chatId, msg.message_id);
        }
    }

    // Handle /manage_ command logic from text (Alternative to button)
    // Note: The logic for /manage text command is handled in bot.onText above.
    
    // --- USER ACTIONS ---
    if (data === 'buy_vpn') {
        const keyboard = Object.keys(PLANS).map(key => [{ text: `${PLANS[key].name} - ${PLANS[key].price}`, callback_data: `select_${key}` }]);
        bot.editMessageText("📅 **Choose Plan:**", { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }

    if (data === 'check_status') {
        await checkUserStatus(chatId, userFirstName);
    }

    if (data.startsWith('select_')) {
        const planKey = data.replace('select_', '');
        userStates[chatId] = { status: 'WAITING_SLIP', plan: PLANS[planKey], name: userFirstName };
        bot.sendMessage(chatId, `✅ **Selected:** ${PLANS[planKey].name}\n💰 **Price:** ${PLANS[planKey].price}\n\n${PAYMENT_INFO}`, { parse_mode: 'Markdown' });
    }

    if (data.startsWith('approve_')) {
        const buyerId = data.split('_')[1];
        if (userStates[buyerId]) {
            const { plan, name } = userStates[buyerId];
            bot.editMessageCaption(`✅ **Approved**`, { chat_id: ADMIN_ID, message_id: msg.message_id });
            const newKey = await createKeyForUser(buyerId, plan, name);
            if (newKey) {
                bot.sendMessage(buyerId, `🎉 **Success!**\nKey: \`${newKey.accessUrl}\``, { parse_mode: 'Markdown' });
                delete userStates[buyerId];
            }
        }
    }

    if (data.startsWith('reject_')) {
        const buyerId = data.split('_')[1];
        bot.editMessageCaption(`❌ **Rejected**`, { chat_id: ADMIN_ID, message_id: msg.message_id });
        bot.sendMessage(buyerId, "❌ Payment Rejected.");
        delete userStates[buyerId];
    }
});

// Admin Command to handle clickable links like /manage_123
bot.onText(/\/manage_(.+)/, async (msg, match) => {
    if (msg.chat.id !== ADMIN_ID) return;
    const keyId = match[1];
    await sendKeyDetails(msg.chat.id, keyId);
});

// Slip Handler
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (userStates[chatId] && userStates[chatId].status === 'WAITING_SLIP') {
        bot.sendMessage(chatId, "📩 Slip Received. Please wait.");
        bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
            caption: `💰 Order: ${userStates[chatId].name} | ${userStates[chatId].plan.name}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `approve_${chatId}` }, { text: "❌ Reject", callback_data: `reject_${chatId}` }]] }
        });
    }
});

// Logic Functions
async function checkUserStatus(chatId, firstName) {
    try {
        const res = await client.get(`${OUTLINE_API_URL}/access-keys`);
        const myKey = res.data.accessKeys.find(k => k.name.startsWith(firstName));
        if (!myKey) return bot.sendMessage(chatId, "❌ Account Not Found.");
        
        // Simple usage check
        const metricRes = await client.get(`${OUTLINE_API_URL}/metrics/transfer`);
        const used = metricRes.data.bytesTransferredByUserId[myKey.id] || 0;
        const limit = myKey.dataLimit ? myKey.dataLimit.bytes : 0;
        
        bot.sendMessage(chatId, `👤 **${myKey.name}**\nUsed: ${formatBytes(used)} / ${formatBytes(limit)}`);
    } catch (e) { bot.sendMessage(chatId, "⚠️ Error."); }
}

async function createKeyForUser(userId, plan, userName) {
    try {
        const expireDate = getFutureDate(plan.days);
        const name = `${userName.replace(/\|/g, '').trim()} | ${expireDate}`;
        const limit = plan.gb * 1024 * 1024 * 1024;
        
        const res = await client.post(`${OUTLINE_API_URL}/access-keys`);
        await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/name`, { name });
        await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/data-limit`, { limit: { bytes: limit } });
        return { accessUrl: res.data.accessUrl, expireDate };
    } catch (e) { return null; }
}

// Auto Guardian
async function runGuardian() {
    try {
        const [kRes, mRes] = await Promise.all([client.get(`${OUTLINE_API_URL}/access-keys`), client.get(`${OUTLINE_API_URL}/metrics/transfer`)]);
        const keys = kRes.data.accessKeys;
        const usage = mRes.data.bytesTransferredByUserId || {};
        const today = new Date().toISOString().split('T')[0];

        for (const k of keys) {
            const lim = k.dataLimit ? k.dataLimit.bytes : 0;
            if (lim > 0 && lim <= 5000) continue; // Already blocked
            
            let block = false;
            // Check Date
            if (k.name.includes('|')) {
                const d = k.name.split('|')[1].trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < today) block = true;
            }
            // Check Data
            if (!block && lim > 5000 && (usage[k.id] || 0) >= lim) block = true;

            if (block) {
                console.log(`Blocking ${k.name}`);
                await client.put(`${OUTLINE_API_URL}/access-keys/${k.id}/data-limit`, { limit: { bytes: 1 } });
                bot.sendMessage(ADMIN_ID, `🚫 **Auto-Blocked:** ${k.name}`, {parse_mode: 'Markdown'});
            }
        }
    } catch (e) { console.error("Guardian Error"); }
}

// Start
runGuardian();
setInterval(runGuardian, CHECK_INTERVAL);
console.log("🚀 Bot Started with Admin Panel");
