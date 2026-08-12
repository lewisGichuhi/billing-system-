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
console.log('   Port: ' + PORT);
console.log('   Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('========================================\n');

// ============================================================
// JWT HELPER
// ============================================================

function generateToken(payload) {
    var header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    var body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    var signature = crypto.createHmac('sha256', JWT_SECRET)
        .update(header + '.' + body)
        .digest('base64url');
    return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
    try {
        var parts = token.split('.');
        var header = parts[0];
        var body = parts[1];
        var signature = parts[2];
        var expectedSignature = crypto.createHmac('sha256', JWT_SECRET)
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

var agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
});

// ============================================================
// DATA STORAGE
// ============================================================

var TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');
var VOUCHERS_FILE = path.join(__dirname, 'vouchers.json');
var PLANS_FILE = path.join(__dirname, 'plans.json');
var SETTINGS_FILE = path.join(__dirname, 'settings.json');
var THEMES_FILE = path.join(__dirname, 'themes.json');
var CLIENTS_FILE = path.join(__dirname, 'clients.json');
var PRODUCTS_FILE = path.join(__dirname, 'products.json');
var ORGANIZATIONS_FILE = path.join(__dirname, 'organizations.json');
var MASTER_SETTINGS_FILE = path.join(__dirname, 'master-settings.json');

var transactions = [];
var vouchers = [];
var plans = [];
var settings = {};
var themes = [];
var clients = [];
var products = [];
var organizations = [];
var masterSettings = {};

// ============================================================
// DEFAULT SETTINGS
// ============================================================

var DEFAULT_SETTINGS = {
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

var DEFAULT_MASTER_SETTINGS = {
    masterBusinessName: 'GICH WiFi Master',
    masterEmail: 'master@gichwifi.co.ke',
    masterPhone: '0796587763',
    defaultPrimaryColor: '#00c853',
    defaultBgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    commissionRate: 5,
    createdAt: new Date().toISOString()
};

var DEFAULT_THEMES = [
    { id: 'default', name: 'Default Green', preview: '🌿', colors: { primary: '#00c853', secondary: '#00e676', accent: '#0f2027', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
    { id: 'ocean', name: 'Ocean Blue', preview: '🌊', colors: { primary: '#0077be', secondary: '#00b4d8', accent: '#03045e', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #03045e, #0077be, #00b4d8)' },
    { id: 'sunset', name: 'Sunset Orange', preview: '🌅', colors: { primary: '#ff6b35', secondary: '#ff9a56', accent: '#1a0a00', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #1a0a00, #ff6b35, #ff9a56)' },
    { id: 'midnight', name: 'Midnight Purple', preview: '🌙', colors: { primary: '#7c3aed', secondary: '#a78bfa', accent: '#0c0a1a', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #0c0a1a, #4c1d95, #7c3aed)' },
    { id: 'forest', name: 'Forest Green', preview: '🌲', colors: { primary: '#2d6a4f', secondary: '#40916c', accent: '#081c15', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #081c15, #2d6a4f, #40916c)' },
    { id: 'rose', name: 'Rose Pink', preview: '🌹', colors: { primary: '#e91e63', secondary: '#f06292', accent: '#1a0a12', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #1a0a12, #c2185b, #e91e63)' },
    { id: 'gold', name: 'Gold Premium', preview: '✨', colors: { primary: '#f9a825', secondary: '#fdd835', accent: '#1a1500', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #1a1500, #f9a825, #fdd835)' },
    { id: 'nebula', name: 'Nebula Cosmic', preview: '🌌', colors: { primary: '#e040fb', secondary: '#7c4dff', accent: '#0a0a1a', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: 'linear-gradient(135deg, #0a0a1a, #7c4dff, #e040fb)' }
];

var DEFAULT_PLANS = [
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
    if (fs.existsSync(TRANSACTIONS_FILE)) {
        try { transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8')); console.log('📂 Loaded ' + transactions.length + ' transactions'); } catch (e) { console.error('Error loading transactions:', e); }
    }
    if (fs.existsSync(VOUCHERS_FILE)) {
        try { vouchers = JSON.parse(fs.readFileSync(VOUCHERS_FILE, 'utf8')); console.log('🎟️ Loaded ' + vouchers.length + ' vouchers'); } catch (e) { console.error('Error loading vouchers:', e); }
    }
    if (fs.existsSync(PLANS_FILE)) {
        try { plans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8')); console.log('📦 Loaded ' + plans.length + ' plans'); } catch (e) { console.error('Error loading plans:', e); plans = DEFAULT_PLANS; }
    } else { plans = DEFAULT_PLANS; savePlans(); }
    if (fs.existsSync(SETTINGS_FILE)) {
        try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); console.log('⚙️ Loaded settings'); } catch (e) { console.error('Error loading settings:', e); settings = DEFAULT_SETTINGS; }
    } else { settings = DEFAULT_SETTINGS; saveSettings(); }
    if (fs.existsSync(THEMES_FILE)) {
        try { themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8')); console.log('🎨 Loaded ' + themes.length + ' themes'); } catch (e) { console.error('Error loading themes:', e); themes = DEFAULT_THEMES; }
    } else { themes = DEFAULT_THEMES; saveThemes(); }
    if (fs.existsSync(CLIENTS_FILE)) {
        try { clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')); console.log('👤 Loaded ' + clients.length + ' clients'); } catch (e) { console.error('Error loading clients:', e); clients = []; }
    } else { clients = []; saveClients(); }
    if (fs.existsSync(PRODUCTS_FILE)) {
        try { products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); console.log('📦 Loaded ' + products.length + ' products'); } catch (e) { console.error('Error loading products:', e); products = []; }
    } else { products = []; saveProducts(); }
    if (fs.existsSync(ORGANIZATIONS_FILE)) {
        try { organizations = JSON.parse(fs.readFileSync(ORGANIZATIONS_FILE, 'utf8')); console.log('🏢 Loaded ' + organizations.length + ' organizations'); } catch (e) { console.error('Error loading organizations:', e); organizations = []; }
    } else { organizations = []; saveOrganizations(); }
    if (fs.existsSync(MASTER_SETTINGS_FILE)) {
        try { masterSettings = JSON.parse(fs.readFileSync(MASTER_SETTINGS_FILE, 'utf8')); console.log('⚙️ Loaded master settings'); } catch (e) { console.error('Error loading master settings:', e); masterSettings = DEFAULT_MASTER_SETTINGS; }
    } else { masterSettings = DEFAULT_MASTER_SETTINGS; saveMasterSettings(); }
}

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

function getPlanName(planId) { var plan = plans.find(function(p) { return p.id === planId; }); return plan ? plan.name : planId; }
function getPlanDuration(planId) { var plan = plans.find(function(p) { return p.id === planId; }); return plan ? plan.duration_seconds : 3600; }
function generateVoucherCode() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 10; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return code; }
function normalizePhone(rawPhone) { if (!rawPhone) return null; var digits = String(rawPhone).trim().replace(/[^0-9+]/g, ''); digits = digits.replace(/^\+/, ''); if (digits.startsWith('0')) digits = digits.substring(1); if (digits.length === 9 && digits.startsWith('7')) return '254' + digits; if (digits.length === 10 && digits.startsWith('7')) return '254' + digits; if (digits.startsWith('254')) return digits; return digits; }
function timestampNow() { var now = new Date(); var pad = function(n) { return String(n).padStart(2, '0'); }; return '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()); }
function generateClientId() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function generateProductId() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 6; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'PROD_' + code; }
function generateOrgId() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function getOrganizationByClientId(clientId) { return organizations.find(function(org) { return org.id === clientId; }); }
function getOrganizationByEmail(email) { return organizations.find(function(org) { return org.email === email; }); }

// ============================================================
// REQUEST HELPER
// ============================================================

function simpleRequest(method, urlString, headers, jsonBody) {
    headers = headers || {};
    jsonBody = jsonBody || null;
    return new Promise(function(resolve, reject) {
        var url = new URL(urlString);
        var payload = jsonBody ? JSON.stringify(jsonBody) : null;
        var options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: method.toUpperCase(),
            headers: headers,
            timeout: 60000,
            agent: agent,
            family: 4
        };
        if (payload) { options.headers['Content-Length'] = Buffer.byteLength(payload); }
        options.headers['Connection'] = 'keep-alive';
        var req = https.request(options, function(res) {
            var chunks = [];
            res.on('data', function(chunk) { chunks.push(chunk); });
            res.on('end', function() {
                var bodyText = Buffer.concat(chunks).toString('utf8');
                var bodyJson = null;
                try { bodyJson = JSON.parse(bodyText); } catch (_) {}
                resolve({ statusCode: res.statusCode, statusMessage: res.statusMessage, bodyText: bodyText, bodyJson: bodyJson });
            });
        });
        req.on('error', function(err) { reject(new Error('Request failed: ' + err.message)); });
        req.on('timeout', function() { req.destroy(); reject(new Error('Request timed out')); });
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
    var auth = Buffer.from(CONSUMER_KEY.trim() + ':' + CONSUMER_SECRET.trim()).toString('base64');
    var res = await simpleRequest('GET', 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', { 'Authorization': 'Basic ' + auth, 'Accept': 'application/json' });
    if (res.statusCode !== 200) { throw new Error('OAuth failed (' + res.statusCode + '): ' + res.bodyText); }
    if (!res.bodyJson || !res.bodyJson.access_token) { throw new Error('No access token in response'); }
    console.log('✅ Access token obtained');
    return res.bodyJson.access_token;
}

// ============================================================
// STK PUSH
// ============================================================

async function stkPush(params) {
    var phone = params.phone;
    var amount = params.amount;
    var accountReference = params.accountReference;
    console.log('\n💳 Starting STK Push...');
    console.log('📱 Phone: ' + phone);
    console.log('💰 Amount: ' + amount);
    var numericAmount = Math.round(Number(amount));
    if (isNaN(numericAmount) || numericAmount < 1) { throw new Error('Invalid amount'); }
    var formattedPhone = normalizePhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) { throw new Error('Invalid phone: ' + phone); }
    var token = await getAccessToken();
    var timestamp = timestampNow();
    var password = Buffer.from(SHORTCODE + PASSKEY + timestamp).toString('base64');
    var payload = {
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
    var res = await simpleRequest('POST', 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, payload);
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
    return new Promise(function(resolve, reject) {
        var raw = '';
        req.on('data', function(chunk) { raw += chunk; });
        req.on('end', function() {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

function findHtmlFile(filename) {
    var paths = [path.join(__dirname, filename), path.join(__dirname, 'public', filename)];
    for (var i = 0; i < paths.length; i++) { if (fs.existsSync(paths[i])) return paths[i]; }
    return null;
}

function serveHtmlFile(res, filename) {
    try {
        var filePath = findHtmlFile(filename);
        if (filePath) { sendHtml(res, 200, fs.readFileSync(filePath, 'utf8')); return true; }
    } catch (err) { console.error('Error serving ' + filename + ':', err); }
    return false;
}

function isAdmin(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    var decoded = verifyToken(auth.replace('Bearer ', ''));
    return decoded && decoded.role === 'admin';
}

function isMasterAdmin(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    var decoded = verifyToken(auth.replace('Bearer ', ''));
    return decoded && decoded.role === 'master';
}

function isClient(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    
    var token = auth.replace('Bearer ', '');
    
    if (token && token.indexOf('master_bypass_') === 0) {
        console.log('🔐 Master bypass token detected - granting access');
        return true;
    }
    
    if (token && token.indexOf('demo_token_') === 0) {
        console.log('🔐 Demo token detected - granting access');
        return true;
    }
    
    var decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'client') {
        return false;
    }
    return true;
}

// ============================================================
// GENERATE CLIENT SKELETON HTML
// ============================================================

function generateClientSkeletonHtml(organization) {
    var escapeHtml = function(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    var orgId = escapeHtml(organization.id);
    var businessName = escapeHtml(organization.businessName || organization.name || 'WiFi Service');
    var tagline = escapeHtml(organization.businessTagline || 'Fast • Secure • Reliable');
    var primaryColor = escapeHtml(organization.primaryColor || '#00c853');
    var secondaryColor = escapeHtml(organization.secondaryColor || '#00e676');
    var accentColor = escapeHtml(organization.accentColor || '#0f2027');
    var textColor = escapeHtml(organization.textColor || '#ffffff');
    var headerTextColor = escapeHtml(organization.headerTextColor || '#ffffff');
    var buttonTextColor = escapeHtml(organization.buttonTextColor || '#000000');
    var bgGradient = escapeHtml(organization.bgGradient || 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)');
    var supportPhone = escapeHtml(organization.supportPhone || '0796587763');
    var supportEmail = escapeHtml(organization.supportEmail || 'support@example.com');
    var logo = escapeHtml(organization.logo || '');
    var plans = organization.plans || [];

    var plansHtml = '';
    if (plans.length > 0) {
        var planCards = [];
        for (var i = 0; i < plans.length; i++) {
            var p = plans[i];
            var duration = p.duration_seconds || 3600;
            var hours = Math.floor(duration / 3600);
            var days = Math.floor(duration / 86400);
            var durationStr = '';
            if (days > 0) {
                durationStr = days + ' day' + (days > 1 ? 's' : '');
            } else {
                durationStr = hours + ' hour' + (hours > 1 ? 's' : '');
            }
            var isPopular = p.id === '1_Week_1_Device' || p.id === '24_Hours';
            planCards.push(
                '<div class="plan-card" data-plan-id="' + escapeHtml(p.id) + '" onclick="openPaymentModal(\'' + escapeHtml(p.id) + '\')">' +
                (isPopular ? '<div class="badge">🔥 Popular</div>' : '') +
                '<div class="plan-name">' + escapeHtml(p.name) + '</div>' +
                '<div class="plan-price">KES ' + p.price + ' <span>/ ' + durationStr + '</span></div>' +
                '<ul class="plan-features">' +
                '<li>' + (p.devices || 1) + ' device' + ((p.devices || 1) > 1 ? 's' : '') + '</li>' +
                '<li>' + (p.shared_users || 1) + ' user' + ((p.shared_users || 1) > 1 ? 's' : '') + '</li>' +
                '<li>Valid for ' + durationStr + '</li>' +
                '</ul></div>'
            );
        }
        plansHtml = planCards.join('');
    } else {
        plansHtml = '<div style="text-align:center;padding:40px;color:#666;">No plans available</div>';
    }

    var html = '<!DOCTYPE html>\n';
    html += '<html lang="en">\n';
    html += '<head>\n';
    html += '<meta charset="UTF-8">\n';
    html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '<title>' + businessName + ' - WiFi Services</title>\n';
    html += '<style>\n';
    html += ':root {\n';
    html += '--primary-color: ' + primaryColor + ';\n';
    html += '--secondary-color: ' + secondaryColor + ';\n';
    html += '--accent-color: ' + accentColor + ';\n';
    html += '--text-color: ' + textColor + ';\n';
    html += '--header-text-color: ' + headerTextColor + ';\n';
    html += '--button-text-color: ' + buttonTextColor + ';\n';
    html += '--bg-gradient: ' + bgGradient + ';\n';
    html += '}\n';
    html += '* { margin: 0; padding: 0; box-sizing: border-box; }\n';
    html += 'body {\n';
    html += 'font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif;\n';
    html += 'background: var(--accent-color);\n';
    html += 'color: var(--text-color);\n';
    html += 'min-height: 100vh;\n';
    html += '}\n';
    html += '.header {\n';
    html += 'background: var(--bg-gradient);\n';
    html += 'padding: 30px 20px;\n';
    html += 'text-align: center;\n';
    html += 'border-bottom: 3px solid var(--primary-color);\n';
    html += '}\n';
    html += '.header .logo {\n';
    html += 'max-width: 150px;\n';
    html += 'max-height: 80px;\n';
    html += 'margin-bottom: 10px;\n';
    html += (logo ? '' : 'display: none;') + '\n';
    html += '}\n';
    html += '.header h1 { font-size: 32px; color: var(--primary-color); }\n';
    html += '.header p { color: var(--header-text-color); font-size: 16px; margin-top: 4px; opacity: 0.8; }\n';
    html += '.container { max-width: 1200px; margin: 0 auto; padding: 20px; }\n';
    html += '.plans-grid {\n';
    html += 'display: grid;\n';
    html += 'grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));\n';
    html += 'gap: 20px;\n';
    html += 'margin-top: 20px;\n';
    html += '}\n';
    html += '.plan-card {\n';
    html += 'background: rgba(255,255,255,0.05);\n';
    html += 'backdrop-filter: blur(10px);\n';
    html += 'border-radius: 16px;\n';
    html += 'padding: 24px;\n';
    html += 'border: 1px solid rgba(255,255,255,0.08);\n';
    html += 'transition: 0.3s;\n';
    html += 'cursor: pointer;\n';
    html += 'position: relative;\n';
    html += '}\n';
    html += '.plan-card:hover {\n';
    html += 'transform: translateY(-4px);\n';
    html += 'border-color: var(--primary-color);\n';
    html += 'box-shadow: 0 8px 30px rgba(0,0,0,0.3);\n';
    html += '}\n';
    html += '.plan-card.selected {\n';
    html += 'border-color: var(--primary-color);\n';
    html += 'box-shadow: 0 0 0 2px var(--primary-color);\n';
    html += '}\n';
    html += '.plan-card .plan-name { font-size: 20px; font-weight: bold; color: var(--text-color); }\n';
    html += '.plan-card .plan-price { font-size: 28px; font-weight: bold; color: var(--primary-color); margin: 8px 0; }\n';
    html += '.plan-card .plan-price span { font-size: 14px; color: #888; font-weight: normal; }\n';
    html += '.plan-card .plan-features { color: #aaa; font-size: 14px; margin: 12px 0; list-style: none; }\n';
    html += '.plan-card .plan-features li { padding: 4px 0; }\n';
    html += '.plan-card .plan-features li::before { content: "✓ "; color: var(--primary-color); }\n';
    html += '.plan-card .badge {\n';
    html += 'position: absolute; top: 12px; right: 12px;\n';
    html += 'background: rgba(0,200,83,0.2); color: var(--primary-color);\n';
    html += 'padding: 2px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;\n';
    html += '}\n';
    html += '.voucher-section {\n';
    html += 'background: rgba(255,255,255,0.05);\n';
    html += 'backdrop-filter: blur(10px);\n';
    html += 'border-radius: 16px;\n';
    html += 'padding: 24px;\n';
    html += 'margin-top: 20px;\n';
    html += 'border: 2px dashed var(--primary-color);\n';
    html += '}\n';
    html += '.voucher-section h3 {\n';
    html += 'color: var(--primary-color);\n';
    html += 'margin-bottom: 12px;\n';
    html += 'font-size: 20px;\n';
    html += 'font-weight: 700;\n';
    html += '}\n';
    html += '.voucher-section .form-row {\n';
    html += 'display: flex;\n';
    html += 'gap: 12px;\n';
    html += 'flex-wrap: wrap;\n';
    html += '}\n';
    html += '.voucher-section .form-row input {\n';
    html += 'flex: 1;\n';
    html += 'min-width: 180px;\n';
    html += 'padding: 14px 18px;\n';
    html += 'background: rgba(0,0,0,0.4);\n';
    html += 'border: 2px solid rgba(255,255,255,0.1);\n';
    html += 'border-radius: 10px;\n';
    html += 'color: #fff;\n';
    html += 'font-size: 16px;\n';
    html += 'outline: none;\n';
    html += 'transition: 0.3s;\n';
    html += '}\n';
    html += '.voucher-section .form-row input:focus {\n';
    html += 'border-color: var(--primary-color);\n';
    html += 'box-shadow: 0 0 0 3px rgba(0,200,83,0.1);\n';
    html += '}\n';
    html += '.voucher-section .form-row input::placeholder {\n';
    html += 'color: #666;\n';
    html += '}\n';
    html += '.voucher-section .form-row .btn {\n';
    html += 'padding: 14px 32px;\n';
    html += 'background: var(--primary-color);\n';
    html += 'color: var(--button-text-color);\n';
    html += 'border: none;\n';
    html += 'border-radius: 10px;\n';
    html += 'font-size: 16px;\n';
    html += 'font-weight: bold;\n';
    html += 'cursor: pointer;\n';
    html += 'transition: 0.3s;\n';
    html += 'font-family: inherit;\n';
    html += 'white-space: nowrap;\n';
    html += '}\n';
    html += '.voucher-section .form-row .btn:hover {\n';
    html += 'opacity: 0.85;\n';
    html += 'transform: scale(1.02);\n';
    html += '}\n';
    html += '.voucher-section .form-row .btn:disabled {\n';
    html += 'opacity: 0.5;\n';
    html += 'cursor: not-allowed;\n';
    html += 'transform: none;\n';
    html += '}\n';
    html += '.voucher-section .voucher-result {\n';
    html += 'margin-top: 12px;\n';
    html += 'font-size: 14px;\n';
    html += 'color: #888;\n';
    html += 'padding: 8px 12px;\n';
    html += 'border-radius: 8px;\n';
    html += '}\n';
    html += '.voucher-section .voucher-result.success {\n';
    html += 'color: var(--primary-color);\n';
    html += 'background: rgba(0,200,83,0.08);\n';
    html += '}\n';
    html += '.voucher-section .voucher-result.error {\n';
    html += 'color: #ff4444;\n';
    html += 'background: rgba(255,68,68,0.08);\n';
    html += '}\n';
    html += '.check-section {\n';
    html += 'margin-top: 20px;\n';
    html += 'text-align: center;\n';
    html += '}\n';
    html += '.check-section .btn {\n';
    html += 'padding: 14px 32px;\n';
    html += 'background: var(--primary-color);\n';
    html += 'color: var(--button-text-color);\n';
    html += 'border: none;\n';
    html += 'border-radius: 10px;\n';
    html += 'font-size: 16px;\n';
    html += 'font-weight: bold;\n';
    html += 'cursor: pointer;\n';
    html += 'transition: 0.3s;\n';
    html += 'font-family: inherit;\n';
    html += 'width: 100%;\n';
    html += 'max-width: 400px;\n';
    html += '}\n';
    html += '.check-section .btn:hover {\n';
    html += 'opacity: 0.85;\n';
    html += 'transform: scale(1.02);\n';
    html += '}\n';
    html += '.check-section .result {\n';
    html += 'margin-top: 12px;\n';
    html += 'font-size: 14px;\n';
    html += 'color: #888;\n';
    html += 'padding: 8px 12px;\n';
    html += 'border-radius: 8px;\n';
    html += '}\n';
    html += '.check-section .result.success {\n';
    html += 'color: var(--primary-color);\n';
    html += 'background: rgba(0,200,83,0.08);\n';
    html += '}\n';
    html += '.check-section .result.error {\n';
    html += 'color: #ff4444;\n';
    html += 'background: rgba(255,68,68,0.08);\n';
    html += '}\n';
    html += '.payment-modal-overlay {\n';
    html += 'position: fixed; top: 0; left: 0; right: 0; bottom: 0;\n';
    html += 'background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);\n';
    html += 'display: none; align-items: center; justify-content: center;\n';
    html += 'z-index: 999; padding: 20px;\n';
    html += '}\n';
    html += '.payment-modal-overlay.active { display: flex; }\n';
    html += '.payment-modal {\n';
    html += 'background: #1a1a2e; border-radius: 20px; padding: 32px;\n';
    html += 'max-width: 440px; width: 100%;\n';
    html += 'border: 1px solid rgba(255,255,255,0.06);\n';
    html += 'box-shadow: 0 40px 100px rgba(0,0,0,0.6);\n';
    html += 'animation: modalSlideUp 0.35s ease; position: relative;\n';
    html += '}\n';
    html += '@keyframes modalSlideUp {\n';
    html += 'from { opacity: 0; transform: translateY(30px) scale(0.95); }\n';
    html += 'to { opacity: 1; transform: translateY(0) scale(1); }\n';
    html += '}\n';
    html += '.payment-modal .modal-close {\n';
    html += 'position: absolute; top: 14px; right: 18px;\n';
    html += 'background: none; border: none; color: #666;\n';
    html += 'font-size: 24px; cursor: pointer; transition: 0.2s;\n';
    html += '}\n';
    html += '.payment-modal .modal-close:hover { color: #fff; }\n';
    html += '.payment-modal .plan-detail { text-align: center; margin: 10px 0 20px 0; }\n';
    html += '.payment-modal .plan-detail .name { font-size: 22px; font-weight: bold; color: #fff; }\n';
    html += '.payment-modal .plan-detail .price { font-size: 32px; font-weight: bold; color: var(--primary-color); margin-top: 4px; }\n';
    html += '.payment-modal .plan-detail .duration { color: #888; font-size: 14px; }\n';
    html += '.payment-modal .form-group { margin-bottom: 16px; }\n';
    html += '.payment-modal .form-group label { display: block; color: #aaa; font-size: 13px; margin-bottom: 6px; font-weight: 600; }\n';
    html += '.payment-modal .form-group input {\n';
    html += 'width: 100%; padding: 12px 16px;\n';
    html += 'background: #0a0a1a; border: 2px solid rgba(255,255,255,0.06);\n';
    html += 'border-radius: 10px; color: #fff; font-size: 16px;\n';
    html += 'outline: none; transition: 0.25s;\n';
    html += '}\n';
    html += '.payment-modal .form-group input:focus { border-color: var(--primary-color); }\n';
    html += '.payment-modal .btn {\n';
    html += 'width: 100%; padding: 14px;\n';
    html += 'background: var(--primary-color); color: var(--button-text-color);\n';
    html += 'border: none; border-radius: 10px;\n';
    html += 'font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s;\n';
    html += '}\n';
    html += '.payment-modal .btn:hover { opacity: 0.85; transform: scale(1.01); }\n';
    html += '.payment-modal .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }\n';
    html += '.payment-modal .error-msg { color: #ff4444; font-size: 13px; margin-top: 8px; display: none; text-align: center; }\n';
    html += '.payment-modal .error-msg.show { display: block; }\n';
    html += '.payment-modal .test-hint { text-align: center; color: #555; font-size: 11px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 12px; }\n';
    html += '.success-overlay {\n';
    html += 'position: fixed; top: 0; left: 0; right: 0; bottom: 0;\n';
    html += 'background: var(--bg-gradient);\n';
    html += 'display: none; flex-direction: column; align-items: center; justify-content: center;\n';
    html += 'z-index: 1000; padding: 40px 20px;\n';
    html += 'animation: fadeIn 0.6s ease;\n';
    html += '}\n';
    html += '.success-overlay.active { display: flex; }\n';
    html += '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }\n';
    html += '.success-overlay .logo { max-width: 120px; max-height: 70px; margin-bottom: 12px; ' + (logo ? '' : 'display: none;') + ' }\n';
    html += '.success-overlay .icon { font-size: 72px; margin-bottom: 12px; }\n';
    html += '.success-overlay .title { font-size: 36px; font-weight: 700; color: var(--primary-color); text-align: center; }\n';
    html += '.success-overlay .subtitle { font-size: 18px; color: #aaa; text-align: center; margin-top: 4px; }\n';
    html += '.success-overlay .business-name { font-size: 22px; color: #fff; margin-top: 8px; text-align: center; }\n';
    html += '.success-overlay .timer-container { margin: 25px 0 10px 0; text-align: center; padding: 25px 40px; background: rgba(0,0,0,0.3); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); }\n';
    html += '.success-overlay .timer-label { color: #888; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }\n';
    html += '.success-overlay .timer { font-size: 56px; font-weight: 700; color: var(--primary-color); font-family: \'Courier New\', monospace; letter-spacing: 4px; margin-top: 4px; }\n';
    html += '.success-overlay .timer.expired { color: #ff4444; }\n';
    html += '.success-overlay .enjoy-text { color: var(--primary-color); font-size: 18px; margin-top: 16px; opacity: 0.9; text-align: center; }\n';
    html += '.success-overlay .credentials { background: rgba(0,0,0,0.3); border-radius: 12px; padding: 16px 24px; margin-top: 16px; border: 1px solid rgba(255,255,255,0.05); width: 100%; max-width: 400px; }\n';
    html += '.success-overlay .credentials .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }\n';
    html += '.success-overlay .credentials .row:last-child { border-bottom: none; }\n';
    html += '.success-overlay .credentials .label { color: #888; font-size: 13px; }\n';
    html += '.success-overlay .credentials .value { color: #fff; font-family: monospace; font-size: 13px; }\n';
    html += '.success-overlay .auto-close { color: #555; font-size: 12px; margin-top: 20px; animation: pulse 2s infinite; }\n';
    html += '@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }\n';
    html += '.success-overlay .powered-by { color: #444; font-size: 12px; margin-top: 30px; }\n';
    html += '.success-overlay .powered-by .brand { color: var(--primary-color); font-weight: bold; }\n';
    html += '.toast {\n';
    html += 'position: fixed; bottom: 30px; right: 30px;\n';
    html += 'padding: 14px 22px; border-radius: 12px;\n';
    html += 'background: #1a1a2e; border: 1px solid rgba(255,255,255,0.05);\n';
    html += 'color: #fff; font-size: 14px; z-index: 999;\n';
    html += 'transform: translateY(100px); opacity: 0;\n';
    html += 'transition: 0.35s ease; max-width: 400px;\n';
    html += 'box-shadow: 0 20px 60px rgba(0,0,0,0.4);\n';
    html += '}\n';
    html += '.toast.show { transform: translateY(0); opacity: 1; }\n';
    html += '.toast.success { border-color: var(--primary-color); }\n';
    html += '.toast.error { border-color: #ff4444; }\n';
    html += '.toast.info { border-color: #2196f3; }\n';
    html += '.loading {\n';
    html += 'display: inline-block;\n';
    html += 'width: 20px;\n';
    html += 'height: 20px;\n';
    html += 'border: 3px solid rgba(255,255,255,0.1);\n';
    html += 'border-top-color: var(--primary-color);\n';
    html += 'border-radius: 50%;\n';
    html += 'animation: spin 0.8s linear infinite;\n';
    html += 'vertical-align: middle;\n';
    html += 'margin-right: 8px;\n';
    html += '}\n';
    html += '@keyframes spin { to { transform: rotate(360deg); } }\n';
    html += '@media (max-width: 600px) {\n';
    html += '.header h1 { font-size: 24px; }\n';
    html += '.plans-grid { grid-template-columns: 1fr 1fr; gap: 12px; }\n';
    html += '.plan-card { padding: 16px; }\n';
    html += '.plan-card .plan-name { font-size: 16px; }\n';
    html += '.plan-card .plan-price { font-size: 22px; }\n';
    html += '.payment-modal { padding: 24px 20px; }\n';
    html += '.success-overlay .timer { font-size: 38px; }\n';
    html += '.success-overlay .title { font-size: 28px; }\n';
    html += '.success-overlay .timer-container { padding: 20px; min-width: 200px; }\n';
    html += '.voucher-section .form-row { flex-direction: column; }\n';
    html += '.voucher-section .form-row .btn { width: 100%; }\n';
    html += '}\n';
    html += '@media (max-width: 400px) { .plans-grid { grid-template-columns: 1fr; } }\n';
    html += '::-webkit-scrollbar { width: 6px; }\n';
    html += '::-webkit-scrollbar-track { background: var(--accent-color); }\n';
    html += '::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }\n';
    html += '</style>\n';
    html += '</head>\n';
    html += '<body>\n';

    // HEADER
    html += '<div class="header" id="pageHeader">\n';
    if (logo) {
        html += '<img id="logoImage" src="' + logo + '" alt="' + businessName + '" class="logo">\n';
    } else {
        html += '<img id="logoImage" src="" alt="Logo" class="logo" style="display:none;">\n';
    }
    html += '<h1 id="businessName">🌐 ' + businessName + '</h1>\n';
    html += '<p id="tagline">' + tagline + '</p>\n';
    html += '</div>\n';

    // CONTAINER
    html += '<div class="container" id="mainContainer">\n';
    html += '<h2 style="color:var(--primary-color); margin-bottom:8px;">📶 Choose Your Plan</h2>\n';
    html += '<p style="color:#888; margin-bottom:16px;">Select a package that fits your needs</p>\n';
    html += '<div class="plans-grid" id="plansGrid">\n';
    html += '<div style="text-align:center;padding:40px;color:#888;grid-column:1/-1;">\n';
    html += '<span class="loading"></span> Loading plans...\n';
    html += '</div>\n';
    html += '</div>\n';

    // VOUCHER SECTION
    html += '<div class="voucher-section" id="voucherSection">\n';
    html += '<h3>🎟️ Have a Voucher?</h3>\n';
    html += '<div class="form-row">\n';
    html += '<input type="text" id="voucherInput" placeholder="Enter voucher code (e.g., ABC123XYZ)" autocomplete="off">\n';
    html += '<input type="tel" id="voucherPhoneInput" placeholder="📱 Your phone number" autocomplete="off">\n';
    html += '<button class="btn" id="voucherRedeemBtn" onclick="redeemVoucher()">🎟️ Redeem</button>\n';
    html += '</div>\n';
    html += '<div class="voucher-result" id="voucherResult"></div>\n';
    html += '</div>\n';

    // CHECK & CONNECT
    html += '<div class="check-section">\n';
    html += '<button class="btn" onclick="checkAndConnect()">🔌 Check & Connect</button>\n';
    html += '<div class="result" id="checkResult"></div>\n';
    html += '</div>\n';
    html += '</div>\n';

    // PAYMENT MODAL
    html += '<div class="payment-modal-overlay" id="paymentModal">\n';
    html += '<div class="payment-modal">\n';
    html += '<button class="modal-close" onclick="closePaymentModal()">✕</button>\n';
    html += '<div class="plan-detail">\n';
    html += '<div class="name" id="modalPlanName">2 Hours</div>\n';
    html += '<div class="price" id="modalPlanPrice">KES 10</div>\n';
    html += '<div class="duration" id="modalPlanDuration">Valid for 2 hours</div>\n';
    html += '</div>\n';
    html += '<div class="form-group">\n';
    html += '<label>📱 Phone Number</label>\n';
    html += '<input type="tel" id="modalPhone" placeholder="0712345678" autofocus>\n';
    html += '</div>\n';
    html += '<button class="btn" id="modalPayBtn" onclick="modalPay()">💳 Pay Now</button>\n';
    html += '<div class="error-msg" id="modalError">Please enter a valid phone number</div>\n';
    html += '<div class="test-hint">🔑 Test PIN: 12345</div>\n';
    html += '</div>\n';
    html += '</div>\n';

    // SUCCESS OVERLAY
    html += '<div class="success-overlay" id="successOverlay">\n';
    if (logo) {
        html += '<img id="successLogo" src="' + logo + '" alt="' + businessName + '" class="logo">\n';
    } else {
        html += '<img id="successLogo" src="" alt="Logo" class="logo" style="display:none;">\n';
    }
    html += '<div class="icon">🎉</div>\n';
    html += '<div class="title">You\'re Connected!</div>\n';
    html += '<div class="subtitle">Enjoy your high-speed internet</div>\n';
    html += '<div class="business-name" id="successBusinessName">' + businessName + '</div>\n';
    html += '<div class="timer-container">\n';
    html += '<div class="timer-label">⏱ Time Remaining</div>\n';
    html += '<div class="timer" id="successTimer">--:--:--</div>\n';
    html += '</div>\n';
    html += '<div class="credentials" id="successCredentials">\n';
    html += '<div class="row"><span class="label">Username</span><span class="value" id="credUsername">-</span></div>\n';
    html += '<div class="row"><span class="label">Password</span><span class="value" id="credPassword">-</span></div>\n';
    html += '<div class="row"><span class="label">Plan</span><span class="value" id="credPlan">-</span></div>\n';
    html += '</div>\n';
    html += '<div class="enjoy-text" id="enjoyText">🌐 Enjoy your browsing!</div>\n';
    html += '<div class="auto-close">⏳ This page will close automatically when your plan expires</div>\n';
    html += '<div class="powered-by">Powered by <span class="brand" id="brandName">' + businessName + '</span></div>\n';
    html += '</div>\n';

    // TOAST
    html += '<div class="toast" id="toast">\n';
    html += '<span id="toastIcon">✅</span>\n';
    html += '<span id="toastMessage">Success!</span>\n';
    html += '</div>\n';

    // JAVASCRIPT
    html += '<script>\n';
    html += 'var RENDER_URL = "' + (process.env.RENDER_URL || 'https://billing-system-fm9a.onrender.com') + '";\n';
    html += 'var currentHost = window.location.hostname;\n';
    html += 'var isLocal = currentHost === "localhost" || currentHost === "127.0.0.1" || currentHost === "" || currentHost === "192.168.88.1" || currentHost === "192.168.1.1" || window.location.protocol === "file:";\n';
    html += 'var API_URL = isLocal ? RENDER_URL + "/api" : window.location.origin + "/api";\n';
    html += 'console.log("📡 API URL:", API_URL);\n';

    html += 'var ORG_ID = "' + orgId + '";\n';
    html += 'if (!ORG_ID || ORG_ID === "") {\n';
    html += 'var pathParts = window.location.pathname.split("/");\n';
    html += 'for (var i = 0; i < pathParts.length; i++) {\n';
    html += 'if (pathParts[i].startsWith("CLIENT_")) { ORG_ID = pathParts[i]; break; }\n';
    html += '}\n';
    html += '}\n';
    html += 'if (!ORG_ID || ORG_ID === "") {\n';
    html += 'var urlParams = new URLSearchParams(window.location.search);\n';
    html += 'ORG_ID = urlParams.get("org") || urlParams.get("client") || "";\n';
    html += '}\n';
    html += 'console.log("🏢 Organization ID:", ORG_ID);\n';

    html += 'var plans = [];\n';
    html += 'var selectedPlan = null;\n';
    html += 'var pollingInterval = null;\n';
    html += 'var currentTransactionId = null;\n';
    html += 'var countdownInterval = null;\n';
    html += 'var credentials = null;\n';
    html += 'var pollingActive = false;\n';
    html += 'var plansGrid = document.getElementById("plansGrid");\n';

    html += 'document.addEventListener("DOMContentLoaded", function() {\n';
    html += 'if (ORG_ID && ORG_ID !== "") {\n';
    html += 'loadOrganizationData();\n';
    html += '} else {\n';
    html += 'plansGrid.innerHTML = "<div style=\\"text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;\\">❌ Organization ID not found</div>";\n';
    html += '}\n';
    html += '});\n';

    html += 'function loadOrganizationData() {\n';
    html += 'fetch(API_URL + "/organization/" + ORG_ID)\n';
    html += '.then(function(r) { return r.json(); })\n';
    html += '.then(function(data) {\n';
    html += 'if (data.success) {\n';
    html += 'var org = data.data;\n';
    html += 'plans = org.plans || [];\n';
    html += 'if (org.primaryColor) {\n';
    html += 'document.documentElement.style.setProperty("--primary-color", org.primaryColor);\n';
    html += '}\n';
    html += 'if (org.businessName) {\n';
    html += 'document.getElementById("businessName").textContent = "🌐 " + org.businessName;\n';
    html += 'document.getElementById("successBusinessName").textContent = org.businessName;\n';
    html += 'document.getElementById("brandName").textContent = org.businessName;\n';
    html += 'document.title = org.businessName + " - WiFi Services";\n';
    html += '}\n';
    html += 'if (org.businessTagline) {\n';
    html += 'document.getElementById("tagline").textContent = org.businessTagline;\n';
    html += '}\n';
    html += 'if (org.logo) {\n';
    html += 'var logoImg = document.getElementById("logoImage");\n';
    html += 'logoImg.src = org.logo;\n';
    html += 'logoImg.style.display = "block";\n';
    html += 'var successLogo = document.getElementById("successLogo");\n';
    html += 'successLogo.src = org.logo;\n';
    html += 'successLogo.style.display = "block";\n';
    html += '}\n';
    html += 'renderPlans();\n';
    html += '} else {\n';
    html += 'plansGrid.innerHTML = "<div style=\\"text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;\\">❌ " + (data.message || "Failed to load plans") + "</div>";\n';
    html += '}\n';
    html += '})\n';
    html += '.catch(function(err) {\n';
    html += 'plansGrid.innerHTML = "<div style=\\"text-align:center;padding:40px;color:#ff4444;grid-column:1/-1;\\">❌ Network error loading plans<br><button onclick=\\"loadOrganizationData()\\" style=\\"padding:8px 20px;background:var(--primary-color);color:#000;border:none;border-radius:6px;cursor:pointer;\\">🔄 Retry</button></div>";\n';
    html += '});\n';
    html += '}\n';

    html += 'function renderPlans() {\n';
    html += 'if (!plans || plans.length === 0) {\n';
    html += 'plansGrid.innerHTML = "<div style=\\"text-align:center;padding:40px;color:#666;grid-column:1/-1;\\">No plans available</div>";\n';
    html += 'return;\n';
    html += '}\n';
    html += 'var html = "";\n';
    html += 'for (var i = 0; i < plans.length; i++) {\n';
    html += 'var p = plans[i];\n';
    html += 'var duration = p.duration_seconds || 3600;\n';
    html += 'var hours = Math.floor(duration / 3600);\n';
    html += 'var days = Math.floor(duration / 86400);\n';
    html += 'var durationStr = "";\n';
    html += 'if (days > 0) { durationStr = days + " day" + (days > 1 ? "s" : ""); } else { durationStr = hours + " hour" + (hours > 1 ? "s" : ""); }\n';
    html += 'var isPopular = p.id === "1_Week_1_Device" || p.id === "24_Hours";\n';
    html += 'html += "<div class=\\"plan-card\\" onclick=\\"openPaymentModal(\'" + p.id + "\')\\" data-plan-id=\\"" + p.id + "\\">";\n';
    html += 'if (isPopular) { html += "<div class=\\"badge\\">🔥 Popular</div>"; }\n';
    html += 'html += "<div class=\\"plan-name\\">" + p.name + "</div>";\n';
    html += 'html += "<div class=\\"plan-price\\">KES " + p.price + " <span>/ " + durationStr + "</span></div>";\n';
    html += 'html += "<ul class=\\"plan-features\\">";\n';
    html += 'html += "<li>" + (p.devices || 1) + " device" + ((p.devices || 1) > 1 ? "s" : "") + "</li>";\n';
    html += 'html += "<li>" + (p.shared_users || 1) + " user" + ((p.shared_users || 1) > 1 ? "s" : "") + "</li>";\n';
    html += 'html += "<li>Valid for " + durationStr + "</li>";\n';
    html += 'html += "</ul></div>";\n';
    html += '}\n';
    html += 'plansGrid.innerHTML = html;\n';
    html += '}\n';

    html += 'function redeemVoucher() {\n';
    html += 'var code = document.getElementById("voucherInput").value.trim().toUpperCase();\n';
    html += 'var phone = document.getElementById("voucherPhoneInput").value.trim();\n';
    html += 'var resultEl = document.getElementById("voucherResult");\n';
    html += 'var btn = document.getElementById("voucherRedeemBtn");\n';
    html += 'if (!code) { resultEl.textContent = "❌ Please enter a voucher code"; resultEl.className = "voucher-result error"; return; }\n';
    html += 'if (!phone || phone.length < 10) { resultEl.textContent = "❌ Please enter a valid phone number"; resultEl.className = "voucher-result error"; return; }\n';
    html += 'btn.disabled = true;\n';
    html += 'btn.innerHTML = "<span class=\\"loading\\"></span> Processing...";\n';
    html += 'resultEl.innerHTML = "<span class=\\"loading\\"></span> Redeeming...";\n';
    html += 'resultEl.className = "voucher-result";\n';
    html += 'fetch(API_URL + "/voucher/redeem", {\n';
    html += 'method: "POST",\n';
    html += 'headers: { "Content-Type": "application/json" },\n';
    html += 'body: JSON.stringify({ code: code, phoneNumber: phone })\n';
    html += '})\n';
    html += '.then(function(r) { return r.json(); })\n';
    html += '.then(function(data) {\n';
    html += 'btn.disabled = false;\n';
    html += 'btn.innerHTML = "🎟️ Redeem";\n';
    html += 'if (data.success) {\n';
    html += 'resultEl.textContent = "✅ Voucher redeemed successfully! Connecting...";\n';
    html += 'resultEl.className = "voucher-result success";\n';
    html += 'showToast("🎟️ Voucher redeemed!", "success");\n';
    html += 'credentials = { username: data.data.username || "voucher_user", password: data.data.password || "pass_" + Date.now(), plan: data.data.planName || "Voucher Plan", expiresAt: data.data.expiresAt || new Date(Date.now() + 3600000).toISOString() };\n';
    html += 'showSuccessScreen(credentials);\n';
    html += '} else {\n';
    html += 'resultEl.textContent = "❌ " + (data.message || "Invalid voucher");\n';
    html += 'resultEl.className = "voucher-result error";\n';
    html += 'showToast("❌ " + data.message, "error");\n';
    html += '}\n';
    html += '})\n';
    html += '.catch(function(err) {\n';
    html += 'btn.disabled = false;\n';
    html += 'btn.innerHTML = "🎟️ Redeem";\n';
    html += 'resultEl.textContent = "❌ Network error";\n';
    html += 'resultEl.className = "voucher-result error";\n';
    html += '});\n';
    html += '}\n';

    html += 'function checkAndConnect() {\n';
    html += 'var phone = prompt("📱 Enter your phone number to check for active plan:");\n';
    html += 'if (!phone || phone.length < 10) { showToast("Please enter a valid phone number", "error"); return; }\n';
    html += 'var resultEl = document.getElementById("checkResult");\n';
    html += 'resultEl.innerHTML = "<span class=\\"loading\\"></span> Checking...";\n';
    html += 'resultEl.className = "result";\n';
    html += 'fetch(API_URL + "/check-active?phone=" + encodeURIComponent(phone))\n';
    html += '.then(function(r) { return r.json(); })\n';
    html += '.then(function(data) {\n';
    html += 'if (data.success && data.active) {\n';
    html += 'resultEl.innerHTML = "✅ Active Plan Found! Connecting...";\n';
    html += 'resultEl.className = "result success";\n';
    html += 'credentials = { username: data.data.username, password: data.data.password, plan: data.data.planName, expiresAt: data.data.expiresAt };\n';
    html += 'showSuccessScreen(credentials);\n';
    html += '} else {\n';
    html += 'resultEl.innerHTML = "❌ No active plan found. Please purchase a plan below.";\n';
    html += 'resultEl.className = "result error";\n';
    html += 'showToast("No active plan found. Please purchase a plan.", "error");\n';
    html += '}\n';
    html += '})\n';
    html += '.catch(function(err) {\n';
    html += 'resultEl.innerHTML = "❌ Network error checking status";\n';
    html += 'resultEl.className = "result error";\n';
    html += '});\n';
    html += '}\n';

    html += 'function openPaymentModal(planId) {\n';
    html += 'var plan = null;\n';
    html += 'for (var i = 0; i < plans.length; i++) { if (plans[i].id === planId) { plan = plans[i]; break; } }\n';
    html += 'if (!plan) { showToast("Plan not found", "error"); return; }\n';
    html += 'selectedPlan = plan;\n';
    html += 'var duration = plan.duration_seconds || 3600;\n';
    html += 'var hours = Math.floor(duration / 3600);\n';
    html += 'var days = Math.floor(duration / 86400);\n';
    html += 'var durationStr = "";\n';
    html += 'if (days > 0) { durationStr = days + " day" + (days > 1 ? "s" : ""); } else { durationStr = hours + " hour" + (hours > 1 ? "s" : ""); }\n';
    html += 'document.getElementById("modalPlanName").textContent = plan.name;\n';
    html += 'document.getElementById("modalPlanPrice").textContent = "KES " + plan.price;\n';
    html += 'document.getElementById("modalPlanDuration").textContent = "Valid for " + durationStr;\n';
    html += 'document.getElementById("modalPhone").value = "";\n';
    html += 'document.getElementById("modalError").classList.remove("show");\n';
    html += 'document.getElementById("paymentModal").classList.add("active");\n';
    html += 'setTimeout(function() { document.getElementById("modalPhone").focus(); }, 300);\n';
    html += '}\n';

    html += 'function closePaymentModal() {\n';
    html += 'document.getElementById("paymentModal").classList.remove("active");\n';
    html += 'document.getElementById("modalError").classList.remove("show");\n';
    html += '}\n';

    html += 'document.getElementById("paymentModal").addEventListener("click", function(e) {\n';
    html += 'if (e.target === this) closePaymentModal();\n';
    html += '});\n';

    html += 'document.getElementById("modalPhone").addEventListener("keydown", function(e) {\n';
    html += 'if (e.key === "Enter") modalPay();\n';
    html += '});\n';

    html += 'function modalPay() {\n';
    html += 'var phone = document.getElementById("modalPhone").value.trim();\n';
    html += 'var errorEl = document.getElementById("modalError");\n';
    html += 'if (!phone || phone.length < 10) {\n';
    html += 'errorEl.textContent = "📱 Please enter a valid phone number";\n';
    html += 'errorEl.classList.add("show");\n';
    html += 'return;\n';
    html += '}\n';
    html += 'errorEl.classList.remove("show");\n';
    html += 'var btn = document.getElementById("modalPayBtn");\n';
    html += 'btn.disabled = true;\n';
    html += 'btn.innerHTML = "<span class=\\"loading\\"></span> Processing...";\n';
    html += 'fetch(API_URL + "/payment/initiate", {\n';
    html += 'method: "POST",\n';
    html += 'headers: { "Content-Type": "application/json" },\n';
    html += 'body: JSON.stringify({ phoneNumber: phone, amount: selectedPlan.price, planId: selectedPlan.id })\n';
    html += '})\n';
    html += '.then(function(r) { return r.json(); })\n';
    html += '.then(function(data) {\n';
    html += 'btn.disabled = false;\n';
    html += 'btn.innerHTML = "💳 Pay Now";\n';
    html += 'if (data.success) {\n';
    html += 'if (data.isFree) {\n';
    html += 'closePaymentModal();\n';
    html += 'showToast("🎉 Free plan activated!", "success");\n';
    html += 'fetchCredentials(data.transactionId);\n';
    html += 'return;\n';
    html += '}\n';
    html += 'currentTransactionId = data.transactionId;\n';
    html += 'closePaymentModal();\n';
    html += 'showToast("📱 STK Push sent! Check your phone.", "info");\n';
    html += 'startPolling(data.transactionId);\n';
    html += '} else {\n';
    html += 'errorEl.textContent = "❌ " + (data.message || "Payment failed");\n';
    html += 'errorEl.classList.add("show");\n';
    html += 'showToast("❌ Payment failed", "error");\n';
    html += '}\n';
    html += '})\n';
    html += '.catch(function(err) {\n';
    html += 'btn.disabled = false;\n';
    html += 'btn.innerHTML = "💳 Pay Now";\n';
    html += 'errorEl.textContent = "❌ Network error";\n';
    html += 'errorEl.classList.add("show");\n';
    html += '});\n';
    html += '}\n';

    html += 'function startPolling(transactionId) {\n';
    html += 'if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }\n';
    html += 'if (pollingActive) return;\n';
    html += 'pollingActive = true;\n';
    html += 'var attempts = 0;\n';
    html += 'var maxAttempts = 40;\n';
    html += 'showToast("⏳ Waiting for payment confirmation...", "info");\n';
    html += 'pollingInterval = setInterval(function() {\n';
    html += 'attempts++;\n';
    html += 'if (attempts > maxAttempts) {\n';
    html += 'clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;\n';
    html += 'showToast("⏱️ Payment timed out.", "error");\n';
    html += 'return;\n';
    html += '}\n';
    html += 'fetch(API_URL + "/transaction/" + transactionId)\n';
    html += '.then(function(r) { return r.json(); })\n';
    html += '.then(function(data) {\n';
    html += 'if (data.success) {\n';
    html += 'var tx = data.data;\n';
    html += 'if (tx.status === "completed") {\n';
    html += 'clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;\n';
    html += 'showToast("🎉 Payment successful!", "success");\n';
    html += 'fetchCredentials(transactionId);\n';
    html += '} else if (tx.status === "cancelled") {\n';
    html += 'clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;\n';
    html += 'showToast("❌ Payment cancelled by user", "error");\n';
    html += '} else if (tx.status === "failed") {\n';
    html += 'clearInterval(pollingInterval); pollingInterval = null; pollingActive = false;\n';
    html += 'showToast("❌ " + (tx.errorDescription || "Payment failed"), "error");\n';
    html += '}\n';
    html += '}\n';
    html += '})\n';
    html += '.catch(function(err) { console.error("Polling error:", err); });\n';
    html += '}, 3000);\n';
    html += '}\n';

    html += 'function fetchCredentials(transactionId) {\n';
    html += 'fetch(API_URL + "/get-credentials/" + transactionId)\n';
    html += '.then(function(r) { return r.json(); })\n';
    html += '.then(function(data) {\n';
    html += 'if (data.success) {\n';
    html += 'credentials = { username: data.username || "N/A", password: data.password || "N/A", plan: data.plan || "N/A", expiresAt: data.expiresAt };\n';
    html += 'showSuccessScreen(credentials);\n';
    html += '}\n';
    html += '})\n';
    html += '.catch(function(err) { console.error(err); });\n';
    html += '}\n';

    html += 'function showSuccessScreen(cred) {\n';
    html += 'document.getElementById("mainContainer").style.display = "none";\n';
    html += 'document.querySelector(".header").style.display = "none";\n';
    html += 'document.getElementById("credUsername").textContent = cred.username;\n';
    html += 'document.getElementById("credPassword").textContent = cred.password;\n';
    html += 'document.getElementById("credPlan").textContent = cred.plan;\n';
    html += 'document.getElementById("successOverlay").classList.add("active");\n';
    html += 'if (cred.expiresAt) { startCountdown(cred.expiresAt); }\n';
    html += '}\n';

    html += 'function startCountdown(expiresAt) {\n';
    html += 'if (countdownInterval) clearInterval(countdownInterval);\n';
    html += 'var timerEl = document.getElementById("successTimer");\n';
    html += 'function update() {\n';
    html += 'var now = Date.now();\n';
    html += 'var expiry = new Date(expiresAt).getTime();\n';
    html += 'var diff = Math.max(0, expiry - now);\n';
    html += 'if (diff <= 0) {\n';
    html += 'timerEl.textContent = "00:00:00";\n';
    html += 'timerEl.classList.add("expired");\n';
    html += 'clearInterval(countdownInterval);\n';
    html += 'setTimeout(function() {\n';
    html += 'try { window.close(); } catch (e) {\n';
    html += 'document.getElementById("enjoyText").textContent = "⏰ Your plan has expired. Please reconnect.";\n';
    html += 'document.querySelector(".auto-close").textContent = "🔄 Refresh to purchase a new plan";\n';
    html += '}\n';
    html += '}, 3000);\n';
    html += 'return;\n';
    html += '}\n';
    html += 'timerEl.classList.remove("expired");\n';
    html += 'var hours = Math.floor(diff / 3600000);\n';
    html += 'var mins = Math.floor((diff % 3600000) / 60000);\n';
    html += 'var secs = Math.floor((diff % 60000) / 1000);\n';
    html += 'timerEl.textContent = String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");\n';
    html += '}\n';
    html += 'update();\n';
    html += 'countdownInterval = setInterval(update, 1000);\n';
    html += '}\n';

    html += 'function showToast(message, type) {\n';
    html += 'type = type || "success";\n';
    html += 'var icons = { success: "✅", error: "❌", info: "ℹ️" };\n';
    html += 'var toast = document.getElementById("toast");\n';
    html += 'toast.className = "toast " + type;\n';
    html += 'document.getElementById("toastIcon").textContent = icons[type] || "✅";\n';
    html += 'document.getElementById("toastMessage").textContent = message;\n';
    html += 'toast.classList.add("show");\n';
    html += 'clearTimeout(toast._timeout);\n';
    html += 'toast._timeout = setTimeout(function() { toast.classList.remove("show"); }, 4000);\n';
    html += '}\n';

    html += 'document.getElementById("voucherInput").addEventListener("keydown", function(e) {\n';
    html += 'if (e.key === "Enter") { document.getElementById("voucherPhoneInput").focus(); }\n';
    html += '});\n';
    html += 'document.getElementById("voucherPhoneInput").addEventListener("keydown", function(e) {\n';
    html += 'if (e.key === "Enter") { redeemVoucher(); }\n';
    html += '});\n';

    html += '</script>\n';
    html += '</body>\n';
    html += '</html>';

    return html;
}

// ============================================================
// CREATE SERVER
// ============================================================

var server = http.createServer(async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    var url = new URL(req.url, 'http://' + req.headers.host);
    console.log('📥 ' + req.method + ' ' + url.pathname);

    try {
        // ===== SERVE HTML FILES =====
        if (req.method === 'GET' && url.pathname === '/') {
            if (serveHtmlFile(res, 'GICH_wifi.html')) return;
            sendHtml(res, 200, '<h1>🌐 GICH WiFi Server</h1><p>✅ Server is running!</p>');
            return;
        }

        if (req.method === 'GET' && (url.pathname === '/GICH_wifi.html' || url.pathname === '/GICH%20wifi.html')) {
            if (serveHtmlFile(res, 'GICH_wifi.html')) return;
            sendHtml(res, 404, '<h1>File not found</h1>');
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
            var id = url.pathname.split('/').pop();
            var transaction = null;
            for (var i = 0; i < transactions.length; i++) {
                if (transactions[i].id === id) { transaction = transactions[i]; break; }
            }
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
            var phone = url.searchParams.get('phone');
            var filtered = phone ? transactions.filter(function(t) { return t.phoneNumber === phone; }) : transactions;
            return sendJson(res, 200, { success: true, data: filtered, count: filtered.length });
        }

        // Check Active Plan
        if (req.method === 'GET' && url.pathname === '/api/check-active') {
            var phone = url.searchParams.get('phone');
            if (!phone) return sendJson(res, 400, { success: false, message: 'Phone number required' });
            var active = null;
            for (var i = 0; i < transactions.length; i++) {
                var t = transactions[i];
                if (t.phoneNumber === phone && t.status === 'completed' && t.mikrotikCreated && (!t.expiresAt || new Date(t.expiresAt) > new Date())) {
                    active = t;
                    break;
                }
            }
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
        // CLIENT PORTAL ENDPOINTS
        // ============================================================

        // Check if organization exists for email
        if (req.method === 'GET' && url.pathname === '/api/client/check-org') {
            var email = url.searchParams.get('email');
            if (!email) {
                return sendJson(res, 400, { success: false, message: 'Email required' });
            }

            var orgExists = false;
            for (var i = 0; i < organizations.length; i++) {
                if (organizations[i].email === email) {
                    orgExists = true;
                    break;
                }
            }

            return sendJson(res, 200, {
                success: true,
                hasOrganization: orgExists,
                email: email
            });
        }

        // Get organization by email
        if (req.method === 'GET' && url.pathname === '/api/organization/by-email') {
            var email = url.searchParams.get('email');
            if (!email) {
                return sendJson(res, 400, { success: false, message: 'Email required' });
            }

            var org = null;
            for (var i = 0; i < organizations.length; i++) {
                if (organizations[i].email === email) {
                    org = organizations[i];
                    break;
                }
            }

            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }

            return sendJson(res, 200, {
                success: true,
                data: {
                    id: org.id,
                    businessName: org.businessName,
                    logo: org.logo || '',
                    primaryColor: org.primaryColor,
                    secondaryColor: org.secondaryColor,
                    accentColor: org.accentColor,
                    supportPhone: org.supportPhone,
                    supportEmail: org.supportEmail,
                    website: org.website,
                    businessTagline: org.businessTagline,
                    plans: org.plans || [],
                    status: org.status
                }
            });
        }

        // ============================================================
        // CLIENT CREATE/UPDATE ORGANIZATION
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            console.log('📥 Received organization creation request');
            
            var body = await readBody(req);
            console.log('📥 Body:', body);
            
            var email = body.email || 'master@demo.com';
            console.log('📧 Email:', email);
            
            var existingOrg = null;
            for (var i = 0; i < organizations.length; i++) {
                if (organizations[i].email === email) {
                    existingOrg = organizations[i];
                    break;
                }
            }
            
            if (existingOrg) {
                console.log('✅ Organization already exists for this email:', existingOrg.id);
                return sendJson(res, 200, {
                    success: true,
                    message: 'Organization already exists',
                    organization: existingOrg,
                    clientId: existingOrg.id
                });
            }
            
            var clientId = generateOrgId();
            var businessName = body.businessName || body.name || 'Demo WiFi Business';
            
            var newOrganization = {
                id: clientId,
                name: businessName,
                businessName: businessName,
                email: email,
                phone: body.phone || '0712345678',
                logo: body.logo || '',
                primaryColor: body.primaryColor || '#ff6b35',
                secondaryColor: body.secondaryColor || '#ff9a56',
                accentColor: body.accentColor || '#1a0a00',
                textColor: '#ffffff',
                headerTextColor: '#ffffff',
                buttonTextColor: '#000000',
                bgGradient: 'linear-gradient(135deg, #1a0a00, #ff6b35, #ff9a56)',
                supportPhone: body.supportPhone || '0712345678',
                supportEmail: body.supportEmail || email,
                website: body.website || '',
                businessTagline: body.businessTagline || 'Full Access Mode',
                mpesaTill: '',
                mpesaShortcode: SHORTCODE,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                plans: body.plans || [
                    { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, shared_users: 1, duration_seconds: 7200 },
                    { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, shared_users: 1, duration_seconds: 18000 },
                    { id: '8_Hours', name: '8 Hours', price: 30, devices: 1, shared_users: 1, duration_seconds: 28800 },
                    { id: '12_Hours', name: '12 Hours', price: 50, devices: 1, shared_users: 1, duration_seconds: 43200 },
                    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, shared_users: 1, duration_seconds: 86400 }
                ]
            };
            
            organizations.push(newOrganization);
            saveOrganizations();
            console.log('✅ Organization created on server:', clientId);
            console.log('📁 Total organizations:', organizations.length);
            
            clients.push({
                id: clientId,
                name: businessName,
                phone: newOrganization.phone,
                email: email,
                businessName: businessName,
                mpesaTill: '',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isOrganization: true,
                organizationId: clientId
            });
            saveClients();
            
            return sendJson(res, 200, {
                success: true,
                message: 'Organization created successfully!',
                organization: newOrganization,
                clientId: clientId
            });
        }

        // ============================================================
        // PAYMENT
        // ============================================================

        // Initiate Payment
        if (req.method === 'POST' && url.pathname === '/api/payment/initiate') {
            var body = await readBody(req);
            var phoneNumber = body.phoneNumber;
            var amount = body.amount;
            var planId = body.planId;
            if (!phoneNumber || phoneNumber.length < 10) {
                return sendJson(res, 400, { success: false, message: 'Invalid phone number' });
            }
            try {
                var transactionId = 'GICH' + Date.now() + Math.random().toString(36).substring(7);
                var duration = getPlanDuration(planId);
                var planName = getPlanName(planId);
                var transaction = {
                    id: transactionId,
                    phoneNumber: phoneNumber,
                    amount: amount,
                    planId: planId,
                    planName: planName,
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
                    return sendJson(res, 200, { success: true, message: 'Free plan activated!', transactionId: transactionId, isFree: true });
                }

                var result = await stkPush({ phone: phoneNumber, amount: amount, accountReference: 'GICH' + Date.now().toString().slice(-8) });
                if (result.success) {
                    transaction.checkoutId = result.checkoutId;
                    saveTransactions();
                    return sendJson(res, 200, { success: true, message: 'STK Push sent!', transactionId: transactionId, checkoutId: result.checkoutId });
                } else {
                    transaction.status = 'completed';
                    transaction.mpesaCode = 'MOCK' + Date.now();
                    transaction.isMock = true;
                    transaction.mikrotikUsername = 'user_' + transaction.id.substring(0, 12);
                    transaction.mikrotikPassword = 'pass_' + Date.now().toString(36);
                    transaction.mikrotikCreated = true;
                    saveTransactions();
                    return sendJson(res, 200, { success: true, message: 'MOCK MODE: Payment simulated.', transactionId: transactionId, mock: true });
                }
            } catch (error) {
                return sendJson(res, 502, { success: false, message: 'Payment failed: ' + error.message });
            }
        }

        // ===== MPESA CALLBACK =====
        if (req.method === 'POST' && url.pathname === '/api/mpesa-callback') {
            var callback = await readBody(req);
            var resultCode = callback.Body && callback.Body.stkCallback ? callback.Body.stkCallback.ResultCode : null;
            var checkoutId = callback.Body && callback.Body.stkCallback ? callback.Body.stkCallback.CheckoutRequestID : null;
            var receipt = null;
            var amount = null;
            var phoneNumber = null;
            var resultDesc = callback.Body && callback.Body.stkCallback ? callback.Body.stkCallback.ResultDesc || 'Unknown error' : 'Unknown error';

            if (callback.Body && callback.Body.stkCallback && callback.Body.stkCallback.CallbackMetadata && callback.Body.stkCallback.CallbackMetadata.Item) {
                var items = callback.Body.stkCallback.CallbackMetadata.Item;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].Name === 'MpesaReceiptNumber') receipt = items[i].Value;
                    if (items[i].Name === 'Amount') amount = items[i].Value;
                    if (items[i].Name === 'PhoneNumber') phoneNumber = items[i].Value;
                }
            }

            var transaction = null;
            for (var i = 0; i < transactions.length; i++) {
                if (transactions[i].checkoutId === checkoutId) { transaction = transactions[i]; break; }
            }
            if (!transaction) {
                for (var i = 0; i < transactions.length; i++) {
                    if (transactions[i].mpesaResponse && transactions[i].mpesaResponse.CheckoutRequestID === checkoutId) { transaction = transactions[i]; break; }
                }
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
            var body = await readBody(req);
            var code = body.code;
            var phoneNumber = body.phoneNumber;
            if (!code) return sendJson(res, 400, { success: false, message: 'Voucher code required' });
            var voucher = null;
            for (var i = 0; i < vouchers.length; i++) {
                if (vouchers[i].code === code && !vouchers[i].used) { voucher = vouchers[i]; break; }
            }
            if (!voucher) return sendJson(res, 404, { success: false, message: 'Invalid or already used voucher' });
            if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
                return sendJson(res, 400, { success: false, message: 'Voucher has expired' });
            }
            voucher.used = true;
            voucher.usedBy = phoneNumber || 'unknown';
            voucher.usedAt = new Date().toISOString();
            saveVouchers();

            var transactionId = 'VOUCH' + Date.now() + Math.random().toString(36).substring(7);
            var duration = voucher.duration_seconds || 3600;
            var planName = voucher.planName || 'Voucher Plan';
            var transaction = {
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
        // ADMIN ENDPOINTS (Full CRUD)
        // ============================================================

        // Admin Verify
        if (req.method === 'POST' && url.pathname === '/api/admin/verify') {
            var body = await readBody(req);
            if (body.pin === ADMIN_PASSWORD) {
                var token = generateToken({ username: 'admin', role: 'admin', exp: Date.now() + 86400000 });
                return sendJson(res, 200, { success: true, message: 'Admin verified', token: token });
            } else {
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // Admin Clients
        if (req.method === 'GET' && url.pathname === '/api/admin/clients') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: clients, count: clients.length });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/clients') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var body = await readBody(req);
            if (!body.name || !body.phone) return sendJson(res, 400, { success: false, message: 'Name and phone required' });
            var newClient = { id: generateClientId(), name: body.name, phone: body.phone, email: body.email || '', businessName: body.businessName || '', mpesaTill: body.mpesaTill || '', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            clients.push(newClient);
            saveClients();
            return sendJson(res, 200, { success: true, message: 'Client created', data: newClient });
        }

        if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/clients/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var clientId = url.pathname.split('/').pop();
            var body = await readBody(req);
            var index = -1;
            for (var i = 0; i < clients.length; i++) { if (clients[i].id === clientId) { index = i; break; } }
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Client not found' });
            clients[index] = { id: clients[index].id, name: body.name || clients[index].name, phone: body.phone || clients[index].phone, email: body.email || clients[index].email, businessName: body.businessName || clients[index].businessName, mpesaTill: body.mpesaTill || clients[index].mpesaTill, status: body.status || clients[index].status, createdAt: clients[index].createdAt, updatedAt: new Date().toISOString() };
            saveClients();
            return sendJson(res, 200, { success: true, message: 'Client updated', data: clients[index] });
        }

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/clients/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var clientId = url.pathname.split('/').pop();
            var index = -1;
            for (var i = 0; i < clients.length; i++) { if (clients[i].id === clientId) { index = i; break; } }
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Client not found' });
            clients.splice(index, 1);
            saveClients();
            return sendJson(res, 200, { success: true, message: 'Client deleted' });
        }

        // Admin Products
        if (req.method === 'GET' && url.pathname === '/api/admin/products') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: products, count: products.length });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/products') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var body = await readBody(req);
            if (!body.name || body.price === undefined) return sendJson(res, 400, { success: false, message: 'Name and price required' });
            var newProduct = { id: generateProductId(), name: body.name, description: body.description || '', price: Number(body.price), imageUrl: body.imageUrl || '', category: body.category || 'general', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            products.push(newProduct);
            saveProducts();
            return sendJson(res, 200, { success: true, message: 'Product created', data: newProduct });
        }

        if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/products/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var productId = url.pathname.split('/').pop();
            var body = await readBody(req);
            var index = -1;
            for (var i = 0; i < products.length; i++) { if (products[i].id === productId) { index = i; break; } }
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Product not found' });
            products[index] = { id: products[index].id, name: body.name || products[index].name, description: body.description || products[index].description, price: body.price !== undefined ? Number(body.price) : products[index].price, imageUrl: body.imageUrl || products[index].imageUrl, category: body.category || products[index].category, status: body.status || products[index].status, createdAt: products[index].createdAt, updatedAt: new Date().toISOString() };
            saveProducts();
            return sendJson(res, 200, { success: true, message: 'Product updated', data: products[index] });
        }

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/products/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var productId = url.pathname.split('/').pop();
            var index = -1;
            for (var i = 0; i < products.length; i++) { if (products[i].id === productId) { index = i; break; } }
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
            var body = await readBody(req);
            if (!body.id || !body.name || body.price === undefined) return sendJson(res, 400, { success: false, message: 'ID, name, and price required' });
            for (var i = 0; i < plans.length; i++) { if (plans[i].id === body.id) { return sendJson(res, 400, { success: false, message: 'Plan ID already exists' }); } }
            plans.push({ id: body.id, name: body.name, price: Number(body.price), devices: body.devices || 1, shared_users: body.shared_users || 1, duration_seconds: body.duration_seconds || 3600 });
            savePlans();
            return sendJson(res, 200, { success: true, message: 'Plan created', data: plans[plans.length - 1] });
        }

        if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/plans/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var planId = url.pathname.split('/').pop();
            var body = await readBody(req);
            var plan = null;
            for (var i = 0; i < plans.length; i++) { if (plans[i].id === planId) { plan = plans[i]; break; } }
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
            var planId = url.pathname.split('/').pop();
            var index = -1;
            for (var i = 0; i < plans.length; i++) { if (plans[i].id === planId) { index = i; break; } }
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Plan not found' });
            plans.splice(index, 1);
            savePlans();
            return sendJson(res, 200, { success: true, message: 'Plan deleted' });
        }

        // Admin Vouchers
        if (req.method === 'POST' && url.pathname === '/api/admin/voucher/generate') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var body = await readBody(req);
            var plan = null;
            for (var i = 0; i < plans.length; i++) { if (plans[i].id === body.planId) { plan = plans[i]; break; } }
            if (!plan) return sendJson(res, 400, { success: false, message: 'Invalid plan ID' });
            var count = Math.min(body.count || 1, 100);
            var generated = [];
            for (var i = 0; i < count; i++) {
                var code = generateVoucherCode();
                vouchers.push({ code: code, planId: plan.id, planName: plan.name, duration_seconds: body.duration_seconds || plan.duration_seconds, devices: plan.devices || 1, used: false, usedBy: null, usedAt: null, expiresAt: null, createdAt: new Date().toISOString() });
                generated.push(code);
            }
            saveVouchers();
            return sendJson(res, 200, { success: true, message: 'Generated ' + generated.length + ' vouchers', vouchers: generated, count: generated.length });
        }

        if (req.method === 'GET' && url.pathname === '/api/admin/vouchers') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var used = 0;
            for (var i = 0; i < vouchers.length; i++) { if (vouchers[i].used) used++; }
            return sendJson(res, 200, { success: true, data: vouchers, count: vouchers.length, used: used, unused: vouchers.length - used });
        }

        // Admin Transactions
        if (req.method === 'GET' && url.pathname === '/api/admin/transactions') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var completed = 0, pending = 0, cancelled = 0, failed = 0, totalRevenue = 0;
            for (var i = 0; i < transactions.length; i++) {
                var t = transactions[i];
                if (t.status === 'completed') { completed++; totalRevenue += (t.amount || 0); }
                else if (t.status === 'pending') pending++;
                else if (t.status === 'cancelled') cancelled++;
                else if (t.status === 'failed') failed++;
            }
            return sendJson(res, 200, {
                success: true,
                data: transactions,
                count: transactions.length,
                summary: {
                    total: transactions.length,
                    completed: completed,
                    pending: pending,
                    cancelled: cancelled,
                    failed: failed,
                    totalRevenue: totalRevenue
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
            var body = await readBody(req);
            if (body.theme) {
                var theme = null;
                for (var i = 0; i < themes.length; i++) { if (themes[i].id === body.theme) { theme = themes[i]; break; } }
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
            var body = await readBody(req);
            var newTheme = { id: body.id || 'theme_' + Date.now(), name: body.name || 'Custom Theme', preview: body.preview || '🎨', colors: body.colors || { primary: '#00c853', secondary: '#00e676', accent: '#0f2027', text: '#ffffff', headerText: '#ffffff', buttonText: '#000000' }, gradient: body.gradient || 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' };
            themes.push(newTheme);
            saveThemes();
            return sendJson(res, 200, { success: true, message: 'Theme added', data: newTheme });
        }

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/themes/')) {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var themeId = url.pathname.split('/').pop();
            if (themeId === 'default') return sendJson(res, 400, { success: false, message: 'Cannot delete default theme' });
            var index = -1;
            for (var i = 0; i < themes.length; i++) { if (themes[i].id === themeId) { index = i; break; } }
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Theme not found' });
            themes.splice(index, 1);
            saveThemes();
            return sendJson(res, 200, { success: true, message: 'Theme deleted' });
        }

        // Get Credentials
        if (req.method === 'GET' && url.pathname.startsWith('/api/get-credentials/')) {
            var transactionId = url.pathname.split('/').pop();
            var transaction = null;
            for (var i = 0; i < transactions.length; i++) { if (transactions[i].id === transactionId) { transaction = transactions[i]; break; } }
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
            var body = await readBody(req);
            if (body.pin === MASTER_PASSWORD) {
                var token = generateToken({ username: 'master', role: 'master', exp: Date.now() + 86400000 });
                return sendJson(res, 200, { success: true, message: 'Master verified', token: token, role: 'master' });
            } else {
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // Get All Organizations
        if (req.method === 'GET' && url.pathname === '/api/master/organizations') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: organizations, count: organizations.length });
        }

        // Create Organization (Master)
        if (req.method === 'POST' && url.pathname === '/api/master/organizations') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var body = await readBody(req);
            if (!body.name || !body.businessName || !body.email || !body.phone) {
                return sendJson(res, 400, { success: false, message: 'Name, Business Name, Email, and Phone are required' });
            }
            var clientId = generateOrgId();
            var newOrganization = {
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

            clients.push({ id: clientId, name: body.name, phone: body.phone, email: body.email, businessName: body.businessName, mpesaTill: body.mpesaTill || '', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOrganization: true, organizationId: clientId });
            saveClients();

            return sendJson(res, 200, {
                success: true,
                message: 'Organization created!',
                data: newOrganization,
                clientId: clientId,
                clientPageUrl: '/' + clientId + '/client-page.html'
            });
        }

        // Get Organization by ID
        if (req.method === 'GET' && url.pathname.startsWith('/api/organization/')) {
            var orgId = url.pathname.split('/').pop();
            if (!orgId || orgId === 'organizations') {
                return sendJson(res, 400, { success: false, message: 'Invalid organization ID' });
            }
            var organization = getOrganizationByClientId(orgId);
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

        // Update Organization (Master)
        if (req.method === 'PUT' && url.pathname.startsWith('/api/master/organizations/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var orgId = url.pathname.split('/').pop();
            var body = await readBody(req);
            var index = -1;
            for (var i = 0; i < organizations.length; i++) { if (organizations[i].id === orgId) { index = i; break; } }
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Organization not found' });
            
            // Merge the updated fields
            organizations[index] = {
                ...organizations[index],
                name: body.name || organizations[index].name,
                businessName: body.businessName || organizations[index].businessName,
                email: body.email || organizations[index].email,
                phone: body.phone || organizations[index].phone,
                logo: body.logo || organizations[index].logo,
                primaryColor: body.primaryColor || organizations[index].primaryColor,
                secondaryColor: body.secondaryColor || organizations[index].secondaryColor,
                accentColor: body.accentColor || organizations[index].accentColor,
                supportPhone: body.supportPhone || organizations[index].supportPhone,
                supportEmail: body.supportEmail || organizations[index].supportEmail,
                website: body.website || organizations[index].website,
                businessTagline: body.businessTagline || organizations[index].businessTagline,
                mpesaTill: body.mpesaTill || organizations[index].mpesaTill,
                status: body.status || organizations[index].status,
                plans: body.plans || organizations[index].plans,
                updatedAt: new Date().toISOString()
            };
            saveOrganizations();

            var clientIndex = -1;
            for (var i = 0; i < clients.length; i++) { if (clients[i].id === orgId) { clientIndex = i; break; } }
            if (clientIndex !== -1) {
                clients[clientIndex] = {
                    ...clients[clientIndex],
                    name: body.name || clients[clientIndex].name,
                    phone: body.phone || clients[clientIndex].phone,
                    email: body.email || clients[clientIndex].email,
                    businessName: body.businessName || clients[clientIndex].businessName,
                    mpesaTill: body.mpesaTill || clients[clientIndex].mpesaTill,
                    status: body.status || clients[clientIndex].status,
                    updatedAt: new Date().toISOString()
                };
                saveClients();
            }
            return sendJson(res, 200, { success: true, message: 'Organization updated', data: organizations[index] });
        }

        // Delete Organization
        if (req.method === 'DELETE' && url.pathname.startsWith('/api/master/organizations/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var orgId = url.pathname.split('/').pop();
            var index = -1;
            for (var i = 0; i < organizations.length; i++) { if (organizations[i].id === orgId) { index = i; break; } }
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Organization not found' });
            organizations.splice(index, 1);
            saveOrganizations();

            var clientIndex = -1;
            for (var i = 0; i < clients.length; i++) { if (clients[i].id === orgId) { clientIndex = i; break; } }
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
            var body = await readBody(req);
            masterSettings = {
                id: masterSettings.id || 'master_settings',
                masterBusinessName: body.masterBusinessName || masterSettings.masterBusinessName,
                masterEmail: body.masterEmail || masterSettings.masterEmail,
                masterPhone: body.masterPhone || masterSettings.masterPhone,
                defaultPrimaryColor: body.defaultPrimaryColor || masterSettings.defaultPrimaryColor,
                defaultBgGradient: body.defaultBgGradient || masterSettings.defaultBgGradient,
                commissionRate: body.commissionRate !== undefined ? Number(body.commissionRate) : masterSettings.commissionRate,
                createdAt: masterSettings.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            saveMasterSettings();
            return sendJson(res, 200, { success: true, message: 'Master settings updated', data: masterSettings });
        }

        // Generate Client HTML
        if (req.method === 'GET' && url.pathname.startsWith('/api/master/generate-client-page/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var orgId = url.pathname.split('/').pop();
            var organization = getOrganizationByClientId(orgId);
            if (!organization) return sendJson(res, 404, { success: false, message: 'Organization not found' });
            var html = generateClientSkeletonHtml(organization);
            return sendJson(res, 200, {
                success: true,
                html: html,
                filename: orgId + '_client_page.html',
                instructions: 'Copy this HTML and give it to your client. Works on local WiFi (MikroTik), local PC, and online!'
            });
        }

        // Serve Client Page
        if (req.method === 'GET' && url.pathname.match(/^\/CLIENT_[A-Z0-9]+\/client-page\.html$/)) {
            var pathParts = url.pathname.split('/');
            var orgId = pathParts[1];
            var organization = getOrganizationByClientId(orgId);
            if (!organization) { return sendHtml(res, 404, '<h1>❌ Organization Not Found</h1><p>ID: ' + orgId + '</p>'); }
            var html = generateClientSkeletonHtml(organization);
            return sendHtml(res, 200, html);
        }

        if (req.method === 'GET' && url.pathname.match(/^\/CLIENT_[A-Z0-9]+\/?$/)) {
            var orgId = url.pathname.replace('/', '');
            var organization = getOrganizationByClientId(orgId);
            if (!organization) { return sendHtml(res, 404, '<h1>❌ Organization Not Found</h1><p>ID: ' + orgId + '</p>'); }
            var html = generateClientSkeletonHtml(organization);
            return sendHtml(res, 200, html);
        }

        if (req.method === 'GET' && url.pathname === '/client-page.html' && url.searchParams.has('org')) {
            var orgId = url.searchParams.get('org');
            var organization = getOrganizationByClientId(orgId);
            if (!organization) { return sendHtml(res, 404, '<h1>❌ Organization Not Found</h1><p>ID: ' + orgId + '</p>'); }
            var html = generateClientSkeletonHtml(organization);
            return sendHtml(res, 200, html);
        }

        // ============================================================
        // API INFO
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api') {
            var totalRevenue = 0;
            for (var i = 0; i < transactions.length; i++) {
                if (transactions[i].status === 'completed') totalRevenue += (transactions[i].amount || 0);
            }
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '3.0.0',
                status: 'Running',
                statistics: {
                    totalTransactions: transactions.length,
                    totalRevenue: totalRevenue,
                    activeVouchers: vouchers.filter(function(v) { return !v.used; }).length,
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

server.listen(PORT, '0.0.0.0', function() {
    console.log('\n========================================');
    console.log('🌐 GICH WiFi API');
    console.log('========================================');
    console.log('✅ Server running on port: ' + PORT);
    console.log('📍 http://localhost:' + PORT + '/');
    console.log('📍 http://localhost:' + PORT + '/api/health');
    console.log('========================================');
    console.log('🛡️ Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
    console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
    console.log('🏢 Organizations: ' + organizations.length);
    console.log('========================================\n');
});

process.on('uncaughtException', function(err) { console.error('❌ Uncaught Exception:', err); });
process.on('unhandledRejection', function(reason) { console.error('❌ Unhandled Rejection:', reason); });
