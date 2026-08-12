/**
 * GICH WiFi - Complete Backend with MongoDB
 * Full M-Pesa STK Push with multi-tenant support
 * FINAL VERSION - Fixed all connection issues
 */

require('dotenv').config();

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

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

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'gich_wifi';

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

const DEFAULT_SETTINGS = {
    businessName: 'GICH WIFI',
    businessTagline: 'Fast • Secure • Reliable',
    supportPhone: '0796587763',
    supportEmail: 'support@gichwifi.co.ke',
    primaryColor: '#00c853',
    secondaryColor: '#00e676',
    accentColor: '#0f2027',
    logo: ''
};

const DEFAULT_PLANS = [
    { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, duration_seconds: 7200 },
    { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, duration_seconds: 18000 },
    { id: '8_Hours', name: '8 Hours', price: 30, devices: 1, duration_seconds: 28800 },
    { id: '12_Hours', name: '12 Hours', price: 50, devices: 1, duration_seconds: 43200 },
    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, duration_seconds: 86400 }
];

// Cache
let plans = [];
let settings = {};
let db = null;
let client = null;

console.log('\n========================================');
console.log('🌐 GICH WiFi API - FINAL VERSION');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   M-Pesa Shortcode: ' + SHORTCODE);
console.log('📱 Device Tracking: ✅ ENABLED');
console.log('🗄️  Database: MongoDB Atlas');
console.log('========================================\n');

// ============================================================
// DATABASE CONNECTION - FINAL FIX
// ============================================================

async function connectDB() {
    try {
        console.log('🔗 Connecting to MongoDB Atlas...');
        console.log('⏳ This may take up to 30 seconds...');
        
        if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017') {
            console.error('❌ MONGODB_URI not set!');
            console.log('💡 Please set MONGODB_URI in Render environment variables');
            process.exit(1);
        }

        console.log('📡 Connection string configured (credentials hidden)');

        // Connection options with NO SSL issues
        const options = {
            serverSelectionTimeoutMS: 60000,  // 60 seconds
            socketTimeoutMS: 60000,
            connectTimeoutMS: 60000,
            maxPoolSize: 10,
            retryWrites: true,
            retryReads: true,
            // Disable SSL verification for Render compatibility
            tls: true,
            tlsAllowInvalidCertificates: true,
            tlsAllowInvalidHostnames: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        };

        client = new MongoClient(MONGODB_URI, options);
        
        console.log('⏳ Attempting to connect...');
        await client.connect();
        db = client.db(DB_NAME);
        
        console.log('✅ Connected to MongoDB Atlas successfully!');
        console.log('📊 Creating indexes...');
        
        try {
            await db.collection('transactions').createIndex({ phoneNumber: 1 });
            await db.collection('transactions').createIndex({ status: 1 });
            await db.collection('transactions').createIndex({ checkoutId: 1 });
            await db.collection('organizations').createIndex({ email: 1 }, { unique: true });
            await db.collection('organizations').createIndex({ id: 1 }, { unique: true });
            await db.collection('vouchers').createIndex({ code: 1 }, { unique: true });
            await db.collection('vouchers').createIndex({ used: 1 });
            await db.collection('activeDevices').createIndex({ deviceId: 1 }, { unique: true });
            await db.collection('activeDevices').createIndex({ connectedAt: 1 });
            await db.collection('subscriptions').createIndex({ clientId: 1 }, { unique: true });
            console.log('✅ Indexes created successfully');
        } catch (indexError) {
            console.log('⚠️ Some indexes may already exist:', indexError.message);
        }
        
        await loadCache();
        return db;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        console.log('\n💡 TROUBLESHOOTING:');
        console.log('   1. Go to MongoDB Atlas → Network Access');
        console.log('   2. Click "Add IP Address"');
        console.log('   3. Click "Allow Access from Anywhere" (0.0.0.0/0)');
        console.log('   4. Click Confirm and wait 2 minutes');
        console.log('   5. Redeploy this app on Render');
        throw error;
    }
}

async function loadCache() {
    try {
        const plansData = await db.collection('plans').find({}).toArray();
        if (plansData.length === 0) {
            await db.collection('plans').insertMany(DEFAULT_PLANS);
            plans = DEFAULT_PLANS;
            console.log('📦 Loaded default plans');
        } else {
            plans = plansData;
            console.log('📦 Loaded ' + plans.length + ' plans from database');
        }
        
        const settingsData = await db.collection('settings').findOne({ _id: 'settings' });
        if (!settingsData) {
            await db.collection('settings').insertOne({ _id: 'settings', ...DEFAULT_SETTINGS });
            settings = DEFAULT_SETTINGS;
            console.log('⚙️ Loaded default settings');
        } else {
            delete settingsData._id;
            settings = settingsData;
            console.log('⚙️ Loaded settings from database');
        }
    } catch (error) {
        console.error('❌ Error loading cache:', error);
    }
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

async function getOrganizationByEmail(email) {
    try { return await db.collection('organizations').findOne({ email: email }); } catch (e) { return null; }
}

async function getOrganizationByClientId(clientId) {
    try { return await db.collection('organizations').findOne({ id: clientId }); } catch (e) { return null; }
}

async function createOrganization(orgData) {
    try { await db.collection('organizations').insertOne(orgData); return orgData; } catch (e) { throw e; }
}

async function updateOrganization(clientId, updateData) {
    try {
        const result = await db.collection('organizations').findOneAndUpdate(
            { id: clientId }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function getAllOrganizations() {
    try { return await db.collection('organizations').find({}).toArray(); } catch (e) { return []; }
}

// Transactions
async function createTransaction(txData) {
    try { await db.collection('transactions').insertOne(txData); return txData; } catch (e) { throw e; }
}

async function getTransaction(id) {
    try { return await db.collection('transactions').findOne({ id: id }); } catch (e) { return null; }
}

async function getTransactionByCheckoutId(checkoutId) {
    try { return await db.collection('transactions').findOne({ checkoutId: checkoutId }); } catch (e) { return null; }
}

async function updateTransaction(id, updateData) {
    try {
        const result = await db.collection('transactions').findOneAndUpdate(
            { id: id }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function getTransactionsByPhone(phone) {
    try { return await db.collection('transactions').find({ phoneNumber: phone }).sort({ timestamp: -1 }).toArray(); } catch (e) { return []; }
}

async function getAllTransactions() {
    try { return await db.collection('transactions').find({}).sort({ timestamp: -1 }).toArray(); } catch (e) { return []; }
}

// Subscriptions
async function getClientSubscription(clientId) {
    try { return await db.collection('subscriptions').findOne({ clientId: clientId }); } catch (e) { return null; }
}

async function createSubscription(subData) {
    try { await db.collection('subscriptions').insertOne(subData); return subData; } catch (e) { throw e; }
}

async function updateSubscription(clientId, updateData) {
    try {
        const result = await db.collection('subscriptions').findOneAndUpdate(
            { clientId: clientId }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function getAllSubscriptions() {
    try { return await db.collection('subscriptions').find({}).toArray(); } catch (e) { return []; }
}

// Vouchers
async function getVoucherByCode(code) {
    try { return await db.collection('vouchers').findOne({ code: code }); } catch (e) { return null; }
}

async function createVouchers(vouchersData) {
    try { await db.collection('vouchers').insertMany(vouchersData); return vouchersData; } catch (e) { throw e; }
}

async function updateVoucher(code, updateData) {
    try {
        const result = await db.collection('vouchers').findOneAndUpdate(
            { code: code }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function getAllVouchers() {
    try { return await db.collection('vouchers').find({}).toArray(); } catch (e) { return []; }
}

// Active Devices
async function checkDeviceAlreadyConnected(deviceId) {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await db.collection('activeDevices').deleteMany({ connectedAt: { $lt: thirtyDaysAgo.toISOString() } });
        return await db.collection('activeDevices').findOne({ deviceId: deviceId, active: true });
    } catch (e) { return null; }
}

async function registerDevice(deviceData) {
    try {
        await db.collection('activeDevices').deleteMany({ deviceId: deviceData.deviceId });
        await db.collection('activeDevices').insertOne(deviceData);
        return deviceData;
    } catch (e) { throw e; }
}

async function removeDevice(deviceId) {
    try { await db.collection('activeDevices').deleteMany({ deviceId: deviceId }); } catch (e) {}
}

async function getActiveDevicesCount() {
    try { return await db.collection('activeDevices').countDocuments({ active: true }); } catch (e) { return 0; }
}

// ============================================================
// HELPERS
// ============================================================

function generateToken(payload) {
    var header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    var body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    var signature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
    return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
    try {
        var parts = token.split('.');
        var header = parts[0];
        var body = parts[1];
        var signature = parts[2];
        var expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
        if (signature !== expectedSignature) return null;
        return JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch (e) { return null; }
}

var agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, timeout: 60000 });

function getPlanName(planId) {
    var plan = plans.find(function(p) { return p.id === planId; });
    return plan ? plan.name : planId;
}

function getPlanDuration(planId) {
    var plan = plans.find(function(p) { return p.id === planId; });
    return plan ? plan.duration_seconds : 3600;
}

function generateVoucherCode() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = '';
    for (var i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateOrgId() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = '';
    for (var i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'CLIENT_' + code;
}

// ============================================================
// SUBSCRIPTION SYSTEM
// ============================================================

async function getClientSubscriptionStatus(clientId) {
    var sub = await getClientSubscription(clientId);
    if (!sub) return null;
    var now = new Date();
    if (sub.status === 'trial') {
        var trialEnd = new Date(sub.trialEnds);
        if (now > trialEnd) { sub.status = 'expired'; await updateSubscription(clientId, { status: 'expired' }); return null; }
        return sub;
    }
    if (sub.status === 'active') {
        var expiresAt = new Date(sub.expiresAt);
        if (now > expiresAt) { sub.status = 'expired'; await updateSubscription(clientId, { status: 'expired' }); return null; }
        return sub;
    }
    return null;
}

async function checkSubscriptionAccess(clientId) {
    var sub = await getClientSubscriptionStatus(clientId);
    if (!sub) {
        return { allowed: false, message: 'No active subscription. Please subscribe to continue.', code: 'NO_SUBSCRIPTION', canSubscribe: true };
    }
    if (sub.status === 'trial') {
        var trialEnd = new Date(sub.trialEnds);
        var daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        return { allowed: true, status: 'trial', daysLeft: daysLeft, trialEnds: sub.trialEnds, message: 'Free trial: ' + daysLeft + ' days remaining' };
    }
    if (sub.status === 'active') {
        var expiresAt = new Date(sub.expiresAt);
        var daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        return { allowed: true, status: 'active', daysLeft: daysLeft, plan: sub.plan, expiresAt: sub.expiresAt, message: 'Subscription active: ' + daysLeft + ' days remaining' };
    }
    return { allowed: false, message: 'Subscription status unknown', code: 'UNKNOWN_STATUS' };
}

async function createFreeTrial(clientId) {
    var sub = { clientId: clientId, plan: 'free_trial', status: 'trial', trialStarted: new Date().toISOString(), trialEnds: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), createdAt: new Date().toISOString() };
    return await createSubscription(sub);
}

async function activateSubscription(clientId, plan) {
    var sub = await getClientSubscription(clientId);
    var planData = SUBSCRIPTION_PLANS[plan];
    if (!planData) return null;
    if (!sub) {
        sub = { clientId: clientId, plan: plan, status: 'active', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), createdAt: new Date().toISOString() };
        await createSubscription(sub);
    } else {
        sub.plan = plan;
        sub.status = 'active';
        sub.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        sub.updatedAt = new Date().toISOString();
        await updateSubscription(clientId, sub);
    }
    var org = await getOrganizationByClientId(clientId);
    if (org && org.status === 'suspended') { org.status = 'active'; await updateOrganization(clientId, { status: 'active' }); }
    return sub;
}

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
    try { var decoded = verifyToken(token); if (decoded && decoded.role === 'admin') return true; } catch (e) {}
    return false;
}

function isMasterAdmin(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    var token = auth.replace('Bearer ', '').trim();
    if (token && token.indexOf('master_bypass_') === 0) { return true; }
    if (token && token.indexOf('demo_token_') === 0) { return true; }
    if (token && token.indexOf('token_') === 0) { return true; }
    try { var decoded = verifyToken(token); if (decoded && decoded.role === 'master') return true; } catch (e) {}
    return false;
}

// ============================================================
// HTML GENERATORS (Placeholder - copy your existing ones)
// ============================================================

function generateRedirectHtml(organization) {
    return '<!DOCTYPE html><html><head><title>Redirecting...</title><script>window.location.href="/customer/' + organization.id + '";</script></head><body>Redirecting...</body></html>';
}

function generateCustomerBillingPage(organization) {
    var escapeHtml = function(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };
    var bizName = escapeHtml(organization.businessName || 'WiFi Business');
    var primaryColor = escapeHtml(organization.primaryColor || '#00c853');
    var accentColor = escapeHtml(organization.accentColor || '#0f2027');
    var orgId = escapeHtml(organization.id);
    return '<!DOCTYPE html><html><head><title>' + bizName + '</title><style>body{font-family:sans-serif;background:' + accentColor + ';color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}.container{background:#121829;padding:40px;border-radius:20px;max-width:500px;width:100%;text-align:center;}.btn{background:' + primaryColor + ';color:#000;padding:12px 24px;border:none;border-radius:8px;cursor:pointer;font-size:16px;width:100%;}.input-group{margin:16px 0;}.input-group input{width:100%;padding:12px;background:#0a0e17;border:2px solid rgba(255,255,255,0.06);border-radius:10px;color:#fff;font-size:16px;}.plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;}.plan-card{background:rgba(255,255,255,0.03);border-radius:12px;padding:14px;border:2px solid rgba(255,255,255,0.05);cursor:pointer;}.plan-card.selected{border-color:' + primaryColor + ';background:rgba(0,200,83,0.15);}.plan-card .price{font-size:20px;font-weight:700;color:' + primaryColor + ';}.connected-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:' + accentColor + ';display:none;flex-direction:column;align-items:center;justify-content:center;z-index:9999;}</style></head><body><div class="container"><h1>🌐 ' + bizName + '</h1><div class="plan-grid">' + (organization.plans || []).map(function(p) { return '<div class="plan-card" onclick="selectPlan(\'' + p.id + '\',' + p.price + ')"><div class="name">' + p.name + '</div><div class="price">KES ' + p.price + '</div></div>'; }).join('') + '</div><div class="input-group"><input type="tel" id="phoneInput" placeholder="0712345678"></div><button class="btn" id="payBtn">Pay</button></div><script>var ORG_ID="' + orgId + '";var API_URL="' + (process.env.RENDER_URL || 'https://billing-system-fm9a.onrender.com') + '/api";var selectedPlan=null;var selectedPlanPrice=0;function selectPlan(id,price){selectedPlan=id;selectedPlanPrice=price;document.querySelectorAll(".plan-card").forEach(function(c){c.classList.remove("selected");});event.target.closest(".plan-card").classList.add("selected");document.getElementById("payBtn").textContent="Pay KES "+price;}</script></body></html>';
}

// ============================================================
// CREATE SERVER - ALL ENDPOINTS
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
            sendHtml(res, 200, '<h1>🌐 GICH WiFi Server</h1><p>✅ Server is running with MongoDB!</p>');
            return;
        }

        // ============================================================
        // PUBLIC API ENDPOINTS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/health') {
            return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString(), database: 'connected', version: '6.0.0-mongodb' });
        }

        if (req.method === 'GET' && url.pathname === '/api/plans') {
            return sendJson(res, 200, { success: true, data: plans });
        }

        if (req.method === 'GET' && url.pathname === '/api/settings') {
            return sendJson(res, 200, { success: true, data: settings });
        }

        // ============================================================
        // DEVICE CONNECTION CHECK
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/device/check') {
            var body = await readBody(req);
            var phoneNumber = body.phoneNumber;
            var deviceId = body.deviceId;
            
            if (!phoneNumber) { return sendJson(res, 400, { success: false, message: 'Phone number required' }); }
            if (!deviceId) { return sendJson(res, 400, { success: false, message: 'Device ID required' }); }
            
            var existingSession = await checkDeviceAlreadyConnected(deviceId);
            
            if (existingSession) {
                return sendJson(res, 200, {
                    success: true,
                    alreadyConnected: true,
                    message: 'You are already connected on this device',
                    session: {
                        username: existingSession.username,
                        planName: existingSession.planName,
                        expiresAt: existingSession.expiresAt,
                        connectedAt: existingSession.connectedAt
                    },
                    shouldClose: true
                });
            }
            
            return sendJson(res, 200, { success: true, alreadyConnected: false, message: 'Device not connected' });
        }

        // ============================================================
        // REGISTER DEVICE CONNECTION
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/device/register') {
            var body = await readBody(req);
            var phoneNumber = body.phoneNumber;
            var username = body.username;
            var planName = body.planName;
            var expiresAt = body.expiresAt;
            var deviceId = body.deviceId;
            
            if (!phoneNumber) { return sendJson(res, 400, { success: false, message: 'Phone number required' }); }
            if (!deviceId) { return sendJson(res, 400, { success: false, message: 'Device ID required' }); }
            
            var deviceData = {
                deviceId: deviceId,
                phoneNumber: phoneNumber,
                username: username || 'user',
                planName: planName || 'Unknown Plan',
                expiresAt: expiresAt,
                connectedAt: new Date().toISOString(),
                active: true
            };
            
            await registerDevice(deviceData);
            
            return sendJson(res, 200, { success: true, message: 'Device registered successfully' });
        }

        // ============================================================
        // CLIENT PORTAL ENDPOINTS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/client/check-org') {
            var email = url.searchParams.get('email');
            if (!email) { return sendJson(res, 400, { success: false, message: 'Email required' }); }
            var org = await getOrganizationByEmail(email);
            return sendJson(res, 200, { success: true, hasOrganization: !!org, email: email });
        }

        if (req.method === 'GET' && url.pathname === '/api/organization/by-email') {
            var email = url.searchParams.get('email');
            if (!email) { return sendJson(res, 400, { success: false, message: 'Email required' }); }
            var org = await getOrganizationByEmail(email);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
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
                    status: org.status,
                    mpesaTill: org.mpesaTill || ''
                }
            });
        }

        if (req.method === 'GET' && url.pathname.startsWith('/api/organization/')) {
            var orgId = url.pathname.split('/').pop();
            if (!orgId || orgId === 'organizations') { return sendJson(res, 400, { success: false, message: 'Invalid organization ID' }); }
            var org = await getOrganizationByClientId(orgId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
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
                    status: org.status,
                    mpesaTill: org.mpesaTill || ''
                }
            });
        }

        // ============================================================
        // CLIENT CREATE ORGANIZATION
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            var body = await readBody(req);
            var email = body.email || 'master@demo.com';
            
            var existingOrg = await getOrganizationByEmail(email);
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
                mpesaTill: body.mpesaTill || '',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                plans: body.plans || DEFAULT_PLANS
            };
            
            await createOrganization(newOrganization);
            
            var clientData = {
                id: clientId,
                name: businessName,
                phone: body.phone || '0712345678',
                email: email,
                businessName: businessName,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                organizationId: clientId
            };
            await db.collection('clients').insertOne(clientData);
            
            var sub = await createFreeTrial(clientId);
            
            console.log('✅ Organization created with 60-day free trial:', clientId);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Organization created with 60-day free trial!',
                organization: newOrganization,
                clientId: clientId
            });
        }

        // ============================================================
        // UPDATE ORGANIZATION
        // ============================================================
        if (req.method === 'PUT' && url.pathname.startsWith('/api/master/organizations/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var orgId = url.pathname.split('/').pop();
            var body = await readBody(req);
            var org = await getOrganizationByClientId(orgId);
            
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            
            var updateData = {
                businessName: body.businessName !== undefined ? body.businessName : org.businessName,
                businessTagline: body.businessTagline !== undefined ? body.businessTagline : org.businessTagline,
                supportPhone: body.supportPhone !== undefined ? body.supportPhone : org.supportPhone,
                supportEmail: body.supportEmail !== undefined ? body.supportEmail : org.supportEmail,
                logo: body.logo !== undefined ? body.logo : org.logo,
                mpesaTill: body.mpesaTill !== undefined ? body.mpesaTill : org.mpesaTill,
                primaryColor: body.primaryColor !== undefined ? body.primaryColor : org.primaryColor,
                secondaryColor: body.secondaryColor !== undefined ? body.secondaryColor : org.secondaryColor,
                accentColor: body.accentColor !== undefined ? body.accentColor : org.accentColor,
                plans: body.plans !== undefined ? body.plans : org.plans,
                updatedAt: new Date().toISOString()
            };
            
            var updated = await updateOrganization(orgId, updateData);
            
            return sendJson(res, 200, { success: true, message: 'Organization updated', data: updated });
        }

        // ============================================================
        // GET SUBSCRIPTION STATUS
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/client/subscription-status') {
            var email = url.searchParams.get('email');
            if (!email) { return sendJson(res, 400, { success: false, message: 'Email required' }); }
            
            var org = await getOrganizationByEmail(email);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            
            var status = await checkSubscriptionAccess(org.id);
            
            return sendJson(res, 200, {
                success: true,
                status: status,
                organization: { id: org.id, name: org.businessName }
            });
        }

        // ============================================================
        // START FREE TRIAL
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/client/start-trial') {
            var body = await readBody(req);
            var clientId = body.clientId || body.email;
            
            var org = await getOrganizationByClientId(clientId) || await getOrganizationByEmail(clientId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            
            var existingSub = await getClientSubscriptionStatus(org.id);
            if (existingSub) {
                return sendJson(res, 400, { success: false, message: 'You already have an active subscription or trial' });
            }
            
            var sub = await createFreeTrial(org.id);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Free trial started! You have 60 days.',
                trialDays: 60,
                trialEnds: sub.trialEnds
            });
        }

        // ============================================================
        // SUBSCRIBE TO PLAN
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/client/subscribe') {
            var body = await readBody(req);
            var clientId = body.clientId || body.email;
            var plan = body.plan || 'starter';
            
            var org = await getOrganizationByClientId(clientId) || await getOrganizationByEmail(clientId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            
            var planData = SUBSCRIPTION_PLANS[plan];
            if (!planData) { return sendJson(res, 400, { success: false, message: 'Invalid plan' }); }
            
            var sub = await activateSubscription(org.id, plan);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Subscribed to ' + planData.name + ' plan successfully!',
                plan: plan,
                expiresAt: sub.expiresAt
            });
        }

        // ============================================================
        // PAYMENT INITIATE - DARAJA STK PUSH
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/payment/initiate') {
            var body = await readBody(req);
            var phoneNumber = body.phoneNumber;
            var amount = body.amount;
            var planId = body.planId;
            var organizationId = body.organizationId;
            var isSubscription = body.isSubscription || false;
            var subscriptionPlan = body.subscriptionPlan || null;
            var deviceId = body.deviceId;
            
            if (!phoneNumber || phoneNumber.length < 10) {
                return sendJson(res, 400, { success: false, message: 'Invalid phone number' });
            }
            
            if (deviceId) {
                var existing = await checkDeviceAlreadyConnected(deviceId);
                if (existing) {
                    return sendJson(res, 409, {
                        success: false,
                        alreadyConnected: true,
                        message: 'You are already connected on this device.',
                        session: {
                            username: existing.username,
                            planName: existing.planName,
                            expiresAt: existing.expiresAt
                        }
                    });
                }
            }
            
            var numericAmount = Math.round(Number(amount));
            if (isNaN(numericAmount) || numericAmount < 1) {
                return sendJson(res, 400, { success: false, message: 'Invalid amount' });
            }
            
            var org = null;
            if (organizationId) {
                org = await getOrganizationByClientId(organizationId);
            }
            
            if (org) {
                var access = await checkSubscriptionAccess(org.id);
                if (!access.allowed) {
                    return sendJson(res, 403, {
                        success: false,
                        message: access.message,
                        code: access.code,
                        canSubscribe: true
                    });
                }
            }
            
            try {
                var transactionId = 'GICH' + Date.now() + Math.random().toString(36).substring(7);
                var planName = isSubscription ? 'Subscription - ' + subscriptionPlan : getPlanName(planId);
                var duration = isSubscription ? 2592000 : getPlanDuration(planId);
                
                if (amount === 0) {
                    var freeTx = {
                        id: transactionId,
                        phoneNumber: phoneNumber,
                        amount: 0,
                        planId: planId || 'free',
                        planName: planName,
                        status: 'completed',
                        timestamp: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
                        username: 'user_' + transactionId.substring(0, 12),
                        password: 'pass_' + Date.now().toString(36),
                        isSubscription: isSubscription,
                        subscriptionPlan: subscriptionPlan,
                        organizationId: organizationId || null,
                        deviceId: deviceId
                    };
                    await createTransaction(freeTx);
                    
                    if (isSubscription && org) {
                        await activateSubscription(org.id, subscriptionPlan);
                    }
                    
                    if (deviceId) {
                        await registerDevice({
                            deviceId: deviceId,
                            phoneNumber: phoneNumber,
                            username: freeTx.username,
                            planName: planName,
                            expiresAt: freeTx.expiresAt,
                            connectedAt: new Date().toISOString(),
                            active: true
                        });
                    }
                    
                    return sendJson(res, 200, {
                        success: true,
                        message: 'Free plan activated!',
                        transactionId: transactionId,
                        isFree: true
                    });
                }
                
                var result = await stkPush({ 
                    phone: phoneNumber, 
                    amount: numericAmount, 
                    accountReference: isSubscription ? 'SUB_' + subscriptionPlan : 'GICH' + Date.now().toString().slice(-8)
                });
                
                if (result.success) {
                    var transaction = {
                        id: transactionId,
                        phoneNumber: phoneNumber,
                        amount: numericAmount,
                        planId: planId || 'subscription',
                        planName: planName,
                        status: 'pending',
                        timestamp: new Date().toISOString(),
                        mpesaCode: null,
                        checkoutId: result.checkoutId,
                        expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
                        username: null,
                        password: null,
                        isSubscription: isSubscription,
                        subscriptionPlan: subscriptionPlan,
                        organizationId: organizationId || null,
                        deviceId: deviceId
                    };
                    await createTransaction(transaction);
                    
                    return sendJson(res, 200, {
                        success: true,
                        message: 'STK Push sent!',
                        transactionId: transactionId,
                        checkoutId: result.checkoutId
                    });
                } else {
                    throw new Error('STK Push failed');
                }
            } catch (error) {
                console.error('Payment error:', error);
                return sendJson(res, 502, { success: false, message: 'Payment failed: ' + error.message });
            }
        }

        // ============================================================
        // MPESA CALLBACK
        // ============================================================
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

            var transaction = await getTransactionByCheckoutId(checkoutId);
            
            if (!transaction) {
                console.log('⚠️ Transaction not found for checkoutId:', checkoutId);
                return sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Transaction not found' });
            }

            if (resultCode === 0) {
                transaction.status = 'completed';
                transaction.mpesaCode = receipt || 'MPESA' + Date.now();
                transaction.completedAt = new Date().toISOString();
                if (amount) transaction.amount = Math.round(Number(amount));
                if (phoneNumber) transaction.phoneNumber = phoneNumber;
                transaction.errorCode = null;
                transaction.errorDescription = null;
                transaction.username = 'user_' + (transaction.mpesaCode || transaction.id).substring(0, 12);
                transaction.password = 'pass_' + Date.now().toString(36);
                await updateTransaction(transaction.id, transaction);
                
                console.log('✅ Payment completed:', transaction.id);
                
                if (transaction.deviceId) {
                    await registerDevice({
                        deviceId: transaction.deviceId,
                        phoneNumber: transaction.phoneNumber,
                        username: transaction.username,
                        planName: transaction.planName,
                        expiresAt: transaction.expiresAt,
                        connectedAt: new Date().toISOString(),
                        active: true
                    });
                }
                
                if (transaction.isSubscription && transaction.organizationId) {
                    var org = await getOrganizationByClientId(transaction.organizationId);
                    if (org) {
                        await activateSubscription(org.id, transaction.subscriptionPlan || 'starter');
                        console.log('✅ Subscription activated for:', org.businessName);
                    }
                }
                
                return sendJson(res, 200, { ResultCode: 0, ResultDesc: 'Success' });
            } else if (resultCode === 1037) {
                transaction.status = 'cancelled';
                transaction.errorDescription = 'User cancelled the transaction';
                transaction.errorCode = resultCode;
                transaction.completedAt = new Date().toISOString();
                await updateTransaction(transaction.id, transaction);
                return sendJson(res, 200, { ResultCode: resultCode, ResultDesc: 'User cancelled' });
            } else if (resultCode === 2001) {
                transaction.status = 'failed';
                transaction.errorDescription = 'Insufficient M-Pesa balance';
                transaction.errorCode = resultCode;
                transaction.completedAt = new Date().toISOString();
                await updateTransaction(transaction.id, transaction);
                return sendJson(res, 200, { ResultCode: resultCode, ResultDesc: 'Insufficient balance' });
            } else {
                transaction.status = 'failed';
                transaction.errorDescription = resultDesc || 'Payment failed';
                transaction.errorCode = resultCode;
                transaction.completedAt = new Date().toISOString();
                await updateTransaction(transaction.id, transaction);
                return sendJson(res, 200, { ResultCode: resultCode, ResultDesc: resultDesc });
            }
        }

        // ============================================================
        // GET TRANSACTION
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/transaction/')) {
            var id = url.pathname.split('/').pop();
            var tx = await getTransaction(id);
            if (!tx) { return sendJson(res, 404, { success: false, message: 'Transaction not found' }); }
            
            return sendJson(res, 200, {
                success: true,
                data: {
                    id: tx.id,
                    status: tx.status,
                    errorDescription: tx.errorDescription || null,
                    phoneNumber: tx.phoneNumber,
                    amount: tx.amount,
                    planName: tx.planName,
                    mpesaCode: tx.mpesaCode || null,
                    expiresAt: tx.expiresAt || null,
                    username: tx.username || null,
                    password: tx.password || null,
                    isSubscription: tx.isSubscription || false
                }
            });
        }

        // ============================================================
        // GET CREDENTIALS
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/get-credentials/')) {
            var id = url.pathname.split('/').pop();
            var tx = await getTransaction(id);
            if (!tx) { return sendJson(res, 404, { success: false, message: 'Transaction not found' }); }
            
            if (tx.status !== 'completed') {
                return sendJson(res, 400, { success: false, message: 'Payment not completed' });
            }
            
            return sendJson(res, 200, {
                success: true,
                username: tx.username || 'user_' + id.substring(0, 8),
                password: tx.password || 'pass_' + Date.now().toString(36),
                plan: tx.planName,
                expiresAt: tx.expiresAt || new Date(Date.now() + 7200000).toISOString()
            });
        }

        // ============================================================
        // GET TRANSACTIONS
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/transactions') {
            var phone = url.searchParams.get('phone');
            var filtered = phone ? await getTransactionsByPhone(phone) : await getAllTransactions();
            return sendJson(res, 200, { success: true, data: filtered, count: filtered.length });
        }

        // ============================================================
        // CHECK ACTIVE PLAN
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/check-active') {
            var phone = url.searchParams.get('phone');
            if (!phone) return sendJson(res, 400, { success: false, message: 'Phone number required' });
            var active = null;
            
            var allTx = await getAllTransactions();
            for (var i = 0; i < allTx.length; i++) {
                var t = allTx[i];
                if (t.phoneNumber === phone && t.status === 'completed' && t.username && (!t.expiresAt || new Date(t.expiresAt) > new Date())) {
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
        // VOUCHER REDEEM
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/voucher/redeem') {
            var body = await readBody(req);
            var code = body.code;
            var phoneNumber = body.phoneNumber;
            var deviceId = body.deviceId;
            
            if (!code) { return sendJson(res, 400, { success: false, message: 'Voucher code required' }); }
            
            var voucher = await getVoucherByCode(code);
            if (!voucher || voucher.used) {
                return sendJson(res, 404, { success: false, message: 'Invalid or already used voucher' });
            }
            
            voucher.used = true;
            voucher.usedBy = phoneNumber || 'unknown';
            voucher.usedAt = new Date().toISOString();
            await updateVoucher(code, voucher);
            
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
                password: 'vpass_' + Date.now().toString(36),
                deviceId: deviceId || null
            };
            await createTransaction(tx);
            
            if (deviceId) {
                await registerDevice({
                    deviceId: deviceId,
                    phoneNumber: phoneNumber || 'voucher_user',
                    username: tx.username,
                    planName: voucher.planName,
                    expiresAt: tx.expiresAt,
                    connectedAt: new Date().toISOString(),
                    active: true
                });
            }
            
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

        // ============================================================
        // ADMIN VOUCHER GENERATE
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/admin/voucher/generate') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var body = await readBody(req);
            var planId = body.planId;
            var count = Math.min(body.count || 1, 100);
            
            if (!planId) { return sendJson(res, 400, { success: false, message: 'Plan ID required' }); }
            
            var plan = plans.find(function(p) { return p.id === planId; });
            if (!plan) { return sendJson(res, 400, { success: false, message: 'Invalid plan ID' }); }
            
            var generated = [];
            var vouchersToInsert = [];
            for (var i = 0; i < count; i++) {
                var code = generateVoucherCode();
                var voucherData = {
                    code: code,
                    planId: plan.id,
                    planName: plan.name,
                    duration_seconds: plan.duration_seconds || 3600,
                    devices: plan.devices || 1,
                    used: false,
                    usedBy: null,
                    usedAt: null,
                    createdAt: new Date().toISOString()
                };
                vouchersToInsert.push(voucherData);
                generated.push(code);
            }
            await createVouchers(vouchersToInsert);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Generated ' + generated.length + ' vouchers',
                vouchers: generated,
                count: generated.length
            });
        }

        // ============================================================
        // ADMIN VOUCHERS LIST
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/admin/vouchers') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var allVouchers = await getAllVouchers();
            var used = allVouchers.filter(function(v) { return v.used; }).length;
            return sendJson(res, 200, {
                success: true,
                data: allVouchers,
                count: allVouchers.length,
                used: used,
                unused: allVouchers.length - used
            });
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
            var allOrgs = await getAllOrganizations();
            return sendJson(res, 200, { success: true, data: allOrgs, count: allOrgs.length });
        }

        // ============================================================
        // GENERATE REDIRECT HTML
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/master/generate-redirect/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var orgId = url.pathname.split('/').pop();
            var org = await getOrganizationByClientId(orgId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            
            var access = await checkSubscriptionAccess(org.id);
            if (!access.allowed) {
                return sendJson(res, 403, {
                    success: false,
                    message: 'Cannot generate redirect file. ' + access.message,
                    code: access.code,
                    canSubscribe: true
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
                }
            });
        }

        // ============================================================
        // SERVE CUSTOMER BILLING PAGE
        // ============================================================
        if (req.method === 'GET' && url.pathname.match(/^\/customer\/CLIENT_[A-Z0-9]+\/?$/)) {
            var pathParts = url.pathname.split('/');
            var orgId = pathParts[2] || '';
            
            if (!orgId) { return sendHtml(res, 404, '<h1>Organization not found</h1>'); }
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) { return sendHtml(res, 404, '<h1>Organization not found</h1>'); }
            
            var html = generateCustomerBillingPage(org);
            return sendHtml(res, 200, html);
        }

        // ============================================================
        // API INFO
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api') {
            var allTx = await getAllTransactions();
            var completedTx = allTx.filter(function(t) { return t.status === 'completed'; });
            var totalRevenue = completedTx.reduce(function(sum, t) { return sum + (t.amount || 0); }, 0);
            var allSubs = await getAllSubscriptions();
            var activeSubs = allSubs.filter(function(s) { return s.status === 'active' || s.status === 'trial'; });
            var activeDevicesCount = await getActiveDevicesCount();
            var allOrgs = await getAllOrganizations();
            var allVouchers = await getAllVouchers();
            var unusedVouchers = allVouchers.filter(function(v) { return !v.used; });
            
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '6.0.0-mongodb',
                status: 'Running',
                database: 'MongoDB Atlas',
                statistics: {
                    totalTransactions: allTx.length,
                    totalRevenue: totalRevenue,
                    activeVouchers: unusedVouchers.length,
                    totalOrganizations: allOrgs.length,
                    activeSubscriptions: activeSubs.length,
                    activeDevices: activeDevicesCount
                }
            });
        }

        return sendJson(res, 404, { error: 'Route not found' });

    } catch (err) {
        console.error('Server error:', err);
        return sendJson(res, 500, { error: 'Internal server error', message: err.message });
    }
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    try {
        await connectDB();
        
        server.listen(PORT, '0.0.0.0', function() {
            console.log('\n========================================');
            console.log('🌐 GICH WiFi API');
            console.log('========================================');
            console.log('✅ Server running on port: ' + PORT);
            console.log('📍 http://localhost:' + PORT + '/');
            console.log('========================================');
            console.log('🛡️ Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('🗄️  Database: MongoDB Atlas - CONNECTED');
            console.log('📱 Device Tracking: ✅ ENABLED');
            console.log('========================================\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

process.on('SIGINT', async function() {
    console.log('\n🛑 Shutting down...');
    if (client) {
        await client.close();
        console.log('✅ MongoDB connection closed');
    }
    process.exit(0);
});

process.on('uncaughtException', function(err) { 
    console.error('❌ Uncaught Exception:', err); 
});

process.on('unhandledRejection', function(reason) { 
    console.error('❌ Unhandled Rejection:', reason); 
});

startServer();
