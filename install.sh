#!/bin/bash

# အရောင်များ သတ်မှတ်ခြင်း
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

clear
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}   🚀 VPN SHOP BOT CUSTOM INSTALLER v3.0   ${NC}"
echo -e "${GREEN}===========================================${NC}"

# --- 1. Bot & Server Config ---
echo -e "${CYAN}--- [1/3] SERVER CONFIGURATION ---${NC}"
read -p "1. Enter Telegram Bot Token: " BOT_TOKEN
read -p "2. Enter Outline API URL (Full URL): " API_URL
read -p "3. Enter Admin Telegram ID: " ADMIN_ID

echo -e ""
# --- 2. Payment Configuration ---
echo -e "${CYAN}--- [2/3] PAYMENT DETAILS ---${NC}"
read -p "1. Kpay Phone Number: " KPAY_NUM
read -p "   Kpay Account Name: " KPAY_NAME
read -p "2. Wave Phone Number: " WAVE_NUM
read -p "   Wave Account Name: " WAVE_NAME

echo -e ""
# --- 3. Plan Customization ---
echo -e "${CYAN}--- [3/3] PLAN CUSTOMIZATION ---${NC}"
echo -e "${YELLOW}Tip: For Unlimited Time, enter 999 in Days.${NC}"

# PLAN 1
echo -e "\n${GREEN}👉 Plan 1 Settings:${NC}"
read -p "   GB Amount (e.g., 10): " P1_GB
read -p "   Duration Days (e.g., 30): " P1_DAYS
read -p "   Price (e.g., 3000 MMK): " P1_PRICE

# PLAN 2
echo -e "\n${GREEN}👉 Plan 2 Settings:${NC}"
read -p "   GB Amount (e.g., 30): " P2_GB
read -p "   Duration Days (e.g., 30): " P2_DAYS
read -p "   Price (e.g., 7000 MMK): " P2_PRICE

# PLAN 3
echo -e "\n${GREEN}👉 Plan 3 Settings:${NC}"
read -p "   GB Amount (e.g., 50): " P3_GB
read -p "   Duration Days (e.g., 999): " P3_DAYS
read -p "   Price (e.g., 12000 MMK): " P3_PRICE

# Set Defaults if empty
P1_GB=${P1_GB:-10}
P1_DAYS=${P1_DAYS:-30}
P1_PRICE=${P1_PRICE:-3,000 MMK}

P2_GB=${P2_GB:-30}
P2_DAYS=${P2_DAYS:-30}
P2_PRICE=${P2_PRICE:-7,000 MMK}

P3_GB=${P3_GB:-50}
P3_DAYS=${P3_DAYS:-999}
P3_PRICE=${P3_PRICE:-12,000 MMK}


# ---------------------------------------------------------
# SYSTEM SETUP START
# ---------------------------------------------------------

echo -e "\n${YELLOW}🔄 Updating System & Installing Node.js...${NC}"
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

echo -e "${YELLOW}📁 Setting up Project Folder...${NC}"
mkdir -p /root/vpn-shop
cd /root/vpn-shop

echo -e "${YELLOW}📦 Installing Libraries...${NC}"
npm init -y > /dev/null 2>&1
npm install axios node-telegram-bot-api pm2 -g
npm install pm2 -g

# ---------------------------------------------------------
# CREATING BOT.JS
# ---------------------------------------------------------
echo -e "${YELLOW}📝 Generating bot.js file...${NC}"

cat <<'EOF' > bot.js
const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ================================================================
// ⚠️ CONFIGURATION (AUTO-FILLED)
// ================================================================
const OUTLINE_API_URL = "REPLACE_API_URL"; 
const TELEGRAM_TOKEN = "REPLACE_BOT_TOKEN"; 
const ADMIN_ID = REPLACE_ADMIN_ID; 

const AUTO_DELETE_HOURS = 24; 
const TEST_PLAN = { days: 1, gb: 1 }; 

// PLANS CONFIGURATION
const PLANS = {
    'plan_1': { 
        name: 'REPLACE_P1_DAYS Days - REPLACE_P1_GB GB', 
        days: REPLACE_P1_DAYS, 
        gb: REPLACE_P1_GB, 
        price: 'REPLACE_P1_PRICE' 
    },
    'plan_2': { 
        name: 'REPLACE_P2_DAYS Days - REPLACE_P2_GB GB', 
        days: REPLACE_P2_DAYS, 
        gb: REPLACE_P2_GB, 
        price: 'REPLACE_P2_PRICE' 
    },
    'plan_3': { 
        name: 'REPLACE_P3_DAYS Days - REPLACE_P3_GB GB', 
        days: REPLACE_P3_DAYS, 
        gb: REPLACE_P3_GB, 
        price: 'REPLACE_P3_PRICE' 
    }
};

const PAYMENT_INFO = `
💸 **Payment Methods:**
1️⃣ Kpay: REPLACE_KPAY_NUM (REPLACE_KPAY_NAME)
2️⃣ Wave: REPLACE_WAVE_NUM (REPLACE_WAVE_NAME)

⚠️ ငွေလွှဲပြီးပါက ပြေစာ (Screenshot) ပို့ပေးပါ။
`;

const CHECK_INTERVAL = 10000; 
// ================================================================

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const client = axios.create({ httpsAgent: agent, timeout: 30000, headers: { 'Content-Type': 'application/json' } });
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const userStates = {}; 
let blockedKeys = {}; 
const CLAIM_FILE = 'claimed_users.json';
let claimedUsers = [];
if (fs.existsSync(CLAIM_FILE)) {
    try { claimedUsers = JSON.parse(fs.readFileSync(CLAIM_FILE)); } catch(e) {}
}

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

// 🤖 INTERACTION LOGIC
bot.onText(/\/start/, (msg) => {
    const buttons = [
        [{ text: "🆓 Get Free Test Key (1GB)", callback_data: 'get_test_key' }],
        [{ text: "🛒 Buy Premium Key", callback_data: 'buy_vpn' }],
        [{ text: "👤 My Account (Renew)", callback_data: 'check_status' }],
        [{ text: "🆘 Contact Admin", url: 'https://t.me/YourUsername' }]
    ];
    if (msg.chat.id === ADMIN_ID) buttons.push([{ text: "👮‍♂️ Admin Panel", callback_data: 'admin_panel' }]);
    bot.sendMessage(msg.chat.id, "👋 Welcome to VPN Shop!", { reply_markup: { inline_keyboard: buttons } });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    const userFirstName = callbackQuery.from.first_name;

    if (data === 'get_test_key') {
        if (claimedUsers.includes(chatId)) {
            return bot.sendMessage(chatId, "⚠️ **Sorry!**\nမိတ်ဆွေ Test Key ထုတ်ယူပြီးသား ဖြစ်ပါသည်။\nPremium Plan ကို ဝယ်ယူအသုံးပြုပေးပါ။");
        }
        bot.sendMessage(chatId, "⏳ Creating Test Key...");
        try {
            const expireDate = getFutureDate(TEST_PLAN.days);
            const name = `TEST_${userFirstName.replace(/\|/g, '').trim()} | ${expireDate}`;
            const limit = TEST_PLAN.gb * 1024 * 1024 * 1024;
            const res = await client.post(`${OUTLINE_API_URL}/access-keys`);
            await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/name`, { name });
            await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/data-limit`, { limit: { bytes: limit } });
            claimedUsers.push(chatId);
            fs.writeFileSync(CLAIM_FILE, JSON.stringify(claimedUsers));
            const message = `🎉 **Free Trial Created!**\n\n👤 Name: ${userFirstName}\n📦 Limit: 1 GB\n📅 Expire: 1 Day\n\n🔗 **Key:**\n\`${res.data.accessUrl}\`\n\n(This key will auto-delete when expired)`;
            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (e) { bot.sendMessage(chatId, "❌ Error creating test key."); }
        return;
    }

    if (data === 'check_status') {
        bot.sendMessage(chatId, "🔎 Checking account...");
        await checkUserStatus(chatId, userFirstName);
    }

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

    if (data.startsWith('select_')) {
        const realPlanKey = data.match(/plan_\d+/)[0]; 
        const realType = data.includes('RENEW') ? 'RENEW' : 'NEW';
        const realKeyId = data.split('_').pop();
        userStates[chatId] = { status: 'WAITING_SLIP', plan: PLANS[realPlanKey], name: userFirstName, type: realType, renewKeyId: realKeyId };
        const typeText = realType === 'RENEW' ? "🔄 RENEW" : "🛒 NEW BUY";
        bot.sendMessage(chatId, `✅ **Selected (${typeText}):** ${PLANS[realPlanKey].name}\n💰 **Price:** ${PLANS[realPlanKey].price}\n\n${PAYMENT_INFO}`, { parse_mode: 'Markdown' });
    }

    if (chatId === ADMIN_ID) {
        if (data === 'admin_panel' || data === 'admin_list_users') await sendUserList(chatId);
        if (data.startsWith('approve_')) {
            const buyerId = data.split('_')[1];
            if (userStates[buyerId]) {
                const { plan, name, type, renewKeyId } = userStates[buyerId];
                bot.editMessageCaption("✅ Approved", { chat_id: ADMIN_ID, message_id: msg.message_id });
                let resultKey;
                if (type === 'RENEW') resultKey = await renewKeyForUser(renewKeyId, plan, name);
                else resultKey = await createKeyForUser(buyerId, plan, name);
                if (resultKey) {
                    bot.sendMessage(buyerId, `🎉 **Success!**\n\n👤 Name: ${name}\n📅 Expire: ${resultKey.expireDate}\n\n🔗 **Key:**\n\`${resultKey.accessUrl}\``, { parse_mode: 'Markdown' });
                    delete userStates[buyerId];
                }
            }
        }
        if (data.startsWith('confirm_delete_')) {
            const keyId = data.split('_')[2];
            bot.editMessageText(`⚠️ Delete Key ID: ${keyId}?`, { chat_id: chatId, message_id: msg.message_id, reply_markup: { inline_keyboard: [[{ text: "✅ YES", callback_data: `do_delete_${keyId}` }, { text: "❌ NO", callback_data: `cancel_delete` }]] } });
        }
        if (data.startsWith('do_delete_')) { await client.delete(`${OUTLINE_API_URL}/access-keys/${data.split('_')[2]}`); bot.editMessageText("✅ Deleted.", { chat_id: chatId, message_id: msg.message_id }); }
        if (data === 'cancel_delete') bot.deleteMessage(chatId, msg.message_id);
        if (data.startsWith('reject_')) { bot.sendMessage(data.split('_')[1], "❌ Rejected."); bot.editMessageCaption("❌ Rejected", { chat_id: ADMIN_ID, message_id: msg.message_id }); }
    }
});

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

// CORE FUNCTIONS
async function checkUserStatus(chatId, firstName) {
    try {
        const [kRes, mRes] = await Promise.all([client.get(`${OUTLINE_API_URL}/access-keys`), client.get(`${OUTLINE_API_URL}/metrics/transfer`)]);
        const myKey = kRes.data.accessKeys.find(k => k.name.includes(firstName));
        if (!myKey) return bot.sendMessage(chatId, "❌ **Account Not Found**");
        const used = mRes.data.bytesTransferredByUserId[myKey.id] || 0;
        const limit = myKey.dataLimit ? myKey.dataLimit.bytes : 0;
        let status = "🟢 Active";
        let isBlocked = false;
        if (limit > 0 && (limit - used) <= 0) { status = "🔴 Data Depleted"; isBlocked = true; }
        if (limit <= 5000) { status = "🔴 Expired/Blocked"; isBlocked = true; }
        const isTestKey = myKey.name.startsWith("TEST_");
        if (isTestKey) status += " (TRIAL)";
        const msg = `👤 **Name:** ${myKey.name.split('|')[0].trim()}\n📡 **Status:** ${status}\n⬇️ **Used:** ${formatBytes(used)} / ${formatBytes(limit)}\n${getProgressBar(used, limit)}`;
        const opts = { parse_mode: 'Markdown' };
        if (isBlocked && !isTestKey) opts.reply_markup = { inline_keyboard: [[{ text: "🔄 RENEW KEY NOW", callback_data: `renew_start_${myKey.id}` }]] };
        else if (isTestKey && isBlocked) opts.reply_markup = { inline_keyboard: [[{ text: "🛒 Upgrade to Premium", callback_data: `buy_vpn` }]] };
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
            if (isTestKey) {
                let testExpired = false;
                if (k.name.includes('|')) { const d = k.name.split('|')[1].trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < today) testExpired = true; }
                if (lim > 0 && (usage[k.id] || 0) >= lim) testExpired = true;
                if (testExpired) { await client.delete(`${OUTLINE_API_URL}/access-keys/${k.id}`); continue; }
            }
            if (!isTestKey) {
                if (lim > 0 && lim <= 5000) {
                    if (!blockedKeys[k.id]) { blockedKeys[k.id] = now; } 
                    else { if ((now - blockedKeys[k.id]) / (3600000) >= AUTO_DELETE_HOURS) { try { await client.delete(`${OUTLINE_API_URL}/access-keys/${k.id}`); delete blockedKeys[k.id]; bot.sendMessage(ADMIN_ID, `🗑️ **Auto-Deleted:** ${k.name}`); } catch (err) {} } }
                    continue;
                }
                let block = false;
                if (k.name.includes('|')) { const d = k.name.split('|')[1].trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < today) block = true; }
                if (lim > 5000 && (usage[k.id] || 0) >= lim) block = true;
                if (block) { await client.put(`${OUTLINE_API_URL}/access-keys/${k.id}/data-limit`, { limit: { bytes: 1 } }); blockedKeys[k.id] = now; bot.sendMessage(ADMIN_ID, `🚫 **Blocked:** ${k.name}\n⏳ Will delete in 24h.`); }
            }
        }
    } catch (e) { console.error("Guardian Error"); }
}
runGuardian();
setInterval(runGuardian, CHECK_INTERVAL);
console.log("🚀 Bot Started!");
EOF

# ---------------------------------------------------------
# APPLY CONFIGURATION
# ---------------------------------------------------------
echo -e "${YELLOW}⚙️ Applying Configurations...${NC}"

# Server Config
sed -i "s|REPLACE_API_URL|$API_URL|g" bot.js
sed -i "s|REPLACE_BOT_TOKEN|$BOT_TOKEN|g" bot.js
sed -i "s|REPLACE_ADMIN_ID|$ADMIN_ID|g" bot.js

# Payment Config
sed -i "s|REPLACE_KPAY_NUM|$KPAY_NUM|g" bot.js
sed -i "s|REPLACE_KPAY_NAME|$KPAY_NAME|g" bot.js
sed -i "s|REPLACE_WAVE_NUM|$WAVE_NUM|g" bot.js
sed -i "s|REPLACE_WAVE_NAME|$WAVE_NAME|g" bot.js

# Plan 1 Config
sed -i "s|REPLACE_P1_GB|$P1_GB|g" bot.js
sed -i "s|REPLACE_P1_DAYS|$P1_DAYS|g" bot.js
sed -i "s|REPLACE_P1_PRICE|$P1_PRICE|g" bot.js

# Plan 2 Config
sed -i "s|REPLACE_P2_GB|$P2_GB|g" bot.js
sed -i "s|REPLACE_P2_DAYS|$P2_DAYS|g" bot.js
sed -i "s|REPLACE_P2_PRICE|$P2_PRICE|g" bot.js

# Plan 3 Config
sed -i "s|REPLACE_P3_GB|$P3_GB|g" bot.js
sed -i "s|REPLACE_P3_DAYS|$P3_DAYS|g" bot.js
sed -i "s|REPLACE_P3_PRICE|$P3_PRICE|g" bot.js

# ---------------------------------------------------------
# START BOT
# ---------------------------------------------------------
echo -e "${GREEN}🚀 Starting Bot...${NC}"
pm2 start bot.js --name "vpn-shop"
pm2 save
pm2 startup

echo -e "\n${GREEN}✅ INSTALLATION SUCCESSFUL!${NC}"
