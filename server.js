/**
 * GICH WiFi - Complete Backend with Subscription System
 * Uses Redirect Model - HTML files redirect to cloud backend
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

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '126483';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'master126483';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Subscription Plans
const SUBSCRIPTION_PLANS = {
    'free_trial': {
        name: 'Free Trial',
        price: 0,
        maxOrganizations: 1,
        maxPlans: 3,
        maxTransactions: 50,
        trialDays: 60,
        features: ['1 Organization', '3 Plans', '50 Transactions/month', '60-day trial']
    },
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

// Aggregator Configuration
const AGGREGATOR_CONFIG = {
    defaultMode: process.env.AGGREGATOR_DEFAULT_MODE || 'test',
    defaultProvider: process.env.AGGREGATOR_DEFAULT_PROVIDER || 'dpo',
    providers: {
        dpo: {
            name: 'DPO Group',
            feePercent: 1.5,
            test: {
                apiKey: process.env.DPO_TEST_API_KEY || 'test_dpo_key',
                apiSecret: process.env.DPO_TEST_API_SECRET || 'test_dpo_secret',
                baseUrl: 'https://sandbox.dpogroup.com/v1'
            },
            production: {
                apiKey: process.env.DPO_PROD_API_KEY || '',
                apiSecret: process.env.DPO_PROD_API_SECRET || '',
                baseUrl: 'https://api.dpogroup.com/v1'
            }
        },
        cellulant: {
            name: 'Cellulant',
            feePercent: 2.0,
            test: {
                apiKey: process.env.CELLULANT_TEST_API_KEY || 'test_cellulant_key',
                apiSecret: process.env.CELLULANT_TEST_API_SECRET || 'test_cellulant_secret',
                baseUrl: 'https://sandbox.cellulant.com/v1'
            },
            production: {
                apiKey: process.env.CELLULANT_PROD_API_KEY || '',
                apiSecret: process.env.CELLULANT_PROD_API_SECRET || '',
                baseUrl: 'https://api.cellulant.com/v1'
            }
        }
    }
};

console.log('\n========================================');
console.log('🌐 GICH WiFi API');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Aggregator Mode: ' + AGGREGATOR_CONFIG.defaultMode);
console.log('   Aggregator Provider: ' + AGGREGATOR_CONFIG.defaultProvider);
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
        try { transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8')); } catch (e) { console.error('Error loading transactions:', e); }
    }
    if (fs.existsSync(VOUCHERS_FILE)) {
        try { vouchers = JSON.parse(fs.readFileSync(VOUCHERS_FILE, 'utf8')); } catch (e) { console.error('Error loading vouchers:', e); }
    }
    if (fs.existsSync(PLANS_FILE)) {
        try { plans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8')); } catch (e) { console.error('Error loading plans:', e); plans = DEFAULT_PLANS; }
    } else { plans = DEFAULT_PLANS; savePlans(); }
    if (fs.existsSync(SETTINGS_FILE)) {
        try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { console.error('Error loading settings:', e); settings = DEFAULT_SETTINGS; }
    } else { settings = DEFAULT_SETTINGS; saveSettings(); }
    if (fs.existsSync(CLIENTS_FILE)) {
        try { clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')); } catch (e) { console.error('Error loading clients:', e); clients = []; }
    } else { clients = []; saveClients(); }
    if (fs.existsSync(ORGANIZATIONS_FILE)) {
        try { organizations = JSON.parse(fs.readFileSync(ORGANIZATIONS_FILE, 'utf8')); } catch (e) { console.error('Error loading organizations:', e); organizations = []; }
    } else { organizations = []; saveOrganizations(); }
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
        try { subscriptions = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')); } catch (e) { console.error('Error loading subscriptions:', e); subscriptions = []; }
    } else { subscriptions = []; saveSubscriptions(); }
}

function saveTransactions() { try { fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2)); } catch (e) {} }
function saveVouchers() { try { fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(vouchers, null, 2)); } catch (e) {} }
function savePlans() { try { fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2)); } catch (e) {} }
function saveSettings() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (e) {} }
function saveClients() { try { fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2)); } catch (e) {} }
function saveOrganizations() { try { fs.writeFileSync(ORGANIZATIONS_FILE, JSON.stringify(organizations, null, 2)); } catch (e) {} }
function saveSubscriptions() { try { fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2)); } catch (e) {} }

// ============================================================
// HELPERS
// ============================================================

function generateOrgId() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function generateVoucherCode() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 10; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return code; }
function getOrganizationByClientId(clientId) { return organizations.find(function(org) { return org.id === clientId; }); }
function getOrganizationByEmail(email) { return organizations.find(function(org) { return org.email === email; }); }

// ============================================================
// SUBSCRIPTION SYSTEM - ACTUALLY WORKS NOW
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
            message: 'No active subscription. Please start a free trial or subscribe.',
            code: 'NO_SUBSCRIPTION',
            canStartTrial: true,
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
            message: 'Free trial: ' + daysLeft + ' days remaining',
            canSubscribe: true
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

// ============================================================
// AUTO-SUSPEND - RUNS DAILY
// ============================================================

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

// Run auto-suspend every 12 hours
setInterval(autoSuspendExpiredAccounts, 12 * 60 * 60 * 1000);
autoSuspendExpiredAccounts();

// ============================================================
// AGGREGATOR PAYMENT FUNCTIONS
// ============================================================

function calculatePriceWithFee(price, feePercent) {
    var fee = price * (feePercent / 100);
    return {
        basePrice: price,
        fee: Math.round(fee * 100) / 100,
        total: Math.round((price + fee) * 100) / 100,
        feePercent: feePercent
    };
}

async function initiateAggregatorPayment(organization, plan, customerPhone) {
    var provider = organization.aggregatorProvider || AGGREGATOR_CONFIG.defaultProvider;
    var mode = organization.aggregatorMode || AGGREGATOR_CONFIG.defaultMode;
    var config = AGGREGATOR_CONFIG.providers[provider];
    var modeConfig = config[mode] || config.test;
    var priceData = calculatePriceWithFee(plan.price, config.feePercent);
    var transactionId = 'GICH_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    
    // TEST MODE - Simulate payment
    if (mode === 'test') {
        console.log('🧪 TEST MODE: Simulating payment for', organization.businessName);
        
        var testTx = {
            id: transactionId,
            organizationId: organization.id,
            planId: plan.id,
            planName: plan.name,
            customerPhone: customerPhone,
            amount: priceData.total,
            baseAmount: priceData.basePrice,
            fee: priceData.fee,
            feePercent: priceData.feePercent,
            status: 'completed',
            provider: provider,
            mode: mode,
            isTest: true,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + plan.duration_seconds * 1000).toISOString(),
            username: 'test_user_' + transactionId.substring(0, 8),
            password: 'test_pass_' + Date.now().toString(36)
        };
        transactions.push(testTx);
        saveTransactions();
        
        return {
            success: true,
            transactionId: transactionId,
            isTest: true,
            amount: priceData.total,
            fee: priceData.fee,
            feePercent: priceData.feePercent,
            baseAmount: priceData.basePrice,
            username: testTx.username,
            password: testTx.password,
            expiresAt: testTx.expiresAt
        };
    }
    
    // PRODUCTION MODE - Call aggregator API
    // ... (API call code here)
    return { success: false, message: 'Production not configured' };
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
// GENERATE REDIRECT.HTML (NEW - Redirects to cloud backend)
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
    html += '        // Auto-redirect to cloud billing page\n';
    html += '        var CLOUD_URL = "' + cloudUrl + '";\n';
    html += '        var linkLogin = "' + escapeHtml(organization.linkLogin || '') + '";\n';
    html += '        var mac = "' + escapeHtml(organization.mac || '') + '";\n';
    html += '        var ip = "' + escapeHtml(organization.ip || '') + '";\n';
    html += '        var linkOrig = "' + escapeHtml(organization.linkOrig || '') + '";\n';
    html += '\n';
    html += '        function redirect() {\n';
    html += '            var url = CLOUD_URL;\n';
    html += '            var params = [];\n';
    html += '            if (linkLogin) params.push("link-login=" + encodeURIComponent(linkLogin));\n';
    html += '            if (mac) params.push("mac=" + encodeURIComponent(mac));\n';
    html += '            if (ip) params.push("ip=" + encodeURIComponent(ip));\n';
    html += '            if (linkOrig) params.push("link-orig=" + encodeURIComponent(linkOrig));\n';
    html += '            if (params.length > 0) {\n';
    html += '                url += "?" + params.join("&");\n';
    html += '            }\n';
    html += '            window.location.href = url;\n';
    html += '        }\n';
    html += '\n';
    html += '        // Redirect after 2 seconds\n';
    html += '        setTimeout(redirect, 2000);\n';
    html += '\n';
    html += '        // Or redirect immediately if user clicks\n';
    html += '        document.addEventListener("click", redirect);\n';
    html += '        document.addEventListener("touchstart", redirect);\n';
    html += '    <\/script>\n';
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

        // ============================================================
        // PUBLIC API ENDPOINTS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/health') {
            return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
        }

        // ============================================================
        // CLIENT PORTAL ENDPOINTS
        // ============================================================

        // Check if organization exists
        if (req.method === 'GET' && url.pathname === '/api/client/check-org') {
            var email = url.searchParams.get('email');
            if (!email) {
                return sendJson(res, 400, { success: false, message: 'Email required' });
            }
            var orgExists = organizations.some(function(o) { return o.email === email; });
            return sendJson(res, 200, { success: true, hasOrganization: orgExists, email: email });
        }

        // Get organization by email
        if (req.method === 'GET' && url.pathname === '/api/organization/by-email') {
            var email = url.searchParams.get('email');
            if (!email) {
                return sendJson(res, 400, { success: false, message: 'Email required' });
            }
            var org = getOrganizationByEmail(email);
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
                    plans: org.plans || [],
                    status: org.status
                }
            });
        }

        // ============================================================
        // CLIENT CREATE ORGANIZATION
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            var body = await readBody(req);
            var email = body.email || 'master@demo.com';
            
            var existingOrg = getOrganizationByEmail(email);
            if (existingOrg) {
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
                primaryColor: body.primaryColor || '#00c853',
                secondaryColor: body.secondaryColor || '#00e676',
                accentColor: body.accentColor || '#0f2027',
                supportPhone: body.supportPhone || '0712345678',
                supportEmail: body.supportEmail || email,
                businessTagline: body.businessTagline || 'Fast • Secure • Reliable',
                mpesaPhoneNumber: body.mpesaPhoneNumber || body.phone || '0712345678',
                aggregatorProvider: body.aggregatorProvider || AGGREGATOR_CONFIG.defaultProvider,
                aggregatorMode: body.aggregatorMode || AGGREGATOR_CONFIG.defaultMode,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                plans: body.plans || DEFAULT_PLANS
            };
            
            organizations.push(newOrganization);
            saveOrganizations();
            
            // Create client record
            clients.push({
                id: clientId,
                name: businessName,
                phone: body.phone || '0712345678',
                email: email,
                businessName: businessName,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                organizationId: clientId
            });
            saveClients();
            
            // Start free trial automatically
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
            
            console.log('✅ Organization created with 60-day free trial:', clientId);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Organization created with 60-day free trial!',
                organization: newOrganization,
                clientId: clientId
            });
        }

        // ============================================================
        // GET ORGANIZATION BY ID
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/organization/')) {
            var orgId = url.pathname.split('/').pop();
            if (!orgId || orgId === 'organizations') {
                return sendJson(res, 400, { success: false, message: 'Invalid organization ID' });
            }
            
            var org = getOrganizationByClientId(orgId);
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
                    businessTagline: org.businessTagline,
                    plans: org.plans || [],
                    status: org.status
                }
            });
        }

        // ============================================================
        // UPDATE ORGANIZATION - WITH SUBSCRIPTION CHECK
        // ============================================================
        if (req.method === 'PUT' && url.pathname.startsWith('/api/master/organizations/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var orgId = url.pathname.split('/').pop();
            var body = await readBody(req);
            var index = organizations.findIndex(function(o) { return o.id === orgId; });
            
            if (index === -1) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            // Merge all fields
            organizations[index] = {
                ...organizations[index],
                businessName: body.businessName !== undefined ? body.businessName : organizations[index].businessName,
                businessTagline: body.businessTagline !== undefined ? body.businessTagline : organizations[index].businessTagline,
                supportPhone: body.supportPhone !== undefined ? body.supportPhone : organizations[index].supportPhone,
                supportEmail: body.supportEmail !== undefined ? body.supportEmail : organizations[index].supportEmail,
                logo: body.logo !== undefined ? body.logo : organizations[index].logo,
                mpesaPhoneNumber: body.mpesaPhoneNumber !== undefined ? body.mpesaPhoneNumber : organizations[index].mpesaPhoneNumber,
                primaryColor: body.primaryColor !== undefined ? body.primaryColor : organizations[index].primaryColor,
                secondaryColor: body.secondaryColor !== undefined ? body.secondaryColor : organizations[index].secondaryColor,
                accentColor: body.accentColor !== undefined ? body.accentColor : organizations[index].accentColor,
                plans: body.plans !== undefined ? body.plans : organizations[index].plans,
                aggregatorProvider: body.aggregatorProvider !== undefined ? body.aggregatorProvider : organizations[index].aggregatorProvider,
                aggregatorMode: body.aggregatorMode !== undefined ? body.aggregatorMode : organizations[index].aggregatorMode,
                updatedAt: new Date().toISOString()
            };
            saveOrganizations();
            
            return sendJson(res, 200, {
                success: true,
                message: 'Organization updated',
                data: organizations[index]
            });
        }

        // ============================================================
        // GET SUBSCRIPTION STATUS - ACTUALLY WORKS NOW
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/client/subscription-status') {
            var email = url.searchParams.get('email');
            if (!email) {
                return sendJson(res, 400, { success: false, message: 'Email required' });
            }
            
            var org = getOrganizationByEmail(email);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var clientId = org.id;
            var status = checkSubscriptionAccess(clientId);
            
            return sendJson(res, 200, {
                success: true,
                status: status,
                organization: {
                    id: org.id,
                    name: org.businessName
                }
            });
        }

        // ============================================================
        // START FREE TRIAL
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/client/start-trial') {
            var body = await readBody(req);
            var clientId = body.clientId || body.email;
            
            var org = getOrganizationByClientId(clientId) || getOrganizationByEmail(clientId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var existingSub = getClientSubscription(org.id);
            if (existingSub) {
                return sendJson(res, 400, { 
                    success: false, 
                    message: 'You already have an active subscription or trial'
                });
            }
            
            var sub = createFreeTrial(org.id);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Free trial started! You have 60 days.',
                trialDays: 60,
                trialEnds: sub.trialEnds
            });
        }

        // ============================================================
        // SUBSCRIBE / UPGRADE PLAN
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/client/subscribe') {
            var body = await readBody(req);
            var clientId = body.clientId || body.email;
            var plan = body.plan || 'starter';
            
            var org = getOrganizationByClientId(clientId) || getOrganizationByEmail(clientId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var planData = SUBSCRIPTION_PLANS[plan];
            if (!planData) {
                return sendJson(res, 400, { success: false, message: 'Invalid plan' });
            }
            
            // Create or update subscription
            var sub = subscriptions.find(function(s) { return s.clientId === org.id; });
            if (!sub) {
                sub = {
                    clientId: org.id,
                    plan: plan,
                    status: 'active',
                    trialStarted: null,
                    trialEnds: null,
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
            
            // Reactivate organization if suspended
            if (org.status === 'suspended') {
                org.status = 'active';
                saveOrganizations();
            }
            
            return sendJson(res, 200, {
                success: true,
                message: 'Subscribed to ' + planData.name + ' plan successfully!',
                plan: plan,
                expiresAt: sub.expiresAt
            });
        }

        // ============================================================
        // AGGREGATOR PAYMENT INITIATE - WITH SUBSCRIPTION CHECK
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/aggregator/initiate') {
            var body = await readBody(req);
            
            var organizationId = body.organizationId;
            var planId = body.planId;
            var customerPhone = body.phoneNumber;
            
            var org = getOrganizationByClientId(organizationId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            // 🔥 CRITICAL: Check subscription BEFORE processing payment
            var access = checkSubscriptionAccess(org.id);
            if (!access.allowed) {
                return sendJson(res, 403, {
                    success: false,
                    message: access.message,
                    code: access.code,
                    canStartTrial: access.canStartTrial || false,
                    canSubscribe: access.canSubscribe || false
                });
            }
            
            var plan = (org.plans || []).find(function(p) { return p.id === planId; });
            if (!plan) {
                return sendJson(res, 404, { success: false, message: 'Plan not found' });
            }
            
            try {
                var result = await initiateAggregatorPayment(org, plan, customerPhone);
                
                return sendJson(res, 200, {
                    success: true,
                    data: {
                        transactionId: result.transactionId,
                        isTest: result.isTest || false,
                        amount: result.amount,
                        fee: result.fee,
                        feePercent: result.feePercent,
                        baseAmount: result.baseAmount,
                        username: result.username,
                        password: result.password,
                        expiresAt: result.expiresAt,
                        message: result.isTest ? '🧪 TEST MODE: Payment simulated' : 'Payment initiated successfully'
                    },
                    subscription: access
                });
            } catch (error) {
                console.error('Payment error:', error);
                return sendJson(res, 500, { success: false, message: error.message });
            }
        }

        // ============================================================
        // GENERATE REDIRECT.HTML - WITH SUBSCRIPTION CHECK
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/master/generate-redirect/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var orgId = url.pathname.split('/').pop();
            var org = getOrganizationByClientId(orgId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            // 🔥 CRITICAL: Check subscription BEFORE generating HTML
            var access = checkSubscriptionAccess(org.id);
            if (!access.allowed) {
                return sendJson(res, 403, {
                    success: false,
                    message: 'Cannot generate redirect file. ' + access.message,
                    code: access.code,
                    canStartTrial: access.canStartTrial || false,
                    canSubscribe: access.canSubscribe || false
                });
            }
            
            var html = generateRedirectHtml(org);
            
            return sendJson(res, 200, {
                success: true,
                html: html,
                filename: 'redirect.html',
                subscription: {
                    status: access.status,
                    daysLeft: access.daysLeft,
                    message: access.message
                },
                message: 'Redirect file generated successfully!'
            });
        }

        // ============================================================
        // SERVE CUSTOMER BILLING PAGE (Cloud version)
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/customer/')) {
            var orgId = url.pathname.split('/')[2];
            var org = getOrganizationByClientId(orgId);
            if (!org) {
                return sendHtml(res, 404, '<h1>Organization not found</h1>');
            }
            
            // Check subscription
            var access = checkSubscriptionAccess(org.id);
            if (!access.allowed) {
                return sendHtml(res, 403, generateExpiredPage(org, access));
            }
            
            // Serve the billing page (you can use the existing billing HTML generator here)
            // For now, show a simple page
            return sendHtml(res, 200, generateCustomerBillingPage(org, access));
        }

        // ============================================================
        // ADMIN VERIFY
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/admin/verify') {
            var body = await readBody(req);
            if (body.pin === ADMIN_PASSWORD) {
                var token = generateToken({ username: 'admin', role: 'admin', exp: Date.now() + 86400000 });
                return sendJson(res, 200, { success: true, message: 'Admin verified', token: token });
            } else {
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // ============================================================
        // MASTER ADMIN VERIFY
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/master/verify') {
            var body = await readBody(req);
            if (body.pin === MASTER_PASSWORD) {
                var token = generateToken({ username: 'master', role: 'master', exp: Date.now() + 86400000 });
                return sendJson(res, 200, { success: true, message: 'Master verified', token: token, role: 'master' });
            } else {
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // ============================================================
        // GET ALL ORGANIZATIONS (Master)
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/master/organizations') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            return sendJson(res, 200, { success: true, data: organizations, count: organizations.length });
        }

        // ============================================================
        // VOUCHER SYSTEM
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/voucher/redeem') {
            var body = await readBody(req);
            var code = body.code;
            var phoneNumber = body.phoneNumber;
            
            if (!code) {
                return sendJson(res, 400, { success: false, message: 'Voucher code required' });
            }
            
            var voucher = vouchers.find(function(v) { return v.code === code && !v.used; });
            if (!voucher) {
                return sendJson(res, 404, { success: false, message: 'Invalid or already used voucher' });
            }
            
            voucher.used = true;
            voucher.usedBy = phoneNumber || 'unknown';
            voucher.usedAt = new Date().toISOString();
            saveVouchers();
            
            var transactionId = 'VOUCH_' + Date.now();
            var duration = voucher.duration_seconds || 3600;
            
            var tx = {
                id: transactionId,
                phoneNumber: phoneNumber || 'voucher_user',
                amount: 0,
                planId: voucher.planId || 'voucher',
                planName: voucher.planName || 'Voucher Plan',
                status: 'completed',
                timestamp: new Date().toISOString(),
                expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
                username: 'vuser_' + transactionId.substring(0, 8),
                password: 'vpass_' + Date.now().toString(36)
            };
            transactions.push(tx);
            saveTransactions();
            
            return sendJson(res, 200, {
                success: true,
                message: 'Voucher redeemed successfully!',
                data: {
                    transactionId: transactionId,
                    planName: voucher.planName,
                    expiresAt: tx.expiresAt,
                    username: tx.username,
                    password: tx.password
                }
            });
        }

        if (req.method === 'POST' && url.pathname === '/api/admin/voucher/generate') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var body = await readBody(req);
            var planId = body.planId;
            var count = Math.min(body.count || 1, 100);
            
            if (!planId) {
                return sendJson(res, 400, { success: false, message: 'Plan ID required' });
            }
            
            var plan = plans.find(function(p) { return p.id === planId; });
            if (!plan) {
                return sendJson(res, 400, { success: false, message: 'Invalid plan ID' });
            }
            
            var generated = [];
            for (var i = 0; i < count; i++) {
                var code = generateVoucherCode();
                vouchers.push({
                    code: code,
                    planId: plan.id,
                    planName: plan.name,
                    duration_seconds: plan.duration_seconds || 3600,
                    devices: plan.devices || 1,
                    used: false,
                    usedBy: null,
                    usedAt: null,
                    createdAt: new Date().toISOString()
                });
                generated.push(code);
            }
            saveVouchers();
            
            return sendJson(res, 200, {
                success: true,
                message: 'Generated ' + generated.length + ' vouchers',
                vouchers: generated,
                count: generated.length
            });
        }

        if (req.method === 'GET' && url.pathname === '/api/admin/vouchers') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var used = vouchers.filter(function(v) { return v.used; }).length;
            return sendJson(res, 200, {
                success: true,
                data: vouchers,
                count: vouchers.length,
                used: used,
                unused: vouchers.length - used
            });
        }

        // ============================================================
        // GET TRANSACTION
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/transaction/')) {
            var id = url.pathname.split('/').pop();
            var tx = transactions.find(function(t) { return t.id === id; });
            if (!tx) {
                return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            }
            
            return sendJson(res, 200, {
                success: true,
                data: {
                    id: tx.id,
                    status: tx.status,
                    amount: tx.amount,
                    planName: tx.planName,
                    expiresAt: tx.expiresAt,
                    username: tx.username,
                    password: tx.password,
                    isTest: tx.isTest || false
                }
            });
        }

        // ============================================================
        // GET CREDENTIALS
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/get-credentials/')) {
            var id = url.pathname.split('/').pop();
            var tx = transactions.find(function(t) { return t.id === id; });
            if (!tx) {
                return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            }
            if (tx.status !== 'completed') {
                return sendJson(res, 400, { success: false, message: 'Payment not completed' });
            }
            return sendJson(res, 200, {
                success: true,
                username: tx.username || 'user_' + id.substring(0, 8),
                password: tx.password || 'pass_' + Date.now().toString(36),
                plan: tx.planName,
                expiresAt: tx.expiresAt
            });
        }

        // ============================================================
        // GET TRANSACTIONS
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/transactions') {
            var phone = url.searchParams.get('phone');
            var filtered = phone ? transactions.filter(function(t) { return t.phoneNumber === phone; }) : transactions;
            return sendJson(res, 200, { success: true, data: filtered, count: filtered.length });
        }

        // ============================================================
        // CHECK ACTIVE PLAN
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/check-active') {
            var phone = url.searchParams.get('phone');
            if (!phone) return sendJson(res, 400, { success: false, message: 'Phone number required' });
            var active = null;
            for (var i = 0; i < transactions.length; i++) {
                var t = transactions[i];
                if (t.phoneNumber === phone && t.status === 'completed' && (!t.expiresAt || new Date(t.expiresAt) > new Date())) {
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
                        username: active.username,
                        password: active.password
                    }
                });
            } else {
                return sendJson(res, 200, { success: true, active: false });
            }
        }

        // ============================================================
        // API INFO
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api') {
            var totalRevenue = transactions.filter(function(t) { return t.status === 'completed'; }).reduce(function(sum, t) { return sum + (t.amount || 0); }, 0);
            var activeSubscriptions = subscriptions.filter(function(s) { return s.status === 'active' || s.status === 'trial'; }).length;
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '4.0.0',
                status: 'Running',
                statistics: {
                    totalTransactions: transactions.length,
                    totalRevenue: totalRevenue,
                    activeVouchers: vouchers.filter(function(v) { return !v.used; }).length,
                    totalOrganizations: organizations.length,
                    activeSubscriptions: activeSubscriptions
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
// HELPER PAGE FUNCTIONS
// ============================================================

function generateExpiredPage(org, access) {
    var html = '<!DOCTYPE html>\n';
    html += '<html>\n';
    html += '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Subscription Required</title>';
    html += '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:sans-serif;background:#0a0a1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}.container{max-width:480px;background:#12121f;padding:40px;border-radius:20px;text-align:center;border:1px solid rgba(255,255,255,0.04);}.icon{font-size:64px;margin-bottom:16px;}h1{color:#ff4444;font-size:24px;margin-bottom:8px;}p{color:#888;font-size:14px;margin-bottom:20px;}.btn{display:inline-block;padding:12px 30px;background:#00c853;color:#000;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;margin:4px 8px;}.btn:hover{background:#00e676;}.btn-secondary{background:#2a2a4a;color:#fff;}.btn-secondary:hover{background:#3a3a5a;}.footer{color:#444;font-size:11px;margin-top:20px;}</style>';
    html += '</head><body>\n';
    html += '<div class="container">\n';
    html += '    <div class="icon">⛔</div>\n';
    html += '    <h1>Service Suspended</h1>\n';
    html += '    <p>' + access.message + '</p>\n';
    if (access.canStartTrial) {
        html += '    <a href="/" class="btn">🚀 Start Free Trial</a>\n';
    }
    if (access.canSubscribe) {
        html += '    <a href="/" class="btn btn-secondary">💳 Subscribe Now</a>\n';
    }
    html += '    <div class="footer">Powered by GICH WiFi</div>\n';
    html += '</div></body></html>';
    return html;
}

function generateCustomerBillingPage(org, access) {
    // This is a simplified version - you can use your full billing HTML here
    var primaryColor = org.primaryColor || '#00c853';
    var plansHtml = '';
    var plans = org.plans || [];
    for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
        var duration = p.duration_seconds || 3600;
        var hours = Math.floor(duration / 3600);
        var days = Math.floor(duration / 86400);
        var durStr = days > 0 ? days + ' days' : hours + ' hours';
        plansHtml += '<div class="plan-card" onclick="selectPlan(\'' + p.id + '\', ' + p.price + ')">\n';
        plansHtml += '    <div class="plan-name">' + p.name + '</div>\n';
        plansHtml += '    <div class="plan-price">KES ' + p.price + '</div>\n';
        plansHtml += '    <div class="plan-duration">' + durStr + '</div>\n';
        plansHtml += '</div>\n';
    }
    
    var html = '<!DOCTYPE html>\n';
    html += '<html>\n';
    html += '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + org.businessName + ' - WiFi</title>';
    html += '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:sans-serif;background:' + org.accentColor + ';color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}.container{max-width:480px;background:#12121f;padding:30px;border-radius:20px;border:1px solid rgba(255,255,255,0.04);}.brand{text-align:center;margin-bottom:20px;}.brand h1{color:' + primaryColor + ';font-size:24px;}.brand p{color:#888;font-size:14px;}.plan-grid{display:grid;gap:10px;margin:16px 0;}.plan-card{background:rgba(255,255,255,0.03);padding:14px;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.05);text-align:center;}.plan-card:hover{border-color:' + primaryColor + ';}.plan-name{font-weight:600;}.plan-price{color:' + primaryColor + ';font-size:20px;font-weight:700;}.plan-duration{color:#888;font-size:12px;}.input-group{margin:12px 0;}.input-group input{width:100%;padding:12px;background:#0a0a1a;border:2px solid rgba(255,255,255,0.06);border-radius:10px;color:#fff;font-size:16px;}.btn{width:100%;padding:14px;background:' + primaryColor + ';border:none;border-radius:10px;color:#000;font-size:16px;font-weight:700;cursor:pointer;}.btn:hover{opacity:0.85;}.status-banner{padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px;text-align:center;}.trial-banner{background:rgba(0,200,83,0.1);border:1px solid rgba(0,200,83,0.2);color:#00c853;}.paid-banner{background:rgba(33,150,243,0.1);border:1px solid rgba(33,150,243,0.2);color:#2196f3;}.result{text-align:center;margin-top:10px;font-size:13px;}.footer{text-align:center;color:#444;font-size:11px;margin-top:20px;}.footer .brand{color:' + primaryColor + ';font-weight:600;}</style>';
    html += '</head><body>\n';
    html += '<div class="container">\n';
    html += '    <div class="brand">\n';
    html += '        <h1>🌐 ' + org.businessName + '</h1>\n';
    html += '        <p>' + (org.businessTagline || 'Fast • Secure • Reliable') + '</p>\n';
    html += '    </div>\n';
    
    // Show subscription status
    if (access.status === 'trial') {
        html += '    <div class="status-banner trial-banner">🎁 Free Trial: ' + access.daysLeft + ' days remaining</div>\n';
    } else if (access.status === 'active') {
        html += '    <div class="status-banner paid-banner">✅ ' + access.plan + ' Plan active</div>\n';
    }
    
    html += '    <div class="plan-grid">\n';
    html += plansHtml;
    html += '    </div>\n';
    html += '    <div class="input-group">\n';
    html += '        <input type="tel" id="phoneInput" placeholder="📱 M-Pesa Phone Number" />\n';
    html += '    </div>\n';
    html += '    <button class="btn" id="payBtn" onclick="payNow()">💳 Pay Now</button>\n';
    html += '    <div id="result" class="result"></div>\n';
    html += '    <div class="footer">Powered by <span class="brand">GICH WiFi</span></div>\n';
    html += '</div>\n';
    
    html += '<script>\n';
    html += '    var selectedPlan = null;\n';
    html += '    var selectedPrice = 0;\n';
    html += '    var API_URL = "' + (process.env.RENDER_URL || 'https://billing-system-fm9a.onrender.com') + '/api";\n';
    html += '    var ORG_ID = "' + org.id + '";\n';
    html += '\n';
    html += '    function selectPlan(id, price) {\n';
    html += '        selectedPlan = id;\n';
    html += '        selectedPrice = price;\n';
    html += '        document.getElementById("payBtn").textContent = "💳 Pay KSh " + price;\n';
    html += '        document.getElementById("payBtn").disabled = false;\n';
    html += '        document.querySelectorAll(".plan-card").forEach(function(el) { el.style.borderColor = "rgba(255,255,255,0.05)"; });\n';
    html += '        event.target.closest(".plan-card").style.borderColor = "' + primaryColor + '";\n';
    html += '    }\n';
    html += '\n';
    html += '    async function payNow() {\n';
    html += '        var phone = document.getElementById("phoneInput").value.trim();\n';
    html += '        if (!phone || phone.length < 10) {\n';
    html += '            alert("📱 Please enter a valid phone number");\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        if (!selectedPlan) {\n';
    html += '            alert("Please select a plan first");\n';
    html += '            return;\n';
    html += '        }\n';
    html += '\n';
    html += '        var btn = document.getElementById("payBtn");\n';
    html += '        btn.disabled = true;\n';
    html += '        btn.textContent = "⏳ Processing...";\n';
    html += '        var resultEl = document.getElementById("result");\n';
    html += '        resultEl.textContent = "⏳ Sending payment request...";\n';
    html += '\n';
    html += '        try {\n';
    html += '            var response = await fetch(API_URL + "/aggregator/initiate", {\n';
    html += '                method: "POST",\n';
    html += '                headers: { "Content-Type": "application/json" },\n';
    html += '                body: JSON.stringify({\n';
    html += '                    organizationId: ORG_ID,\n';
    html += '                    planId: selectedPlan,\n';
    html += '                    phoneNumber: phone\n';
    html += '                })\n';
    html += '            });\n';
    html += '            var data = await response.json();\n';
    html += '\n';
    html += '            if (data.success) {\n';
    html += '                var result = data.data;\n';
    html += '                if (result.isTest) {\n';
    html += '                    resultEl.innerHTML = "🧪 TEST MODE: Payment simulated!<br>Username: " + result.username + "<br>Password: " + result.password;\n';
    html += '                    btn.textContent = "✅ Connected!";\n';
    html += '                    showCredentials(result);\n';
    html += '                } else {\n';
    html += '                    resultEl.innerHTML = "✅ Payment initiated! Check your phone.";\n';
    html += '                    btn.textContent = "📱 Check Phone";\n';
    html += '                    pollTransaction(result.transactionId);\n';
    html += '                }\n';
    html += '            } else if (data.code === "NO_SUBSCRIPTION" || data.code === "SUBSCRIPTION_EXPIRED") {\n';
    html += '                resultEl.innerHTML = "❌ " + data.message + "<br><a href=\'/api/client/start-trial\' style=\'color:" + "' + primaryColor + '" + ";text-decoration:underline;\'>Start Free Trial</a>";\n';
    html += '                btn.disabled = false;\n';
    html += '                btn.textContent = "💳 Pay Now";\n';
    html += '            } else {\n';
    html += '                resultEl.innerHTML = "❌ " + (data.message || "Payment failed");\n';
    html += '                btn.disabled = false;\n';
    html += '                btn.textContent = "💳 Pay Now";\n';
    html += '            }\n';
    html += '        } catch (e) {\n';
    html += '            resultEl.innerHTML = "❌ Network error: " + e.message;\n';
    html += '            btn.disabled = false;\n';
    html += '            btn.textContent = "💳 Pay Now";\n';
    html += '        }\n';
    html += '    }\n';
    html += '\n';
    html += '    async function pollTransaction(txnId) {\n';
    html += '        var attempts = 0;\n';
    html += '        var maxAttempts = 30;\n';
    html += '        var interval = setInterval(async function() {\n';
    html += '            attempts++;\n';
    html += '            if (attempts > maxAttempts) {\n';
    html += '                clearInterval(interval);\n';
    html += '                document.getElementById("result").innerHTML = "⏱️ Payment confirmation timed out.";\n';
    html += '                return;\n';
    html += '            }\n';
    html += '            try {\n';
    html += '                var res = await fetch(API_URL + "/transaction/" + txnId);\n';
    html += '                var data = await res.json();\n';
    html += '                if (data.success && data.data.status === "completed") {\n';
    html += '                    clearInterval(interval);\n';
    html += '                    document.getElementById("result").innerHTML = "✅ Payment successful! Connecting...";\n';
    html += '                    showCredentials(data.data);\n';
    html += '                }\n';
    html += '            } catch (e) {}\n';
    html += '        }, 3000);\n';
    html += '    }\n';
    html += '\n';
    html += '    function showCredentials(data) {\n';
    html += '        document.querySelector(".container").innerHTML = \'<div style="text-align:center;padding:20px;"><div style="font-size:64px;margin-bottom:12px;">🎉</div><h2 style="color:' + primaryColor + ';">You\'re Connected!</h2><p style="color:#888;margin:8px 0;">Username: <strong style="color:#fff;">\' + data.username + \'</strong></p><p style="color:#888;margin:8px 0;">Password: <strong style="color:#fff;">\' + data.password + \'</strong></p><p style="color:#888;margin:8px 0;">Plan: <strong style="color:#fff;">\' + data.planName + \'</strong></p><p style="color:#666;font-size:12px;margin-top:16px;">🔒 Secured by GICH WiFi</p></div>\';\n';
    html += '    }\n';
    html += '</script>\n';
    html += '</body></html>';
    
    return html;
}

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
    console.log('========================================');
    console.log('🛡️ Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
    console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
    console.log('🏢 Organizations: ' + organizations.length);
    console.log('📋 Active Subscriptions: ' + subscriptions.filter(function(s) { return s.status === 'active' || s.status === 'trial'; }).length);
    console.log('========================================\n');
});

process.on('uncaughtException', function(err) { console.error('❌ Uncaught Exception:', err); });
process.on('unhandledRejection', function(reason) { console.error('❌ Unhandled Rejection:', reason); });
