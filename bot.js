const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

// ================================================================
// ⚙️ CONFIGURATION (ဒီနေရာကို ပြင်ဆင်ပါ)
// ================================================================
const OUTLINE_API_URL = "https://77.83.241.86:14394/V1IZp0KCiiMSph2ROMAxSQ"; // သင်၏ Outline API URL
const TELEGRAM_TOKEN = "8085635848:AAFoonUAG2JwDfymgMAp2keb2lJzTRAWDeQ"; // BotFather မှ Token
const ADMIN_ID = 1372269701; // သင်၏ Telegram User ID (Slip စစ်ရန်)

// အရောင်း Plans များ
const PLANS = {
    'plan_1': { name: '1 Month - 50 GB', days: 30, gb: 1, price: '3,000 MMK' },
    'plan_2': { name: '1 Month - 100 GB', days: 30, gb: 100, price: '5,000 MMK' },
    'plan_3': { name: '1 Month - 500 GB', days: 30, gb: 500, price: '20,000 MMK' }
};

// ငွေလက်ခံမည့် အကောင့်များ
const PAYMENT_INFO = `
💸 **Payment Methods:**
1️⃣ Kpay: 09253402855 (Naing Myo Zaw)
2️⃣ Wave: 09253402855 (Naing Myo Zaw)

⚠️ ငွေလွှဲပြီးပါက ပြေစာ (Screenshot) ပို့ပေးပါ။
`;

const CHECK_INTERVAL = 10000; // Guardian စစ်မည့်အချိန် (၁၀ စက္ကန့်)
// ================================================================

// SSL Setup
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const client = axios.create({ httpsAgent: agent, timeout: 30000, headers: { 'Content-Type': 'application/json' } });
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Memory Storage
const userStates = {}; 

// Helper Functions
function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

function getFutureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// ================================================================
// 🤖 PART 1: SHOP & USER INTERACTION
// ================================================================

// /start & Menu
bot.onText(/\/start/, (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🛒 Buy VPN Key", callback_data: 'buy_vpn' }],
                [{ text: "Admin ဆက်သွယ်ရန်", url: 'https://t.me/unpatchpos' }] 
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "👋 Welcome to VPN Shop!\nအောက်ပါခလုတ်ကို နှိပ်၍ ဝယ်ယူနိုင်ပါတယ်။", opts);
});

// Button Handling
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;

    // Show Plans
    if (data === 'buy_vpn') {
        const keyboard = Object.keys(PLANS).map(key => {
            return [{ text: `${PLANS[key].name} - ${PLANS[key].price}`, callback_data: `select_${key}` }];
        });
        bot.editMessageText("📅 **မိမိလိုချင်သော Plan ကို ရွေးချယ်ပါ:**", {
            chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    // Handle Plan Selection
    if (data.startsWith('select_')) {
        const planKey = data.replace('select_', '');
        const selectedPlan = PLANS[planKey];

        if (selectedPlan) {
            userStates[chatId] = { status: 'WAITING_SLIP', plan: selectedPlan };
            bot.sendMessage(chatId, `✅ **Selected:** ${selectedPlan.name}\n💰 **Price:** ${selectedPlan.price}\n\n${PAYMENT_INFO}`, { parse_mode: 'Markdown' });
        }
    }

    // Admin Approve
    if (data.startsWith('approve_')) {
        const buyerId = data.split('_')[1];
        
        // Admin State Check (Memory ပျောက်သွားရင် Error မတက်အောင်)
        if (!userStates[buyerId] || !userStates[buyerId].plan) {
            bot.sendMessage(ADMIN_ID, "⚠️ Error: User data not found (Bot Restarted?). Check manually.");
            return;
        }

        const plan = userStates[buyerId].plan;
        bot.editMessageCaption(`✅ **Approved & Processing...**`, { chat_id: ADMIN_ID, message_id: msg.message_id });

        // Key Create
        const newKey = await createKeyForUser(buyerId, plan);
        if (newKey) {
            const message = `🎉 **Payment Successful!**\n\n✅ Plan: ${plan.name}\n📅 Expire: ${newKey.expireDate}\n\n🔗 **Your Access Key:**\n\`${newKey.accessUrl}\`\n\n(Click to Copy)`;
            bot.sendMessage(buyerId, message, { parse_mode: 'Markdown' });
            bot.sendMessage(ADMIN_ID, `✅ Key sent to User ID: ${buyerId}`);
            delete userStates[buyerId];
        }
    }

    // Admin Reject
    if (data.startsWith('reject_')) {
        const buyerId = data.split('_')[1];
        bot.editMessageCaption(`❌ **Rejected**`, { chat_id: ADMIN_ID, message_id: msg.message_id });
        bot.sendMessage(buyerId, "❌ သင့်ငွေလွှဲမှု မှားယွင်းနေပါသဖြင့် ပယ်ဖျက်လိုက်ပါသည်။ Admin ကို ဆက်သွယ်ပါ။");
        delete userStates[buyerId];
    }
});

// Slip Photo Handling
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userState = userStates[chatId];

    if (userState && userState.status === 'WAITING_SLIP') {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const plan = userState.plan;

        bot.sendMessage(chatId, "📩 Slip ရရှိပါသည်။ Admin စစ်ဆေးပြီးပါက Key ပို့ပေးပါမည်။");

        const caption = `💰 **New Order!**\n\n👤 User: ${msg.from.first_name} (ID: ${chatId})\n📦 Plan: ${plan.name}\n💵 Price: ${plan.price}`;
        bot.sendPhoto(ADMIN_ID, fileId, {
            caption: caption, parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ Approve", callback_data: `approve_${chatId}` },
                    { text: "❌ Reject", callback_data: `reject_${chatId}` }
                ]]
            }
        });
    }
});

// Create Key Function
async function createKeyForUser(userId, plan) {
    try {
        const expireDate = getFutureDate(plan.days);
        const name = `User_${userId} | ${expireDate}`;
        const limitBytes = plan.gb * 1024 * 1024 * 1024;

        const createRes = await client.post(`${OUTLINE_API_URL}/access-keys`);
        const newKey = createRes.data;

        await client.put(`${OUTLINE_API_URL}/access-keys/${newKey.id}/name`, { name: name });
        await client.put(`${OUTLINE_API_URL}/access-keys/${newKey.id}/data-limit`, { limit: { bytes: limitBytes } });

        return { accessUrl: newKey.accessUrl, expireDate: expireDate };
    } catch (error) {
        console.error("Key Creation Error:", error);
        bot.sendMessage(ADMIN_ID, "❌ Failed to create key (API Error).");
        return null;
    }
}

// ================================================================
// 🛡️ PART 2: AUTO GUARDIAN (Checking & Blocking)
// ================================================================
async function runGuardian() {
    const now = new Date().toLocaleString('en-US', { hour12: false });
    
    try {
        // Fetch Keys & Usage
        const [keysRes, metricsRes] = await Promise.all([
            client.get(`${OUTLINE_API_URL}/access-keys`),
            client.get(`${OUTLINE_API_URL}/metrics/transfer`)
        ]);

        const keys = keysRes.data.accessKeys;
        const usageMap = metricsRes.data.bytesTransferredByUserId || {};
        const today = new Date().toISOString().split('T')[0];

        for (const key of keys) {
            const limitBytes = key.dataLimit ? key.dataLimit.bytes : 0;
            const usedBytes = usageMap[key.id] || 0;
            
            // Skip already blocked keys (Limit <= 5KB)
            if (limitBytes > 0 && limitBytes <= 5000) continue; 

            let shouldBlock = false;
            let reason = "";

            // 1. Check Expiry Date (Format: "Name | YYYY-MM-DD")
            if (key.name && key.name.includes('|')) {
                const parts = key.name.split('|');
                const dateStr = parts[parts.length - 1].trim();
                
                // If valid date format and date is in the past
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && dateStr < today) {
                    shouldBlock = true;
                    reason = `EXPIRED (Date: ${dateStr})`;
                }
            }

            // 2. Check Data Limit (Backup check, Outline usually handles this but good to double check)
            if (!shouldBlock && limitBytes > 5000 && usedBytes >= limitBytes) {
                shouldBlock = true;
                reason = `DATA LIMIT REACHED (${formatBytes(usedBytes)})`;
            }

            // 3. Block Action
            if (shouldBlock) {
                console.log(`[${now}] 🚫 Blocking Key ID ${key.id} -> ${reason}`);
                try {
                    // Set limit to 1 Byte to block connection
                    await client.put(`${OUTLINE_API_URL}/access-keys/${key.id}/data-limit`, {
                        limit: { bytes: 1 } 
                    });
                    
                    // Alert Admin
                    bot.sendMessage(ADMIN_ID, `🛡️ **Auto-Guardian Alert**\n\n🚫 Blocked: ${key.name}\n📝 Reason: ${reason}`, { parse_mode: 'Markdown' });
                    
                } catch (blockErr) {
                    console.error(`Failed to block: ${blockErr.message}`);
                }
            }
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(`[${now}] ⚠️ Connection Error: Cannot reach Outline Server.`);
        } else {
            console.error(`[${now}] ⚠️ Guardian Error: ${error.message}`);
        }
    }
}

// ================================================================
// 🚀 STARTUP
// ================================================================
console.log("---------------------------------------");
console.log("🚀 VPN Shop & Auto-Guardian Started");
console.log("---------------------------------------");

// Start the Guardian Loop
runGuardian(); // Run immediately once
setInterval(runGuardian, CHECK_INTERVAL); // Loop every 10 seconds
