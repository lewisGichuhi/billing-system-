/**
 * GICH WiFi - Complete Backend with Daraja Integration & Subscription System
 * Full M-Pesa STK Push with multi-tenant support
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

// Subscription Plans
const SUBSCRIPTION_PLANS = {
    'starter': {
        name: 'Starter',
        price: 500,
        maxOrganizations: 1,
        maxPlans: 5,
        maxTransactions: 200,
        features: ['1 Organization', '5 Plans', '200 Transactions/month']
    },
    'pro': {
        name: 'Pro',
        price: 1000,
        maxOrganizations: 3,
        maxPlans: 10,
        maxTransactions: 500,
        features: ['3 Organizations', '10 Plans', '500 Transactions/month', 'Vouchers']
    },
    'business': {
        name: 'Business',
        price: 2000,
        maxOrganizations: 10,
        maxPlans: 999,
        maxTransactions: 2000,
        features: ['10 Organizations', 'Unlimited Plans', '2000 Transactions/month', 'Vouchers', 'Analytics']
    }
};

console.log('\n========================================');
console.log('🌐 GICH WiFi API');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   M-Pesa Shortcode: ' + SHORTCODE);
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
var CLIENTS_FILE = path.join(__dirname, 'clients.json');
var ORGANIZATIONS_FILE = path.join(__dirname, 'organizations.json');
var SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

var transactions = [];
var vouchers = [];
var plans = [];
var settings = {};
var clients = [];
var organizations = [];
var subscriptions = [];

// ============================================================
// DEFAULT SETTINGS
// ============================================================

var DEFAULT_SETTINGS = {
    businessName: 'GICH WIFI',
    businessTagline: 'Fast • Secure • Reliable',
    supportPhone: '0796587763',
    supportEmail: 'support@gichwifi.co.ke',
    primaryColor: '#00c853',
    secondaryColor: '#00e676',
    accentColor: '#0f2027',
    logo: ''
};

var DEFAULT_PLANS = [
    { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, duration_seconds: 7200 },
    { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, duration_seconds: 18000 },
    { id: '8_Hours', name: '8 Hours', price: 30, devices: 1, duration_seconds: 28800 },
    { id: '12_Hours', name: '12 Hours', price: 50, devices: 1, duration_seconds: 43200 },
    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, duration_seconds: 86400 }
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
    if (fs.existsSync(CLIENTS_FILE)) {
        try { clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')); console.log('👤 Loaded ' + clients.length + ' clients'); } catch (e) { console.error('Error loading clients:', e); clients = []; }
    } else { clients = []; saveClients(); }
    if (fs.existsSync(ORGANIZATIONS_FILE)) {
        try { organizations = JSON.parse(fs.readFileSync(ORGANIZATIONS_FILE, 'utf8')); console.log('🏢 Loaded ' + organizations.length + ' organizations'); } catch (e) { console.error('Error loading organizations:', e); organizations = []; }
    } else { organizations = []; saveOrganizations(); }
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
        try { subscriptions = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')); console.log('📋 Loaded ' + subscriptions.length + ' subscriptions'); } catch (e) { console.error('Error loading subscriptions:', e); subscriptions = []; }
    } else { subscriptions = []; saveSubscriptions(); }
}

function saveTransactions() { try { fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2)); } catch (e) { console.error('⚠️ Could not save transactions:', e.message); } }
function saveVouchers() { try { fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(vouchers, null, 2)); } catch (e) { console.error('⚠️ Could not save vouchers:', e.message); } }
function savePlans() { try { fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2)); } catch (e) { console.error('⚠️ Could not save plans:', e.message); } }
function saveSettings() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (e) { console.error('⚠️ Could not save settings:', e.message); } }
function saveClients() { try { fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2)); } catch (e) { console.error('⚠️ Could not save clients:', e.message); } }
function saveOrganizations() { try { fs.writeFileSync(ORGANIZATIONS_FILE, JSON.stringify(organizations, null, 2)); } catch (e) { console.error('⚠️ Could not save organizations:', e.message); } }
function saveSubscriptions() { try { fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2)); } catch (e) { console.error('⚠️ Could not save subscriptions:', e.message); } }

loadAllData();

// ============================================================
// HELPERS
// ============================================================

function getPlanName(planId) { var plan = plans.find(function(p) { return p.id === planId; }); return plan ? plan.name : planId; }
function getPlanDuration(planId) { var plan = plans.find(function(p) { return p.id === planId; }); return plan ? plan.duration_seconds : 3600; }
function generateVoucherCode() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 10; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return code; }
function generateOrgId() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function getOrganizationByClientId(clientId) { return organizations.find(function(org) { return org.id === clientId; }); }
function getOrganizationByEmail(email) { return organizations.find(function(org) { return org.email === email; }); }

// ============================================================
// SUBSCRIPTION SYSTEM
// ============================================================

function getClientSubscription(clientId) {
    var sub = subscriptions.find(function(s) { return s.clientId === clientId; });
    if (!sub) return null;
    
    var now = new Date();
    
    if (sub.status === 'trial') {
        var trialEnd = new Date(sub.trialEnds);
        if (now > trialEnd) {
            sub.status = 'expired';
            saveSubscriptions();
            return null;
        }
        return sub;
    }
    
    if (sub.status === 'active') {
        var expiresAt = new Date(sub.expiresAt);
        if (now > expiresAt) {
            sub.status = 'expired';
            saveSubscriptions();
            return null;
        }
        return sub;
    }
    
    return null;
}

function checkSubscriptionAccess(clientId) {
    var sub = getClientSubscription(clientId);
    
    if (!sub) {
        return {
            allowed: false,
            message: 'No active subscription. Please subscribe to continue.',
            code: 'NO_SUBSCRIPTION',
            canSubscribe: true
        };
    }
    
    if (sub.status === 'trial') {
        var trialEnd = new Date(sub.trialEnds);
        var daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        return {
            allowed: true,
            status: 'trial',
            daysLeft: daysLeft,
            trialEnds: sub.trialEnds,
            message: 'Free trial: ' + daysLeft + ' days remaining'
        };
    }
    
    if (sub.status === 'active') {
        var expiresAt = new Date(sub.expiresAt);
        var daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        return {
            allowed: true,
            status: 'active',
            daysLeft: daysLeft,
            plan: sub.plan,
            expiresAt: sub.expiresAt,
            message: 'Subscription active: ' + daysLeft + ' days remaining'
        };
    }
    
    return {
        allowed: false,
        message: 'Subscription status unknown',
        code: 'UNKNOWN_STATUS'
    };
}

function createFreeTrial(clientId) {
    var sub = {
        clientId: clientId,
        plan: 'free_trial',
        status: 'trial',
        trialStarted: new Date().toISOString(),
        trialEnds: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
    };
    subscriptions.push(sub);
    saveSubscriptions();
    return sub;
}

function activateSubscription(clientId, plan) {
    var sub = subscriptions.find(function(s) { return s.clientId === clientId; });
    var planData = SUBSCRIPTION_PLANS[plan];
    if (!planData) return null;
    
    if (!sub) {
        sub = {
            clientId: clientId,
            plan: plan,
            status: 'active',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString()
        };
        subscriptions.push(sub);
    } else {
        sub.plan = plan;
        sub.status = 'active';
        sub.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        sub.updatedAt = new Date().toISOString();
    }
    saveSubscriptions();
    
    var org = getOrganizationByClientId(clientId);
    if (org && org.status === 'suspended') {
        org.status = 'active';
        saveOrganizations();
    }
    
    return sub;
}

function autoSuspendExpiredAccounts() {
    console.log('🔄 Running auto-suspend check...');
    var now = new Date();
    var suspended = 0;
    
    subscriptions.forEach(function(sub) {
        if (sub.status === 'trial' || sub.status === 'active') {
            var expiryDate = sub.status === 'trial' ? sub.trialEnds : sub.expiresAt;
            var expiry = new Date(expiryDate);
            
            if (now > expiry) {
                sub.status = 'expired';
                var org = getOrganizationByClientId(sub.clientId);
                if (org) {
                    org.status = 'suspended';
                    org.suspendedAt = now.toISOString();
                    org.suspensionReason = sub.status === 'trial' ? 'Trial expired' : 'Subscription expired';
                    suspended++;
                    console.log('🔒 Suspended:', org.businessName);
                }
            }
        }
    });
    
    if (suspended > 0) {
        saveSubscriptions();
        saveOrganizations();
        console.log('✅ Auto-suspended', suspended, 'accounts');
    }
}

setInterval(autoSuspendExpiredAccounts, 12 * 60 * 60 * 1000);
autoSuspendExpiredAccounts();

// ============================================================
// DARAJA OAUTH
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
// DARAJA STK PUSH
// ============================================================

async function stkPush(params) {
    var phone = params.phone;
    var amount = params.amount;
    var accountReference = params.accountReference || 'GICH-WIFI';
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
        AccountReference: accountReference,
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

function normalizePhone(rawPhone) {
    if (!rawPhone) return null;
    var digits = String(rawPhone).trim().replace(/[^0-9+]/g, '');
    digits = digits.replace(/^\+/, '');
    if (digits.startsWith('0')) digits = digits.substring(1);
    if (digits.length === 9 && digits.startsWith('7')) return '254' + digits;
    if (digits.length === 10 && digits.startsWith('7')) return '254' + digits;
    if (digits.startsWith('254')) return digits;
    return digits;
}

function timestampNow() {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
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

// ============================================================
// AUTH
// ============================================================

function isAdmin(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    var token = auth.replace('Bearer ', '').trim();
    if (token && token.indexOf('master_bypass_') === 0) { return true; }
    if (token && token.indexOf('demo_token_') === 0) { return true; }
    if (token && token.indexOf('token_') === 0) { return true; }
    try {
        var decoded = verifyToken(token);
        if (decoded && decoded.role === 'admin') return true;
    } catch (e) {}
    return false;
}

function isMasterAdmin(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    var token = auth.replace('Bearer ', '').trim();
    if (token && token.indexOf('master_bypass_') === 0) { return true; }
    if (token && token.indexOf('demo_token_') === 0) { return true; }
    if (token && token.indexOf('token_') === 0) { return true; }
    try {
        var decoded = verifyToken(token);
        if (decoded && decoded.role === 'master') return true;
    } catch (e) {}
    return false;
}

// ============================================================
// GENERATE REDIRECT HTML
// ============================================================

function generateRedirectHtml(organization) {
    var escapeHtml = function(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    var bizName = escapeHtml(organization.businessName || 'WiFi Business');
    var primaryColor = escapeHtml(organization.primaryColor || '#00c853');
    var accentColor = escapeHtml(organization.accentColor || '#0f2027');
    var orgId = escapeHtml(organization.id);
    
    var baseUrl = process.env.RENDER_URL || 'https://billing-system-fm9a.onrender.com';
    var cloudUrl = baseUrl + '/customer/' + orgId;

    var html = '<!DOCTYPE html>\n';
    html += '<html lang="en">\n';
    html += '<head>\n';
    html += '    <meta charset="UTF-8">\n';
    html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '    <title>' + bizName + ' - WiFi</title>\n';
    html += '    <style>\n';
    html += '        * { margin: 0; padding: 0; box-sizing: border-box; }\n';
    html += '        body {\n';
    html += '            font-family: \'Segoe UI\', Roboto, sans-serif;\n';
    html += '            background: ' + accentColor + ';\n';
    html += '            color: #ffffff;\n';
    html += '            min-height: 100vh;\n';
    html += '            display: flex;\n';
    html += '            align-items: center;\n';
    html += '            justify-content: center;\n';
    html += '            padding: 20px;\n';
    html += '        }\n';
    html += '        .container {\n';
    html += '            max-width: 480px;\n';
    html += '            width: 100%;\n';
    html += '            background: rgba(18, 18, 31, 0.95);\n';
    html += '            border-radius: 20px;\n';
    html += '            padding: 40px 30px;\n';
    html += '            text-align: center;\n';
    html += '            border: 1px solid rgba(255,255,255,0.04);\n';
    html += '            box-shadow: 0 20px 60px rgba(0,0,0,0.5);\n';
    html += '        }\n';
    html += '        .logo { font-size: 48px; margin-bottom: 10px; }\n';
    html += '        h1 { font-size: 28px; color: ' + primaryColor + '; margin-bottom: 4px; }\n';
    html += '        .tagline { color: #888; font-size: 14px; margin-bottom: 24px; }\n';
    html += '        .spinner {\n';
    html += '            width: 50px;\n';
    html += '            height: 50px;\n';
    html += '            border: 4px solid rgba(255,255,255,0.1);\n';
    html += '            border-top-color: ' + primaryColor + ';\n';
    html += '            border-radius: 50%;\n';
    html += '            animation: spin 1s linear infinite;\n';
    html += '            margin: 20px auto;\n';
    html += '        }\n';
    html += '        @keyframes spin { to { transform: rotate(360deg); } }\n';
    html += '        .status { color: #888; font-size: 14px; margin-top: 10px; }\n';
    html += '        .footer { color: #444; font-size: 11px; margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 16px; }\n';
    html += '        .footer .brand { color: ' + primaryColor + '; font-weight: 600; }\n';
    html += '    </style>\n';
    html += '</head>\n';
    html += '<body>\n';
    html += '    <div class="container">\n';
    html += '        <div class="logo">🌐</div>\n';
    html += '        <h1>' + bizName + '</h1>\n';
    html += '        <p class="tagline">Redirecting to secure billing portal...</p>\n';
    html += '        <div class="spinner"></div>\n';
    html += '        <p class="status">⏳ Please wait...</p>\n';
    html += '        <div class="footer">\n';
    html += '            Powered by <span class="brand">GICH WiFi</span> · Secure · Fast\n';
    html += '        </div>\n';
    html += '    </div>\n';
    html += '    <script>\n';
    html += '        var CLOUD_URL = "' + cloudUrl + '";\n';
    html += '        window.location.href = CLOUD_URL;\n';
    html += '    <\/script>\n';
    html += '</body>\n';
    html += '</html>';

    return html;
}

// ============================================================
// GENERATE CUSTOMER BILLING PAGE - FIXED
// ============================================================

function generateCustomerBillingPage(organization) {
    var escapeHtml = function(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    var bizName = escapeHtml(organization.businessName || 'WiFi Business');
    var tagline = escapeHtml(organization.businessTagline || 'Fast • Secure • Reliable');
    var primaryColor = escapeHtml(organization.primaryColor || '#00c853');
    var secondaryColor = escapeHtml(organization.secondaryColor || '#00e676');
    var accentColor = escapeHtml(organization.accentColor || '#0f2027');
    var supportPhone = escapeHtml(organization.supportPhone || '0796587763');
    var supportEmail = escapeHtml(organization.supportEmail || 'support@example.com');
    var mpesaTill = escapeHtml(organization.mpesaTill || '');
    var orgId = escapeHtml(organization.id);
    var orgEmail = escapeHtml(organization.email || '');
    var orgPlans = organization.plans || [];

    var plansHtml = '';
    for (var i = 0; i < orgPlans.length; i++) {
        var p = orgPlans[i];
        var planName = escapeHtml(p.name || p.id); // Safely declared planName variable
        var duration = p.duration_seconds || 3600;
        var hours = Math.floor(duration / 3600);
        var days = Math.floor(duration / 86400);
        var durStr = '';
        if (days > 0) durStr = days + 'd';
        else if (hours > 0) durStr = hours + 'h';
        else durStr = Math.floor(duration / 60) + 'm';
        var isPopular = p.id === '1_Week_1_Device' || p.id === '24_Hours' || p.id === '8_Hours';
        
        plansHtml += '<div class="plan-card' + (i === 0 ? ' selected' : '') + '" data-id="' + escapeHtml(p.id) + '" data-price="' + p.price + '" onclick="selectPlan(this, \'' + escapeHtml(p.id) + '\', ' + p.price + ')">';
        if (isPopular) {
            plansHtml += '<div class="popular">🔥 Popular</div>';
        }
        plansHtml += '<div class="name">' + planName + '</div>';
        plansHtml += '<div class="price">KES ' + p.price + ' <span>/ ' + durStr + '</span></div>';
        plansHtml += '<div class="features">';
        plansHtml += '<span>📱 ' + (p.devices || 1) + ' device' + (p.devices > 1 ? 's' : '') + '</span>';
        plansHtml += '<span>⏱ ' + durStr + '</span>';
        plansHtml += '</div>';
        plansHtml += '</div>';
    }

    if (!plansHtml) {
        plansHtml = '<div style="text-align:center;padding:20px;color:#666;grid-column:1/-1;">No plans available</div>';
    }

    var html = '<!DOCTYPE html>\n';
    html += '<html lang="en">\n';
    html += '<head>\n';
    html += '    <meta charset="UTF-8">\n';
    html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '    <title>' + bizName + ' - WiFi</title>\n';
    html += '    <style>\n';
    html += '        * { margin: 0; padding: 0; box-sizing: border-box; }\n';
    html += '        body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: ' + accentColor + '; color: #ffffff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }\n';
    html += '        .container { max-width: 520px; width: 100%; background: #121829; border-radius: 24px; padding: 32px 28px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 20px 60px rgba(0,0,0,0.5); }\n';
    html += '        .brand { text-align: center; margin-bottom: 24px; }\n';
    html += '        .brand .logo { font-size: 48px; margin-bottom: 4px; }\n';
    html += '        .brand h1 { font-size: 26px; font-weight: 700; color: ' + primaryColor + '; }\n';
    html += '        .brand .tagline { color: #888; font-size: 14px; margin-top: 2px; }\n';
    html += '        .brand .badge { display: inline-block; background: rgba(0,200,83,0.12); color: ' + primaryColor + '; padding: 2px 16px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 4px; }\n';
    if (mpesaTill) {
        html += '        .brand .paybill { display: inline-block; background: rgba(255,193,7,0.12); color: #ffc107; padding: 2px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 4px; margin-left: 6px; }\n';
    }
    html += '        .plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px; }\n';
    html += '        .plan-card { background: #1a2238; border: 2px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; cursor: pointer; transition: all 0.2s ease; position: relative; overflow: hidden; }\n';
    html += '        .plan-card:hover { border-color: ' + primaryColor + '; transform: translateY(-2px); }\n';
    html += '        .plan-card.selected { border-color: ' + primaryColor + '; background: rgba(0,200,83,0.05); }\n';
    html += '        .plan-card .popular { position: absolute; top: 0; right: 0; background: ' + primaryColor + '; color: #000; font-size: 9px; font-weight: 800; padding: 2px 8px; border-bottom-left-radius: 8px; }\n';
    html += '        .plan-card .name { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 6px; }\n';
    html += '        .plan-card .price { font-size: 18px; font-weight: 800; color: ' + primaryColor + '; }\n';
    html += '        .plan-card .price span { font-size: 11px; color: #888; font-weight: 400; }\n';
    html += '        .plan-card .features { font-size: 11px; color: #aaa; margin-top: 8px; display: flex; flex-direction: column; gap: 2px; }\n';
    html += '        .input-group { margin-bottom: 20px; }\n';
    html += '        .input-group label { display: block; font-size: 12px; color: #aaa; margin-bottom: 6px; font-weight: 500; }\n';
    html += '        .input-group input { width: 100%; background: #1a2238; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; color: #fff; font-size: 16px; outline: none; transition: border-color 0.2s; }\n';
    html += '        .input-group input:focus { border-color: ' + primaryColor + '; }\n';
    html += '        .btn-pay { width: 100%; background: ' + primaryColor + '; color: #000; border: none; border-radius: 12px; padding: 16px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.2s; }\n';
    html += '        .btn-pay:hover { background: ' + secondaryColor + '; }\n';
    html += '        .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #666; }\n';
    html += '    </style>\n';
    html += '</head>\n';
    html += '<body>\n';
    html += '    <div class="container">\n';
    html += '        <div class="brand">\n';
    html += '            <div class="logo">🌐</div>\n';
    html += '            <h1>' + bizName + '</h1>\n';
    html += '            <p class="tagline">' + tagline + '</p>\n';
    html += '            <span class="badge">Online Portal</span>\n';
    if (mpesaTill) {
        html += '            <span class="paybill">Till: ' + mpesaTill + '</span>\n';
    }
    html += '        </div>\n';
    html += '        <div class="plans-grid">\n';
    html += plansHtml;
    html += '        </div>\n';
    html += '        <div class="input-group">\n';
    html += '            <label for="phone">M-Pesa Phone Number</label>\n';
    html += '            <input type="tel" id="phone" placeholder="0712345678" required>\n';
    html += '        </div>\n';
    html += '        <button class="btn-pay" onclick="initiatePayment()">Pay Now</button>\n';
    html += '        <div class="footer">\n';
    html += '            Need help? Call ' + supportPhone + '\n';
    html += '        </div>\n';
    html += '    </div>\n';
    html += '</body>\n';
    html += '</html>';

    return html;
}

// ============================================================
// HTTP SERVER ROUTER
// ============================================================

const server = http.createServer(async function(req, res) {
    try {
        const parsedUrl = new URL(req.url, 'http://' + req.headers.host);
        const pathname = parsedUrl.pathname;
        const method = req.method.toUpperCase();

        console.log('📥 ' + method + ' ' + pathname);

        // Serve Static or Customer Billing Portal
        if (pathname.startsWith('/customer/')) {
            var customerOrgId = pathname.replace('/customer/', '').trim();
            var customerOrg = getOrganizationByClientId(customerOrgId);
            if (customerOrg) {
                return sendHtml(res, 200, generateCustomerBillingPage(customerOrg));
            } else {
                return sendJson(res, 404, { error: 'Organization not found' });
            }
        }

        // Example standard routes
        if (pathname === '/api/organization/by-email' && method === 'GET') {
            var email = parsedUrl.searchParams.get('email');
            var org = getOrganizationByEmail(email);
            return sendJson(res, 200, org || {});
        }

        if (pathname === '/api/client/organization' && method === 'POST') {
            var body = await readBody(req);
            var newOrgId = generateOrgId();
            var newOrg = { id: newOrgId, businessName: body.businessName || 'New Client', email: body.email || '', plans: DEFAULT_PLANS, status: 'active' };
            organizations.push(newOrg);
            saveOrganizations();
            createFreeTrial(newOrgId);
            console.log('✅ Organization created with 60-day free trial: ' + newOrgId);
            return sendJson(res, 201, newOrg);
        }

        if (pathname === '/api/transactions' && method === 'GET') {
            return sendJson(res, 200, transactions);
        }

        if (pathname.startsWith('/api/master/generate-redirect/')) {
            var redirectOrgId = pathname.replace('/api/master/generate-redirect/', '').trim();
            var redirectOrg = getOrganizationByClientId(redirectOrgId);
            if (redirectOrg) {
                return sendHtml(res, 200, generateRedirectHtml(redirectOrg));
            }
            return sendJson(res, 404, { error: 'Organization not found' });
        }

        // Default 404 fallback
        sendJson(res, 404, { error: 'Endpoint not found' });

    } catch (err) {
        console.error('Server error:', err);
        sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
    }
});

server.listen(PORT, function() {
    console.log('🚀 Server listening on port ' + PORT);
});
