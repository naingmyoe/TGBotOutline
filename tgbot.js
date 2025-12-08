const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

// ================================================================
// ⚙️ CONFIGURATION (ဒီနေရာကို ဖြည့်ပါ)
// ================================================================
const OUTLINE_API_URL = "https://77.83.241.86:14394/V1IZp0KCiiMSph2ROMAxSQ"; 
const TELEGRAM_TOKEN = "8388989661:AAG0H3zRbO27BgUDSgACmCld9c9w5g9Xu70"; // BotFather မှရသော Token
const ADMIN_ID = 1372269701; // သင့် Telegram User ID (အခြားသူ Key မထုတ်နိုင်အောင် ကာကွယ်ရန်)

const CHECK_INTERVAL = 10000; // 10 စက္ကန့်
// ================================================================

// SSL Setup
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const client = axios.create({
    httpsAgent: agent,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
});

// Telegram Bot Setup
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Helper: Bytes Conversion
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

// Helper: Date Calculator (YYYY-MM-DD)
function getFutureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// ================================================================
// 🛡️ PART 1: AUTO GUARDIAN (မိတ်ဆွေ၏ မူရင်း Logic)
// ================================================================
async function runGuardian() {
    const now = new Date().toLocaleString('en-US', { hour12: false });
    try {
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
            
            // Already blocked (Limit <= 5KB)
            if (limitBytes > 0 && limitBytes <= 5000) continue; 

            let shouldBlock = false;
            let reason = "";

            // Check Expiry (Name | YYYY-MM-DD)
            if (key.name && key.name.includes('|')) {
                const parts = key.name.split('|');
                const dateStr = parts[parts.length - 1].trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && dateStr < today) {
                    shouldBlock = true;
                    reason = `EXPIRED (${dateStr})`;
                }
            }

            // Check Data Limit
            if (!shouldBlock && limitBytes > 5000 && usedBytes >= limitBytes) {
                shouldBlock = true;
                reason = `DATA LIMIT (${formatBytes(usedBytes)} / ${formatBytes(limitBytes)})`;
            }

            // Block Action
            if (shouldBlock) {
                console.log(`[${now}] 🚫 Blocking Key ID ${key.id} -> ${reason}`);
                await client.put(`${OUTLINE_API_URL}/access-keys/${key.id}/data-limit`, { limit: { bytes: 1 } });
                
                // (Optional) Bot ကနေ Admin ဆီ Alert ပို့ရန်
                bot.sendMessage(ADMIN_ID, `🚫 **Blocked User:** ${key.name}\nReason: ${reason}`, { parse_mode: 'Markdown' });
            }
        }
    } catch (error) {
        console.error(`[${now}] Guardian Error: ${error.message}`);
    }
}

// ================================================================
// 🤖 PART 2: TELEGRAM BOT COMMANDS (Shop Features)
// ================================================================

// Command: /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Welcome to VPN Shop Bot!\n\nAdmin Commands:\n`/create [Name] [Days] [GB]` - Create New Key\n`/status` - Server Status", { parse_mode: 'Markdown' });
});

// Command: /create [Name] [Days] [GB]
// Example: /create MgMg 30 10 (မောင်မောင်, ၃၀ရက်, ၁၀ GB)
bot.onText(/\/create (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    // Security Check: Admin မဟုတ်ရင် ခွင့်မပြုပါ
    if (chatId !== ADMIN_ID) {
        return bot.sendMessage(chatId, "⛔ You are not authorized.");
    }

    const params = match[1].split(' ');
    if (params.length < 3) {
        return bot.sendMessage(chatId, "⚠️ Usage: `/create [Name] [Days] [GB]`\nExample: `/create User1 30 10`", { parse_mode: 'Markdown' });
    }

    const userName = params[0];
    const days = params[1];
    const gb = params[2];
    
    // Auto-Guard ဖတ်လို့ရမယ့် Name Format ပြောင်းခြင်း (Name | YYYY-MM-DD)
    const expireDate = getFutureDate(days);
    const finalName = `${userName} | ${expireDate}`;
    const limitBytes = gb * 1024 * 1024 * 1024; // GB to Bytes

    bot.sendMessage(chatId, "⏳ Creating key...");

    try {
        // 1. Create Key
        const createRes = await client.post(`${OUTLINE_API_URL}/access-keys`);
        const newKey = createRes.data;

        // 2. Rename Key (with Expiry Date)
        await client.put(`${OUTLINE_API_URL}/access-keys/${newKey.id}/name`, { name: finalName });

        // 3. Set Data Limit
        await client.put(`${OUTLINE_API_URL}/access-keys/${newKey.id}/data-limit`, { limit: { bytes: limitBytes } });

        // 4. Send Result to Admin
        const message = `✅ **Key Created Successfully!**\n\n👤 Name: ${userName}\n📅 Expire: ${expireDate} (${days} days)\n💾 Limit: ${gb} GB\n\n🔗 **Access Key:**\n\`${newKey.accessUrl}\``;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// Command: /status (Server Info ကြည့်ရန်)
bot.onText(/\/status/, async (msg) => {
    if (msg.chat.id !== ADMIN_ID) return;

    try {
        const metrics = await client.get(`${OUTLINE_API_URL}/metrics/transfer`);
        const keys = await client.get(`${OUTLINE_API_URL}/access-keys`);
        
        const totalKeys = keys.data.accessKeys.length;
        const totalUsage = Object.values(metrics.data.bytesTransferredByUserId).reduce((a, b) => a + b, 0);

        bot.sendMessage(msg.chat.id, `📊 **Server Status**\n\n🔑 Total Keys: ${totalKeys}\n📉 Total Bandwidth Used: ${formatBytes(totalUsage)}`, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(msg.chat.id, "Error fetching status.");
    }
});

// ================================================================
// 🚀 STARTUP
// ================================================================
console.log("🚀 Telegram Bot & Auto-Guard Started...");

// Guardian Loop စတင်ခြင်း
runGuardian();
setInterval(runGuardian, CHECK_INTERVAL);
