/**
 * GICH WiFi - Complete Backend with Multi-Tenant Support
 * Deployable on Render with .env support
 */

require('dotenv').config();

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// CONFIGURATION
// ============================================================

const SHORTCODE = process.env.SHORTCODE || '174379';
const PASSKEY = process.env.PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const CONSUMER_KEY = process.env.CONSUMER_KEY || '';
const CONSUMER_SECRET = process.env.CONSUMER_SECRET || '';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://billing-system-fm9a.onrender.com/api/mpesa-callback';
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '126483';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'master126483';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

console.log('\n========================================');
console.log('🌐 GICH WiFi API');
console.log('========================================');
console.log('📋 Configuration loaded:');
console.log(`   Port: ${PORT}`);
console.log(`   Admin PIN: ${ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'}`);
console.log(`   Master PIN: ${MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'}`);
console.log('========================================\n');

// ============================================================
// JWT HELPER
// ============================================================

function generateToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET)
        .update(header + '.' + body)
        .digest('base64url');
    return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
    try {
        const [header, body, signature] = token.split('.');
        const expectedSignature = crypto.createHmac('sha256', JWT_SECRET)
            .update(header + '.' + body)
            .digest('base64url');
        if (signature !== expectedSignature) return null;
        return JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch (error) {
        return null;
    }
}

// ============================================================
// HTTPS AGENT
// ============================================================

const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
});

// ============================================================
// DATA STORAGE
// ============================================================

const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');
const VOUCHERS_FILE = path.join(__dirname, 'vouchers.json');
const PLANS_FILE = path.join(__dirname, 'plans.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const THEMES_FILE = path.join(__dirname, 'themes.json');
const CLIENTS_FILE = path.join(__dirname, 'clients.json');
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const ORGANIZATIONS_FILE = path.join(__dirname, 'organizations.json');
const MASTER_SETTINGS_FILE = path.join(__dirname, 'master-settings.json');

let transactions = [];
let vouchers = [];
let plans = [];
let settings = {};
let themes = [];
let clients = [];
let products = [];
let organizations = [];
let masterSettings = {};

// ============================================================
// DEFAULT SETTINGS
// ============================================================

const DEFAULT_SETTINGS = {
    businessName: 'GICH WIFI',
    businessTagline: 'Fast • Secure • Reliable',
    supportPhone: '0796587763',
    supportEmail: 'support@gichwifi.co.ke',
    website: 'https://gichwifi.co.ke',
    logo: '',
    theme: 'default',
    primaryColor: '#00c853',
    secondaryColor: '#00e676',
    accentColor: '#0f2027',
    textColor: '#ffffff',
    headerTextColor: '#ffffff',
    buttonTextColor: '#000000',
    bgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)'
};

const DEFAULT_MASTER_SETTINGS = {
    masterBusinessName: 'GICH WiFi Master',
    masterEmail: 'master@gichwifi.co.ke',
    masterPhone: '0796587763',
    defaultPrimaryColor: '#00c853',
    defaultBgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    commissionRate: 5,
    createdAt: new Date().toISOString()
};

// ============================================================
// DEFAULT THEMES
// ============================================================

const DEFAULT_THEMES = [
    { id: 'default', name: 'Default Green', preview: '🌿', colors: { primary: '#00c853', secondary: '#00e676', accent: '#0f2027', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
    { id: 'ocean', name: 'Ocean Blue', preview: '🌊', colors: { primary: '#0077be', secondary: '#00b4d8', accent: '#03045e', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #03045e, #0077be, #00b4d8)' },
    { id: 'sunset', name: 'Sunset Orange', preview: '🌅', colors: { primary: '#ff6b35', secondary: '#ff9a56', accent: '#1a0a00', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #1a0a00, #ff6b35, #ff9a56)' },
    { id: 'midnight', name: 'Midnight Purple', preview: '🌙', colors: { primary: '#7c3aed', secondary: '#a78bfa', accent: '#0c0a1a', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #0c0a1a, #4c1d95, #7c3aed)' },
    { id: 'forest', name: 'Forest Green', preview: '🌲', colors: { primary: '#2d6a4f', secondary: '#40916c', accent: '#081c15', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #081c15, #2d6a4f, #40916c)' },
    { id: 'rose', name: 'Rose Pink', preview: '🌹', colors: { primary: '#e91e63', secondary: '#f06292', accent: '#1a0a12', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #1a0a12, #c2185b, #e91e63)' },
    { id: 'gold', name: 'Gold Premium', preview: '✨', colors: { primary: '#f9a825', secondary: '#fdd835', accent: '#1a1500', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #1a1500, #f9a825, #fdd835)' },
    { id: 'nebula', name: 'Nebula Cosmic', preview: '🌌', colors: { primary: '#e040fb', secondary: '#7c4dff', accent: '#0a0a1a', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #0a0a1a, #7c4dff, #e040fb)' }
];

// ============================================================
// DEFAULT PLANS
// ============================================================

const DEFAULT_PLANS = [
    { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, shared_users: 1, duration_seconds: 7200 },
    { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, shared_users: 1, duration_seconds: 18000 },
    { id: '8_Hours', name: '8 Hours', price: 30, devices: 1, shared_users: 1, duration_seconds: 28800 },
    { id: '12_Hours', name: '12 Hours', price: 50, devices: 1, shared_users: 1, duration_seconds: 43200 },
    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, shared_users: 1, duration_seconds: 86400 },
    { id: '1_Week_1_Device', name: '1 Week (1 Device)', price: 300, devices: 1, shared_users: 1, duration_seconds: 604800 },
    { id: '1_Week_3_Devices', name: '1 Week (3 Devices)', price: 400, devices: 3, shared_users: 3, duration_seconds: 604800 },
    { id: '1_Month_1_Device', name: '1 Month (1 Device)', price: 1000, devices: 1, shared_users: 1, duration_seconds: 2592000 },
    { id: '1_Month_3_Devices', name: '1 Month (3 Devices)', price: 1200, devices: 3, shared_users: 3, duration_seconds: 2592000 }
];

// ============================================================
// LOAD DATA
// ============================================================

function loadAllData() {
    // Load transactions
    if (fs.existsSync(TRANSACTIONS_FILE)) {
        try { transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8')); console.log(`📂 Loaded ${transactions.length} transactions`); } catch (e) { console.error('Error loading transactions:', e); }
    }
    // Load vouchers
    if (fs.existsSync(VOUCHERS_FILE)) {
        try { vouchers = JSON.parse(fs.readFileSync(VOUCHERS_FILE, 'utf8')); console.log(`🎟️ Loaded ${vouchers.length} vouchers`); } catch (e) { console.error('Error loading vouchers:', e); }
    }
    // Load plans
    if (fs.existsSync(PLANS_FILE)) {
        try { plans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8')); console.log(`📦 Loaded ${plans.length} plans`); } catch (e) { console.error('Error loading plans:', e); plans = DEFAULT_PLANS; }
    } else { plans = DEFAULT_PLANS; savePlans(); }
    // Load settings
    if (fs.existsSync(SETTINGS_FILE)) {
        try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); console.log(`⚙️ Loaded settings`); } catch (e) { console.error('Error loading settings:', e); settings = DEFAULT_SETTINGS; }
    } else { settings = DEFAULT_SETTINGS; saveSettings(); }
    // Load themes
    if (fs.existsSync(THEMES_FILE)) {
        try { themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8')); console.log(`🎨 Loaded ${themes.length} themes`); } catch (e) { console.error('Error loading themes:', e); themes = DEFAULT_THEMES; }
    } else { themes = DEFAULT_THEMES; saveThemes(); }
    // Load clients
    if (fs.existsSync(CLIENTS_FILE)) {
        try { clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')); console.log(`👤 Loaded ${clients.length} clients`); } catch (e) { console.error('Error loading clients:', e); clients = []; }
    } else { clients = []; saveClients(); }
    // Load products
    if (fs.existsSync(PRODUCTS_FILE)) {
        try { products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); console.log(`📦 Loaded ${products.length} products`); } catch (e) { console.error('Error loading products:', e); products = []; }
    } else { products = []; saveProducts(); }
    // Load organizations
    if (fs.existsSync(ORGANIZATIONS_FILE)) {
        try { organizations = JSON.parse(fs.readFileSync(ORGANIZATIONS_FILE, 'utf8')); console.log(`🏢 Loaded ${organizations.length} organizations`); } catch (e) { console.error('Error loading organizations:', e); organizations = []; }
    } else { organizations = []; saveOrganizations(); }
    // Load master settings
    if (fs.existsSync(MASTER_SETTINGS_FILE)) {
        try { masterSettings = JSON.parse(fs.readFileSync(MASTER_SETTINGS_FILE, 'utf8')); console.log(`⚙️ Loaded master settings`); } catch (e) { console.error('Error loading master settings:', e); masterSettings = DEFAULT_MASTER_SETTINGS; }
    } else { masterSettings = DEFAULT_MASTER_SETTINGS; saveMasterSettings(); }
}

// ============================================================
// SAVE FUNCTIONS
// ============================================================

function saveTransactions() { try { fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2)); } catch (e) { console.error('⚠️ Could not save transactions:', e.message); } }
function saveVouchers() { try { fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(vouchers, null, 2)); } catch (e) { console.error('⚠️ Could not save vouchers:', e.message); } }
function savePlans() { try { fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2)); } catch (e) { console.error('⚠️ Could not save plans:', e.message); } }
function saveSettings() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (e) { console.error('⚠️ Could not save settings:', e.message); } }
function saveThemes() { try { fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2)); } catch (e) { console.error('⚠️ Could not save themes:', e.message); } }
function saveClients() { try { fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2)); } catch (e) { console.error('⚠️ Could not save clients:', e.message); } }
function saveProducts() { try { fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2)); } catch (e) { console.error('⚠️ Could not save products:', e.message); } }
function saveOrganizations() { try { fs.writeFileSync(ORGANIZATIONS_FILE, JSON.stringify(organizations, null, 2)); } catch (e) { console.error('⚠️ Could not save organizations:', e.message); } }
function saveMasterSettings() { try { fs.writeFileSync(MASTER_SETTINGS_FILE, JSON.stringify(masterSettings, null, 2)); } catch (e) { console.error('⚠️ Could not save master settings:', e.message); } }

// ============================================================
// HELPERS
// ============================================================

function getPlanName(planId) { const plan = plans.find(p => p.id === planId); return plan ? plan.name : planId; }
function getPlanDuration(planId) { const plan = plans.find(p => p.id === planId); return plan ? plan.duration_seconds : 3600; }
function generateVoucherCode() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = ''; for (let i = 0; i < 10; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return code; }
function normalizePhone(rawPhone) { if (!rawPhone) return null; let digits = String(rawPhone).trim().replace(/[^0-9+]/g, ''); digits = digits.replace(/^\+/, ''); if (digits.startsWith('0')) digits = digits.substring(1); if (digits.length === 9 && digits.startsWith('7')) return '254' + digits; if (digits.length === 10 && digits.startsWith('7')) return '254' + digits; if (digits.startsWith('254')) return digits; return digits; }
function timestampNow() { const now = new Date(); const pad = (n) => String(n).padStart(2, '0'); return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`; }
function generateClientId() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = ''; for (let i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function generateProductId() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = ''; for (let i = 0; i < 6; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'PROD_' + code; }
function generateOrgId() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = ''; for (let i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function getOrganizationByClientId(clientId) { return organizations.find(org => org.id === clientId); }

// ============================================================
// REQUEST HELPER
// ============================================================

function simpleRequest(method, urlString, headers = {}, jsonBody = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const payload = jsonBody ? JSON.stringify(jsonBody) : null;
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: method.toUpperCase(),
            headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}), 'Connection': 'keep-alive' },
            timeout: 60000,
            agent: agent,
            family: 4
        };
        const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const bodyText = Buffer.concat(chunks).toString('utf8');
                let bodyJson = null;
                try { bodyJson = JSON.parse(bodyText); } catch (_) {}
                resolve({ statusCode: res.statusCode, statusMessage: res.statusMessage, bodyText, bodyJson });
            });
        });
        req.on('error', (err) => { reject(new Error(`Request failed: ${err.message}`)); });
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        if (payload) { req.write(payload); }
        req.end();
    });
}

// ============================================================
// OAUTH
// ============================================================

async function getAccessToken() {
    console.log('\n🔑 Getting access token...');
    if (!CONSUMER_KEY || !CONSUMER_SECRET) { throw new Error('Consumer Key or Secret not configured.'); }
    const auth = Buffer.from(`${CONSUMER_KEY.trim()}:${CONSUMER_SECRET.trim()}`).toString('base64');
    const res = await simpleRequest('GET', 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' });
    if (res.statusCode !== 200) { throw new Error(`OAuth failed (${res.statusCode}): ${res.bodyText}`); }
    if (!res.bodyJson || !res.bodyJson.access_token) { throw new Error('No access token in response'); }
    console.log('✅ Access token obtained');
    return res.bodyJson.access_token;
}

// ============================================================
// STK PUSH
// ============================================================

async function stkPush({ phone, amount, accountReference }) {
    console.log('\n💳 Starting STK Push...');
    console.log(`📱 Phone: ${phone}`);
    console.log(`💰 Amount: ${amount}`);
    const numericAmount = Math.round(Number(amount));
    if (isNaN(numericAmount) || numericAmount < 1) { throw new Error('Invalid amount'); }
    const formattedPhone = normalizePhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) { throw new Error(`Invalid phone: ${phone}`); }
    const token = await getAccessToken();
    const timestamp = timestampNow();
    const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
    const payload = {
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: numericAmount,
        PartyA: formattedPhone,
        PartyB: SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: CALLBACK_URL,
        AccountReference: accountReference || 'GICH-WIFI',
        TransactionDesc: 'GICH WiFi Payment'
    };
    console.log('📤 Sending STK Push to Safaricom...');
    const res = await simpleRequest('POST', 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, payload);
    if (!res.bodyJson) { throw new Error('Invalid response from Safaricom'); }
    if (res.bodyJson.ResponseCode === '0') {
        console.log('✅ STK Push successful!');
        return { success: true, data: res.bodyJson, checkoutId: res.bodyJson.CheckoutRequestID, message: res.bodyJson.CustomerMessage || 'STK Push sent' };
    } else {
        throw new Error(res.bodyJson.ResponseDescription || 'STK Push failed');
    }
}

// ============================================================
// SERVER FUNCTIONS
// ============================================================

function sendJson(res, statusCode, obj) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(obj, null, 2));
}

function sendHtml(res, statusCode, html) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    res.end(html);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => raw += chunk);
        req.on('end', () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

function findHtmlFile(filename) {
    const paths = [path.join(__dirname, filename), path.join(__dirname, 'public', filename)];
    for (const p of paths) { if (fs.existsSync(p)) return p; }
    return null;
}

function serveHtmlFile(res, filename) {
    try {
        const filePath = findHtmlFile(filename);
        if (filePath) { sendHtml(res, 200, fs.readFileSync(filePath, 'utf8')); return true; }
    } catch (err) { console.error(`Error serving ${filename}:`, err); }
    return false;
}

function isAdmin(req) {
    const auth = req.headers.authorization;
    if (!auth) return false;
    const decoded = verifyToken(auth.replace('Bearer ', ''));
    return decoded && decoded.role === 'admin';
}

function isMasterAdmin(req) {
    const auth = req.headers.authorization;
    if (!auth) return false;
    const decoded = verifyToken(auth.replace('Bearer ', ''));
    return decoded && decoded.role === 'master';
}

// ============================================================
// GENERATE CLIENT SKELETON HTML - FULLY FIXED
// ============================================================

function generateClientSkeletonHtml(organization) {
    const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    const orgId = escapeHtml(organization.id);
    const businessName = escapeHtml(organization.businessName || organization.name || 'WiFi Service');
    const tagline = escapeHtml(organization.businessTagline || 'Fast • Secure • Reliable');
    const primaryColor = escapeHtml(organization.primaryColor || '#00c853');
    const secondaryColor = escapeHtml(organization.secondaryColor || '#00e676');
    const accentColor = escapeHtml(organization.accentColor || '#0f2027');
    const textColor = escapeHtml(organization.textColor || '#ffffff');
    const headerTextColor = escapeHtml(organization.headerTextColor || '#ffffff');
    const buttonTextColor = escapeHtml(organization.buttonTextColor || '#000000');
    const bgGradient = escapeHtml(organization.bgGradient || 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)');
    const supportPhone = escapeHtml(organization.supportPhone || '0796587763');
    const supportEmail = escapeHtml(organization.supportEmail || 'support@example.com');
    const logo = escapeHtml(organization.logo || '');
    const plans = organization.plans || [];

    let plansHtml = '';
    if (plans.length > 0) {
        plansHtml = plans.map(p => {
            const duration = p.duration_seconds || 3600;
            const hours = Math.floor(duration / 3600);
            const days = Math.floor(duration / 86400);
            const durationStr = days > 0 ? `${days} day${days > 1 ? 's' : ''}` : `${hours} hour${hours > 1 ? 's' : ''}`;
            const isPopular = p.id === '1_Week_1_Device' || p.id === '24_Hours';
            return `
                <div class="plan-card" data-plan-id="${escapeHtml(p.id)}" onclick="openPaymentModal('${escapeHtml(p.id)}')">
                    ${isPopular ? '<div class="badge">🔥 Popular</div>' : ''}
                    <div class="plan-name">${escapeHtml(p.name)}</div>
                    <div class="plan-price">KES ${p.price} <span>/ ${durationStr}</span></div>
                    <ul class="plan-features">
                        <li>${p.devices || 1} device${(p.devices || 1) > 1 ? 's' : ''}</li>
                        <li>${p.shared_users || 1} user${(p.shared_users || 1) > 1 ? 's' : ''}</li>
                        <li>Valid for ${durationStr}</li>
                    </ul>
                </div>
            `;
        }).join('');
    } else {
        plansHtml = `<div style="text-align:center;padding:40px;color:#666;">No plans available</div>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${businessName} - WiFi Services</title>
    <style>
        :root {
            --primary-color: ${primaryColor};
            --secondary-color: ${secondaryColor};
            --accent-color: ${accentColor};
            --text-color: ${textColor};
            --header-text-color: ${headerTextColor};
            --button-text-color: ${buttonTextColor};
            --bg-gradient: ${bgGradient};
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--accent-color);
            color: var(--text-color);
            min-height: 100vh;
        }
        .header {
            background: var(--bg-gradient);
            padding: 30px 20px;
            text-align: center;
            border-bottom: 3px solid var(--primary-color);
        }
        .header .logo {
            max-width: 150px;
            max-height: 80px;
            margin-bottom: 10px;
            ${logo ? '' : 'display: none;'}
        }
        .header h1 { font-size: 32px; color: var(--primary-color); }
        .header p { color: var(--header-text-color); font-size: 16px; margin-top: 4px; opacity: 0.8; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .plans-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .plan-card {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 24px;
            border: 1px solid rgba(255,255,255,0.08);
            transition: 0.3s;
            cursor: pointer;
            position: relative;
        }
        .plan-card:hover {
            transform: translateY(-4px);
            border-color: var(--primary-color);
            box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        }
        .plan-card.selected {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px var(--primary-color);
        }
        .plan-card .plan-name { font-size: 20px; font-weight: bold; color: var(--text-color); }
        .plan-card .plan-price { font-size: 28px; font-weight: bold; color: var(--primary-color); margin: 8px 0; }
        .plan-card .plan-price span { font-size: 14px; color: #888; font-weight: normal; }
        .plan-card .plan-features { color: #aaa; font-size: 14px; margin: 12px 0; list-style: none; }
        .plan-card .plan-features li { padding: 4px 0; }
        .plan-card .plan-features li::before { content: "✓ "; color: var(--primary-color); }
        .plan-card .badge {
            position: absolute; top: 12px; right: 12px;
            background: rgba(0,200,83,0.2); color: var(--primary-color);
            padding: 2px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
        }

        .voucher-section {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 24px;
            margin-top: 20px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .voucher-section h3 {
            color: var(--primary-color);
            margin-bottom: 12px;
            font-size: 18px;
        }
        .voucher-section .form-row {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        .voucher-section .form-row input {
            flex: 1;
            min-width: 180px;
            padding: 12px 16px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            color: #fff;
            font-size: 16px;
            outline: none;
        }
        .voucher-section .form-row input:focus { border-color: var(--primary-color); }
        .voucher-section .form-row input::placeholder { color: #555; }
        .voucher-section .form-row .btn {
            padding: 12px 24px;
            background: var(--primary-color);
            color: var(--button-text-color);
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: 0.2s;
            font-family: inherit;
            white-space: nowrap;
        }
        .voucher-section .form-row .btn:hover { opacity: 0.85; transform: scale(1.01); }
        .voucher-section .form-row .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .voucher-section .voucher-result {
            margin-top: 12px;
            font-size: 14px;
            color: #888;
        }
        .voucher-section .voucher-result.success { color: var(--primary-color); }
        .voucher-section .voucher-result.error { color: #ff4444; }

        .check-section {
            margin-top: 20px;
            text-align: center;
        }
        .check-section .btn {
            padding: 12px 28px;
            background: var(--primary-color);
            color: var(--button-text-color);
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: 0.2s;
            font-family: inherit;
            width: auto;
        }
        .check-section .btn:hover { opacity: 0.85; transform: scale(1.01); }
        .check-section .result {
            margin-top: 12px;
            font-size: 14px;
            color: #888;
        }
        .check-section .result.success { color: var(--primary-color); }
        .check-section .result.error { color: #ff4444; }

        .payment-modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
            display: none; align-items: center; justify-content: center;
            z-index: 999; padding: 20px;
        }
        .payment-modal-overlay.active { display: flex; }
        .payment-modal {
            background: #1a1a2e; border-radius: 20px; padding: 32px;
            max-width: 440px; width: 100%;
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 40px 100px rgba(0,0,0,0.6);
            animation: modalSlideUp 0.35s ease; position: relative;
        }
        @keyframes modalSlideUp {
            from { opacity: 0; transform: translateY(30px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .payment-modal .modal-close {
            position: absolute; top: 14px; right: 18px;
            background: none; border: none; color: #666;
            font-size: 24px; cursor: pointer; transition: 0.2s;
        }
        .payment-modal .modal-close:hover { color: #fff; }
        .payment-modal .plan-detail { text-align: center; margin: 10px 0 20px 0; }
        .payment-modal .plan-detail .name { font-size: 22px; font-weight: bold; color: #fff; }
        .payment-modal .plan-detail .price { font-size: 32px; font-weight: bold; color: var(--primary-color); margin-top: 4px; }
        .payment-modal .plan-detail .duration { color: #888; font-size: 14px; }
        .payment-modal .form-group { margin-bottom: 16px; }
        .payment-modal .form-group label { display: block; color: #aaa; font-size: 13px; margin-bottom: 6px; font-weight: 600; }
        .payment-modal .form-group input {
            width: 100%; padding: 12px 16px;
            background: #0a0a1a; border: 2px solid rgba(255,255,255,0.06);
            border-radius: 10px; color: #fff; font-size: 16px;
            outline: none; transition: 0.25s;
        }
        .payment-modal .form-group input:focus { border-color: var(--primary-color); }
        .payment-modal .btn {
            width: 100%; padding: 14px;
            background: var(--primary-color); color: var(--button-text-color);
            border: none; border-radius: 10px;
            font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s;
        }
        .payment-modal .btn:hover { opacity: 0.85; transform: scale(1.01); }
        .payment-modal .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .payment-modal .error-msg { color: #ff4444; font-size: 13px; margin-top: 8px; display: none; text-align: center; }
        .payment-modal .error-msg.show { display: block; }
        .payment-modal .test-hint { text-align: center; color: #555; font-size: 11px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 12px; }

        .success-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: var(--bg-gradient);
            display: none; flex-direction: column; align-items: center; justify-content: center;
            z-index: 1000; padding: 40px 20px;
            animation: fadeIn 0.6s ease;
        }
        .success-overlay.active { display: flex; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .success-overlay .logo { max-width: 120px; max-height: 70px; margin-bottom: 12px; ${logo ? '' : 'display: none;'} }
        .success-overlay .icon { font-size: 72px; margin-bottom: 12px; }
        .success-overlay .title { font-size: 36px; font-weight: 700; color: var(--primary-color); text-align: center; }
        .success-overlay .subtitle { font-size: 18px; color: #aaa; text-align: center; margin-top: 4px; }
        .success-overlay .business-name { font-size: 22px; color: #fff; margin-top: 8px; text-align: center; }
        .success-overlay .timer-container { margin: 25px 0 10px 0; text-align: center; padding: 25px 40px; background: rgba(0,0,0,0.3); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); }
        .success-overlay .timer-label { color: #888; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }
        .success-overlay .timer { font-size: 56px; font-weight: 700; color: var(--primary-color); font-family: 'Courier New', monospace; letter-spacing: 4px; margin-top: 4px; }
        .success-overlay .timer.expired { color: #ff4444; }
        .success-overlay .enjoy-text { color: var(--primary-color); font-size: 18px; margin-top: 16px; opacity: 0.9; text-align: center; }
        .success-overlay .credentials { background: rgba(0,0,0,0.3); border-radius: 12px; padding: 16px 24px; margin-top: 16px; border: 1px solid rgba(255,255,255,0.05); width: 100%; max-width: 400px; }
        .success-overlay .credentials .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
        .success-overlay .credentials .row:last-child { border-bottom: none; }
        .success-overlay .credentials .label { color: #888; font-size: 13px; }
        .success-overlay .credentials .value { color: #fff; font-family: monospace; font-size: 13px; }
        .success-overlay .auto-close { color: #555; font-size: 12px; margin-top: 20px; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .success-overlay .powered-by { color: #444; font-size: 12px; margin-top: 30px; }
        .success-overlay .powered-by .brand { color: var(--primary-color); font-weight: bold; }

        .toast {
            position: fixed; bottom: 30px; right: 30px;
            padding: 14px 22px; border-radius: 12px;
            background: #1a1a2e; border: 1px solid rgba(255,255,255,0.05);
            color: #fff; font-size: 14px; z-index: 999;
            transform: translateY(100px); opacity: 0;
            transition: 0.35s ease; max-width: 400px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }
        .toast.show { transform: translateY(0); opacity: 1; }
        .toast.success { border-color: var(--primary-color); }
        .toast.error { border-color: #ff4444; }
        .toast.info { border-color: #2196f3; }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: var(--primary-color);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            vertical-align: middle;
            margin-right: 8px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 600px) {
            .header h1 { font-size: 24px; }
            .plans-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
            .plan-card { padding: 16px; }
            .plan-card .plan-name { font-size: 16px; }
            .plan-card .plan-price { font-size: 22px; }
            .payment-modal { padding: 24px 20px; }
            .success-overlay .timer { font-size: 38px; }
            .success-overlay .title { font-size: 28px; }
            .success-overlay .timer-container { padding: 20px; min-width: 200px; }
            .voucher-section .form-row { flex-direction: column; }
            .voucher-section .form-row .btn { width: 100%; }
        }
        @media (max-width: 400px) { .plans-grid { grid-template-columns: 1fr; } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: var(--accent-color); }
        ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
    </style>
</head>
<body>

    <div class="header" id="pageHeader">
        ${logo ? `<img src="${logo}" alt="${businessName}" class="logo">` : ''}
        <h1>🌐 ${businessName}</h1>
        <p id="tagline">${tagline}</p>
    </div>

    <div class="container" id="mainContainer">
        <h2 style="color:var(--primary-color); margin-bottom:8px;">📶 Choose Your Plan</h2>
        <p style="color:#888; margin-bottom:16px;">Select a package that fits your needs</p>
        <div class="plans-grid" id="plansGrid">
            <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1;">
                <span class="loading"></span> Loading plans...
            </div>
        </div>

        <!-- VOUCHER SECTION -->
        <div class="voucher-section" id="voucherSection">
            <h3>🎟️ Have a Voucher?</h3>
            <div class="form-row">
                <input type="text" id="voucherInput" placeholder="Enter voucher code (e.g., ABC123XYZ)" autocomplete="off">
                <input type="tel" id="voucherPhoneInput" placeholder="📱 Your phone number" autocomplete="off">
                <button class="btn" id="voucherRedeemBtn" onclick="redeemVoucher()">🎟️ Redeem</button>
            </div>
            <div class="voucher-result" id="voucherResult"></div>
        </div>

        <!-- CHECK & CONNECT -->
        <div class="check-section">
            <button class="btn" onclick="checkAndConnect()">🔌 Check & Connect</button>
            <div class="result" id="checkResult"></div>
        </div>
    </div>

    <!-- PAYMENT MODAL -->
    <div class="payment-modal-overlay" id="paymentModal">
        <div class="payment-modal">
            <button class="modal-close" onclick="closePaymentModal()">✕</button>
            <div class="plan-detail">
                <div class="name" id="modalPlanName">2 Hours</div>
                <div class="price" id="modalPlanPrice">KES 10</div>
                <div class="duration" id="modalPlanDuration">Valid for 2 hours</div>
            </div>
            <div class="form-group">
                <label>📱 Phone Number</label>
                <input type="tel" id="modalPhone" placeholder="0712345678" autofocus>
            </div>
            <button class="btn" id="modalPayBtn" onclick="modalPay()">💳 Pay Now</button>
            <div class="error-msg" id="modalError">Please enter a valid phone number</div>
            <div class="test-hint">🔑 Test PIN: 12345</div>
        </div>
    </div>

    <!-- SUCCESS OVERLAY -->
    <div class="success-overlay" id="successOverlay">
        ${logo ? `<img src="${logo}" alt="${businessName}" class="logo">` : ''}
        <div class="icon">🎉</div>
        <div class="title">You're Connected!</div>
        <div class="subtitle">Enjoy your high-speed internet</div>
        <div class="business-name" id="successBusinessName">${businessName}</div>
        <div class="timer-container">
            <div class="timer-label">⏱ Time Remaining</div>
            <div class="timer" id="successTimer">--:--:--</div>
        </div>
        <div class="credentials" id="successCredentials">
            <div class="row"><span class="label">Username</span><span class="value" id="credUsername">-</span></div>
            <div class="row"><span class="label">Password</span><span class="value" id="credPassword">-</span></div>
            <div class="row"><span class="label">Plan</span><span class="value" id="credPlan">-</span></div>
        </div>
        <div class="enjoy-text" id="enjoyText">🌐 Enjoy your browsing!</div>
        <div class="auto-close">⏳ This page will close automatically when your plan expires</div>
        <div class="powered-by">Powered by <span class="brand" id="brandName">${businessName}</span></div>
    </div>

    <div class="toast" id="toast">
        <span id="toastIcon">✅</span>
        <span id="toastMessage">Success!</span>
    </div>

    <script>
        // ============================================================
        // CONFIGURATION - WORKS EVERYWHERE
        // ============================================================
        const RENDER_URL = 'https://billing-system-fm9a.onrender.com';
        const currentHost = window.location.hostname;
        const isLocal = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '' ||
                        currentHost === '192.168.88.1' || currentHost === '192.168.1.1' ||
                        window.location.protocol === 'file:';

        let API_URL = isLocal ? RENDER_URL + '/api' : window.location.origin + '/api';
        console.log('📡 API URL:', API_URL);

        // ============================================================
        // ORGANIZATION ID - MULTIPLE DETECTION METHODS
        // ============================================================
        let ORG_ID = '${orgId}';
        if (!ORG_ID || ORG_ID === '') {
            const pathParts = window.location.pathname.split('/');
            for (const part of pathParts) {
                if (part.startsWith('CLIENT_')) { ORG_ID = part; break; }
            }
        }
        if (!ORG_ID || ORG_ID === '') {
            const urlParams = new URLSearchParams(window.location.search);
            ORG_ID = urlParams.get('org') || urlParams.get('client') || '';
        }
        if (!ORG_ID || ORG_ID === '') {
            ORG_ID = localStorage.getItem('client_org_id') || '';
        }
        console.log('🏢 Organization ID:', ORG_ID);
        if (ORG_ID && ORG_ID !== '') { localStorage.setItem('client_org_id', ORG_ID); }

        // ============================================================
        // STATE
        // ============================================================
        let plans = [];
        let selectedPlan = null;
        let pollingInterval = null;
        let currentTransactionId = null;
        let countdownInterval = null;
        let credentials = null;
        let pollingActive = false;

        const plansGrid = document.getElementById('plansGrid');

        // ============================================================
        // INIT
        // ============================================================
        document.addEventListener('DOMContentLoaded', () => {
            if (ORG_ID && ORG_ID !== '') {
                loadOrganizationData();
            } else {
                plansGrid.innerHTML = '<div style="text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;">❌ Organization ID not found</div>';
            }
        });

        // ============================================================
        // LOAD ORGANIZATION DATA
        // ============================================================
        function loadOrganizationData() {
            fetch(API_URL + '/organization/' + ORG_ID)
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        const org = data.data;
                        plans = org.plans || [];
                        if (org.primaryColor) {
                            document.documentElement.style.setProperty('--primary-color', org.primaryColor);
                        }
                        if (org.businessName) {
                            document.querySelector('.header h1').textContent = '🌐 ' + org.businessName;
                            document.getElementById('successBusinessName').textContent = org.businessName;
                            document.getElementById('brandName').textContent = org.businessName;
                        }
                        if (org.businessTagline) {
                            document.getElementById('tagline').textContent = org.businessTagline;
                        }
                        if (org.logo) {
                            document.querySelector('.header .logo').src = org.logo;
                            document.querySelector('.header .logo').style.display = 'block';
                            document.getElementById('successLogo').src = org.logo;
                            document.getElementById('successLogo').style.display = 'block';
                        }
                        renderPlans();
                    } else {
                        plansGrid.innerHTML = '<div style="text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;">❌ ' + (data.message || 'Failed to load plans') + '</div>';
                    }
                })
                .catch(err => {
                    plansGrid.innerHTML = '<div style="text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;">❌ Network error loading plans<br><button onclick="loadOrganizationData()" style="padding:8px 20px;background:var(--primary-color);color:#000;border:none;border-radius:6px;cursor:pointer;">🔄 Retry</button></div>';
                });
        }

        // ============================================================
        // RENDER PLANS
        // ============================================================
        function renderPlans() {
            if (!plans || plans.length === 0) {
                plansGrid.innerHTML = '<div style="text-align:center;padding:40px;color:#666;grid-column:1/-1;">No plans available</div>';
                return;
            }
            plansGrid.innerHTML = plans.map(p => {
                const duration = p.duration_seconds || 3600;
                const hours = Math.floor(duration / 3600);
                const days = Math.floor(duration / 86400);
                const durationStr = days > 0 ? `${days} day${days > 1 ? 's' : ''}` : `${hours} hour${hours > 1 ? 's' : ''}`;
                const isPopular = p.id === '1_Week_1_Device' || p.id === '24_Hours';
                return \`
                    <div class="plan-card" onclick="openPaymentModal('\${p.id}')" data-plan-id="\${p.id}">
                        \${isPopular ? '<div class="badge">🔥 Popular</div>' : ''}
                        <div class="plan-name">\${p.name}</div>
                        <div class="plan-price">KES \${p.price} <span>/ \${durationStr}</span></div>
                        <ul class="plan-features">
                            <li>\${p.devices || 1} device\${(p.devices || 1) > 1 ? 's' : ''}</li>
                            <li>\${p.shared_users || 1} user\${(p.shared_users || 1) > 1 ? 's' : ''}</li>
                            <li>Valid for \${durationStr}</li>
                        </ul>
                    </div>
                \`;
            }).join('');
        }

        // ============================================================
        // CHECK & CONNECT - ONE CLICK
        // ============================================================
        function checkAndConnect() {
            const phone = prompt('📱 Enter your phone number to check for active plan:');
            if (!phone || phone.length < 10) {
                showToast('Please enter a valid phone number', 'error');
                return;
            }
            const resultEl = document.getElementById('checkResult');
            resultEl.innerHTML = '<span class="loading"></span> Checking...';
            resultEl.style.color = '#888';

            fetch(API_URL + '/check-active?phone=' + encodeURIComponent(phone))
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.active) {
                        resultEl.innerHTML = '✅ Active Plan Found! Connecting...';
                        resultEl.className = 'result success';
                        credentials = {
                            username: data.data.username,
                            password: data.data.password,
                            plan: data.data.planName,
                            expiresAt: data.data.expiresAt
                        };
                        showSuccessScreen(credentials);
                    } else {
                        resultEl.innerHTML = '❌ No active plan found. Please purchase a plan below.';
                        resultEl.className = 'result error';
                        showToast('No active plan found. Please purchase a plan.', 'error');
                    }
                })
                .catch(err => {
                    resultEl.innerHTML = '❌ Network error checking status';
                    resultEl.className = 'result error';
                });
        }

        // ============================================================
        // REDEEM VOUCHER - VISIBLE ON PAGE
        // ============================================================
        function redeemVoucher() {
            const code = document.getElementById('voucherInput').value.trim().toUpperCase();
            const phone = document.getElementById('voucherPhoneInput').value.trim();
            const resultEl = document.getElementById('voucherResult');
            const btn = document.getElementById('voucherRedeemBtn');

            if (!code) {
                resultEl.textContent = '❌ Please enter a voucher code';
                resultEl.className = 'voucher-result error';
                return;
            }
            if (!phone || phone.length < 10) {
                resultEl.textContent = '❌ Please enter a valid phone number';
                resultEl.className = 'voucher-result error';
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="loading"></span> Processing...';
            resultEl.innerHTML = '<span class="loading"></span> Redeeming...';
            resultEl.className = 'voucher-result';

            fetch(API_URL + '/voucher/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code, phoneNumber: phone })
            })
            .then(r => r.json())
            .then(data => {
                btn.disabled = false;
                btn.innerHTML = '🎟️ Redeem';
                if (data.success) {
                    resultEl.textContent = '✅ Voucher redeemed successfully! Connecting...';
                    resultEl.className = 'voucher-result success';
                    showToast('🎟️ Voucher redeemed!', 'success');
                    credentials = {
                        username: data.data.username || 'voucher_user',
                        password: data.data.password || 'pass_' + Date.now(),
                        plan: data.data.planName || 'Voucher Plan',
                        expiresAt: data.data.expiresAt || new Date(Date.now() + 3600000).toISOString()
                    };
                    showSuccessScreen(credentials);
                } else {
                    resultEl.textContent = '❌ ' + (data.message || 'Invalid voucher');
                    resultEl.className = 'voucher-result error';
                    showToast('❌ ' + data.message, 'error');
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.innerHTML = '🎟️ Redeem';
                resultEl.textContent = '❌ Network error';
                resultEl.className = 'voucher-result error';
            });
        }

        // ============================================================
        // OPEN PAYMENT MODAL
        // ============================================================
        function openPaymentModal(planId) {
            const plan = plans.find(p => p.id === planId);
            if (!plan) { showToast('Plan not found', 'error'); return; }
            selectedPlan = plan;
            const duration = plan.duration_seconds || 3600;
            const hours = Math.floor(duration / 3600);
            const days = Math.floor(duration / 86400);
            const durationStr = days > 0 ? `${days} day${days > 1 ? 's' : ''}` : `${hours} hour${hours > 1 ? 's' : ''}`;
            document.getElementById('modalPlanName').textContent = plan.name;
            document.getElementById('modalPlanPrice').textContent = 'KES ' + plan.price;
            document.getElementById('modalPlanDuration').textContent = 'Valid for ' + durationStr;
            document.getElementById('modalPhone').value = '';
            document.getElementById('modalError').classList.remove('show');
            document.getElementById('paymentModal').classList.add('active');
            setTimeout(() => { document.getElementById('modalPhone').focus(); }, 300);
        }

        function closePaymentModal() {
            document.getElementById('paymentModal').classList.remove('active');
            document.getElementById('modalError').classList.remove('show');
        }

        document.getElementById('paymentModal').addEventListener('click', function(e) {
            if (e.target === this) closePaymentModal();
        });

        document.getElementById('modalPhone').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') modalPay();
        });

        // ============================================================
        // MODAL PAYMENT
        // ============================================================
        function modalPay() {
            const phone = document.getElementById('modalPhone').value.trim();
            const errorEl = document.getElementById('modalError');
            if (!phone || phone.length < 10) {
                errorEl.textContent = '📱 Please enter a valid phone number';
                errorEl.classList.add('show');
                return;
            }
            errorEl.classList.remove('show');
            const btn = document.getElementById('modalPayBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="loading"></span> Processing...';

            fetch(API_URL + '/payment/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: phone, amount: selectedPlan.price, planId: selectedPlan.id })
            })
            .then(r => r.json())
            .then(data => {
                btn.disabled = false;
                btn.innerHTML = '💳 Pay Now';
                if (data.success) {
                    if (data.isFree) {
                        closePaymentModal();
                        showToast('🎉 Free plan activated!', 'success');
                        fetchCredentials(data.transactionId);
                        return;
                    }
                    currentTransactionId = data.transactionId;
                    closePaymentModal();
                    showToast('📱 STK Push sent! Check your phone.', 'info');
                    startPolling(data.transactionId);
                } else {
                    errorEl.textContent = '❌ ' + (data.message || 'Payment failed');
                    errorEl.classList.add('show');
                    showToast('❌ Payment failed', 'error');
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.innerHTML = '💳 Pay Now';
                errorEl.textContent = '❌ Network error';
                errorEl.classList.add('show');
            });
        }

        // ============================================================
        // POLLING - FIXED WITH CANCELLATION HANDLING
        // ============================================================
        function startPolling(transactionId) {
            if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
            if (pollingActive) return;
            pollingActive = true;
            let attempts = 0;
            const maxAttempts = 40;
            showToast('⏳ Waiting for payment confirmation...', 'info');

            pollingInterval = setInterval(() => {
                attempts++;
                if (attempts > maxAttempts) {
                    clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;
                    showToast('⏱️ Payment timed out.', 'error');
                    return;
                }
                fetch(API_URL + '/transaction/' + transactionId)
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) {
                            const tx = data.data;
                            if (tx.status === 'completed') {
                                clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;
                                showToast('🎉 Payment successful!', 'success');
                                fetchCredentials(transactionId);
                            } else if (tx.status === 'cancelled') {
                                clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;
                                showToast('❌ Payment cancelled by user', 'error');
                            } else if (tx.status === 'failed') {
                                clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;
                                showToast('❌ ' + (tx.errorDescription || 'Payment failed'), 'error');
                            }
                        }
                    })
                    .catch(err => { console.error('Polling error:', err); });
            }, 3000);
        }

        // ============================================================
        // FETCH CREDENTIALS & SHOW SUCCESS
        // ============================================================
        function fetchCredentials(transactionId) {
            fetch(API_URL + '/get-credentials/' + transactionId)
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        credentials = {
                            username: data.username || 'N/A',
                            password: data.password || 'N/A',
                            plan: data.plan || 'N/A',
                            expiresAt: data.expiresAt
                        };
                        showSuccessScreen(credentials);
                    }
                })
                .catch(console.error);
        }

        // ============================================================
        // SHOW SUCCESS FULL-SCREEN
        // ============================================================
        function showSuccessScreen(cred) {
            document.getElementById('mainContainer').style.display = 'none';
            document.querySelector('.header').style.display = 'none';
            document.getElementById('credUsername').textContent = cred.username;
            document.getElementById('credPassword').textContent = cred.password;
            document.getElementById('credPlan').textContent = cred.plan;
            document.getElementById('successOverlay').classList.add('active');
            if (cred.expiresAt) { startCountdown(cred.expiresAt); }
        }

        // ============================================================
        // COUNTDOWN TIMER
        // ============================================================
        function startCountdown(expiresAt) {
            if (countdownInterval) clearInterval(countdownInterval);
            const timerEl = document.getElementById('successTimer');
            function update() {
                const now = Date.now();
                const expiry = new Date(expiresAt).getTime();
                const diff = Math.max(0, expiry - now);
                if (diff <= 0) {
                    timerEl.textContent = '00:00:00';
                    timerEl.classList.add('expired');
                    clearInterval(countdownInterval);
                    setTimeout(() => {
                        try { window.close(); } catch (e) {
                            document.getElementById('enjoyText').textContent = '⏰ Your plan has expired. Please reconnect.';
                            document.querySelector('.auto-close').textContent = '🔄 Refresh to purchase a new plan';
                        }
                    }, 3000);
                    return;
                }
                timerEl.classList.remove('expired');
                const hours = Math.floor(diff / 3600000);
                const mins = Math.floor((diff % 3600000) / 60000);
                const secs = Math.floor((diff % 60000) / 1000);
                timerEl.textContent = String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
            }
            update();
            countdownInterval = setInterval(update, 1000);
        }

        // ============================================================
        // TOAST
        // ============================================================
        function showToast(message, type = 'success') {
            const icons = { success: '✅', error: '❌', info: 'ℹ️' };
            const toast = document.getElementById('toast');
            toast.className = 'toast ' + type;
            document.getElementById('toastIcon').textContent = icons[type] || '✅';
            document.getElementById('toastMessage').textContent = message;
            toast.classList.add('show');
            clearTimeout(toast._timeout);
            toast._timeout = setTimeout(() => { toast.classList.remove('show'); }, 4000);
        }

        // ============================================================
        // ENTER KEY SUPPORT FOR VOUCHER
        // ============================================================
        document.getElementById('voucherInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { document.getElementById('voucherPhoneInput').focus(); }
        });
        document.getElementById('voucherPhoneInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { redeemVoucher(); }
        });
    </script>
</body>
</html>`;
}

// ============================================================
// CREATE SERVER
// ============================================================

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log(`📥 ${req.method} ${url.pathname}`);

    try {
        // ===== SERVE HTML FILES =====
        if (req.method === 'GET' && url.pathname === '/') {
            if (serveHtmlFile(res, 'GICH_wifi.html')) return;
            sendHtml(res, 200, `<h1>🌐 GICH WiFi Server</h1><p>✅ Server is running!</p>`);
            return;
        }

        if (req.method === 'GET' && (url.pathname === '/GICH_wifi.html' || url.pathname === '/GICH%20wifi.html')) {
            if (serveHtmlFile(res, 'GICH_wifi.html')) return;
            sendHtml(res, 404, `<h1>File not found</h1>`);
            return;
        }

        // ============================================================
        // PUBLIC API ENDPOINTS
        // ============================================================

        // Health
        if (req.method === 'GET' && url.pathname === '/api/health') {
            return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
        }

        // Get Plans
        if (req.method === 'GET' && url.pathname === '/api/plans') {
            return sendJson(res, 200, { success: true, data: plans });
        }

        // Get Settings
        if (req.method === 'GET' && url.pathname === '/api/settings') {
            return sendJson(res, 200, { success: true, data: settings });
        }

        // Get Themes
        if (req.method === 'GET' && url.pathname === '/api/themes') {
            return sendJson(res, 200, { success: true, data: themes });
        }

        // Get Products
        if (req.method === 'GET' && url.pathname === '/api/products') {
            return sendJson(res, 200, { success: true, data: products });
        }

        // Get Transaction
        if (req.method === 'GET' && url.pathname.startsWith('/api/transaction/')) {
            const id = url.pathname.split('/').pop();
            const transaction = transactions.find(t => t.id === id);
            if (!transaction) return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            return sendJson(res, 200, {
                success: true,
                data: {
                    id: transaction.id,
                    status: transaction.status,
                    errorDescription: transaction.errorDescription || null,
                    phoneNumber: transaction.phoneNumber,
                    amount: transaction.amount,
                    planName: transaction.planName,
                    mpesaCode: transaction.mpesaCode || null,
                    expiresAt: transaction.expiresAt || null,
                    mikrotikUsername: transaction.mikrotikUsername || null,
                    mikrotikPassword: transaction.mikrotikPassword || null
                }
            });
        }

        // Get All Transactions
        if (req.method === 'GET' && url.pathname === '/api/transactions') {
            const phone = url.searchParams.get('phone');
            let filtered = phone ? transactions.filter(t => t.phoneNumber === phone) : transactions;
            return sendJson(res, 200, { success: true, data: filtered, count: filtered.length });
        }

        // Check Active Plan
        if (req.method === 'GET' && url.pathname === '/api/check-active') {
            const phone = url.searchParams.get('phone');
            if (!phone) return sendJson(res, 400, { success: false, message: 'Phone number required' });
            const active = transactions.find(t => t.phoneNumber === phone && t.status === 'completed' && t.mikrotikCreated && (!t.expiresAt || new Date(t.expiresAt) > new Date()));
            if (active) {
                return sendJson(res, 200, {
                    success: true,
                    active: true,
                    data: {
                        id: active.id,
                        planName: active.planName,
                        expiresAt: active.expiresAt,
                        username: active.mikrotikUsername,
                        password: active.mikrotikPassword,
                        mpesaCode: active.mpesaCode
                    }
                });
            } else {
                return sendJson(res, 200, { success: true, active: false });
            }
        }

        // ============================================================
        // PAYMENT
        // ============================================================

        // Initiate Payment
        if (req.method === 'POST' && url.pathname === '/api/payment/initiate') {
            const body = await readBody(req);
            const { phoneNumber, amount, planId } = body;
            if (!phoneNumber || phoneNumber.length < 10) {
                return sendJson(res, 400, { success: false, message: 'Invalid phone number' });
            }
            try {
                const transactionId = 'GICH' + Date.now() + Math.random().toString(36).substring(7);
                const duration = getPlanDuration(planId);
                const planName = getPlanName(planId);
                const transaction = {
                    id: transactionId,
                    phoneNumber,
                    amount,
                    planId,
                    planName,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    mpesaCode: null,
                    checkoutId: null,
                    expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
                    mikrotikUsername: null,
                    mikrotikPassword: null,
                    mikrotikCreated: false,
                    errorCode: null,
                    errorDescription: null
                };
                transactions.push(transaction);
                saveTransactions();

                if (amount === 0) {
                    transaction.status = 'completed';
                    transaction.mpesaCode = 'FREE' + Date.now();
                    transaction.mikrotikUsername = 'user_' + transaction.id.substring(0, 12);
                    transaction.mikrotikPassword = 'pass_' + Date.now().toString(36);
                    transaction.mikrotikCreated = true;
                    saveTransactions();
                    return sendJson(res, 200, { success: true, message: 'Free plan activated!', transactionId, isFree: true });
                }

                const result = await stkPush({ phone: phoneNumber, amount, accountReference: 'GICH' + Date.now().toString().slice(-8) });
                if (result.success) {
                    transaction.checkoutId = result.checkoutId;
                    saveTransactions();
                    return sendJson(res, 200, { success: true, message: 'STK Push sent!', transactionId, checkoutId: result.checkoutId });
                } else {
                    transaction.status = 'completed';
                    transaction.mpesaCode = 'MOCK' + Date.now();
                    transaction.isMock = true;
                    transaction.mikrotikUsername = 'user_' + transaction.id.substring(0, 12);
                    transaction.mikrotikPassword = 'pass_' + Date.now().toString(36);
                    transaction.mikrotikCreated = true;
                    saveTransactions();
                    return sendJson(res, 200, { success: true, message: 'MOCK MODE: Payment simulated.', transactionId, mock: true });
                }
            } catch (error) {
                return sendJson(res, 502, { success: false, message: 'Payment failed: ' + error.message });
            }
        }

        // ===== MPESA CALLBACK - FIXED =====
        if (req.method === 'POST' && url.pathname === '/api/mpesa-callback') {
            const callback = await readBody(req);
            const resultCode = callback.Body?.stkCallback?.ResultCode;
            const checkoutId = callback.Body?.stkCallback?.CheckoutRequestID;
            const receipt = callback.Body?.stkCallback?.CallbackMetadata?.Item?.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
            const amount = callback.Body?.stkCallback?.CallbackMetadata?.Item?.find(item => item.Name === 'Amount')?.Value;
            const phoneNumber = callback.Body?.stkCallback?.CallbackMetadata?.Item?.find(item => item.Name === 'PhoneNumber')?.Value;
            const resultDesc = callback.Body?.stkCallback?.ResultDesc || 'Unknown error';

            let transaction = transactions.find(t => t.checkoutId === checkoutId);
            if (!transaction) {
                transaction = transactions.find(t => t.mpesaResponse?.CheckoutRequestID === checkoutId);
            }
            if (!transaction) {
                return sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Transaction not found' });
            }

            if (resultCode === 0) {
                transaction.status = 'completed';
                transaction.mpesaCode = receipt || 'MPESA' + Date.now();
                transaction.completedAt = new Date().toISOString();
                if (amount) transaction.amount = amount;
                if (phoneNumber) transaction.phoneNumber = phoneNumber;
                transaction.errorCode = null;
                transaction.errorDescription = null;
                transaction.mikrotikUsername = 'user_' + (transaction.mpesaCode || transaction.id).substring(0, 12);
                transaction.mikrotikPassword = 'pass_' + Date.now().toString(36);
                transaction.mikrotikCreated = true;
                saveTransactions();
                return sendJson(res, 200, { ResultCode: 0, ResultDesc: 'Success' });
            } else if (resultCode === 1037) {
                transaction.status = 'cancelled';
                transaction.errorDescription = 'User cancelled the transaction';
                transaction.errorCode = resultCode;
                transaction.completedAt = new Date().toISOString();
                saveTransactions();
                return sendJson(res, 200, { ResultCode: resultCode, ResultDesc: 'User cancelled' });
            } else if (resultCode === 2001) {
                transaction.status = 'failed';
                transaction.errorDescription = 'Insufficient M-Pesa balance';
                transaction.errorCode = resultCode;
                transaction.completedAt = new Date().toISOString();
                saveTransactions();
                return sendJson(res, 200, { ResultCode: resultCode, ResultDesc: 'Insufficient balance' });
            } else {
                transaction.status = 'failed';
                transaction.errorDescription = resultDesc || 'Payment failed';
                transaction.errorCode = resultCode;
                transaction.completedAt = new Date().toISOString();
                saveTransactions();
                return sendJson(res, 200, { ResultCode: resultCode, ResultDesc: resultDesc });
            }
        }

        // ============================================================
        // VOUCHER SYSTEM
        // ============================================================

        // Redeem Voucher
        if (req.method === 'POST' && url.pathname === '/api/voucher/redeem') {
            const body = await readBody(req);
            const { code, phoneNumber } = body;
            if (!code) return sendJson(res, 400, { success: false, message: 'Voucher code required' });
            const voucher = vouchers.find(v => v.code === code && !v.used);
            if (!voucher) return sendJson(res, 404, { success: false, message: 'Invalid or already used voucher' });
            if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
                return sendJson(res, 400, { success: false, message: 'Voucher has expired' });
            }
            voucher.used = true;
            voucher.usedBy = phoneNumber || 'unknown';
            voucher.usedAt = new Date().toISOString();
            saveVouchers();

            const transactionId = 'VOUCH' + Date.now() + Math.random().toString(36).substring(7);
            const duration = voucher.duration_seconds || 3600;
            const planName = voucher.planName || 'Voucher Plan';
            const transaction = {
                id: transactionId,
                phoneNumber: phoneNumber || 'voucher_user',
                amount: 0,
                planId: voucher.planId || 'voucher',
                planName: planName,
                status: 'completed',
                timestamp: new Date().toISOString(),
                mpesaCode: 'VOUCHER_' + voucher.code,
                completedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
                mikrotikUsername: 'vuser_' + transactionId.substring(0, 8),
                mikrotikPassword: 'vpass_' + Date.now().toString(36),
                mikrotikCreated: true,
                isVoucher: true,
                voucherCode: voucher.code,
                sharedUsers: voucher.devices || 1
            };
            transactions.push(transaction);
            saveTransactions();

            return sendJson(res, 200, {
                success: true,
                message: 'Voucher redeemed successfully!',
                data: {
                    transactionId: transactionId,
                    planName: planName,
                    expiresAt: transaction.expiresAt,
                    username: transaction.mikrotikUsername,
                    password: transaction.mikrotikPassword
                }
            });
        }

        // ============================================================
        // ADMIN ENDPOINTS
        // ============================================================

        // Admin Verify
        if (req.method === 'POST' && url.pathname === '/api/admin/verify') {
            const body = await readBody(req);
            if (body.pin === ADMIN_PASSWORD) {
                const token = generateToken({ username: 'admin', role: 'admin', exp: Date.now() + 86400000 });
                return sendJson(res, 200, { success: true, message: 'Admin verified', token });
            } else {
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // Admin Clients CRUD
        if (req.method === 'GET' && url.pathname === '/api/admin/clients') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: clients, count: clients.length });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/clients') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            if (!body.name || !body.phone) return sendJson(res, 400, { success: false, message: 'Name and phone required' });
            const newClient = {
                id: generateClientId(),
                name: body.name,
                phone: body.phone,
                email: body.email || '',
                businessName: body.businessName || '',
                mpesaTill: body.mpesaTill || '',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            clients.push(newClient);
            saveClients();
            return sendJson(res, 200, { success: true, message: 'Client created', data: newClient });
        }

        if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/clients/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const clientId = url.pathname.split('/').pop();
            const body = await readBody(req);
            const index = clients.findIndex(c => c.id === clientId);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Client not found' });
            clients[index] = { ...clients[index], ...body, updatedAt: new Date().toISOString() };
            saveClients();
            return sendJson(res, 200, { success: true, message: 'Client updated', data: clients[index] });
        }

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/clients/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const clientId = url.pathname.split('/').pop();
            const index = clients.findIndex(c => c.id === clientId);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Client not found' });
            clients.splice(index, 1);
            saveClients();
            return sendJson(res, 200, { success: true, message: 'Client deleted' });
        }

        // Admin Products CRUD
        if (req.method === 'GET' && url.pathname === '/api/admin/products') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: products, count: products.length });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/products') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            if (!body.name || body.price === undefined) return sendJson(res, 400, { success: false, message: 'Name and price required' });
            const newProduct = {
                id: generateProductId(),
                name: body.name,
                description: body.description || '',
                price: Number(body.price),
                imageUrl: body.imageUrl || '',
                category: body.category || 'general',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            products.push(newProduct);
            saveProducts();
            return sendJson(res, 200, { success: true, message: 'Product created', data: newProduct });
        }

        if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/products/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const productId = url.pathname.split('/').pop();
            const body = await readBody(req);
            const index = products.findIndex(p => p.id === productId);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Product not found' });
            products[index] = { ...products[index], ...body, price: body.price !== undefined ? Number(body.price) : products[index].price, updatedAt: new Date().toISOString() };
            saveProducts();
            return sendJson(res, 200, { success: true, message: 'Product updated', data: products[index] });
        }

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/products/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const productId = url.pathname.split('/').pop();
            const index = products.findIndex(p => p.id === productId);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Product not found' });
            products.splice(index, 1);
            saveProducts();
            return sendJson(res, 200, { success: true, message: 'Product deleted' });
        }

        // Admin Plans
        if (req.method === 'GET' && url.pathname === '/api/admin/plans') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: plans });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/plans') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            if (!body.id || !body.name || body.price === undefined) return sendJson(res, 400, { success: false, message: 'ID, name, and price required' });
            if (plans.find(p => p.id === body.id)) return sendJson(res, 400, { success: false, message: 'Plan ID already exists' });
            plans.push({ id: body.id, name: body.name, price: Number(body.price), devices: body.devices || 1, shared_users: body.shared_users || 1, duration_seconds: body.duration_seconds || 3600 });
            savePlans();
            return sendJson(res, 200, { success: true, message: 'Plan created', data: plans[plans.length - 1] });
        }

        if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/plans/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const planId = url.pathname.split('/').pop();
            const body = await readBody(req);
            const plan = plans.find(p => p.id === planId);
            if (!plan) return sendJson(res, 404, { success: false, message: 'Plan not found' });
            if (body.name) plan.name = body.name;
            if (body.price !== undefined) plan.price = Number(body.price);
            if (body.devices !== undefined) plan.devices = Number(body.devices);
            if (body.shared_users !== undefined) plan.shared_users = Number(body.shared_users);
            if (body.duration_seconds !== undefined) plan.duration_seconds = Number(body.duration_seconds);
            savePlans();
            return sendJson(res, 200, { success: true, message: 'Plan updated', data: plan });
        }

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/plans/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const planId = url.pathname.split('/').pop();
            const index = plans.findIndex(p => p.id === planId);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Plan not found' });
            plans.splice(index, 1);
            savePlans();
            return sendJson(res, 200, { success: true, message: 'Plan deleted' });
        }

        // Admin Vouchers
        if (req.method === 'POST' && url.pathname === '/api/admin/voucher/generate') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            const plan = plans.find(p => p.id === body.planId);
            if (!plan) return sendJson(res, 400, { success: false, message: 'Invalid plan ID' });
            const count = Math.min(body.count || 1, 100);
            const generated = [];
            for (let i = 0; i < count; i++) {
                const code = generateVoucherCode();
                vouchers.push({
                    code: code,
                    planId: plan.id,
                    planName: plan.name,
                    duration_seconds: body.duration_seconds || plan.duration_seconds,
                    devices: plan.devices || 1,
                    used: false,
                    usedBy: null,
                    usedAt: null,
                    expiresAt: null,
                    createdAt: new Date().toISOString()
                });
                generated.push(code);
            }
            saveVouchers();
            return sendJson(res, 200, { success: true, message: 'Generated ' + generated.length + ' vouchers', vouchers: generated, count: generated.length });
        }

        if (req.method === 'GET' && url.pathname === '/api/admin/vouchers') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: vouchers, count: vouchers.length, used: vouchers.filter(v => v.used).length, unused: vouchers.filter(v => !v.used).length });
        }

        // Admin Transactions
        if (req.method === 'GET' && url.pathname === '/api/admin/transactions') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, {
                success: true,
                data: transactions,
                count: transactions.length,
                summary: {
                    total: transactions.length,
                    completed: transactions.filter(t => t.status === 'completed').length,
                    pending: transactions.filter(t => t.status === 'pending').length,
                    cancelled: transactions.filter(t => t.status === 'cancelled').length,
                    failed: transactions.filter(t => t.status === 'failed').length,
                    totalRevenue: transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0)
                }
            });
        }

        // Admin Settings
        if (req.method === 'GET' && url.pathname === '/api/admin/settings') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: settings });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/settings') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            if (body.theme) {
                const theme = themes.find(t => t.id === body.theme);
                if (theme) {
                    settings.theme = theme.id;
                    settings.primaryColor = theme.colors.primary;
                    settings.secondaryColor = theme.colors.secondary;
                    settings.accentColor = theme.colors.accent;
                    settings.textColor = theme.colors.text;
                    settings.headerTextColor = theme.colors.headerText;
                    settings.buttonTextColor = theme.colors.buttonText;
                    settings.bgGradient = theme.gradient;
                }
            }
            if (body.primaryColor !== undefined) settings.primaryColor = body.primaryColor;
            if (body.secondaryColor !== undefined) settings.secondaryColor = body.secondaryColor;
            if (body.accentColor !== undefined) settings.accentColor = body.accentColor;
            if (body.businessName !== undefined) settings.businessName = body.businessName;
            if (body.businessTagline !== undefined) settings.businessTagline = body.businessTagline;
            if (body.supportPhone !== undefined) settings.supportPhone = body.supportPhone;
            if (body.supportEmail !== undefined) settings.supportEmail = body.supportEmail;
            if (body.website !== undefined) settings.website = body.website;
            if (body.logo !== undefined) settings.logo = body.logo;
            saveSettings();
            return sendJson(res, 200, { success: true, message: 'Settings updated', data: settings });
        }

        // Admin Themes
        if (req.method === 'GET' && url.pathname === '/api/admin/themes') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: themes });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/themes') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            const newTheme = {
                id: body.id || 'theme_' + Date.now(),
                name: body.name || 'Custom Theme',
                preview: body.preview || '🎨',
                colors: body.colors || { primary: '#00c853', secondary: '#00e676', accent: '#0f2027', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' },
                gradient: body.gradient || 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)'
            };
            themes.push(newTheme);
            saveThemes();
            return sendJson(res, 200, { success: true, message: 'Theme added', data: newTheme });
        }

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/themes/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const themeId = url.pathname.split('/').pop();
            if (themeId === 'default') return sendJson(res, 400, { success: false, message: 'Cannot delete default theme' });
            const index = themes.findIndex(t => t.id === themeId);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Theme not found' });
            themes.splice(index, 1);
            saveThemes();
            return sendJson(res, 200, { success: true, message: 'Theme deleted' });
        }

        // Get Credentials
        if (req.method === 'GET' && url.pathname.startsWith('/api/get-credentials/')) {
            const transactionId = url.pathname.split('/').pop();
            const transaction = transactions.find(t => t.id === transactionId);
            if (!transaction) return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            if (transaction.status !== 'completed') return sendJson(res, 400, { success: false, message: 'Payment not completed' });
            return sendJson(res, 200, {
                success: true,
                username: transaction.mikrotikUsername || 'user_' + (transaction.mpesaCode || transaction.id).substring(0, 12),
                password: transaction.mikrotikPassword || 'pass_' + Date.now().toString(36),
                plan: transaction.planName,
                expiresAt: transaction.expiresAt || new Date(Date.now() + 7200000).toISOString()
            });
        }

        // ============================================================
        // MULTI-TENANT ENDPOINTS
        // ============================================================

        // Master Admin Verify
        if (req.method === 'POST' && url.pathname === '/api/master/verify') {
            const body = await readBody(req);
            if (body.pin === MASTER_PASSWORD) {
                const token = generateToken({ username: 'master', role: 'master', exp: Date.now() + 86400000 });
                return sendJson(res, 200, { success: true, message: 'Master verified', token, role: 'master' });
            } else {
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // Get All Organizations
        if (req.method === 'GET' && url.pathname === '/api/master/organizations') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: organizations, count: organizations.length });
        }

        // Create Organization
        if (req.method === 'POST' && url.pathname === '/api/master/organizations') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            if (!body.name || !body.businessName || !body.email || !body.phone) {
                return sendJson(res, 400, { success: false, message: 'Name, Business Name, Email, and Phone are required' });
            }
            const clientId = generateOrgId();
            const newOrganization = {
                id: clientId,
                name: body.name,
                businessName: body.businessName,
                email: body.email,
                phone: body.phone,
                logo: body.logo || '',
                primaryColor: body.primaryColor || masterSettings.defaultPrimaryColor || '#00c853',
                secondaryColor: body.secondaryColor || '#00e676',
                accentColor: body.accentColor || '#0f2027',
                textColor: '#ffffff',
                headerTextColor: '#ffffff',
                buttonTextColor: '#000000',
                bgGradient: body.bgGradient || masterSettings.defaultBgGradient || 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
                supportPhone: body.supportPhone || body.phone,
                supportEmail: body.supportEmail || body.email,
                website: body.website || '',
                businessTagline: body.businessTagline || 'Fast • Secure • Reliable',
                mpesaTill: body.mpesaTill || '',
                mpesaShortcode: SHORTCODE,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                plans: body.plans || [
                    { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, shared_users: 1, duration_seconds: 7200 },
                    { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, shared_users: 1, duration_seconds: 18000 },
                    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, shared_users: 1, duration_seconds: 86400 }
                ]
            };
            organizations.push(newOrganization);
            saveOrganizations();

            // Also add to clients
            clients.push({
                id: clientId,
                name: body.name,
                phone: body.phone,
                email: body.email,
                businessName: body.businessName,
                mpesaTill: body.mpesaTill || '',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isOrganization: true,
                organizationId: clientId
            });
            saveClients();

            return sendJson(res, 200, {
                success: true,
                message: 'Organization created!',
                data: newOrganization,
                clientId: clientId,
                clientPageUrl: `/${clientId}/client-page.html`
            });
        }

        // Get Organization by ID
        if (req.method === 'GET' && url.pathname.startsWith('/api/organization/')) {
            const orgId = url.pathname.split('/').pop();
            if (!orgId || orgId === 'organizations') {
                return sendJson(res, 400, { success: false, message: 'Invalid organization ID' });
            }
            const organization = getOrganizationByClientId(orgId);
            if (!organization) return sendJson(res, 404, { success: false, message: 'Organization not found' });
            return sendJson(res, 200, {
                success: true,
                data: {
                    id: organization.id,
                    businessName: organization.businessName,
                    logo: organization.logo || '',
                    primaryColor: organization.primaryColor,
                    secondaryColor: organization.secondaryColor,
                    accentColor: organization.accentColor,
                    textColor: organization.textColor,
                    headerTextColor: organization.headerTextColor,
                    buttonTextColor: organization.buttonTextColor,
                    bgGradient: organization.bgGradient,
                    supportPhone: organization.supportPhone,
                    supportEmail: organization.supportEmail,
                    website: organization.website,
                    businessTagline: organization.businessTagline,
                    plans: organization.plans || [],
                    status: organization.status
                }
            });
        }

        // Update Organization
        if (req.method === 'PUT' && url.pathname.startsWith('/api/master/organizations/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const orgId = url.pathname.split('/').pop();
            const body = await readBody(req);
            const index = organizations.findIndex(o => o.id === orgId);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Organization not found' });
            organizations[index] = { ...organizations[index], ...body, updatedAt: new Date().toISOString() };
            saveOrganizations();

            const clientIndex = clients.findIndex(c => c.id === orgId);
            if (clientIndex !== -1) {
                clients[clientIndex] = { ...clients[clientIndex], ...body, updatedAt: new Date().toISOString() };
                saveClients();
            }
            return sendJson(res, 200, { success: true, message: 'Organization updated', data: organizations[index] });
        }

        // Delete Organization
        if (req.method === 'DELETE' && url.pathname.startsWith('/api/master/organizations/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const orgId = url.pathname.split('/').pop();
            const orgIndex = organizations.findIndex(o => o.id === orgId);
            if (orgIndex === -1) return sendJson(res, 404, { success: false, message: 'Organization not found' });
            organizations.splice(orgIndex, 1);
            saveOrganizations();

            const clientIndex = clients.findIndex(c => c.id === orgId);
            if (clientIndex !== -1) { clients.splice(clientIndex, 1);
                saveClients(); }
            return sendJson(res, 200, { success: true, message: 'Organization deleted' });
        }

        // Master Settings
        if (req.method === 'GET' && url.pathname === '/api/master/settings') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: masterSettings });
        }

        if (req.method === 'POST' && url.pathname === '/api/master/settings') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const body = await readBody(req);
            masterSettings = { ...masterSettings, ...body, updatedAt: new Date().toISOString() };
            saveMasterSettings();
            return sendJson(res, 200, { success: true, message: 'Master settings updated', data: masterSettings });
        }

        // Generate Client HTML
        if (req.method === 'GET' && url.pathname.startsWith('/api/master/generate-client-page/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const orgId = url.pathname.split('/').pop();
            const organization = getOrganizationByClientId(orgId);
            if (!organization) return sendJson(res, 404, { success: false, message: 'Organization not found' });
            const html = generateClientSkeletonHtml(organization);
            return sendJson(res, 200, {
                success: true,
                html: html,
                filename: `${orgId}_client_page.html`,
                instructions: 'Copy this HTML and give it to your client. Works on local WiFi (MikroTik), local PC, and online!'
            });
        }

        // Serve Client Page
        if (req.method === 'GET' && url.pathname.match(/^\/CLIENT_[A-Z0-9]+\/client-page\.html$/)) {
            const pathParts = url.pathname.split('/');
            const orgId = pathParts[1];
            const organization = getOrganizationByClientId(orgId);
            if (!organization) {
                return sendHtml(res, 404, `<h1>❌ Organization Not Found</h1><p>ID: ${orgId}</p>`);
            }
            const html = generateClientSkeletonHtml(organization);
            return sendHtml(res, 200, html);
        }

        if (req.method === 'GET' && url.pathname.match(/^\/CLIENT_[A-Z0-9]+\/?$/)) {
            const orgId = url.pathname.replace('/', '');
            const organization = getOrganizationByClientId(orgId);
            if (!organization) {
                return sendHtml(res, 404, `<h1>❌ Organization Not Found</h1><p>ID: ${orgId}</p>`);
            }
            const html = generateClientSkeletonHtml(organization);
            return sendHtml(res, 200, html);
        }

        if (req.method === 'GET' && url.pathname === '/client-page.html' && url.searchParams.has('org')) {
            const orgId = url.searchParams.get('org');
            const organization = getOrganizationByClientId(orgId);
            if (!organization) {
                return sendHtml(res, 404, `<h1>❌ Organization Not Found</h1><p>ID: ${orgId}</p>`);
            }
            const html = generateClientSkeletonHtml(organization);
            return sendHtml(res, 200, html);
        }

        // ============================================================
        // API INFO
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api') {
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '3.0.0',
                status: 'Running',
                statistics: {
                    totalTransactions: transactions.length,
                    totalRevenue: transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0),
                    activeVouchers: vouchers.filter(v => !v.used).length,
                    totalClients: clients.length,
                    totalProducts: products.length,
                    totalOrganizations: organizations.length
                }
            });
        }

        return sendJson(res, 404, { error: 'Route not found' });

    } catch (err) {
        console.error('Server error:', err);
        return sendJson(res, 500, { error: 'Internal server error' });
    }
});

// ============================================================
// LOAD DATA & START SERVER
// ============================================================

loadAllData();

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n========================================');
    console.log('🌐 GICH WiFi API');
    console.log('========================================');
    console.log(`✅ Server running on port: ${PORT}`);
    console.log(`📍 http://localhost:${PORT}/`);
    console.log(`📍 http://localhost:${PORT}/api/health`);
    console.log('========================================');
    console.log(`🛡️ Admin PIN: ${ADMIN_PASSWORD ? '✅ Set' : '⚠️ NOT SET'}`);
    console.log(`👑 Master PIN: ${MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'}`);
    console.log(`🏢 Organizations: ${organizations.length}`);
    console.log('========================================\n');
});

process.on('uncaughtException', (err) => console.error('❌ Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));
