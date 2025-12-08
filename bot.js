const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

// ================================================================
// ⚠️ CONFIGURATION (ဒီနေရာကို အရင်ဆုံး ပြင်ဆင်ပါ)
// ================================================================

// 1. Outline Manager API URL (Secret Key အဆုံးထိပါရမည်)
const OUTLINE_API_URL = "https://77.83.241.86:14394/V1IZp0KCiiMSph2ROMAxSQ"; 

// 2. BotFather မှရသော Token
const TELEGRAM_TOKEN = "8085635848:AAFoonUAG2JwDfymgMAp2keb2lJzTRAWDeQ"; 

// 3. Admin ၏ Telegram User ID (Slip စစ်ရန်နှင့် Key ဖျက်ရန်)
const ADMIN_ID = 1372269701; 

// 4. ရောင်းမည့် Plan များ
const PLANS = {
    'plan_1': { name: '1 Month - 10 GB', days: 30, gb: 10, price: '3,000 MMK' },
    'plan_2': { name: '1 Month - 30 GB', days: 30, gb: 30, price: '7,000 MMK' },
    'plan_3': { name: 'Unlimited Time - 50 GB', days: 999, gb: 50, price: '12,000 MMK' }
};

// 5. ငွေလွှဲလက်ခံမည့် ဖုန်းနံပါတ်များ
const PAYMENT_INFO = `
💸 **Payment Methods:**
1️⃣ Kpay: 09123456789 (Name)
2️⃣ Wave: 09123456789 (Name)

⚠️ ငွေလွှဲပြီးပါက ပြေစာ (Screenshot) ပို့ပေးပါ။
`;

const CHECK_INTERVAL = 10000; // 10 စက္ကန့်တစ်ခါ Auto-Guard အလုပ်လုပ်မယ်
// ================================================================

// SSL Setup
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const client = axios.create({ 
    httpsAgent: agent, 
    timeout: 30000, 
    headers: { 'Content-Type': 'application/json' } 
});

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userStates = {}; 

// --- HELPER FUNCTIONS ---

// 1. Bytes to Readable String
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

// 2. Future Date Calculator
function getFutureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// 3. Progress Bar Generator (Solid Line Style)
function getProgressBar(used, total) {
    if (total === 0) return "ERROR";
    const percentage = Math.min((used / total) * 100, 100);
    
    // Bar Length (10 characters for mobile fit)
    const totalLength = 10; 
    const filledLength = Math.round((percentage / 100) * totalLength);
    const emptyLength = totalLength - filledLength;
    
    // Style: ████░░░░
    const filledChar = '█';
    const emptyChar = '░';
    
    const bar = filledChar.repeat(filledLength) + emptyChar.repeat(emptyLength);
    return `${bar} ${percentage.toFixed(1)}%`;
}

// ================================================================
// 👮‍♂️ ADMIN COMMANDS & LOGIC
// ================================================================

// Admin Panel
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

// Manage Specific User Command
bot.onText(/\/manage (.+)/, async (msg, match) => {
    if (msg.chat.id !== ADMIN_ID) return;
    const keyId = match[1].trim();
    await sendKeyDetails(msg.chat.id, keyId);
});

// Helper: List Users
async function sendUserList(chatId) {
    bot.sendMessage(chatId, "⏳ Fetching users...");
    try {
        const res = await client.get(`${OUTLINE_API_URL}/access-keys`);
        let message = "👥 **User List**\n\n";
        res.data.accessKeys.forEach(k => {
            message += `🆔 \`${k.id}\` : ${k.name}\n👉 /manage_${k.id}\n\n`;
        });
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (e) { bot.sendMessage(chatId, "❌ Error fetching list."); }
}

// Helper: Key Details
async function sendKeyDetails(chatId, keyId) {
    try {
        const [keysRes, metricsRes] = await Promise.all([
            client.get(`${OUTLINE_API_URL}/access-keys`),
            client.get(`${OUTLINE_API_URL}/metrics/transfer`)
        ]);
        const key = keysRes.data.accessKeys.find(k => k.id == keyId);
        if (!key) return bot.sendMessage(chatId, "❌ Key not found.");

        const usage = metricsRes.data.bytesTransferredByUserId[keyId] || 0;
        const limit = key.dataLimit ? key.dataLimit.bytes : 0;

        const msg = `
👮‍♂️ **User Details**
-------------------
👤 Name: ${key.name}
🆔 ID: \`${key.id}\`
📊 Usage: ${formatBytes(usage)}
💾 Limit: ${formatBytes(limit)}
-------------------
`;
        bot.sendMessage(chatId, msg, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🗑️ DELETE KEY", callback_data: `confirm_delete_${key.id}` }]] }
        });
    } catch (e) { bot.sendMessage(chatId, "❌ Error."); }
}

// ================================================================
// 🤖 SHOP & USER INTERACTION
// ================================================================

bot.onText(/\/start/, (msg) => {
    const buttons = [
        [{ text: "🛒 Buy VPN Key", callback_data: 'buy_vpn' }],
        [{ text: "👤 My Account (Check Balance)", callback_data: 'check_status' }],
        [{ text: "🆘 Contact Admin", url: 'https://t.me/YourUsername' }]
    ];
    // Add Admin Button if Admin
    if (msg.chat.id === ADMIN_ID) buttons.push([{ text: "👮‍♂️ Admin Panel", callback_data: 'admin_panel' }]);

    bot.sendMessage(msg.chat.id, "👋 Welcome to VPN Shop!", { reply_markup: { inline_keyboard: buttons } });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    const userFirstName = callbackQuery.from.first_name;

    // --- USER: CHECK STATUS (DASHBOARD) ---
    if (data === 'check_status') {
        bot.sendMessage(chatId, "🔎 Checking account...");
        await checkUserStatus(chatId, userFirstName);
    }

    // --- SHOP: BUY & SELECT PLAN ---
    if (data === 'buy_vpn') {
        const keyboard = Object.keys(PLANS).map(key => [{ text: `${PLANS[key].name} - ${PLANS[key].price}`, callback_data: `select_${key}` }]);
        bot.editMessageText("📅 **Choose Plan:**", { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }

    if (data.startsWith('select_')) {
        const planKey = data.replace('select_', '');
        userStates[chatId] = { status: 'WAITING_SLIP', plan: PLANS[planKey], name: userFirstName };
        bot.sendMessage(chatId, `✅ **Selected:** ${PLANS[planKey].name}\n💰 **Price:** ${PLANS[planKey].price}\n\n${PAYMENT_INFO}`, { parse_mode: 'Markdown' });
    }

    // --- ADMIN ACTIONS ---
    if (chatId === ADMIN_ID) {
        if (data === 'admin_panel' || data === 'admin_list_users') await sendUserList(chatId);
        
        // Delete Logic
        if (data.startsWith('confirm_delete_')) {
            const keyId = data.split('_')[2];
            bot.editMessageText(`⚠️ Delete Key ID: ${keyId}?`, {
                chat_id: chatId, message_id: msg.message_id,
                reply_markup: { inline_keyboard: [[{ text: "✅ YES", callback_data: `do_delete_${keyId}` }, { text: "❌ NO", callback_data: `cancel_delete` }]] }
            });
        }
        if (data.startsWith('do_delete_')) {
            await client.delete(`${OUTLINE_API_URL}/access-keys/${data.split('_')[2]}`);
            bot.editMessageText("✅ Deleted.", { chat_id: chatId, message_id: msg.message_id });
        }
        if (data === 'cancel_delete') bot.deleteMessage(chatId, msg.message_id);

        // Approve Logic
        if (data.startsWith('approve_')) {
            const buyerId = data.split('_')[1];
            if (userStates[buyerId]) {
                const { plan, name } = userStates[buyerId];
                bot.editMessageCaption("✅ Approved", { chat_id: ADMIN_ID, message_id: msg.message_id });
                const newKey = await createKeyForUser(buyerId, plan, name);
                if (newKey) {
                    bot.sendMessage(buyerId, `🎉 **Success!**\n\n👤 Name: ${name}\n📅 Expire: ${newKey.expireDate}\n\n🔗 **Key:**\n\`${newKey.accessUrl}\``, { parse_mode: 'Markdown' });
                    delete userStates[buyerId];
                }
            }
        }
        // Reject Logic
        if (data.startsWith('reject_')) {
            bot.editMessageCaption("❌ Rejected", { chat_id: ADMIN_ID, message_id: msg.message_id });
            bot.sendMessage(data.split('_')[1], "❌ Payment Rejected. Contact Admin.");
        }
    }
});

// Admin Shortcut for /manage_ID links
bot.onText(/\/manage_(.+)/, async (msg, match) => {
    if (msg.chat.id === ADMIN_ID) await sendKeyDetails(msg.chat.id, match[1]);
});

// Slip Photo Handler
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (userStates[chatId] && userStates[chatId].status === 'WAITING_SLIP') {
        bot.sendMessage(chatId, "📩 Slip Received. Waiting for Admin.");
        bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
            caption: `💰 Order: ${userStates[chatId].name} | ${userStates[chatId].plan.name}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `approve_${chatId}` }, { text: "❌ Reject", callback_data: `reject_${chatId}` }]] }
        });
    }
});

// --- CORE FUNCTIONS ---

// 1. Check User Status (Layout & Progress Bar Updated)
async function checkUserStatus(chatId, firstName) {
    try {
        const [kRes, mRes] = await Promise.all([client.get(`${OUTLINE_API_URL}/access-keys`), client.get(`${OUTLINE_API_URL}/metrics/transfer`)]);
        
        // Match Name
        const myKey = kRes.data.accessKeys.find(k => k.name.startsWith(firstName));

        if (!myKey) return bot.sendMessage(chatId, "❌ **Account Not Found**\n(Name mismatch? Contact Admin)");

        const used = mRes.data.bytesTransferredByUserId[myKey.id] || 0;
        const limit = myKey.dataLimit ? myKey.dataLimit.bytes : 0;
        const remaining = limit - used;
        
        // Format Name & Date
        let cleanName = myKey.name;
        let expireDate = "Unknown";
        if (myKey.name.includes('|')) {
            const parts = myKey.name.split('|');
            cleanName = parts[0].trim();
            expireDate = parts[1].trim();
        }

        // Status
        let status = "🟢 Active";
        if (limit > 0 && remaining <= 0) status = "🔴 Data Depleted";
        if (limit <= 5000) status = "🔴 Expired/Blocked";

        // Generate Bar
        const progressBar = getProgressBar(used, limit);

        const msg = `
👤 **Name:** ${cleanName}
📅 **Expire:** ${expireDate}
📡 **Status:** ${status}
⬇️ **Used:** ${formatBytes(used)}
📦 **Total:** ${formatBytes(limit)}
🎁 **Remaining:** ${formatBytes(remaining > 0 ? remaining : 0)}

${progressBar}
`;
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });

    } catch (e) { bot.sendMessage(chatId, "⚠️ Server Error."); }
}

// 2. Create Key
async function createKeyForUser(userId, plan, userName) {
    try {
        const expireDate = getFutureDate(plan.days);
        // Clean name to avoid duplicates/errors
        const name = `${userName.replace(/\|/g, '').trim()} | ${expireDate}`;
        const limit = plan.gb * 1024 * 1024 * 1024;
        
        const res = await client.post(`${OUTLINE_API_URL}/access-keys`);
        await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/name`, { name });
        await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/data-limit`, { limit: { bytes: limit } });
        return { accessUrl: res.data.accessUrl, expireDate };
    } catch (e) { return null; }
}

// 3. Auto Guardian (Background Check)
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
            let reason = "";

            // Check Date
            if (k.name.includes('|')) {
                const d = k.name.split('|')[1].trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < today) {
                    block = true;
                    reason = "EXPIRED";
                }
            }
            // Check Data
            if (!block && lim > 5000 && (usage[k.id] || 0) >= lim) {
                block = true;
                reason = "DATA LIMIT";
            }

            if (block) {
                console.log(`Blocking ${k.name}`);
                await client.put(`${OUTLINE_API_URL}/access-keys/${k.id}/data-limit`, { limit: { bytes: 1 } });
                bot.sendMessage(ADMIN_ID, `🚫 **Auto-Blocked:** ${k.name}\nReason: ${reason}`, {parse_mode: 'Markdown'});
            }
        }
    } catch (e) { console.error("Guardian Error"); }
}

// Start
runGuardian();
setInterval(runGuardian, CHECK_INTERVAL);
console.log("🚀 Bot Started with Updated Dashboard!");
