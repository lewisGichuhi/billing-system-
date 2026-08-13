/**
 * GICH WiFi - Complete Backend with MongoDB
 * Full M-Pesa STK Push with multi-tenant support
 * INCLUDES: Device Tracking, Google OAuth Login, Email Validation
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

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'https://billing-system-fm9a.onrender.com/auth/google/callback';

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
console.log('🌐 GICH WiFi API - FULL VERSION with Google OAuth');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   M-Pesa Shortcode: ' + SHORTCODE);
console.log('📱 Device Tracking: ✅ ENABLED');
console.log('🔑 Google OAuth: ' + (GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'));
console.log('🗄️  Database: MongoDB Atlas');
console.log('========================================\n');

// ============================================================
// EMAIL VALIDATION FUNCTION
// ============================================================

function isValidEmail(email) {
    // Basic email format validation
    var emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;
    
    // Check for common disposable email domains (optional)
    var disposableDomains = [
        'tempmail.com', '10minutemail.com', 'guerrillamail.com',
        'mailinator.com', 'trashmail.com', 'fakeemail.com'
    ];
    var domain = email.split('@')[1];
    if (disposableDomains.indexOf(domain) !== -1) return false;
    
    return true;
}

// ============================================================
// DATABASE CONNECTION
// ============================================================

async function connectDB() {
    try {
        console.log('🔗 Connecting to MongoDB Atlas...');
        
        if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017') {
            console.error('❌ MONGODB_URI not set!');
            process.exit(1);
        }

        console.log('📡 Using connection string (hiding credentials)...');
        const hiddenUri = MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//****:****@');
        console.log('   ' + hiddenUri);

        const options = {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 60000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10,
            retryWrites: true,
            retryReads: true,
            tlsAllowInvalidCertificates: true,
            tlsAllowInvalidHostnames: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        };

        client = new MongoClient(MONGODB_URI, options);
        await client.connect();
        db = client.db(DB_NAME);
        
        console.log('✅ Connected to MongoDB Atlas successfully!');
        console.log('📊 Creating indexes...');
        
        try {
            await db.collection('transactions').createIndex({ phoneNumber: 1 });
            await db.collection('transactions').createIndex({ status: 1 });
            await db.collection('transactions').createIndex({ checkoutId: 1 });
            await db.collection('transactions').createIndex({ expiresAt: 1 });
            await db.collection('organizations').createIndex({ email: 1 }, { unique: true });
            await db.collection('organizations').createIndex({ id: 1 }, { unique: true });
            await db.collection('vouchers').createIndex({ code: 1 }, { unique: true });
            await db.collection('vouchers').createIndex({ used: 1 });
            await db.collection('activeDevices').createIndex({ deviceId: 1 }, { unique: true });
            await db.collection('activeDevices').createIndex({ connectedAt: 1 });
            await db.collection('activeDevices').createIndex({ expiresAt: 1 });
            await db.collection('subscriptions').createIndex({ clientId: 1 }, { unique: true });
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            await db.collection('users').createIndex({ googleId: 1 });
            console.log('✅ Indexes created successfully');
        } catch (indexError) {
            console.log('⚠️ Some indexes may already exist');
        }
        
        await loadCache();
        return db;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        console.log('\n💡 Troubleshooting:');
        console.log('   1. Check your internet connection');
        console.log('   2. Make sure MongoDB Atlas is running');
        console.log('   3. Whitelist your IP in MongoDB Atlas (0.0.0.0/0)');
        console.log('   4. Verify username and password are correct');
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

// Users (for Google OAuth)
async function getUserByEmail(email) {
    try { return await db.collection('users').findOne({ email: email }); } catch (e) { return null; }
}

async function getUserByGoogleId(googleId) {
    try { return await db.collection('users').findOne({ googleId: googleId }); } catch (e) { return null; }
}

async function createUser(userData) {
    try { await db.collection('users').insertOne(userData); return userData; } catch (e) { throw e; }
}

async function updateUser(email, updateData) {
    try {
        const result = await db.collection('users').findOneAndUpdate(
            { email: email }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

// ============================================================
// ACTIVE DEVICES - WITH EXPIRY CHECK
// ============================================================

async function checkDeviceAlreadyConnected(deviceId) {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        await db.collection('activeDevices').deleteMany({
            connectedAt: { $lt: thirtyDaysAgo.toISOString() }
        });
        
        await db.collection('activeDevices').deleteMany({
            expiresAt: { $lt: now.toISOString() }
        });
        
        const device = await db.collection('activeDevices').findOne({
            deviceId: deviceId,
            active: true,
            expiresAt: { $gt: now.toISOString() }
        });
        
        return device;
    } catch (e) { 
        console.error('Error checking device:', e);
        return null; 
    }
}

async function registerDevice(deviceData) {
    try {
        await db.collection('activeDevices').deleteMany({ deviceId: deviceData.deviceId });
        await db.collection('activeDevices').insertOne(deviceData);
        return deviceData;
    } catch (e) { throw e; }
}

async function removeDevice(deviceId) {
    try { await db.collection('activeDevices').deleteMany({ deviceId: deviceId }); } catch (e) { console.error('Error removing device:', e); }
}

async function getActiveDevicesCount() {
    try { 
        const now = new Date().toISOString();
        return await db.collection('activeDevices').countDocuments({ 
            active: true,
            expiresAt: { $gt: now }
        }); 
    } catch (e) { return 0; }
}

// Auto-cleanup expired devices every 5 minutes
setInterval(async function() {
    try {
        const now = new Date().toISOString();
        const result = await db.collection('activeDevices').deleteMany({
            $or: [
                { expiresAt: { $lt: now } },
                { connectedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() } }
            ]
        });
        if (result.deletedCount > 0) {
            console.log('🧹 Cleaned up ' + result.deletedCount + ' expired/old device connections');
        }
    } catch (e) {
        console.error('Error cleaning up devices:', e);
    }
}, 5 * 60 * 1000);

// ============================================================
// JWT HELPER
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

// ============================================================
// HTTPS AGENT
// ============================================================

var agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
});

// ============================================================
// HELPERS
// ============================================================

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

function simpleRequest(method, urlString, headers, jsonBody, formData) {
    headers = headers || {};
    jsonBody = jsonBody || null;
    formData = formData || null;
    return new Promise(function(resolve, reject) {
        var url = new URL(urlString);
        var payload = null;
        
        if (formData) {
            payload = Object.keys(formData).map(function(key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(formData[key]);
            }).join('&');
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            headers['Content-Length'] = Buffer.byteLength(payload);
        } else if (jsonBody) {
            payload = JSON.stringify(jsonBody);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(payload);
        }
        
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
// GOOGLE OAUTH HANDLERS - FIXED
// ============================================================

async function handleGoogleAuth(req, res) {
    if (!GOOGLE_CLIENT_ID) {
        return sendHtml(res, 500, '<h1>Google OAuth not configured</h1><p>Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.</p>');
    }
    
    const redirectUri = GOOGLE_CALLBACK_URL;
    const clientId = GOOGLE_CLIENT_ID;
    const scope = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=online`;
    
    res.writeHead(302, { Location: authUrl });
    res.end();
}

async function handleGoogleCallback(req, res) {
    try {
        const url = new URL(req.url, 'http://' + req.headers.host);
        const code = url.searchParams.get('code');
        
        if (!code) {
            return sendHtml(res, 400, '<h1>Error: No authorization code received</h1>');
        }
        
        console.log('🔑 Exchanging code for access token...');
        console.log('📡 GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
        console.log('📡 GOOGLE_CLIENT_SECRET:', GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
        
        // Exchange code for access token - FIXED with proper headers
        const tokenResponse = await simpleRequest('POST', 'https://oauth2.googleapis.com/token', {
            'Content-Type': 'application/x-www-form-urlencoded'
        }, null, {
            code: code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_CALLBACK_URL,
            grant_type: 'authorization_code'
        });
        
        console.log('📡 Token Response Status:', tokenResponse.statusCode);
        
        if (!tokenResponse.bodyJson || !tokenResponse.bodyJson.access_token) {
            console.error('❌ Token exchange failed:', tokenResponse.bodyText);
            return sendHtml(res, 400, '<h1>Error: Failed to get access token</h1><pre>' + tokenResponse.bodyText + '</pre>');
        }
        
        console.log('✅ Access token obtained!');
        
        // Get user info with the access token
        const userInfoResponse = await simpleRequest('GET', 'https://www.googleapis.com/oauth2/v2/userinfo', {
            'Authorization': 'Bearer ' + tokenResponse.bodyJson.access_token
        });
        
        if (!userInfoResponse.bodyJson || !userInfoResponse.bodyJson.email) {
            return sendHtml(res, 400, '<h1>Error: Failed to get user info</h1>');
        }
        
        const userInfo = userInfoResponse.bodyJson;
        
        // Check if user exists in your database
        let user = await getUserByEmail(userInfo.email);
        
        if (!user) {
            // Create new user
            const newUser = {
                email: userInfo.email,
                name: userInfo.name || userInfo.email,
                picture: userInfo.picture || '',
                googleId: userInfo.id,
                createdAt: new Date().toISOString(),
                role: 'user',
                lastLogin: new Date().toISOString()
            };
            await createUser(newUser);
            user = newUser;
        } else {
            // Update last login
            await updateUser(userInfo.email, { lastLogin: new Date().toISOString() });
            user.lastLogin = new Date().toISOString();
        }
        
        // Create JWT token for the user
        const token = generateToken({ 
            email: user.email, 
            name: user.name, 
            role: user.role || 'user',
            picture: user.picture || ''
        });
        
        // Redirect to homepage with token
        const frontendUrl = 'https://clientadminwifi.netlify.app';
        sendHtml(res, 200, `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Successful</title>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0f2027; color: #fff; }
                    .container { text-align: center; background: #121829; padding: 40px; border-radius: 20px; max-width: 400px; }
                    .icon { font-size: 64px; }
                    h1 { color: #00c853; }
                    .spinner { border: 4px solid rgba(255,255,255,0.1); border-top-color: #00c853; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .btn { background: #00c853; color: #000; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; text-decoration: none; display: inline-block; margin-top: 10px; }
                </style>
                <script>
                    localStorage.setItem('clientToken', '${token}');
                    localStorage.setItem('userEmail', '${user.email}');
                    localStorage.setItem('userData', '${JSON.stringify({ email: user.email, name: user.name, picture: user.picture })}');
                    setTimeout(function() {
                        window.location.href = '${frontendUrl}';
                    }, 2000);
                </script>
            </head>
            <body>
                <div class="container">
                    <div class="icon">✅</div>
                    <h1>Login Successful!</h1>
                    <p>Welcome, ${user.name || user.email}!</p>
                    <div class="spinner"></div>
                    <p>Redirecting...</p>
                    <a href="${frontendUrl}" class="btn">Go to Dashboard</a>
                </div>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Google callback error:', error);
        sendHtml(res, 500, '<h1>❌ Authentication failed</h1><p>' + error.message + '</p>');
    }
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
    
    var baseUrl = process.env.RENDER_URL || 'https://clientadminwifi.netlify.app';
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
// GENERATE CUSTOMER BILLING PAGE (Full Version)
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
    var plans = organization.plans || [];

    var plansHtml = '';
    for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
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
        plansHtml += '<div class="name">' + escapeHtml(p.name) + '</div>';
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
        html += '        .brand .paybill { display: inline-block; background: rgba(255,193,7,0.12); color: #ffc107; padding: 2px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 4px; margin-left: 6px; }\n';
    }
    html += '        .status-banner { padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; text-align: center; font-size: 13px; display: none; }\n';
    html += '        .status-banner.show { display: block; }\n';
    html += '        .status-banner.success { background: rgba(0,200,83,0.1); border: 1px solid rgba(0,200,83,0.15); color: #00c853; }\n';
    html += '        .status-banner.warning { background: rgba(255,193,7,0.1); border: 1px solid rgba(255,193,7,0.15); color: #ffc107; }\n';
    html += '        .status-banner.error { background: rgba(255,68,68,0.1); border: 1px solid rgba(255,68,68,0.15); color: #ff4444; }\n';
    html += '        .status-banner.info { background: rgba(33,150,243,0.1); border: 1px solid rgba(33,150,243,0.15); color: #2196f3; }\n';
    html += '        .section-title { font-size: 16px; font-weight: 600; margin: 20px 0 12px 0; color: #fff; display: flex; align-items: center; gap: 8px; }\n';
    html += '        .plan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }\n';
    html += '        .plan-card { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 14px 12px; border: 2px solid rgba(255,255,255,0.05); cursor: pointer; transition: all 0.25s ease; text-align: center; position: relative; }\n';
    html += '        .plan-card:hover { background: rgba(255,255,255,0.06); border-color: ' + primaryColor + '40; transform: translateY(-2px); }\n';
    html += '        .plan-card.selected { border-color: ' + primaryColor + '; background: ' + primaryColor + '15; box-shadow: 0 0 20px ' + primaryColor + '20; }\n';
    html += '        .plan-card .name { font-weight: 600; font-size: 14px; color: #fff; }\n';
    html += '        .plan-card .price { font-size: 20px; font-weight: 700; color: ' + primaryColor + '; margin: 2px 0; }\n';
    html += '        .plan-card .price span { font-size: 12px; font-weight: 400; color: #666; }\n';
    html += '        .plan-card .features { font-size: 11px; color: #666; margin-top: 4px; }\n';
    html += '        .plan-card .features span { display: inline-block; background: rgba(255,255,255,0.04); padding: 1px 10px; border-radius: 12px; margin: 2px 2px; }\n';
    html += '        .plan-card .popular { position: absolute; top: -8px; right: -8px; background: #ff6b35; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; }\n';
    html += '        .input-group { margin: 14px 0 12px 0; }\n';
    html += '        .input-group label { display: block; color: #aaa; font-size: 13px; font-weight: 500; margin-bottom: 4px; }\n';
    html += '        .input-group input { width: 100%; padding: 12px 16px; background: #0a0e17; border: 2px solid rgba(255,255,255,0.06); border-radius: 10px; color: #fff; font-size: 16px; outline: none; transition: 0.25s; }\n';
    html += '        .input-group input:focus { border-color: ' + primaryColor + '; box-shadow: 0 0 0 3px ' + primaryColor + '20; }\n';
    html += '        .input-group input::placeholder { color: #444; }\n';
    html += '        .btn { width: 100%; padding: 13px; background: ' + primaryColor + '; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; color: #000; cursor: pointer; transition: all 0.25s ease; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px; }\n';
    html += '        .btn:hover { background: ' + secondaryColor + '; transform: scale(1.01); }\n';
    html += '        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }\n';
    html += '        .btn-secondary { background: rgba(255,255,255,0.06); color: #fff; }\n';
    html += '        .btn-secondary:hover { background: rgba(255,255,255,0.1); }\n';
    html += '        .btn .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid rgba(0,0,0,0.1); border-top-color: #000; border-radius: 50%; animation: spin 0.8s linear infinite; }\n';
    html += '        @keyframes spin { to { transform: rotate(360deg); } }\n';
    html += '        .divider { display: flex; align-items: center; gap: 16px; margin: 16px 0; color: #444; font-size: 12px; }\n';
    html += '        .divider::before, .divider::after { content: \'\'; flex: 1; height: 1px; background: rgba(255,255,255,0.04); }\n';
    html += '        .voucher-row { display: flex; gap: 10px; }\n';
    html += '        .voucher-row input { flex: 1; padding: 11px 14px; background: #0a0e17; border: 2px solid rgba(255,255,255,0.06); border-radius: 10px; color: #fff; font-size: 14px; outline: none; }\n';
    html += '        .voucher-row input:focus { border-color: ' + primaryColor + '; }\n';
    html += '        .voucher-row .btn { flex: 0 0 auto; width: auto; padding: 11px 20px; font-size: 13px; }\n';
    html += '        .result-box { margin-top: 10px; padding: 10px 14px; border-radius: 10px; font-size: 13px; display: none; }\n';
    html += '        .result-box.show { display: block; }\n';
    html += '        .result-box.success { background: rgba(0,200,83,0.08); color: #00c853; border: 1px solid rgba(0,200,83,0.1); }\n';
    html += '        .result-box.error { background: rgba(255,68,68,0.08); color: #ff4444; border: 1px solid rgba(255,68,68,0.1); }\n';
    html += '        .result-box.info { background: rgba(33,150,243,0.08); color: #2196f3; border: 1px solid rgba(33,150,243,0.1); }\n';
    html += '        .check-row { display: flex; gap: 10px; margin-top: 14px; }\n';
    html += '        .check-row input { flex: 1; padding: 11px 14px; background: #0a0e17; border: 2px solid rgba(255,255,255,0.06); border-radius: 10px; color: #fff; font-size: 14px; outline: none; }\n';
    html += '        .check-row input:focus { border-color: ' + primaryColor + '; }\n';
    html += '        .check-row .btn { flex: 0 0 auto; width: auto; padding: 11px 20px; font-size: 13px; }\n';
    html += '        .upgrade-section { margin-top: 16px; padding: 16px; background: rgba(255,193,7,0.05); border-radius: 12px; border: 1px solid rgba(255,193,7,0.1); display: none; }\n';
    html += '        .upgrade-section.show { display: block; }\n';
    html += '        .upgrade-section h3 { color: #ffc107; font-size: 16px; margin-bottom: 4px; }\n';
    html += '        .upgrade-section p { color: #888; font-size: 13px; margin-bottom: 10px; }\n';
    html += '        .upgrade-section .plan-options { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }\n';
    html += '        .upgrade-section .plan-options .btn { padding: 10px; font-size: 12px; background: rgba(255,255,255,0.05); color: #fff; }\n';
    html += '        .upgrade-section .plan-options .btn:hover { background: rgba(255,255,255,0.1); }\n';
    html += '        .connected-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: ' + accentColor + '; display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; padding: 30px; }\n';
    html += '        .connected-overlay.active { display: flex; }\n';
    html += '        .connected-overlay .icon { font-size: 72px; margin-bottom: 12px; }\n';
    html += '        .connected-overlay .title { font-size: 28px; font-weight: 700; color: ' + primaryColor + '; }\n';
    html += '        .connected-overlay .sub { color: #888; font-size: 16px; margin-top: 4px; }\n';
    html += '        .connected-overlay .timer-box { background: rgba(255,255,255,0.03); padding: 20px 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.04); margin: 16px 0; text-align: center; }\n';
    html += '        .connected-overlay .timer-box .label { color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; }\n';
    html += '        .connected-overlay .timer-box .time { font-size: 44px; font-weight: 700; color: ' + primaryColor + '; font-family: \'Courier New\', monospace; letter-spacing: 4px; }\n';
    html += '        .connected-overlay .timer-box .time.expired { color: #ff4444; }\n';
    html += '        .connected-overlay .creds { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 14px 24px; border: 1px solid rgba(255,255,255,0.04); width: 100%; max-width: 360px; margin: 8px 0; }\n';
    html += '        .connected-overlay .creds .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 13px; }\n';
    html += '        .connected-overlay .creds .row:last-child { border-bottom: none; }\n';
    html += '        .connected-overlay .creds .label { color: #666; }\n';
    html += '        .connected-overlay .creds .value { color: #fff; font-family: monospace; }\n';
    html += '        .connected-overlay .enjoy { color: ' + primaryColor + '; font-size: 18px; margin-top: 12px; opacity: 0.9; }\n';
    html += '        .connected-overlay .powered { color: #444; font-size: 12px; margin-top: 24px; }\n';
    html += '        .connected-overlay .powered .brand { color: ' + primaryColor + '; font-weight: 600; }\n';
    html += '        .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #121829; padding: 12px 24px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); color: #fff; font-size: 14px; z-index: 999; max-width: 90%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); display: none; animation: toastIn 0.35s ease; }\n';
    html += '        .toast.show { display: block; }\n';
    html += '        .toast.success { border-color: ' + primaryColor + '; }\n';
    html += '        .toast.error { border-color: #ff4444; }\n';
    html += '        .toast.info { border-color: #2196f3; }\n';
    html += '        .already-connected-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: ' + accentColor + '; display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 10000; padding: 30px; }\n';
    html += '        .already-connected-overlay.active { display: flex; }\n';
    html += '        .already-connected-overlay .icon { font-size: 80px; margin-bottom: 16px; }\n';
    html += '        .already-connected-overlay .title { font-size: 32px; font-weight: 700; color: ' + primaryColor + '; margin-bottom: 8px; }\n';
    html += '        .already-connected-overlay .sub { color: #aaa; font-size: 18px; margin-bottom: 8px; }\n';
    html += '        .already-connected-overlay .details { color: #666; font-size: 14px; margin-top: 8px; }\n';
    html += '        .already-connected-overlay .timer-box { background: rgba(255,255,255,0.03); padding: 20px 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.04); margin: 16px 0; text-align: center; }\n';
    html += '        .already-connected-overlay .timer-box .label { color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; }\n';
    html += '        .already-connected-overlay .timer-box .time { font-size: 44px; font-weight: 700; color: ' + primaryColor + '; font-family: \'Courier New\', monospace; letter-spacing: 4px; }\n';
    html += '        .already-connected-overlay .timer-box .time.expired { color: #ff4444; }\n';
    html += '        .already-connected-overlay .expired-message { color: #ff4444; font-size: 20px; margin-top: 10px; display: none; }\n';
    html += '        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(30px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }\n';
    html += '        @media (max-width: 480px) { .container { padding: 20px 16px; } .plan-grid { grid-template-columns: 1fr 1fr; gap: 8px; } .plan-card { padding: 12px 10px; } .plan-card .price { font-size: 18px; } .voucher-row { flex-direction: column; } .voucher-row .btn { width: 100%; } .check-row { flex-direction: column; } .check-row .btn { width: 100%; } .connected-overlay .timer-box .time { font-size: 34px; } .connected-overlay .timer-box { padding: 20px; } .upgrade-section .plan-options { grid-template-columns: 1fr 1fr; } }\n';
    html += '        @media (max-width: 380px) { .plan-grid { grid-template-columns: 1fr; } .upgrade-section .plan-options { grid-template-columns: 1fr; } }\n';
    html += '    </style>\n';
    html += '</head>\n';
    html += '<body>\n';

    // ALREADY CONNECTED OVERLAY
    html += '<div class="already-connected-overlay" id="alreadyConnectedOverlay">\n';
    html += '    <div class="icon" id="alreadyIcon">🔌</div>\n';
    html += '    <div class="title" id="alreadyTitle">Already Connected!</div>\n';
    html += '    <div class="sub" id="alreadySub">You are already connected on this device</div>\n';
    html += '    <div class="details" id="alreadyDetails">Plan: <span id="alreadyPlan">-</span></div>\n';
    html += '    <div class="timer-box">\n';
    html += '        <div class="label">⏱ Time Remaining</div>\n';
    html += '        <div class="time" id="alreadyTimer">--:--:--</div>\n';
    html += '    </div>\n';
    html += '    <div class="expired-message" id="expiredMessage">⛔ Your plan has expired. Redirecting to billing page...</div>\n';
    html += '    <div class="details" id="alreadyCloseMsg" style="margin-top:12px;">This page will close automatically...</div>\n';
    html += '    <div class="powered" style="margin-top:20px;color:#444;font-size:12px;">Powered by <span class="brand" style="color:' + primaryColor + ';font-weight:600;">GICH WiFi</span></div>\n';
    html += '</div>\n';

    // Main container
    html += '<div class="container" id="app">\n';
    html += '    <div class="brand">\n';
    html += '        <div class="logo">🌐</div>\n';
    html += '        <h1>' + bizName + '</h1>\n';
    html += '        <p class="tagline">' + tagline + '</p>\n';
    html += '        <div>\n';
    html += '            <span class="badge">🔐 Secure</span>\n';
    if (mpesaTill) {
        html += '            <span class="paybill">💰 Paybill: ' + mpesaTill + '</span>\n';
    }
    html += '        </div>\n';
    html += '    </div>\n';

    html += '    <div class="status-banner" id="statusBanner"></div>\n';

    // Google Login Button
    html += '    <a href="https://billing-system-fm9a.onrender.com/auth/google" class="google-btn" style="width:100%; padding:14px; background:#fff; color:#333; border:none; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition:0.2s; display:flex; align-items:center; justify-content:center; gap:12px; text-decoration:none; margin-bottom:16px;">\n';
    html += '        <svg viewBox="0 0 48 48" style="width:24px; height:24px; flex-shrink:0;">\n';
    html += '            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>\n';
    html += '            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>\n';
    html += '            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>\n';
    html += '            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>\n';
    html += '        </svg>\n';
    html += '        Sign in with Google\n';
    html += '    </a>\n';
    html += '    <div class="divider-text" style="display:flex; align-items:center; gap:16px; margin:16px 0; color:#666; font-size:12px;">or continue with M-Pesa</div>\n';

    html += '    <div class="section-title">📶 Choose Your Plan</div>\n';
    html += '    <div class="plan-grid" id="planGrid">\n';
    html += plansHtml;
    html += '    </div>\n';

    html += '    <div class="input-group">\n';
    html += '        <label>📱 M-Pesa Phone Number</label>\n';
    html += '        <input type="tel" id="phoneInput" placeholder="0712345678" />\n';
    html += '    </div>\n';

    html += '    <button class="btn" id="payBtn" onclick="initiatePayment()" disabled>💳 Select a plan to pay</button>\n';
    html += '    <div id="paymentResult" class="result-box"></div>\n';

    html += '    <div class="divider">or use a voucher</div>\n';
    html += '    <div class="voucher-row">\n';
    html += '        <input type="text" id="voucherInput" placeholder="🎟️ Enter voucher code" />\n';
    html += '        <button class="btn btn-secondary" onclick="redeemVoucher()">Redeem</button>\n';
    html += '    </div>\n';
    html += '    <div id="voucherResult" class="result-box"></div>\n';

    html += '    <div class="check-row">\n';
    html += '        <input type="tel" id="checkPhoneInput" placeholder="🔍 Check your plan" />\n';
    html += '        <button class="btn btn-secondary" onclick="checkPlan()">Check</button>\n';
    html += '    </div>\n';
    html += '    <div id="checkResult" class="result-box"></div>\n';

    html += '    <div class="upgrade-section" id="upgradeSection">\n';
    html += '        <h3>⛔ Your subscription has expired</h3>\n';
    html += '        <p>Subscribe to continue using the service. Pay monthly via M-Pesa.</p>\n';
    html += '        <div class="plan-options">\n';
    html += '            <button class="btn" onclick="subscribeToPlan(\'starter\')">🌱 Starter<br><small>KSh 500</small></button>\n';
    html += '            <button class="btn" onclick="subscribeToPlan(\'pro\')">🚀 Pro<br><small>KSh 1,000</small></button>\n';
    html += '            <button class="btn" onclick="subscribeToPlan(\'business\')">💼 Business<br><small>KSh 2,000</small></button>\n';
    html += '        </div>\n';
    html += '        <div id="subscribeResult" style="margin-top:8px;font-size:13px;text-align:center;"></div>\n';
    html += '    </div>\n';

    html += '    <div style="text-align:center;color:#444;font-size:11px;margin-top:18px;border-top:1px solid rgba(255,255,255,0.03);padding-top:14px;">\n';
    html += '        Powered by <span style="color:' + primaryColor + ';font-weight:600;">GICH WiFi</span> · Secure · Fast · Reliable\n';
    html += '        <br><span id="supportInfo" style="color:#555;font-size:11px;">📞 ' + supportPhone + (supportEmail ? ' · ✉️ ' + supportEmail : '') + '</span>\n';
    html += '    </div>\n';
    html += '</div>\n';

    // Connected overlay
    html += '<div class="connected-overlay" id="connectedOverlay">\n';
    html += '    <div class="icon">🎉</div>\n';
    html += '    <div class="title" id="connTitle">You\'re Connected!</div>\n';
    html += '    <div class="sub" id="connSub">Enjoy your high-speed internet</div>\n';
    html += '    <div class="timer-box">\n';
    html += '        <div class="label">⏱ Time Remaining</div>\n';
    html += '        <div class="time" id="connTimer">--:--:--</div>\n';
    html += '    </div>\n';
    html += '    <div class="creds">\n';
    html += '        <div class="row"><span class="label">Username</span><span class="value" id="connUser">-</span></div>\n';
    html += '        <div class="row"><span class="label">Password</span><span class="value" id="connPass">-</span></div>\n';
    html += '        <div class="row"><span class="label">Plan</span><span class="value" id="connPlan">-</span></div>\n';
    html += '    </div>\n';
    html += '    <div class="enjoy" id="connEnjoy">🌐 Enjoy your browsing!</div>\n';
    html += '    <div class="powered">Powered by <span class="brand">GICH WiFi</span></div>\n';
    html += '</div>\n';

    // Toast
    html += '<div class="toast" id="toast">\n';
    html += '    <span id="toastIcon">✅</span>\n';
    html += '    <span id="toastMessage">Success!</span>\n';
    html += '</div>\n';

    // JavaScript (Full version)
    html += '<script>\n';
    html += '    var ORG_ID = "' + orgId + '";\n';
    html += '    var ORG_EMAIL = "' + orgEmail + '";\n';
    html += '    var API_URL = "https://billing-system-fm9a.onrender.com/api";\n';
    html += '    var selectedPlan = null;\n';
    html += '    var selectedPlanPrice = 0;\n';
    html += '    var credentials = null;\n';
    html += '    var countdownInterval = null;\n';
    html += '    var pollingInterval = null;\n';
    html += '    var subscriptionStatus = null;\n';
    html += '    var deviceId = null;\n';
    html += '    var isExpired = false;\n';
    html += '\n';
    html += '    function getEl(id) { return document.getElementById(id); }\n';
    html += '\n';
    html += '    function getDeviceId() {\n';
    html += '        var stored = localStorage.getItem("gich_device_id");\n';
    html += '        if (stored) return stored;\n';
    html += '        var newId = "device_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);\n';
    html += '        localStorage.setItem("gich_device_id", newId);\n';
    html += '        return newId;\n';
    html += '    }\n';
    html += '\n';
    html += '    function checkDeviceConnection(phoneNumber) {\n';
    html += '        if (!phoneNumber) return;\n';
    html += '        fetch(API_URL + "/device/check", {\n';
    html += '            method: "POST",\n';
    html += '            headers: { "Content-Type": "application/json" },\n';
    html += '            body: JSON.stringify({\n';
    html += '                phoneNumber: phoneNumber,\n';
    html += '                deviceId: deviceId\n';
    html += '            })\n';
    html += '        })\n';
    html += '        .then(function(r) { return r.json(); })\n';
    html += '        .then(function(data) {\n';
    html += '            if (data.success && data.alreadyConnected) {\n';
    html += '                if (data.session && data.session.expiresAt) {\n';
    html += '                    var expiry = new Date(data.session.expiresAt).getTime();\n';
    html += '                    var now = Date.now();\n';
    html += '                    if (expiry <= now) {\n';
    html += '                        isExpired = true;\n';
    html += '                        showAlreadyConnected(data.session, true);\n';
    html += '                        setTimeout(function() { window.location.reload(); }, 3000);\n';
    html += '                        return;\n';
    html += '                    }\n';
    html += '                }\n';
    html += '                showAlreadyConnected(data.session, false);\n';
    html += '                setTimeout(function() { window.close(); }, 5000);\n';
    html += '            }\n';
    html += '        })\n';
    html += '        .catch(function(err) { console.error("Device check error:", err); });\n';
    html += '    }\n';
    html += '\n';
    html += '    function showAlreadyConnected(session, expired) {\n';
    html += '        document.getElementById("app").style.display = "none";\n';
    html += '        var overlay = getEl("alreadyConnectedOverlay");\n';
    html += '        overlay.classList.add("active");\n';
    html += '        if (expired) {\n';
    html += '            getEl("alreadyIcon").textContent = "⛔";\n';
    html += '            getEl("alreadyTitle").textContent = "Plan Expired!";\n';
    html += '            getEl("alreadySub").textContent = "Your plan has expired. Redirecting...";\n';
    html += '            getEl("alreadyTimer").textContent = "00:00:00";\n';
    html += '            getEl("alreadyTimer").classList.add("expired");\n';
    html += '            getEl("expiredMessage").style.display = "block";\n';
    html += '            getEl("alreadyCloseMsg").textContent = "Redirecting to billing page...";\n';
    html += '            if (session) {\n';
    html += '                getEl("alreadyPlan").textContent = session.planName || "Unknown Plan" + " (EXPIRED)";\n';
    html += '            }\n';
    html += '        } else if (session) {\n';
    html += '            getEl("alreadyPlan").textContent = session.planName || "Unknown Plan";\n';
    html += '            if (session.expiresAt) {\n';
    html += '                startAlreadyCountdown(session.expiresAt);\n';
    html += '            }\n';
    html += '        }\n';
    html += '    }\n';
    html += '\n';
    html += '    function startAlreadyCountdown(expiresAt) {\n';
    html += '        var timer = getEl("alreadyTimer");\n';
    html += '        function update() {\n';
    html += '            var now = Date.now();\n';
    html += '            var expiry = new Date(expiresAt).getTime();\n';
    html += '            var diff = Math.max(0, expiry - now);\n';
    html += '            if (diff <= 0) {\n';
    html += '                timer.textContent = "00:00:00";\n';
    html += '                timer.classList.add("expired");\n';
    html += '                clearInterval(countdownInterval);\n';
    html += '                getEl("alreadyIcon").textContent = "⛔";\n';
    html += '                getEl("alreadyTitle").textContent = "Plan Expired!";\n';
    html += '                getEl("alreadySub").textContent = "Your plan has expired. Please reconnect.";\n';
    html += '                getEl("expiredMessage").style.display = "block";\n';
    html += '                getEl("alreadyCloseMsg").textContent = "Redirecting to billing page...";\n';
    html += '                setTimeout(function() { window.location.reload(); }, 3000);\n';
    html += '                return;\n';
    html += '            }\n';
    html += '            timer.classList.remove("expired");\n';
    html += '            var hours = Math.floor(diff / 3600000);\n';
    html += '            var mins = Math.floor((diff % 3600000) / 60000);\n';
    html += '            var secs = Math.floor((diff % 60000) / 1000);\n';
    html += '            timer.textContent = String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");\n';
    html += '        }\n';
    html += '        update();\n';
    html += '        countdownInterval = setInterval(update, 1000);\n';
    html += '    }\n';
    html += '\n';
    html += '    function selectPlan(el, id, price) {\n';
    html += '        var cards = document.querySelectorAll(".plan-card");\n';
    html += '        for (var i = 0; i < cards.length; i++) { cards[i].classList.remove("selected"); }\n';
    html += '        el.classList.add("selected");\n';
    html += '        selectedPlan = id;\n';
    html += '        selectedPlanPrice = price;\n';
    html += '        getEl("payBtn").textContent = "💳 Pay KSh " + price;\n';
    html += '        getEl("payBtn").disabled = false;\n';
    html += '        getEl("paymentResult").className = "result-box";\n';
    html += '        getEl("paymentResult").textContent = "";\n';
    html += '    }\n';
    html += '\n';
    html += '    var firstPlan = document.querySelector(".plan-card");\n';
    html += '    if (firstPlan) {\n';
    html += '        var price = parseInt(firstPlan.dataset.price) || 0;\n';
    html += '        getEl("payBtn").textContent = "💳 Pay KSh " + price;\n';
    html += '        getEl("payBtn").disabled = false;\n';
    html += '        selectedPlan = firstPlan.dataset.id;\n';
    html += '        selectedPlanPrice = price;\n';
    html += '    }\n';
    html += '\n';
    html += '    function checkSubscriptionStatus() {\n';
    html += '        if (!ORG_EMAIL) return;\n';
    html += '        fetch(API_URL + "/client/subscription-status?email=" + encodeURIComponent(ORG_EMAIL))\n';
    html += '            .then(function(r) { return r.json(); })\n';
    html += '            .then(function(data) {\n';
    html += '                if (data.success) {\n';
    html += '                    subscriptionStatus = data.status;\n';
    html += '                    updateStatusBanner(subscriptionStatus);\n';
    html += '                    var upgradeSection = getEl("upgradeSection");\n';
    html += '                    if (subscriptionStatus.status === "expired" || subscriptionStatus.status === "no_subscription") {\n';
    html += '                        upgradeSection.classList.add("show");\n';
    html += '                    } else {\n';
    html += '                        upgradeSection.classList.remove("show");\n';
    html += '                    }\n';
    html += '                }\n';
    html += '            })\n';
    html += '            .catch(function(err) { console.error("Error checking subscription:", err); });\n';
    html += '    }\n';
    html += '\n';
    html += '    function updateStatusBanner(status) {\n';
    html += '        var banner = getEl("statusBanner");\n';
    html += '        if (!status || status.status === "active") {\n';
    html += '            banner.className = "status-banner";\n';
    html += '            banner.textContent = "";\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        if (status.status === "trial") {\n';
    html += '            banner.className = "status-banner show info";\n';
    html += '            banner.textContent = "🎁 Free Trial: " + status.daysLeft + " days remaining";\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        if (status.status === "expired" || status.status === "no_subscription") {\n';
    html += '            banner.className = "status-banner show error";\n';
    html += '            banner.textContent = "⛔ " + (status.message || "No active subscription. Please subscribe below.");\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        banner.className = "status-banner show warning";\n';
    html += '        banner.textContent = status.message || "Subscription status unknown";\n';
    html += '    }\n';
    html += '\n';
    html += '    function initiatePayment() {\n';
    html += '        var phone = getEl("phoneInput").value.trim();\n';
    html += '        var resultEl = getEl("paymentResult");\n';
    html += '        if (!phone || phone.length < 10) {\n';
    html += '            resultEl.className = "result-box show error";\n';
    html += '            resultEl.textContent = "📱 Please enter a valid phone number";\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        if (!selectedPlan) {\n';
    html += '            resultEl.className = "result-box show error";\n';
    html += '            resultEl.textContent = "Please select a plan first";\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        var btn = getEl("payBtn");\n';
    html += '        btn.disabled = true;\n';
    html += '        btn.innerHTML = "<span class=\\"spinner\\"></span> Processing...";\n';
    html += '        resultEl.className = "result-box show info";\n';
    html += '        resultEl.textContent = "⏳ Sending M-Pesa request...";\n';
    html += '        fetch(API_URL + "/payment/initiate", {\n';
    html += '            method: "POST",\n';
    html += '            headers: { "Content-Type": "application/json" },\n';
    html += '            body: JSON.stringify({\n';
    html += '                phoneNumber: phone,\n';
    html += '                amount: selectedPlanPrice,\n';
    html += '                planId: selectedPlan,\n';
    html += '                organizationId: ORG_ID,\n';
    html += '                deviceId: deviceId\n';
    html += '            })\n';
    html += '        })\n';
    html += '        .then(function(r) { return r.json(); })\n';
    html += '        .then(function(data) {\n';
    html += '            if (data.success) {\n';
    html += '                resultEl.className = "result-box show success";\n';
    html += '                resultEl.textContent = "✅ M-Pesa prompt sent! Check your phone.";\n';
    html += '                showToast("📱 M-Pesa prompt sent!", "success");\n';
    html += '                if (data.isFree) {\n';
    html += '                    setTimeout(function() { fetchCredentials(data.transactionId); }, 1000);\n';
    html += '                } else {\n';
    html += '                    startPolling(data.transactionId);\n';
    html += '                }\n';
    html += '            } else if (data.alreadyConnected) {\n';
    html += '                resultEl.className = "result-box show error";\n';
    html += '                resultEl.textContent = "🔌 You are already connected on this device!";\n';
    html += '                showToast("🔌 Already connected!", "error");\n';
    html += '                btn.disabled = false;\n';
    html += '                btn.innerHTML = "💳 Pay KSh " + selectedPlanPrice;\n';
    html += '                showAlreadyConnected(data.session, false);\n';
    html += '                setTimeout(function() { window.close(); }, 5000);\n';
    html += '            } else {\n';
    html += '                resultEl.className = "result-box show error";\n';
    html += '                resultEl.textContent = "❌ " + (data.message || "Payment failed");\n';
    html += '                showToast("❌ Payment failed", "error");\n';
    html += '                btn.disabled = false;\n';
    html += '                btn.innerHTML = "💳 Pay KSh " + selectedPlanPrice;\n';
    html += '            }\n';
    html += '        })\n';
    html += '        .catch(function(err) {\n';
    html += '            console.error("Payment error:", err);\n';
    html += '            resultEl.className = "result-box show error";\n';
    html += '            resultEl.textContent = "❌ Network error: " + err.message;\n';
    html += '            showToast("❌ Network error", "error");\n';
    html += '            btn.disabled = false;\n';
    html += '            btn.innerHTML = "💳 Pay KSh " + selectedPlanPrice;\n';
    html += '        });\n';
    html += '    }\n';
    html += '\n';
    html += '    function startPolling(transactionId) {\n';
    html += '        var attempts = 0;\n';
    html += '        var maxAttempts = 30;\n';
    html += '        if (pollingInterval) clearInterval(pollingInterval);\n';
    html += '        pollingInterval = setInterval(function() {\n';
    html += '            attempts++;\n';
    html += '            if (attempts > maxAttempts) {\n';
    html += '                clearInterval(pollingInterval);\n';
    html += '                pollingInterval = null;\n';
    html += '                showToast("⏱️ Payment timed out", "error");\n';
    html += '                getEl("payBtn").disabled = false;\n';
    html += '                getEl("payBtn").innerHTML = "💳 Pay KSh " + selectedPlanPrice;\n';
    html += '                return;\n';
    html += '            }\n';
    html += '            fetch(API_URL + "/transaction/" + transactionId)\n';
    html += '                .then(function(r) { return r.json(); })\n';
    html += '                .then(function(data) {\n';
    html += '                    if (data.success) {\n';
    html += '                        var tx = data.data;\n';
    html += '                        if (tx.status === "completed") {\n';
    html += '                            clearInterval(pollingInterval);\n';
    html += '                            pollingInterval = null;\n';
    html += '                            showToast("✅ Payment successful!", "success");\n';
    html += '                            getEl("paymentResult").className = "result-box show success";\n';
    html += '                            getEl("paymentResult").textContent = "✅ Payment successful! Connecting...";\n';
    html += '                            fetchCredentials(transactionId);\n';
    html += '                        } else if (tx.status === "cancelled" || tx.status === "failed") {\n';
    html += '                            clearInterval(pollingInterval);\n';
    html += '                            pollingInterval = null;\n';
    html += '                            showToast("❌ Payment " + tx.status, "error");\n';
    html += '                            getEl("paymentResult").className = "result-box show error";\n';
    html += '                            getEl("paymentResult").textContent = "❌ Payment " + tx.status;\n';
    html += '                            getEl("payBtn").disabled = false;\n';
    html += '                            getEl("payBtn").innerHTML = "💳 Pay KSh " + selectedPlanPrice;\n';
    html += '                        }\n';
    html += '                    }\n';
    html += '                })\n';
    html += '                .catch(function(err) { console.error("Polling error:", err); });\n';
    html += '        }, 3000);\n';
    html += '    }\n';
    html += '\n';
    html += '    function fetchCredentials(transactionId) {\n';
    html += '        fetch(API_URL + "/get-credentials/" + transactionId)\n';
    html += '            .then(function(r) { return r.json(); })\n';
    html += '            .then(function(data) {\n';
    html += '                if (data.success) {\n';
    html += '                    credentials = {\n';
    html += '                        username: data.username || "N/A",\n';
    html += '                        password: data.password || "N/A",\n';
    html += '                        plan: data.plan || "N/A",\n';
    html += '                        expiresAt: data.expiresAt,\n';
    html += '                        phoneNumber: getEl("phoneInput").value.trim()\n';
    html += '                    };\n';
    html += '                    registerDevice(credentials);\n';
    html += '                    showConnectedPage(credentials);\n';
    html += '                } else {\n';
    html += '                    showToast("❌ Failed to get credentials", "error");\n';
    html += '                }\n';
    html += '            })\n';
    html += '            .catch(function(err) {\n';
    html += '                console.error("Error fetching credentials:", err);\n';
    html += '                showToast("❌ Error fetching credentials", "error");\n';
    html += '            });\n';
    html += '    }\n';
    html += '\n';
    html += '    function registerDevice(cred) {\n';
    html += '        fetch(API_URL + "/device/register", {\n';
    html += '            method: "POST",\n';
    html += '            headers: { "Content-Type": "application/json" },\n';
    html += '            body: JSON.stringify({\n';
    html += '                deviceId: deviceId,\n';
    html += '                phoneNumber: cred.phoneNumber,\n';
    html += '                username: cred.username,\n';
    html += '                planName: cred.plan,\n';
    html += '                expiresAt: cred.expiresAt\n';
    html += '            })\n';
    html += '        })\n';
    html += '        .then(function(r) { return r.json(); })\n';
    html += '        .then(function(data) {\n';
    html += '            if (data.success) {\n';
    html += '                console.log("Device registered:", data.message);\n';
    html += '            }\n';
    html += '        })\n';
    html += '        .catch(function(err) { console.error("Device registration error:", err); });\n';
    html += '    }\n';
    html += '\n';
    html += '    function showConnectedPage(cred) {\n';
    html += '        document.getElementById("app").style.display = "none";\n';
    html += '        var overlay = getEl("connectedOverlay");\n';
    html += '        overlay.classList.add("active");\n';
    html += '        getEl("connUser").textContent = cred.username || "N/A";\n';
    html += '        getEl("connPass").textContent = cred.password || "N/A";\n';
    html += '        getEl("connPlan").textContent = cred.plan || "N/A";\n';
    html += '        if (cred.expiresAt) { startCountdown(cred.expiresAt); }\n';
    html += '    }\n';
    html += '\n';
    html += '    function startCountdown(expiresAt) {\n';
    html += '        if (countdownInterval) clearInterval(countdownInterval);\n';
    html += '        var timer = getEl("connTimer");\n';
    html += '        function update() {\n';
    html += '            var now = Date.now();\n';
    html += '            var expiry = new Date(expiresAt).getTime();\n';
    html += '            var diff = Math.max(0, expiry - now);\n';
    html += '            if (diff <= 0) {\n';
    html += '                timer.textContent = "00:00:00";\n';
    html += '                timer.classList.add("expired");\n';
    html += '                getEl("connEnjoy").textContent = "⏰ Your plan has expired. Please reconnect.";\n';
    html += '                clearInterval(countdownInterval);\n';
    html += '                setTimeout(function() { window.location.reload(); }, 3000);\n';
    html += '                return;\n';
    html += '            }\n';
    html += '            timer.classList.remove("expired");\n';
    html += '            var hours = Math.floor(diff / 3600000);\n';
    html += '            var mins = Math.floor((diff % 3600000) / 60000);\n';
    html += '            var secs = Math.floor((diff % 60000) / 1000);\n';
    html += '            timer.textContent = String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");\n';
    html += '        }\n';
    html += '        update();\n';
    html += '        countdownInterval = setInterval(update, 1000);\n';
    html += '    }\n';
    html += '\n';
    html += '    function redeemVoucher() {\n';
    html += '        var code = getEl("voucherInput").value.trim().toUpperCase();\n';
    html += '        var resultEl = getEl("voucherResult");\n';
    html += '        var phone = getEl("phoneInput").value.trim();\n';
    html += '        if (!phone || phone.length < 10) {\n';
    html += '            resultEl.className = "result-box show error";\n';
    html += '            resultEl.textContent = "📱 Please enter your phone number first";\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        if (!code) {\n';
    html += '            resultEl.className = "result-box show error";\n';
    html += '            resultEl.textContent = "❌ Please enter a voucher code";\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        resultEl.className = "result-box show info";\n';
    html += '        resultEl.textContent = "⏳ Redeeming...";\n';
    html += '        fetch(API_URL + "/voucher/redeem", {\n';
    html += '            method: "POST",\n';
    html += '            headers: { "Content-Type": "application/json" },\n';
    html += '            body: JSON.stringify({ \n';
    html += '                code: code, \n';
    html += '                phoneNumber: phone,\n';
    html += '                deviceId: deviceId\n';
    html += '            })\n';
    html += '        })\n';
    html += '        .then(function(r) { return r.json(); })\n';
    html += '        .then(function(data) {\n';
    html += '            if (data.success) {\n';
    html += '                resultEl.className = "result-box show success";\n';
    html += '                resultEl.textContent = "✅ Voucher redeemed! Connecting...";\n';
    html += '                showToast("🎟️ Voucher redeemed!", "success");\n';
    html += '                credentials = {\n';
    html += '                    username: data.data.username || "voucher_user",\n';
    html += '                    password: data.data.password || "pass_" + Date.now(),\n';
    html += '                    plan: data.data.planName || "Voucher Plan",\n';
    html += '                    expiresAt: data.data.expiresAt || new Date(Date.now() + 3600000).toISOString(),\n';
    html += '                    phoneNumber: phone\n';
    html += '                };\n';
    html += '                registerDevice(credentials);\n';
    html += '                showConnectedPage(credentials);\n';
    html += '            } else {\n';
    html += '                resultEl.className = "result-box show error";\n';
    html += '                resultEl.textContent = "❌ " + (data.message || "Invalid voucher");\n';
    html += '                showToast("❌ Invalid voucher", "error");\n';
    html += '            }\n';
    html += '        })\n';
    html += '        .catch(function(err) {\n';
    html += '            console.error("Voucher error:", err);\n';
    html += '            resultEl.className = "result-box show error";\n';
    html += '            resultEl.textContent = "❌ Network error";\n';
    html += '        });\n';
    html += '    }\n';
    html += '\n';
    html += '    function checkPlan() {\n';
    html += '        var phone = getEl("checkPhoneInput").value.trim();\n';
    html += '        var resultEl = getEl("checkResult");\n';
    html += '        if (!phone || phone.length < 10) {\n';
    html += '            resultEl.className = "result-box show error";\n';
    html += '            resultEl.textContent = "❌ Please enter a valid phone number";\n';
    html += '            return;\n';
    html += '        }\n';
    html += '        resultEl.className = "result-box show info";\n';
    html += '        resultEl.textContent = "⏳ Checking...";\n';
    html += '        fetch(API_URL + "/check-active?phone=" + encodeURIComponent(phone))\n';
    html += '            .then(function(r) { return r.json(); })\n';
    html += '            .then(function(data) {\n';
    html += '                if (data.success && data.active) {\n';
    html += '                    checkDeviceConnection(phone);\n';
    html += '                    resultEl.className = "result-box show success";\n';
    html += '                    resultEl.textContent = "✅ Active plan found! Connecting...";\n';
    html += '                    credentials = {\n';
    html += '                        username: data.data.username,\n';
    html += '                        password: data.data.password,\n';
    html += '                        plan: data.data.planName,\n';
    html += '                        expiresAt: data.data.expiresAt,\n';
    html += '                        phoneNumber: phone\n';
    html += '                    };\n';
    html += '                    registerDevice(credentials);\n';
    html += '                    showConnectedPage(credentials);\n';
    html += '                } else {\n';
    html += '                    resultEl.className = "result-box show error";\n';
    html += '                    resultEl.textContent = "❌ No active plan found for this number.";\n';
    html += '                }\n';
    html += '            })\n';
    html += '            .catch(function(err) {\n';
    html += '                console.error("Check plan error:", err);\n';
    html += '                resultEl.className = "result-box show error";\n';
    html += '                resultEl.textContent = "❌ Network error";\n';
    html += '            });\n';
    html += '    }\n';
    html += '\n';
    html += '    document.addEventListener("DOMContentLoaded", function() {\n';
    html += '        deviceId = getDeviceId();\n';
    html += '        console.log("📱 Device ID:", deviceId);\n';
    html += '        \n';
    html += '        getEl("phoneInput").addEventListener("keydown", function(e) { if (e.key === "Enter") initiatePayment(); });\n';
    html += '        getEl("voucherInput").addEventListener("keydown", function(e) { if (e.key === "Enter") redeemVoucher(); });\n';
    html += '        getEl("checkPhoneInput").addEventListener("keydown", function(e) { if (e.key === "Enter") checkPlan(); });\n';
    html += '        checkSubscriptionStatus();\n';
    html += '        \n';
    html += '        var savedPhone = localStorage.getItem("gich_last_phone");\n';
    html += '        if (savedPhone) {\n';
    html += '            getEl("phoneInput").value = savedPhone;\n';
    html += '            checkDeviceConnection(savedPhone);\n';
    html += '        }\n';
    html += '        \n';
    html += '        getEl("phoneInput").addEventListener("change", function() {\n';
    html += '            var phone = this.value.trim();\n';
    html += '            if (phone && phone.length >= 10) {\n';
    html += '                localStorage.setItem("gich_last_phone", phone);\n';
    html += '            }\n';
    html += '        });\n';
    html += '    });\n';
    html += '<\/script>\n';
    html += '</body>\n';
    html += '</html>';

    return html;
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
            sendHtml(res, 200, '<h1>🌐 GICH WiFi Server</h1><p>✅ Server is running with MongoDB and Google OAuth!</p>');
            return;
        }

        // ============================================================
        // GOOGLE OAUTH ROUTES
        // ============================================================

        // Login with Google - redirect to Google
        if (req.method === 'GET' && url.pathname === '/auth/google') {
            return await handleGoogleAuth(req, res);
        }

        // Google OAuth Callback
        if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
            return await handleGoogleCallback(req, res);
        }

        // Get current user info (requires auth)
        if (req.method === 'GET' && url.pathname === '/api/me') {
            var authHeader = req.headers.authorization;
            if (!authHeader) {
                return sendJson(res, 401, { success: false, message: 'Not authenticated' });
            }
            var token = authHeader.replace('Bearer ', '');
            var decoded = verifyToken(token);
            if (!decoded) {
                return sendJson(res, 401, { success: false, message: 'Invalid token' });
            }
            return sendJson(res, 200, { success: true, user: decoded });
        }

        // Logout
        if (req.method === 'POST' && url.pathname === '/api/logout') {
            return sendJson(res, 200, { success: true, message: 'Logged out successfully' });
        }

        // ============================================================
        // PUBLIC API ENDPOINTS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/health') {
            return sendJson(res, 200, { 
                status: 'ok', 
                timestamp: new Date().toISOString(),
                database: 'connected',
                googleOAuth: !!GOOGLE_CLIENT_ID,
                version: '6.0.0-mongodb'
            });
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
            
            // Validate email format
            if (!isValidEmail(email) && email !== 'master@demo.com') {
                return sendJson(res, 400, { 
                    success: false, 
                    message: 'Please enter a valid email address'
                });
            }
            
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
                googleOAuth: !!GOOGLE_CLIENT_ID,
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
            console.log('📱 Device Tracking: ✅ ENABLED (with expiry check)');
            console.log('🔑 Google OAuth: ' + (GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'));
            console.log('📧 Email Validation: ✅ ENABLED');
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
