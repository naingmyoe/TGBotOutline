#!/bin/bash

# အရောင်များနိုင်နိုင်
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

clear
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN} 🚀 VPN SHOP BOT INSTALLER (DEBUG VERSION) ${NC}"
echo -e "${GREEN}===========================================${NC}"

# --- 1. Bot & Server Config ---
echo -e "${CYAN}--- [1/3] SERVER CONFIGURATION ---${NC}"
read -p "1. Enter Telegram Bot Token: " BOT_TOKEN
read -p "2. Enter Outline API URL (Full URL): " API_URL
read -p "3. Enter Admin Telegram ID (Numeric only, e.g. 123456789): " ADMIN_ID
read -p "4. Enter Admin Username (e.g. @admin): " ADMIN_USERNAME

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

# Set Defaults
P1_GB=${P1_GB:-10}; P1_DAYS=${P1_DAYS:-30}; P1_PRICE=${P1_PRICE:-3,000 MMK}
P2_GB=${P2_GB:-30}; P2_DAYS=${P2_DAYS:-30}; P2_PRICE=${P2_PRICE:-7,000 MMK}
P3_GB=${P3_GB:-50}; P3_DAYS=${P3_DAYS:-999}; P3_PRICE=${P3_PRICE:-12,000 MMK}

# ---------------------------------------------------------
# SYSTEM SETUP
# ---------------------------------------------------------
echo -e "\n${YELLOW}🔄 Updating System & Installing Node.js...${NC}"
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

echo -e "${YELLOW}📁 Setting up Project Folder...${NC}"
rm -rf /root/vpn-shop # Clean old folder
mkdir -p /root/vpn-shop
cd /root/vpn-shop

echo -e "${YELLOW}📦 Installing Libraries...${NC}"
npm init -y > /dev/null 2>&1
npm install axios node-telegram-bot-api pm2 -g
npm install pm2 -g

# ---------------------------------------------------------
# GENERATING BOT.JS
# ---------------------------------------------------------
echo -e "${YELLOW}📝 Generating bot.js with DEBUG features...${NC}"

cat <<'EOF' > bot.js
const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ================================================================
// ⚠️ CONFIGURATION
// ================================================================
const OUTLINE_API_URL = "REPLACE_API_URL"; 
const TELEGRAM_TOKEN = "REPLACE_BOT_TOKEN"; 
const ADMIN_ID = REPLACE_ADMIN_ID; // This will be replaced by script

const AUTO_DELETE_HOURS = 24; 
const TEST_PLAN = { days: 1, gb: 1 }; 

const PLANS = {
    'plan_1': { name: 'REPLACE_P1_DAYS Days - REPLACE_P1_GB GB', days: REPLACE_P1_DAYS, gb: REPLACE_P1_GB, price: 'REPLACE_P1_PRICE' },
    'plan_2': { name: 'REPLACE_P2_DAYS Days - REPLACE_P2_GB GB', days: REPLACE_P2_DAYS, gb: REPLACE_P2_GB, price: 'REPLACE_P2_PRICE' },
    'plan_3': { name: 'REPLACE_P3_DAYS Days - REPLACE_P3_GB GB', days: REPLACE_P3_DAYS, gb: REPLACE_P3_GB, price: 'REPLACE_P3_PRICE' }
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
if (fs.existsSync(CLAIM_FILE)) { try { claimedUsers = JSON.parse(fs.readFileSync(CLAIM_FILE)); } catch(e) {} }

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}
function getFutureDate(days) {
    const date = new Date(); date.setDate(date.getDate() + parseInt(days)); return date.toISOString().split('T')[0];
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
    // --- DEBUGGING LOGIC ---
    const userId = msg.chat.id;
    console.log(`[DEBUG] User ID: ${userId} | Admin ID Configured: ${ADMIN_ID}`);
    
    const buttons = [
        [{ text: "🆓 Get Free Test Key (1GB)", callback_data: 'get_test_key' }],
        [{ text: "🛒 Buy Premium Key", callback_data: 'buy_vpn' }],
        [{ text: "👤 My Account (Renew)", callback_data: 'check_status' }],
        [{ text: "🆘 Contact Admin", url: 'https://t.me/REPLACE_ADMIN_USER' }]
    ];

    // STRICT CHECK FOR ADMIN ID (String comparison)
    if (String(userId) === String(ADMIN_ID)) {
        console.log("✅ ADMIN MATCHED! Showing Panel.");
        buttons.push([{ text: "👮‍♂️ Admin Panel", callback_data: 'admin_panel' }]);
    } else {
        console.log("❌ Not Admin.");
    }

    bot.sendMessage(userId, "👋 Welcome to VPN Shop!", { reply_markup: { inline_keyboard: buttons } });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    const userFirstName = callbackQuery.from.first_name;

    if (data === 'get_test_key') {
        if (claimedUsers.includes(chatId)) { return bot.sendMessage(chatId, "⚠️ **Sorry!**\nမိတ်ဆွေ Test Key ထုတ်ယူပြီးသား ဖြစ်ပါသည်။"); }
        bot.sendMessage(chatId, "⏳ Creating Test Key...");
        try {
            const expireDate = getFutureDate(TEST_PLAN.days);
            const name = `TEST_${userFirstName.replace(/\|/g, '').trim()} | ${expireDate}`;
            const limit = TEST_PLAN.gb * 1024 * 1024 * 1024;
            const res = await client.post(`${OUTLINE_API_URL}/access-keys`);
            await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/name`, { name });
            await client.put(`${OUTLINE_API_URL}/access-keys/${res.data.id}/data-limit`, { limit: { bytes: limit } });
            claimedUsers.push(chatId); fs.writeFileSync(CLAIM_FILE, JSON.stringify(claimedUsers));
            bot.sendMessage(chatId, `🎉 **Free Trial Created!**\n\n👤 Name: ${userFirstName}\n📦 Limit: 1 GB\n📅 Expire: 1 Day\n\n🔗 **Key:**\n\`${res.data.accessUrl}\``, { parse_mode: 'Markdown' });
        } catch (e) { bot.sendMessage(chatId, "❌ Error."); }
        return;
    }

    if (data === 'check_status') { bot.sendMessage(chatId, "🔎 Checking..."); await checkUserStatus(chatId, userFirstName); }

    if (data === 'buy_vpn' || data.startsWith('renew_start_')) {
        const isRenew = data.startsWith('renew_start_');
        const keyIdToRenew = isRenew ? data.split('_')[2] : null;
        const keyboard = Object.keys(PLANS).map(key => [{ text: `${PLANS[key].name} - ${PLANS[key].price}`, callback_data: `select_${key}_${isRenew ? 'RENEW' : 'NEW'}_${keyIdToRenew || '0'}` }]);
        bot.editMessageText(isRenew ? "🔄 **Renew:**" : "📅 **Plan:**", { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }

    if (data.startsWith('select_')) {
        const realPlanKey = data.match(/plan_\d+/)[0]; 
        const realType = data.includes('RENEW') ? 'RENEW' : 'NEW';
        const realKeyId = data.split('_').pop();
        userStates[chatId] = { status: 'WAITING_SLIP', plan: PLANS
