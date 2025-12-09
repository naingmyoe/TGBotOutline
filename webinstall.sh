#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   Outline Manager All-in-One Installer (Myanmar) ${NC}"
echo -e "${GREEN}==================================================${NC}"

# 1. Check Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo ./install.sh)${NC}"
  exit
fi

# 2. Ask for API URL
echo -e "${YELLOW}Outline Manager ၏ API URL ကို ထည့်သွင်းပေးပါ (e.g., https://1.2.3.4:1234/xxxxx):${NC}"
read -p "API URL: " OUTLINE_API_URL

if [ -z "$OUTLINE_API_URL" ]; then
  echo -e "${RED}API URL မထည့်သွင်းထားပါ။ Installation ရပ်တန့်လိုက်ပါပြီ။${NC}"
  exit 1
fi

echo -e "${YELLOW}Updating System...${NC}"
apt update && apt upgrade -y
apt install -y curl gnupg2 ca-certificates lsb-release ubuntu-keyring nginx git

# 3. Install Node.js 18
echo -e "${YELLOW}Installing Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 4. Setup Backend (Monitor Script)
echo -e "${YELLOW}Setting up Auto-Block Monitor Script...${NC}"
mkdir -p /opt/outline-bot
cd /opt/outline-bot

# Initialize npm and install modules
npm init -y > /dev/null
npm install node-fetch@2 https > /dev/null
npm install -g pm2 > /dev/null

# Create monitor.js
cat << EOF > monitor.js
const fetch = require('node-fetch');
const https = require('https');

// SETTINGS FROM INSTALLER
const API_URL = "${OUTLINE_API_URL}";
const CHECK_INTERVAL = 10000; // 10 Seconds

const agent = new https.Agent({ rejectUnauthorized: false });

function getMyanmarDate() {
    const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Yangon"});
    const mmDate = new Date(now);
    const y = mmDate.getFullYear();
    const m = String(mmDate.getMonth() + 1).padStart(2, '0');
    const d = String(mmDate.getDate()).padStart(2, '0');
    return \`\${y}-\${m}-\${d}\`;
}

async function checkAndBlock() {
    const today = getMyanmarDate();
    console.log(\`[\${new Date().toLocaleTimeString()}] Checking keys for date: \${today}...\`);

    try {
        const response = await fetch(\`\${API_URL}/access-keys\`, { agent });
        const data = await response.json();
        const keys = data.accessKeys;
        let blockedCount = 0;

        for (const key of keys) {
            let expireDate = null;
            if (key.name && key.name.includes('|')) {
                const match = key.name.match(/(\d{4}-\d{2}-\d{2})/);
                if (match) expireDate = match[1];
            }
            const currentLimit = key.dataLimit ? key.dataLimit.bytes : 0;

            if (expireDate && expireDate < today) {
                if (currentLimit !== 1) {
                    console.log(\`🚫 BLOCKING EXPIRED KEY: ID \${key.id} (\${key.name})\`);
                    await fetch(\`\${API_URL}/access-keys/\${key.id}/data-limit\`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ limit: { bytes: 1 } }),
                        agent
                    });
                    blockedCount++;
                }
            }
        }
        if (blockedCount > 0) console.log(\`⚠️ Blocked \${blockedCount} keys.\`);
    } catch (error) {
        console.error("❌ Connection Error:", error.message);
    }
}

console.log("🚀 Monitor Started...");
checkAndBlock();
setInterval(checkAndBlock, CHECK_INTERVAL);
EOF

# Start PM2
pm2 delete outline-monitor 2>/dev/null
pm2 start monitor.js --name "outline-monitor"
pm2 save
pm2 startup | bash > /dev/null 2>&1 

# 5. Setup Frontend (HTML Panel)
echo -e "${YELLOW}Setting up Web Panel (Nginx)...${NC}"
rm -rf /var/www/html/index.html

# Inject HTML Code (Using the latest version with Smart Reset & Auto Block)
cat << 'EOF' > /var/www/html/index.html
<!DOCTYPE html>
<html lang="my">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Outline Manager Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .modal { transition: opacity 0.25s ease; }
        .progress-bar { transition: width 0.5s ease-in-out; }
    </style>
</head>
<body class="bg-slate-50 min-h-screen text-slate-800">
    <nav class="bg-slate-900 text-white shadow-lg sticky top-0 z-40">
        <div class="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <div class="bg-indigo-600 p-2 rounded-lg"><i data-lucide="layers" class="w-6 h-6 text-white"></i></div>
                <div><h1 class="text-xl font-bold tracking-tight">Outline Manager</h1><p class="text-xs text-slate-400 font-mono" id="mmt-display">MMT: Loading...</p></div>
            </div>
            <div id="nav-status" class="hidden flex items-center space-x-4">
                <span class="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full flex items-center"><span class="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span> Active</span>
                <button onclick="disconnect()" class="text-slate-400 hover:text-white transition" title="Logout"><i data-lucide="log-out" class="w-5 h-5"></i></button>
            </div>
        </div>
    </nav>
    <main class="max-w-6xl mx-auto px-4 py-8">
        <div id="login-section" class="max-w-xl mx-auto mt-10">
            <div class="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="server" class="w-8 h-8 text-indigo-600"></i></div>
                    <h2 class="text-2xl font-bold text-slate-800">Server Login</h2>
                </div>
                <div class="space-y-4">
                    <input type="password" id="api-url" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Paste apiUrl here...">
                    <button onclick="connectServer()" id="connect-btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold shadow-lg transition flex justify-center items-center">Connect</button>
                </div>
                <div id="ssl-help" class="hidden mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    <p class="font-bold">Connection Error:</p><a href="#" id="ssl-link" target="_blank" class="block mt-2 font-bold underline text-indigo-700">1. Click Here to Allow Cert</a><p class="mt-1">2. Select "Advanced" -> "Proceed"</p>
                </div>
            </div>
        </div>
        <div id="dashboard" class="hidden space-y-8">
            <div class="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div><h2 class="text-2xl font-bold text-slate-800" id="server-title">Checking...</h2><p class="text-slate-500 text-sm mt-1" id="server-version">ID: ...</p></div>
                <div class="mt-4 sm:mt-0 flex space-x-3">
                    <button onclick="refreshData()" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition"><i data-lucide="refresh-cw" class="w-6 h-6"></i></button>
                    <button onclick="openCreateModal()" class="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-md transition transform active:scale-95"><i data-lucide="plus" class="w-5 h-5 mr-2"></i> New Key</button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center"><div class="p-3 bg-blue-50 text-blue-600 rounded-lg mr-4"><i data-lucide="users" class="w-6 h-6"></i></div><div><p class="text-slate-500 text-sm font-medium">Total Keys</p><h3 class="text-2xl font-bold text-slate-800" id="total-keys">0</h3></div></div>
                <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center"><div class="p-3 bg-emerald-50 text-emerald-600 rounded-lg mr-4"><i data-lucide="activity" class="w-6 h-6"></i></div><div><p class="text-slate-500 text-sm font-medium">Real Total Usage</p><h3 class="text-2xl font-bold text-slate-800" id="total-usage">0 GB</h3></div></div>
            </div>
            <div id="keys-list" class="grid grid-cols-1 lg:grid-cols-2 gap-6"></div>
        </div>
    </main>
    <div id="modal-overlay" class="fixed inset-0 bg-slate-900/80 hidden z-50 flex items-center justify-center backdrop-blur-sm opacity-0 modal">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all scale-95" id="modal-content">
            <div class="p-6 border-b border-slate-100 flex justify-between items-center"><h3 class="text-xl font-bold text-slate-800" id="modal-title">Key Management</h3><button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-6 h-6"></i></button></div>
            <form id="key-form" class="p-6 space-y-5"><input type="hidden" id="key-id"><div><label class="block text-sm font-medium text-slate-700 mb-1">Name</label><input type="text" id="key-name" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required></div><div><label class="block text-sm font-medium text-slate-700 mb-1">Total Data Limit</label><div class="flex"><input type="number" id="key-limit" class="flex-1 p-3 border border-r-0 border-slate-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 outline-none" step="0.1"><select id="key-unit" class="bg-slate-50 border border-slate-300 text-slate-700 rounded-r-lg px-4"><option value="GB">GB</option><option value="MB">MB</option></select></div></div><div><label class="block text-sm font-medium text-slate-700 mb-1">Expire Date (MMT)</label><input type="date" id="key-expire" class="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"></div><button type="submit" id="save-btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold shadow transition">Save Key</button></form>
        </div>
    </div>
    <div id="date-modal" class="fixed inset-0 bg-slate-900/80 hidden z-[60] flex items-center justify-center backdrop-blur-sm opacity-0 modal">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm transform transition-all scale-95 p-6">
            <h3 class="text-lg font-bold text-indigo-700 mb-2 flex items-center"><i data-lucide="refresh-ccw" class="w-5 h-5 mr-2"></i> Extend & Reset Usage</h3><p class="text-slate-600 text-sm mb-4">Extend expiry and reset visual usage to 0.</p><input type="hidden" id="extend-key-id"><input type="hidden" id="extend-key-name"><input type="hidden" id="extend-current-usage"><label class="block text-xs font-bold text-slate-500 mb-1">New Expire Date</label><input type="date" id="extend-date" class="w-full p-3 border border-slate-300 rounded-lg mb-4 focus:ring-indigo-500"><label class="block text-xs font-bold text-slate-500 mb-1">Add New Session Data (GB)</label><div class="relative"><input type="number" id="extend-limit" class="w-full p-3 border border-indigo-300 rounded-lg mb-4 focus:ring-indigo-500 bg-indigo-50 font-bold text-indigo-900" placeholder="e.g. 10"><div class="absolute right-3 top-3 text-sm font-bold text-indigo-400">GB</div></div><div class="flex space-x-3"><button onclick="closeDateModal()" class="flex-1 py-2 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button onclick="confirmSmartExtend()" class="flex-1 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-lg">Confirm</button></div>
        </div>
    </div>
    <div id="toast" class="fixed bottom-5 right-5 bg-slate-800 text-white px-6 py-3 rounded-lg shadow-lg transform translate-y-20 transition-transform duration-300 flex items-center z-50 max-w-sm"><span id="toast-msg">Notification</span></div>
    <script>
        let apiUrl = localStorage.getItem('outline_api_url') || '';
        let refreshInterval;
        function getMyanmarDate() { const now = new Date(); const mmString = now.toLocaleString("en-US", {timeZone: "Asia/Yangon"}); const mmDate = new Date(mmString); const y = mmDate.getFullYear(); const m = String(mmDate.getMonth() + 1).padStart(2, '0'); const d = String(mmDate.getDate()).padStart(2, '0'); return \`\${y}-\${m}-\${d}\`; }
        document.addEventListener('DOMContentLoaded', () => { lucide.createIcons(); document.getElementById('mmt-display').textContent = \`MMT: \${getMyanmarDate()}\`; if(apiUrl) { document.getElementById('api-url').value = apiUrl; connectServer(); } });
        function showToast(msg, isError = false) { const toast = document.getElementById('toast'); toast.className = \`fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-lg transform transition-transform duration-300 flex items-center z-50 max-w-sm break-words \${isError ? 'bg-red-600' : 'bg-slate-800'} text-white\`; document.getElementById('toast-msg').textContent = msg; toast.classList.remove('translate-y-20'); setTimeout(() => toast.classList.add('translate-y-20'), 4000); }
        function disconnect() { localStorage.removeItem('outline_api_url'); if(refreshInterval) clearInterval(refreshInterval); location.reload(); }
        async function connectServer() { let cleanUrl = document.getElementById('api-url').value.trim(); if(cleanUrl.startsWith('{')) { try { cleanUrl = JSON.parse(cleanUrl).apiUrl; } catch(e){} } if(cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1); if(!cleanUrl) return showToast("URL Required", true); document.getElementById('ssl-link').href = cleanUrl; try { const res = await fetch(\`\${cleanUrl}/server\`); if(!res.ok) throw new Error(); const data = await res.json(); apiUrl = cleanUrl; localStorage.setItem('outline_api_url', apiUrl); document.getElementById('server-title').textContent = data.name || "Outline Server"; document.getElementById('server-version').textContent = \`ID: \${data.serverId.substring(0,8)}\`; document.getElementById('login-section').classList.add('hidden'); document.getElementById('dashboard').classList.remove('hidden'); document.getElementById('nav-status').classList.remove('hidden').classList.add('flex'); refreshData(); refreshInterval = setInterval(refreshData, 10000); } catch (error) { showToast("Connection Error", true); document.getElementById('ssl-help').classList.remove('hidden'); } }
        async function refreshData() { document.getElementById('mmt-display').textContent = \`MMT: \${getMyanmarDate()}\`; try { const [keysRes, metricsRes] = await Promise.all([fetch(\`\${apiUrl}/access-keys\`), fetch(\`\${apiUrl}/metrics/transfer\`)]); renderDashboard(await keysRes.json(), await metricsRes.json()); } catch(e) {} }
        function formatBytes(bytes) { if (!bytes) return '0 B'; const sizes = ['B', 'KB', 'MB', 'GB', 'TB']; const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024))); return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i]; }
        function parseKeyInfo(key, realUsage) { let displayName = key.name || 'No Name'; let resetOffset = 0; let expireDate = null; let cleanName = displayName; const resetMatch = displayName.match(/\[R:(\d+)\]/); if (resetMatch) { resetOffset = parseInt(resetMatch[1]); cleanName = cleanName.replace(resetMatch[0], '').trim(); } const dateMatch = cleanName.match(/(\d{4}-\d{2}-\d{2})/); if (dateMatch) expireDate = dateMatch[1]; if (cleanName.includes('|')) cleanName = cleanName.split('|')[0].trim(); const sessionUsage = Math.max(0, realUsage - resetOffset); const realLimit = key.dataLimit ? key.dataLimit.bytes : 0; let sessionLimit = 0; if (realLimit > 1000) { sessionLimit = Math.max(0, realLimit - resetOffset); } return { cleanName, expireDate, resetOffset, sessionUsage, sessionLimit, realLimit, realUsage }; }
        function renderDashboard(keysData, metricsData) { const keys = keysData.accessKeys || []; const usageMap = metricsData.bytesTransferredByUserId || {}; const list = document.getElementById('keys-list'); list.innerHTML = ''; document.getElementById('total-keys').textContent = keys.length; let totalB = 0; Object.values(usageMap).forEach(v => totalB += v); document.getElementById('total-usage').textContent = formatBytes(totalB); keys.sort((a,b) => parseInt(a.id) - parseInt(b.id)); const today = getMyanmarDate(); keys.forEach(key => { const realUsage = usageMap[key.id] || 0; const info = parseKeyInfo(key, realUsage); const finalUrl = \`\${key.accessUrl.split('#')[0]}#\${encodeURIComponent(info.cleanName)}\`; const isBlocked = info.realLimit === 1; const isExpired = info.expireDate && info.expireDate < today; let statusBadge = ''; if (isBlocked) statusBadge = \`<span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded border">Disabled</span>\`; else if (isExpired) statusBadge = \`<span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200">Expired</span>\`; else statusBadge = \`<span class="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded border border-green-200">Active</span>\`; let pct = 0; if(info.sessionLimit > 0) pct = Math.min((info.sessionUsage / info.sessionLimit)*100, 100); const card = document.createElement('div'); card.className = \`bg-white rounded-xl shadow-sm border \${isExpired ? 'border-red-300' : 'border-slate-200'} p-5 hover:shadow-md transition-all\`; card.innerHTML = \`<div class="flex justify-between items-start mb-4"><div class="flex items-center"><div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 mr-3 text-sm">\${key.id}</div><div><h4 class="font-bold text-slate-800 text-md truncate max-w-[150px]">\${info.cleanName}</h4><div class="flex items-center gap-2 mt-1">\${statusBadge}\${info.expireDate ? \`<span class="text-xs text-slate-500 flex items-center"><i data-lucide="calendar" class="w-3 h-3 mr-1"></i> \${info.expireDate}</span>\` : ''}</div></div></div><button onclick="openExtendModal('\${key.id}', '\${info.cleanName.replace(/'/g, "\\\\'")}', '\${info.expireDate||''}', \${info.realUsage})" class="bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center shadow-sm shadow-indigo-200"><i data-lucide="refresh-ccw" class="w-3 h-3 mr-1"></i> Renew</button></div><div class="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100"><div class="flex justify-between text-xs font-semibold text-slate-600 mb-1"><span class="text-indigo-600">\${formatBytes(info.sessionUsage)}</span><span>of</span><span class="text-slate-800">\${(info.sessionLimit > 0) ? formatBytes(info.sessionLimit) : '∞'}</span></div><div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden"><div class="progress-bar \${isBlocked ? 'bg-slate-400' : (pct > 90 ? 'bg-red-500' : 'bg-green-500')} h-2.5 rounded-full" style="width: \${isBlocked ? 0 : pct}%"></div></div></div><div class="flex justify-between gap-2"><button onclick="editKey('\${key.id}', '\${info.cleanName.replace(/'/g, "\\\\'")}', '\${info.expireDate||''}', \${info.realLimit})" class="flex-1 py-2 text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"><i data-lucide="settings" class="w-3 h-3 inline mr-1"></i> Edit</button><button onclick="copyKey('\${finalUrl}')" class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-transparent hover:border-indigo-100"><i data-lucide="copy" class="w-4 h-4"></i></button></div>\`; list.appendChild(card); }); lucide.createIcons(); }
        function openExtendModal(id, name, currentDate, realUsage) { document.getElementById('extend-key-id').value = id; document.getElementById('extend-key-name').value = name; document.getElementById('extend-current-usage').value = realUsage; const mmNow = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Yangon"})); mmNow.setDate(mmNow.getDate() + 30); const y = mmNow.getFullYear(); const m = String(mmNow.getMonth() + 1).padStart(2, '0'); const d = String(mmNow.getDate()).padStart(2, '0'); document.getElementById('extend-date').value = \`\${y}-\${m}-\${d}\`; document.getElementById('extend-limit').value = "10"; const modal = document.getElementById('date-modal'); modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); }, 10); }
        function closeDateModal() { const modal = document.getElementById('date-modal'); modal.classList.add('opacity-0'); modal.querySelector('div').classList.add('scale-95'); setTimeout(() => modal.classList.add('hidden'), 200); }
        async function confirmSmartExtend() { const id = document.getElementById('extend-key-id').value; const cleanName = document.getElementById('extend-key-name').value; const newDate = document.getElementById('extend-date').value; const addLimitGB = document.getElementById('extend-limit').value; const currentRealUsage = parseInt(document.getElementById('extend-current-usage').value); if (!newDate || !addLimitGB) return alert("Please fill all fields"); const btn = document.querySelector('#date-modal button:last-child'); btn.innerText = "Processing..."; btn.disabled = true; try { const addBytes = Math.floor(parseFloat(addLimitGB) * 1024 * 1024 * 1024); const newRealTotalBytes = currentRealUsage + addBytes; const newFullName = \`\${cleanName} | \${newDate} | [R:\${currentRealUsage}]\`; await fetch(\`\${apiUrl}/access-keys/\${id}/name\`, { method: 'PUT', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: \`name=\${encodeURIComponent(newFullName)}\` }); await fetch(\`\${apiUrl}/access-keys/\${id}/data-limit\`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ limit: { bytes: newRealTotalBytes } }) }); showToast("Key Extended & Usage Reset!"); closeDateModal(); refreshData(); } catch(e) { showToast("Error", true); } finally { btn.innerText = "Confirm"; btn.disabled = false; } }
        const modalOverlay = document.getElementById('modal-overlay'); const modalContent = document.getElementById('modal-content'); function openCreateModal() { document.getElementById('key-form').reset(); document.getElementById('key-id').value = ''; document.getElementById('modal-title').textContent = 'Create New Key'; const d = new Date(); d.setDate(d.getDate() + 30); document.getElementById('key-expire').value = d.toISOString().split('T')[0]; modalOverlay.classList.remove('hidden'); setTimeout(() => { modalOverlay.classList.remove('opacity-0'); modalContent.classList.remove('scale-95'); }, 10); } function closeModal() { modalOverlay.classList.add('opacity-0'); modalContent.classList.add('scale-95'); setTimeout(() => modalOverlay.classList.add('hidden'), 200); } function editKey(id, name, date, bytes) { document.getElementById('key-id').value = id; document.getElementById('key-name').value = name; document.getElementById('key-expire').value = date; if (bytes > 1000) { document.getElementById('key-limit').value = (bytes / 1073741824).toFixed(2); document.getElementById('key-unit').value = 'GB'; } document.getElementById('modal-title').textContent = \`Edit Key \${id}\`; modalOverlay.classList.remove('hidden'); setTimeout(() => { modalOverlay.classList.remove('opacity-0'); modalContent.classList.remove('scale-95'); }, 10); } document.getElementById('key-form').addEventListener('submit', async (e) => { e.preventDefault(); const id = document.getElementById('key-id').value; let name = document.getElementById('key-name').value; const date = document.getElementById('key-expire').value; const lim = document.getElementById('key-limit').value; if (date) name = \`\${name} | \${date}\`; try { let tid = id; if(!tid) { const res = await fetch(\`\${apiUrl}/access-keys\`, { method: 'POST' }); const d = await res.json(); tid = d.id; } await fetch(\`\${apiUrl}/access-keys/\${tid}/name\`, { method: 'PUT', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: \`name=\${encodeURIComponent(name)}\` }); if(lim) { const bytes = Math.floor(parseFloat(lim) * 1024 * 1024 * 1024); await fetch(\`\${apiUrl}/access-keys/\${tid}/data-limit\`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ limit: { bytes: bytes } }) }); } closeModal(); refreshData(); showToast("Saved"); } catch(e){ showToast("Error", true); } }); function copyKey(text) { const temp = document.createElement('textarea'); temp.value = text; document.body.appendChild(temp); temp.select(); document.execCommand('copy'); document.body.removeChild(temp); showToast("Copied Key Link"); }
    </script>
</body>
</html>
EOF

# 6. Final Steps
systemctl restart nginx
chown -R www-data:www-data /var/www/html

# 7. Success Message
IP_ADDRESS=$(curl -s ifconfig.me)

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   INSTALLATION COMPLETE! ${NC}"
echo -e "${GREEN}==================================================${NC}"
echo -e "${YELLOW}1. Web Panel: ${NC} http://${IP_ADDRESS}"
echo -e "${YELLOW}2. Auto-Block Bot:${NC} Running in background (Check with 'pm2 list')"
echo -e "${YELLOW}3. Note:${NC} Open your browser to the IP above. The API URL is already configured."
echo -e "${GREEN}==================================================${NC}"
