const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs'); // File System (User စာရင်းမှတ်ရန်)

// ================================================================
// ⚠️ CONFIGURATION
// ================================================================
const OUTLINE_API_URL = "https://77.83.241.86:14394/V1IZp0KCiiMSph2ROMAxSQ"; 
const TELEGRAM_TOKEN = "8085635848:AAFoonUAG2JwDfymgMAp2keb2lJzTRAWDeQ"; 
const ADMIN_ID = 1372269701; 

// Auto Delete Time for PAID keys (24 Hours)
const AUTO_DELETE_HOURS = 24; 

// TEST KEY SETTINGS
const TEST_PLAN = { days: 1, gb: 1 }; // 1 Day, 1 GB

const PLANS = {
    'plan_1': { name: '1 Month - 50 GB', days: 30, gb: 50, price: '3,000 MMK' },
    'plan_2': { name: '1 Month - 100 GB', days: 30, gb: 100, price: '5,000 MMK' },
    'plan_3': { name: '1 Month 500 GB', days: 30, gb: 500, price: '20,000 MMK' }
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
const client = axios.create({ httpsAgent: agent, timeout: 30000, headers: { 'Content-Type': 'application/json' } });
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Memory Storage
const userStates = {}; 
let blockedKeys = {}; 

// Load Claimed Test Users (ဖိုင်ထဲကနေ ဖတ်မယ်)
const CLAIM_FILE = 'claimed_users.json';
let claimedUsers = [];
if (fs.existsSync(CLAIM_FILE)) {
    try { claimedUsers = JSON.parse(fs.readFileSync(CLAIM_FILE)); } catch(e) {}
}

// --- HELPER FUNCTIONS ---
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

function getProgressBar(used, total) {
    if (total === 0) return "ERROR";
    const percentage = Math.min((used / total) * 100, 100);
    const totalLength = 10; 
    const filledLength = Math.round((percentage / 100) * totalLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(totalLength - filledLength);
    return `${bar} ${percentage.toFixed(1)}%`;
}

// ================================================================
// 🤖 INTERACTION LOGIC
// ================================================================

bot.onText(/\/start/, (msg) => {
    const buttons = [
        [{ text: "🆓 Get Free Test Key (1GB)", callback_data: 'get_test_key' }], // 🔥 New Button
        [{ text: "🛒 Buy Premium Key", callback_data: 'buy_vpn' }],
        [{ text: "👤 My Account (Renew)", callback_data: 'check_status' }],
        [{ text: "🆘 Contact Admin", url: 'https://t.me/unpatchpos' }]
    ];
    if (msg.chat.id === ADMIN_ID) buttons.push([{ text: "👮‍♂️ Admin Panel", callback_data: 'admin_panel' }]);
    bot.sendMessage(msg.chat.id, "👋 Welcome to VPN Shop!", { reply_markup: { inline_keyboard: buttons } });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    const userFirstName = callbackQuery.from.first_name;

    // --- 🔥 TEST KEY LOGIC ---
    if (data === 'get_test_key') {
        // 1. Check if already claimed
        if (claimedUsers.includes(chatId)) {
            return bot.sendMessage(chatId, "⚠️ **Sorry!**\nမိတ်ဆွေ Test Key ထုတ်ယူပြီးသား ဖြစ်ပါသည်။\nPremium Plan ကို ဝယ်ယူအသုံးပြုပေးပါ။");
        }

        bot.sendMessage(chatId, "⏳ Creating Test Key...");

        try {
            // 2. Create Test Key
            const expireDate = getFutureDate(TEST_PLAN.days);
            const name = `TEST_${userFirstName.replace(/\|/g, '').trim()} | ${expireDate}`; // Note: Starts with TEST_
            const limit = TEST_PLAN.gb * 1024 * 1024 * 1024;

            const res = await client.post(`${OUTLINE_API_URL}/access-keys`);
            await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/name`, { name });
            await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/data-limit`, { limit: { bytes: limit } });

            // 3. Save User ID to File
            claimedUsers.push(chatId);
            fs.writeFileSync(CLAIM_FILE, JSON.stringify(claimedUsers));

            // 4. Send Key
            const message = `🎉 **Free Trial Created!**\n\n👤 Name: ${userFirstName}\n📦 Limit: 1 GB\n📅 Expire: 1 Day\n\n🔗 **Key:**\n\`${res.data.accessUrl}\`\n\n(This key will auto-delete when expired)`;
            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

        } catch (e) {
            bot.sendMessage(chatId, "❌ Error creating test key.");
            console.error(e);
        }
        return;
    }
    // -------------------------

    // 1. Check Status & RENEW Option
    if (data === 'check_status') {
        bot.sendMessage(chatId, "🔎 Checking account...");
        await checkUserStatus(chatId, userFirstName);
    }

    // 2. Buy New or Renew Selection
    if (data === 'buy_vpn' || data.startsWith('renew_start_')) {
        const isRenew = data.startsWith('renew_start_');
        const keyIdToRenew = isRenew ? data.split('_')[2] : null;

        const keyboard = Object.keys(PLANS).map(key => [{ 
            text: `${PLANS[key].name} - ${PLANS[key].price}`, 
            callback_data: `select_${key}_${isRenew ? 'RENEW' : 'NEW'}_${keyIdToRenew || '0'}` 
        }]);
        
        const title = isRenew ? "🔄 **Renew Plan ကို ရွေးချယ်ပါ:**" : "📅 **Plan ကို ရွေးချယ်ပါ:**";
        bot.editMessageText(title, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }

    // 3. Plan Selected
    if (data.startsWith('select_')) {
        const realPlanKey = data.match(/plan_\d+/)[0]; 
        const realType = data.includes('RENEW') ? 'RENEW' : 'NEW';
        const realKeyId = data.split('_').pop();

        userStates[chatId] = { 
            status: 'WAITING_SLIP', 
            plan: PLANS[realPlanKey], 
            name: userFirstName,
            type: realType, 
            renewKeyId: realKeyId
        };
        
        const typeText = realType === 'RENEW' ? "🔄 RENEW" : "🛒 NEW BUY";
        bot.sendMessage(chatId, `✅ **Selected (${typeText}):** ${PLANS[realPlanKey].name}\n💰 **Price:** ${PLANS[realPlanKey].price}\n\n${PAYMENT_INFO}`, { parse_mode: 'Markdown' });
    }

    // 4. Admin Actions
    if (chatId === ADMIN_ID) {
        if (data === 'admin_panel' || data === 'admin_list_users') await sendUserList(chatId);
        
        // Approve
        if (data.startsWith('approve_')) {
            const buyerId = data.split('_')[1];
            if (userStates[buyerId]) {
                const { plan, name, type, renewKeyId } = userStates[buyerId];
                bot.editMessageCaption("✅ Approved", { chat_id: ADMIN_ID, message_id: msg.message_id });
                
                let resultKey;
                if (type === 'RENEW') {
                    resultKey = await renewKeyForUser(renewKeyId, plan, name);
                } else {
                    resultKey = await createKeyForUser(buyerId, plan, name);
                }

                if (resultKey) {
                    bot.sendMessage(buyerId, `🎉 **Success!**\n\n👤 Name: ${name}\n📅 Expire: ${resultKey.expireDate}\n\n🔗 **Key:**\n\`${resultKey.accessUrl}\``, { parse_mode: 'Markdown' });
                    delete userStates[buyerId];
                }
            }
        }
        // Rejects & Deletes...
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
        if (data.startsWith('reject_')) {
            bot.sendMessage(data.split('_')[1], "❌ Rejected.");
            bot.editMessageCaption("❌ Rejected", { chat_id: ADMIN_ID, message_id: msg.message_id });
        }
    }
});

// Slip Handler & Admin Command
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (userStates[chatId] && userStates[chatId].status === 'WAITING_SLIP') {
        const { plan, name, type } = userStates[chatId];
        bot.sendMessage(chatId, "📩 Slip Received.");
        bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
            caption: `💰 Order: ${name} | ${plan.name}\nType: ${type === 'RENEW' ? '🔄 RENEW' : '🛒 NEW'}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `approve_${chatId}` }, { text: "❌ Reject", callback_data: `reject_${chatId}` }]] }
        });
    }
});
bot.onText(/\/manage[ _](.+)/, async (msg, match) => { if (msg.chat.id === ADMIN_ID) await sendKeyDetails(msg.chat.id, match[1].trim()); });

// --- CORE FUNCTIONS ---

async function checkUserStatus(chatId, firstName) {
    try {
        const [kRes, mRes] = await Promise.all([client.get(`${OUTLINE_API_URL}/access-keys`), client.get(`${OUTLINE_API_URL}/metrics/transfer`)]);
        // Find key (Check TEST keys first too)
        const myKey = kRes.data.accessKeys.find(k => k.name.includes(firstName));

        if (!myKey) return bot.sendMessage(chatId, "❌ **Account Not Found**");

        const used = mRes.data.bytesTransferredByUserId[myKey.id] || 0;
        const limit = myKey.dataLimit ? myKey.dataLimit.bytes : 0;
        
        let status = "🟢 Active";
        let isBlocked = false;
        if (limit > 0 && (limit - used) <= 0) { status = "🔴 Data Depleted"; isBlocked = true; }
        if (limit <= 5000) { status = "🔴 Expired/Blocked"; isBlocked = true; }

        // Determine if it's a TEST key
        const isTestKey = myKey.name.startsWith("TEST_");
        if (isTestKey) status += " (TRIAL)";

        const msg = `👤 **Name:** ${myKey.name.split('|')[0].trim()}\n📡 **Status:** ${status}\n⬇️ **Used:** ${formatBytes(used)} / ${formatBytes(limit)}\n${getProgressBar(used, limit)}`;
        
        const opts = { parse_mode: 'Markdown' };
        // Only show Renew if it's NOT a Test Key (Test keys cannot be renewed easily in this logic, better to buy new)
        if (isBlocked && !isTestKey) {
            opts.reply_markup = { inline_keyboard: [[{ text: "🔄 RENEW KEY NOW", callback_data: `renew_start_${myKey.id}` }]] };
        } else if (isTestKey && isBlocked) {
            opts.reply_markup = { inline_keyboard: [[{ text: "🛒 Upgrade to Premium", callback_data: `buy_vpn` }]] };
        }
        
        bot.sendMessage(chatId, msg, opts);
    } catch (e) { bot.sendMessage(chatId, "⚠️ Server Error."); }
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

async function renewKeyForUser(keyId, plan, userName) {
    try {
        const expireDate = getFutureDate(plan.days);
        // Remove TEST_ prefix if renewing a test key to premium
        const cleanName = userName.replace('TEST_', '').replace(/\|/g, '').trim();
        const name = `${cleanName} | ${expireDate}`;
        const limit = plan.gb * 1024 * 1024 * 1024;

        await client.put(`${OUTLINE_API_URL}/access-keys/${keyId}/name`, { name });
        await client.put(`${OUTLINE_API_URL}/access-keys/${keyId}/data-limit`, { limit: { bytes: limit } });
        if (blockedKeys[keyId]) delete blockedKeys[keyId];

        const res = await client.get(`${OUTLINE_API_URL}/access-keys`);
        const key = res.data.accessKeys.find(k => String(k.id) === String(keyId));
        return { accessUrl: key.accessUrl, expireDate };
    } catch (e) { return null; }
}

async function sendUserList(chatId) { 
    try {
        const res = await client.get(`${OUTLINE_API_URL}/access-keys`);
        let message = "👥 **User List**\n\n";
        res.data.accessKeys.forEach(k => { message += `🆔 \`${k.id}\` : ${k.name}\n👉 /manage_${k.id}\n\n`; });
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (e) {}
}
async function sendKeyDetails(chatId, keyId) {
    try {
        const [keysRes, metricsRes] = await Promise.all([client.get(`${OUTLINE_API_URL}/access-keys`), client.get(`${OUTLINE_API_URL}/metrics/transfer`)]);
        const key = keysRes.data.accessKeys.find(k => String(k.id) === String(keyId));
        if (!key) return bot.sendMessage(chatId, "❌ Key not found.");
        const usage = metricsRes.data.bytesTransferredByUserId[key.id] || 0;
        const limit = key.dataLimit ? key.dataLimit.bytes : 0;
        const msg = `👤 ${key.name}\n🆔 \`${key.id}\`\n📊 ${formatBytes(usage)} / ${formatBytes(limit)}`;
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🗑️ DELETE", callback_data: `confirm_delete_${key.id}` }]] } });
    } catch (e) {}
}

// ================================================================
// 🛡️ AUTO GUARDIAN (Checking & Deleting)
// ================================================================
async function runGuardian() {
    try {
        const [kRes, mRes] = await Promise.all([client.get(`${OUTLINE_API_URL}/access-keys`), client.get(`${OUTLINE_API_URL}/metrics/transfer`)]);
        const keys = kRes.data.accessKeys;
        const usage = mRes.data.bytesTransferredByUserId || {};
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();

        for (const k of keys) {
            const lim = k.dataLimit ? k.dataLimit.bytes : 0;
            const isTestKey = k.name.startsWith("TEST_");

            // --- 1. HANDLE TEST KEYS (Instant Delete) ---
            if (isTestKey) {
                let testExpired = false;
                if (k.name.includes('|')) {
                     const d = k.name.split('|')[1].trim();
                     if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < today) testExpired = true;
                }
                if (lim > 0 && (usage[k.id] || 0) >= lim) testExpired = true;

                if (testExpired) {
                    console.log(`[TEST] Deleting Expired Trial: ${k.name}`);
                    await client.delete(`${OUTLINE_API_URL}/access-keys/${k.id}`);
                    continue; // Skip to next key
                }
            }

            // --- 2. HANDLE PAID KEYS (Block -> Wait 24h -> Delete) ---
            if (!isTestKey) {
                // If already blocked (Limit <= 5KB)
                if (lim > 0 && lim <= 5000) {
                    if (!blockedKeys[k.id]) {
                        blockedKeys[k.id] = now;
                    } else {
                        const diffHours = (now - blockedKeys[k.id]) / (1000 * 60 * 60);
                        if (diffHours >= AUTO_DELETE_HOURS) {
                            console.log(`[PAID] Deleting Expired User: ${k.name}`);
                            try {
                                await client.delete(`${OUTLINE_API_URL}/access-keys/${k.id}`);
                                delete blockedKeys[k.id];
                                bot.sendMessage(ADMIN_ID, `🗑️ **Auto-Deleted:** ${k.name}\nReason: Not renewed in 24h.`);
                            } catch (err) {}
                        }
                    }
                    continue;
                }

                // Check active keys
                let block = false;
                if (k.name.includes('|')) {
                    const d = k.name.split('|')[1].trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < today) block = true;
                }
                if (lim > 5000 && (usage[k.id] || 0) >= lim) block = true;

                if (block) {
                    await client.put(`${OUTLINE_API_URL}/access-keys/${k.id}/data-limit`, { limit: { bytes: 1 } });
                    blockedKeys[k.id] = now; // Start timer
                    bot.sendMessage(ADMIN_ID, `🚫 **Blocked:** ${k.name}\n⏳ Will delete in 24h.`);
                }
            }
        }
    } catch (e) { console.error("Guardian Error"); }
}

runGuardian();
setInterval(runGuardian, CHECK_INTERVAL);
console.log("🚀 Bot Started with Test Keys & Auto-Delete!");
