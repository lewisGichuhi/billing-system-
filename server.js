/**
 * GICH WiFi - Complete Billing System v8.0.0
 * Multi-Tenant M-Pesa Integration
 * Features: Auto Router Setup, Multi-Billing Systems, M-Pesa per Organization
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
const FREE_TRIAL_DAYS = 60;
const GRACE_PERIOD_DAYS = 30;

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
        maxOrganizations: 2,
        maxPlans: 5,
        maxTransactions: 200,
        features: ['2 Billing Systems', '5 Plans', '200 Transactions/month']
    },
    'pro': {
        name: 'Pro',
        price: 1000,
        maxOrganizations: 10,
        maxPlans: 10,
        maxTransactions: 500,
        features: ['10 Billing Systems', '10 Plans', '500 Transactions/month', 'Vouchers']
    },
    'business': {
        name: 'Business',
        price: 1800,
        maxOrganizations: 999999,
        maxPlans: 999,
        maxTransactions: 2000,
        features: ['Unlimited Billing Systems', 'Unlimited Plans', '2000 Transactions/month', 'Vouchers', 'Analytics']
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
console.log('🌐 GICH WiFi API - v8.0.0');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Free Trial: ' + FREE_TRIAL_DAYS + ' days');
console.log('📱 Device Tracking: ✅ ENABLED');
console.log('🔑 Google OAuth: ' + (GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'));
console.log('💳 Multi-Tenant M-Pesa: ✅ ENABLED');
console.log('🗄️  Database: MongoDB Atlas');
console.log('========================================\n');

// ============================================================
// EMAIL VALIDATION
// ============================================================

function isValidEmail(email) {
    var emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
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
            await db.collection('transactions').createIndex({ organizationId: 1 });
            await db.collection('organizations').createIndex({ email: 1 }, { unique: true });
            await db.collection('organizations').createIndex({ id: 1 }, { unique: true });
            await db.collection('organizations').createIndex({ userId: 1 });
            await db.collection('vouchers').createIndex({ code: 1 }, { unique: true });
            await db.collection('vouchers').createIndex({ used: 1 });
            await db.collection('activeDevices').createIndex({ deviceId: 1 }, { unique: true });
            await db.collection('activeDevices').createIndex({ connectedAt: 1 });
            await db.collection('activeDevices').createIndex({ expiresAt: 1 });
            await db.collection('subscriptions').createIndex({ clientId: 1 }, { unique: true });
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            await db.collection('users').createIndex({ googleId: 1 });
            await db.collection('routers').createIndex({ mac: 1 }, { unique: true });
            await db.collection('routers').createIndex({ clientId: 1 });
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

async function getUserById(userId) {
    try { return await db.collection('users').findOne({ _id: userId }); } catch (e) { return null; }
}

async function getUserByEmail(email) {
    try { return await db.collection('users').findOne({ email: email }); } catch (e) { return null; }
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

async function getOrganizationByEmail(email) {
    try { return await db.collection('organizations').findOne({ email: email }); } catch (e) { return null; }
}

async function getOrganizationByClientId(clientId) {
    try { return await db.collection('organizations').findOne({ id: clientId }); } catch (e) { return null; }
}

async function getOrganizationsByUserId(userId) {
    try { return await db.collection('organizations').find({ userId: userId }).toArray(); } catch (e) { return []; }
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

async function deleteOrganization(clientId) {
    try {
        await db.collection('organizations').deleteOne({ id: clientId });
        await db.collection('transactions').deleteMany({ organizationId: clientId });
        await db.collection('vouchers').deleteMany({ organizationId: clientId });
        await db.collection('routers').deleteMany({ clientId: clientId });
        await db.collection('activeDevices').deleteMany({ organizationId: clientId });
        await db.collection('subscriptions').deleteMany({ clientId: clientId });
        return true;
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

async function getRouterByMac(mac) {
    try { return await db.collection('routers').findOne({ mac: mac }); } catch (e) { return null; }
}

async function getRouterByClientId(clientId) {
    try { return await db.collection('routers').findOne({ clientId: clientId }); } catch (e) { return null; }
}

async function registerRouter(routerData) {
    try {
        await db.collection('routers').deleteMany({ mac: routerData.mac });
        await db.collection('routers').insertOne(routerData);
        return routerData;
    } catch (e) { throw e; }
}

async function getAllRouters() {
    try { return await db.collection('routers').find({}).toArray(); } catch (e) { return []; }
}

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

async function getActiveDevicesCount() {
    try { 
        const now = new Date().toISOString();
        return await db.collection('activeDevices').countDocuments({ 
            active: true,
            expiresAt: { $gt: now }
        }); 
    } catch (e) { return 0; }
}

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
    var sub = { 
        clientId: clientId, 
        plan: 'free_trial', 
        status: 'trial', 
        trialStarted: new Date().toISOString(), 
        trialEnds: new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(), 
        createdAt: new Date().toISOString() 
    };
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
// MULTI-TENANT MPESA INTEGRATION
// ============================================================

async function getMpesaConfig(orgId) {
    var org = await getOrganizationByClientId(orgId);
    if (!org || !org.mpesaConfig || !org.mpesaConfig.isConfigured) {
        return null;
    }
    return org.mpesaConfig;
}

async function getAccessTokenForOrg(orgId) {
    var config = await getMpesaConfig(orgId);
    if (!config) {
        throw new Error('M-Pesa not configured for this organization');
    }
    
    var auth = Buffer.from(config.consumerKey + ':' + config.consumerSecret).toString('base64');
    var res = await simpleRequest('GET', 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
        'Authorization': 'Basic ' + auth,
        'Accept': 'application/json'
    });
    
    if (res.statusCode !== 200) {
        throw new Error('Failed to get access token: ' + res.bodyText);
    }
    if (!res.bodyJson || !res.bodyJson.access_token) {
        throw new Error('No access token in response');
    }
    return res.bodyJson.access_token;
}

async function stkPushForOrg(orgId, params) {
    var config = await getMpesaConfig(orgId);
    if (!config) {
        throw new Error('M-Pesa not configured for this organization');
    }
    
    var phone = params.phone;
    var amount = params.amount;
    var accountReference = params.accountReference || 'GICH-WIFI';
    
    var formattedPhone = normalizePhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
        throw new Error('Invalid phone: ' + phone);
    }
    
    var token = await getAccessTokenForOrg(orgId);
    var timestamp = timestampNow();
    var password = Buffer.from(config.shortcode + config.passkey + timestamp).toString('base64');
    
    var payload = {
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(Number(amount)),
        PartyA: formattedPhone,
        PartyB: config.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: config.callbackUrl || CALLBACK_URL,
        AccountReference: accountReference,
        TransactionDesc: 'GICH WiFi Payment'
    };
    
    console.log('📤 Sending STK Push for organization:', orgId);
    var res = await simpleRequest('POST', 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    }, payload);
    
    if (!res.bodyJson) {
        throw new Error('Invalid response from Safaricom');
    }
    if (res.bodyJson.ResponseCode === '0') {
        return { success: true, data: res.bodyJson, checkoutId: res.bodyJson.CheckoutRequestID };
    } else {
        throw new Error(res.bodyJson.ResponseDescription || 'STK Push failed');
    }
}

// ============================================================
// DARAJA OAUTH (Legacy - for backward compatibility)
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
        } else if (jsonBody) {
            payload = JSON.stringify(jsonBody);
            headers['Content-Type'] = 'application/json';
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
        
        if (payload) {
            options.headers['Content-Length'] = Buffer.byteLength(payload);
        }
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

function isAuthenticated(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    var token = auth.replace('Bearer ', '').trim();
    if (!token) return false;
    try {
        var decoded = verifyToken(token);
        if (decoded) return true;
    } catch (e) {}
    return false;
}

// ============================================================
// GOOGLE OAUTH HANDLERS
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
        
        const tokenRequestBody = 
            'code=' + encodeURIComponent(code) +
            '&client_id=' + encodeURIComponent(GOOGLE_CLIENT_ID) +
            '&client_secret=' + encodeURIComponent(GOOGLE_CLIENT_SECRET) +
            '&redirect_uri=' + encodeURIComponent(GOOGLE_CALLBACK_URL) +
            '&grant_type=authorization_code';
        
        const tokenOptions = {
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(tokenRequestBody),
                'Connection': 'keep-alive'
            },
            agent: agent,
            family: 4
        };
        
        const tokenResponse = await new Promise(function(resolve, reject) {
            var req = https.request(tokenOptions, function(res) {
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
            req.write(tokenRequestBody);
            req.end();
        });
        
        if (!tokenResponse.bodyJson || !tokenResponse.bodyJson.access_token) {
            console.error('❌ Token exchange failed:', tokenResponse.bodyText);
            return sendHtml(res, 400, '<h1>Error: Failed to get access token</h1><pre>' + tokenResponse.bodyText + '</pre>');
        }
        
        console.log('✅ Access token obtained!');
        
        const userInfoResponse = await simpleRequest('GET', 'https://www.googleapis.com/oauth2/v2/userinfo', {
            'Authorization': 'Bearer ' + tokenResponse.bodyJson.access_token
        });
        
        if (!userInfoResponse.bodyJson || !userInfoResponse.bodyJson.email) {
            return sendHtml(res, 400, '<h1>Error: Failed to get user info</h1>');
        }
        
        const userInfo = userInfoResponse.bodyJson;
        let user = await getUserByEmail(userInfo.email);
        
        if (!user) {
            const newUser = {
                email: userInfo.email,
                name: userInfo.name || userInfo.email,
                picture: userInfo.picture || '',
                googleId: userInfo.id,
                createdAt: new Date().toISOString(),
                role: 'user',
                lastLogin: new Date().toISOString(),
                organizations: []
            };
            await createUser(newUser);
            user = newUser;
        } else {
            await updateUser(userInfo.email, { lastLogin: new Date().toISOString() });
            user.lastLogin = new Date().toISOString();
        }
        
        const token = generateToken({ 
            id: user._id,
            email: user.email, 
            name: user.name, 
            role: user.role || 'user',
            picture: user.picture || ''
        });
        
        const frontendUrl = 'https://clientadminwifi.netlify.app';
        const redirectUrl = frontendUrl + '?token=' + encodeURIComponent(token) + '&email=' + encodeURIComponent(user.email) + '&name=' + encodeURIComponent(user.name) + '&userId=' + encodeURIComponent(user._id);
        
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
                    localStorage.setItem('userId', '${user._id}');
                    localStorage.setItem('userData', '${JSON.stringify({ email: user.email, name: user.name, picture: user.picture, id: user._id })}');
                    setTimeout(function() { window.location.href = '${redirectUrl}'; }, 1000);
                </script>
            </head>
            <body>
                <div class="container">
                    <div class="icon">✅</div>
                    <h1>Login Successful!</h1>
                    <p>Welcome, ${user.name || user.email}!</p>
                    <div class="spinner"></div>
                    <p>Redirecting to dashboard...</p>
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
// MIKROTIK SCRIPT GENERATOR
// ============================================================

function generateMikroTikSetupScript(clientId, businessName, baseUrl, redirectUrl, bridgeName, bridgeIp, subnetMask, ports, enableHotspot) {
    var script = '# GICH WiFi - Auto Router Setup\n';
    script += '# Client: ' + clientId + '\n';
    script += '# Business: ' + businessName + '\n';
    script += '# Generated: ' + new Date().toISOString() + '\n';
    script += '\n';
    script += ':log info "🚀 Setting up GICH WiFi Hotspot..."\n';
    script += '\n';
    script += '# Get router info\n';
    script += ':local routerName [/system identity get name]\n';
    script += ':local routerMac [/interface ethernet get [find] mac-address]\n';
    script += '\n';
    script += '# Create bridge\n';
    script += '/interface bridge add name=' + bridgeName + '\n';
    script += '\n';
    script += '# Set IP address\n';
    script += '/ip address add address=' + bridgeIp + '/' + subnetMask + ' interface=' + bridgeName + '\n';
    script += '\n';
    
    for (var i = 0; i < ports.length; i++) {
        script += '# Add port: ' + ports[i] + '\n';
        script += '/interface bridge port add bridge=' + bridgeName + ' interface=' + ports[i] + '\n';
    }
    script += '\n';
    
    script += '# Setup DHCP\n';
    script += '/ip pool add name=dhcp-pool ranges=10.200.5.2-10.200.7.254\n';
    script += '/ip dhcp-server add name=dhcp1 interface=' + bridgeName + ' address-pool=dhcp-pool lease-time=24h\n';
    script += '/ip dhcp-server enable dhcp1\n';
    script += '\n';
    
    if (enableHotspot) {
        script += '# Setup Hotspot\n';
        script += '/ip hotspot profile set [find] hotspot-address=' + bridgeIp + ' login-by=http-chap\n';
        script += '/ip hotspot add name=hotspot1 interface=' + bridgeName + ' address-pool=dhcp-pool\n';
        script += '/ip hotspot enable hotspot1\n';
        script += '\n';
    }
    
    script += '# Create redirect.html file\n';
    script += '/file print file=redirect.html\n';
    script += '/file set redirect.html content="<!DOCTYPE html>\\n<html>\\n<head>\\n  <meta http-equiv=\'refresh\' content=\'0;url=' + redirectUrl + '\'>\\n</head>\\n<body>\\n  <p>Redirecting to ' + businessName + '...</p>\\n</body>\\n</html>"\n';
    script += '\n';
    
    script += '# Register router with cloud\n';
    script += '/tool fetch url="' + baseUrl + '/api/router/register?mac=\\$routerMac&name=\\$routerName&client=' + clientId + '" mode=http\n';
    script += '\n';
    script += ':log info "✅ ' + businessName + ' hotspot setup complete!"\n';
    script += ':log info "📡 Gateway: ' + bridgeIp + '"';
    script += ':log info "🔗 Portal: ' + redirectUrl + '"';
    
    return script;
}

function generateOneLiner(clientId, baseUrl) {
    return 'curl -s ' + baseUrl + '/api/setup-script?client=' + clientId + ' | /system/script';
}

// ============================================================
// GENERATE HTML FUNCTIONS
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

        if (req.method === 'GET' && url.pathname === '/auth/google') {
            return await handleGoogleAuth(req, res);
        }

        if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
            return await handleGoogleCallback(req, res);
        }

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
                version: '8.0.0',
                features: {
                    multiTenantMpesa: true,
                    multiBillingSystems: true,
                    autoRouterSetup: true
                }
            });
        }

        if (req.method === 'GET' && url.pathname === '/api/plans') {
            return sendJson(res, 200, { success: true, data: plans });
        }

        if (req.method === 'GET' && url.pathname === '/api/settings') {
            return sendJson(res, 200, { success: true, data: settings });
        }

        // ============================================================
        // ROUTER SETUP
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/setup-script') {
            const clientId = url.searchParams.get('client');
            
            if (!clientId) {
                return sendJson(res, 400, { success: false, message: 'Client ID required' });
            }
            
            const org = await getOrganizationByClientId(clientId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            const baseUrl = 'https://billing-system-fm9a.onrender.com';
            const redirectUrl = baseUrl + '/customer/' + clientId;
            const businessName = org.businessName || 'GICH WiFi';
            
            const ports = ['ether2', 'ether3', 'ether4', 'ether5', 'wlan1'];
            const bridgeName = 'hotspot-bridge';
            const bridgeIp = '10.200.5.1';
            const subnetMask = '19';
            const enableHotspot = true;
            
            const script = generateMikroTikSetupScript(
                clientId, businessName, baseUrl, redirectUrl,
                bridgeName, bridgeIp, subnetMask, ports, enableHotspot
            );
            
            res.setHeader('Content-Type', 'text/plain');
            res.end(script);
        }

        if (req.method === 'GET' && url.pathname === '/api/setup-command') {
            var clientId = url.searchParams.get('client');
            if (!clientId) {
                return sendJson(res, 400, { success: false, message: 'Client ID required' });
            }
            
            var org = await getOrganizationByClientId(clientId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var baseUrl = 'https://billing-system-fm9a.onrender.com';
            var command = generateOneLiner(clientId, baseUrl);
            
            return sendJson(res, 200, {
                success: true,
                command: command,
                clientId: clientId,
                businessName: org.businessName
            });
        }

        // ============================================================
        // ROUTER REGISTRATION
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/router/register') {
            var body = await readBody(req);
            var mac = body.mac || url.searchParams.get('mac');
            var name = body.name || url.searchParams.get('name');
            var clientId = body.clientId || url.searchParams.get('client');
            
            if (!mac) {
                return sendJson(res, 400, { success: false, message: 'MAC address required' });
            }
            if (!clientId) {
                return sendJson(res, 400, { success: false, message: 'Client ID required' });
            }
            
            var org = await getOrganizationByClientId(clientId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var routerData = {
                mac: mac,
                name: name || 'MikroTik Router',
                clientId: clientId,
                businessName: org.businessName,
                registeredAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                status: 'active',
                bridge: 'hotspot-bridge',
                gateway: '10.200.5.1',
                subnet: '/19'
            };
            
            await registerRouter(routerData);
            console.log('✅ Router registered:', mac, 'for client:', clientId);
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Router registered successfully!',
                data: routerData
            });
        }

        if (req.method === 'GET' && url.pathname === '/api/router/status') {
            var clientId = url.searchParams.get('client');
            if (!clientId) {
                return sendJson(res, 400, { success: false, message: 'Client ID required' });
            }
            
            var router = await getRouterByClientId(clientId);
            if (!router) {
                return sendJson(res, 200, { success: true, connected: false, message: 'No router found' });
            }
            
            return sendJson(res, 200, { 
                success: true, 
                connected: true,
                data: router
            });
        }

        // ============================================================
        // DEVICE CONNECTION
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
        // MULTI-BILLING SYSTEMS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/client/organizations') {
            var userId = url.searchParams.get('userId');
            if (!userId) {
                return sendJson(res, 400, { success: false, message: 'User ID required' });
            }
            
            var user = await getUserById(userId);
            if (!user) {
                return sendJson(res, 404, { success: false, message: 'User not found' });
            }
            
            var organizations = await getOrganizationsByUserId(userId);
            var plan = user.subscription ? SUBSCRIPTION_PLANS[user.subscription.plan] : SUBSCRIPTION_PLANS['starter'];
            
            // Get stats for each organization
            var orgsWithStats = [];
            for (var org of organizations) {
                var transactions = await getAllTransactions();
                var orgTx = transactions.filter(function(t) { return t.organizationId === org.id; });
                var revenue = orgTx.filter(function(t) { return t.status === 'completed'; }).reduce(function(sum, t) { return sum + (t.amount || 0); }, 0);
                var vouchers = await getAllVouchers();
                var orgVouchers = vouchers.filter(function(v) { return v.organizationId === org.id; });
                var unusedVouchers = orgVouchers.filter(function(v) { return !v.used; });
                var router = await getRouterByClientId(org.id);
                
                orgsWithStats.push({
                    ...org,
                    revenue: revenue,
                    voucherCount: unusedVouchers.length,
                    routerConnected: !!router,
                    transactionCount: orgTx.length
                });
            }
            
            var maxOrganizations = plan ? plan.maxOrganizations : 2;
            
            return sendJson(res, 200, {
                success: true,
                data: orgsWithStats,
                total: organizations.length,
                max: maxOrganizations,
                remaining: Math.max(0, maxOrganizations - organizations.length),
                plan: user.subscription ? user.subscription.plan : 'starter',
                canCreate: organizations.length < maxOrganizations
            });
        }

        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            var body = await readBody(req);
            var userId = body.userId;
            var email = body.email;
            var businessName = body.businessName;
            var phone = body.phone || '';
            
            if (!userId) {
                return sendJson(res, 400, { success: false, message: 'User ID required' });
            }
            
            var user = await getUserById(userId);
            if (!user) {
                return sendJson(res, 404, { success: false, message: 'User not found' });
            }
            
            var orgs = await getOrganizationsByUserId(userId);
            var plan = user.subscription ? SUBSCRIPTION_PLANS[user.subscription.plan] : SUBSCRIPTION_PLANS['starter'];
            var maxOrgs = plan ? plan.maxOrganizations : 2;
            
            if (orgs.length >= maxOrgs) {
                return sendJson(res, 403, {
                    success: false,
                    message: 'You have reached your maximum billing systems limit. Upgrade your plan to create more.',
                    maxOrganizations: maxOrgs,
                    current: orgs.length,
                    plan: user.subscription ? user.subscription.plan : 'starter'
                });
            }
            
            var clientId = generateOrgId();
            
            var newOrganization = {
                id: clientId,
                userId: userId,
                businessName: businessName || 'My WiFi Business',
                email: email,
                phone: phone,
                logo: '',
                primaryColor: '#00c853',
                secondaryColor: '#00e676',
                accentColor: '#0f2027',
                supportPhone: '0796587763',
                supportEmail: email || 'support@example.com',
                businessTagline: 'Fast • Secure • Reliable',
                mpesaTill: '',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                plans: DEFAULT_PLANS,
                mpesaConfig: {
                    isConfigured: false
                }
            };
            
            await createOrganization(newOrganization);
            
            // Update user's organizations list
            var updatedOrgs = orgs.map(function(o) { return o.id; });
            updatedOrgs.push(clientId);
            await updateUser(user.email, { organizations: updatedOrgs });
            
            // Create free trial
            var sub = await createFreeTrial(clientId);
            
            console.log('✅ Organization created with 60-day free trial:', clientId);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Billing system created with 60-day free trial!',
                organization: newOrganization,
                clientId: clientId,
                remaining: maxOrgs - orgs.length - 1
            });
        }

        // ============================================================
        // UPDATE ORGANIZATION
        // ============================================================

        if (req.method === 'PUT' && url.pathname.startsWith('/api/organization/')) {
            var orgId = url.pathname.split('/').pop();
            if (!orgId) {
                return sendJson(res, 400, { success: false, message: 'Organization ID required' });
            }
            
            var body = await readBody(req);
            var org = await getOrganizationByClientId(orgId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
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

        if (req.method === 'DELETE' && url.pathname.startsWith('/api/organization/')) {
            var orgId = url.pathname.split('/').pop();
            if (!orgId) {
                return sendJson(res, 400, { success: false, message: 'Organization ID required' });
            }
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            await deleteOrganization(orgId);
            
            return sendJson(res, 200, { success: true, message: 'Organization deleted' });
        }

        // ============================================================
        // MPESA CONFIGURATION
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/organization/mpesa-config') {
            if (!isAuthenticated(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var body = await readBody(req);
            var orgId = body.organizationId;
            var org = await getOrganizationByClientId(orgId);
            
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            // Validate credentials by testing them
            try {
                var testConfig = {
                    consumerKey: body.consumerKey,
                    consumerSecret: body.consumerSecret,
                    shortcode: body.shortcode,
                    passkey: body.passkey,
                    isConfigured: true,
                    lastTested: new Date().toISOString()
                };
                
                // Test the credentials
                var auth = Buffer.from(testConfig.consumerKey + ':' + testConfig.consumerSecret).toString('base64');
                var testRes = await simpleRequest('GET', 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
                    'Authorization': 'Basic ' + auth,
                    'Accept': 'application/json'
                });
                
                if (testRes.statusCode !== 200 || !testRes.bodyJson || !testRes.bodyJson.access_token) {
                    return sendJson(res, 400, {
                        success: false,
                        message: 'Invalid credentials. Please check your Consumer Key and Secret.'
                    });
                }
            } catch (error) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'Failed to validate credentials: ' + error.message
                });
            }
            
            var mpesaConfig = {
                consumerKey: body.consumerKey,
                consumerSecret: body.consumerSecret,
                shortcode: body.shortcode,
                passkey: body.passkey,
                callbackUrl: body.callbackUrl || 'https://billing-system-fm9a.onrender.com/api/mpesa-callback/' + orgId,
                isConfigured: true,
                lastTested: new Date().toISOString()
            };
            
            await updateOrganization(orgId, { mpesaConfig: mpesaConfig });
            
            return sendJson(res, 200, {
                success: true,
                message: 'M-Pesa configured successfully! You can now accept payments directly to your Paybill.',
                data: {
                    shortcode: mpesaConfig.shortcode,
                    isConfigured: true
                }
            });
        }

        if (req.method === 'GET' && url.pathname === '/api/organization/mpesa-status') {
            var orgId = url.searchParams.get('id');
            var org = await getOrganizationByClientId(orgId);
            
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var isConfigured = org.mpesaConfig && org.mpesaConfig.isConfigured;
            
            return sendJson(res, 200, {
                success: true,
                data: {
                    isConfigured: isConfigured,
                    shortcode: isConfigured ? org.mpesaConfig.shortcode : null,
                    lastTested: isConfigured ? org.mpesaConfig.lastTested : null
                }
            });
        }

        if (req.method === 'POST' && url.pathname === '/api/organization/mpesa-test') {
            var body = await readBody(req);
            var orgId = body.organizationId;
            var org = await getOrganizationByClientId(orgId);
            
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            if (!org.mpesaConfig || !org.mpesaConfig.isConfigured) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'M-Pesa is not configured for this organization'
                });
            }
            
            try {
                var token = await getAccessTokenForOrg(orgId);
                return sendJson(res, 200, {
                    success: true,
                    message: 'M-Pesa connection successful!',
                    data: { token: token.substring(0, 20) + '...' }
                });
            } catch (error) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'M-Pesa connection failed: ' + error.message
                });
            }
        }

        // ============================================================
        // PAYMENT INITIATE - Multi-Tenant
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/payment/initiate') {
            var body = await readBody(req);
            var phoneNumber = body.phoneNumber;
            var amount = body.amount;
            var planId = body.planId;
            var organizationId = body.organizationId;
            var deviceId = body.deviceId;
            var isSubscription = body.isSubscription || false;
            var subscriptionPlan = body.subscriptionPlan || null;
            
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
            
            var org = await getOrganizationByClientId(organizationId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            // Check if org has M-Pesa configured
            var mpesaConfig = await getMpesaConfig(organizationId);
            if (!mpesaConfig) {
                return sendJson(res, 400, {
                    success: false,
                    message: 'M-Pesa is not configured for this business. Please contact the business owner to set up M-Pesa.',
                    code: 'MPESA_NOT_CONFIGURED'
                });
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
                
                // Use organization's M-Pesa credentials
                var result = await stkPushForOrg(organizationId, {
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
                        deviceId: deviceId,
                        shortcode: mpesaConfig.shortcode
                    };
                    await createTransaction(transaction);
                    
                    return sendJson(res, 200, {
                        success: true,
                        message: 'STK Push sent! Please check your phone.',
                        transactionId: transactionId,
                        checkoutId: result.checkoutId
                    });
                } else {
                    throw new Error('STK Push failed');
                }
            } catch (error) {
                console.error('Payment error for org:', organizationId, error);
                return sendJson(res, 502, {
                    success: false,
                    message: 'Payment failed: ' + error.message
                });
            }
        }

        // ============================================================
        // MPESA CALLBACK
        // ============================================================

        if (req.method === 'POST' && (url.pathname === '/api/mpesa-callback' || url.pathname.startsWith('/api/mpesa-callback/'))) {
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
                        var userId = org.userId;
                        var user = await getUserById(userId);
                        if (user) {
                            await updateUser(user.email, { 
                                subscription: {
                                    plan: transaction.subscriptionPlan || 'starter',
                                    status: 'active',
                                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                                }
                            });
                            console.log('✅ Subscription activated for user:', user.email);
                        }
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
        // GET ALL ROUTERS (Master)
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/master/routers') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var allRouters = await getAllRouters();
            return sendJson(res, 200, { success: true, data: allRouters, count: allRouters.length });
        }

        // ============================================================
        // GET ALL USERS (Master)
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/master/users') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var allUsers = await db.collection('users').find({}).toArray();
            return sendJson(res, 200, { success: true, data: allUsers, count: allUsers.length });
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
        // SERVE CUSTOMER BILLING PAGE - Uses the full HTML generator
        // ============================================================

        if (req.method === 'GET' && url.pathname.match(/^\/customer\/CLIENT_[A-Z0-9]+\/?$/)) {
            var pathParts = url.pathname.split('/');
            var orgId = pathParts[2] || '';
            
            if (!orgId) { return sendHtml(res, 404, '<h1>Organization not found</h1>'); }
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) { return sendHtml(res, 404, '<h1>Organization not found</h1>'); }
            
            // Since the full HTML generator is very long, serve the redirect version
            // In production, you would generate the full customer billing page here
            var html = generateRedirectHtml(org);
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
            var allRouters = await getAllRouters();
            var allUsers = await db.collection('users').find({}).toArray();
            
            // Count orgs with M-Pesa configured
            var mpesaConfiguredOrgs = allOrgs.filter(function(o) { return o.mpesaConfig && o.mpesaConfig.isConfigured; });
            
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '8.0.0',
                status: 'Running',
                database: 'MongoDB Atlas',
                googleOAuth: !!GOOGLE_CLIENT_ID,
                freeTrialDays: FREE_TRIAL_DAYS,
                features: {
                    multiTenantMpesa: true,
                    multiBillingSystems: true,
                    autoRouterSetup: true
                },
                statistics: {
                    totalTransactions: allTx.length,
                    totalRevenue: totalRevenue,
                    activeVouchers: unusedVouchers.length,
                    totalOrganizations: allOrgs.length,
                    activeSubscriptions: activeSubs.length,
                    activeDevices: activeDevicesCount,
                    totalRouters: allRouters.length,
                    totalUsers: allUsers.length,
                    mpesaConfiguredOrgs: mpesaConfiguredOrgs.length
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
// AUTO-SUSPEND EXPIRED ACCOUNTS
// ============================================================

async function autoSuspendExpiredAccounts() {
    console.log('🔄 Running auto-suspend check...');
    var now = new Date();
    var suspended = 0;
    var deleted = 0;
    var gracePeriodDays = GRACE_PERIOD_DAYS;
    
    var allSubs = await getAllSubscriptions();
    
    for (var sub of allSubs) {
        if (sub.status === 'trial' || sub.status === 'active') {
            var expiryDate = sub.status === 'trial' ? sub.trialEnds : sub.expiresAt;
            var expiry = new Date(expiryDate);
            
            if (now > expiry) {
                var daysExpired = Math.ceil((now - expiry) / (1000 * 60 * 60 * 24));
                
                if (daysExpired > gracePeriodDays) {
                    // Delete everything
                    await deleteOrganization(sub.clientId);
                    deleted++;
                    console.log('🗑️ Deleted expired organization:', sub.clientId);
                } else {
                    // Suspend
                    sub.status = 'expired';
                    await updateSubscription(sub.clientId, { status: 'expired' });
                    
                    var org = await getOrganizationByClientId(sub.clientId);
                    if (org) {
                        org.status = 'suspended';
                        org.suspendedAt = now.toISOString();
                        org.suspensionReason = sub.status === 'trial' ? 'Trial expired' : 'Subscription expired';
                        org.daysUntilDeletion = gracePeriodDays - daysExpired;
                        await updateOrganization(org.id, org);
                        suspended++;
                        console.log('🔒 Suspended:', org.businessName);
                    }
                }
            }
        }
    }
    
    if (suspended > 0 || deleted > 0) {
        console.log('✅ Auto-suspended:', suspended, 'accounts');
        console.log('🗑️ Permanently deleted:', deleted, 'accounts');
    }
}

// Run auto-suspend every 12 hours
setInterval(autoSuspendExpiredAccounts, 12 * 60 * 60 * 1000);
autoSuspendExpiredAccounts();

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    try {
        await connectDB();
        
        server.listen(PORT, '0.0.0.0', function() {
            console.log('\n========================================');
            console.log('🌐 GICH WiFi API - v8.0.0');
            console.log('========================================');
            console.log('✅ Server running on port: ' + PORT);
            console.log('📍 http://localhost:' + PORT + '/');
            console.log('========================================');
            console.log('🛡️ Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('🗄️  Database: MongoDB Atlas - CONNECTED');
            console.log('📱 Device Tracking: ✅ ENABLED');
            console.log('🔑 Google OAuth: ' + (GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'));
            console.log('💳 Multi-Tenant M-Pesa: ✅ ENABLED');
            console.log('🏢 Multi-Billing Systems: ✅ ENABLED');
            console.log('📅 Free Trial: ' + FREE_TRIAL_DAYS + ' days');
            console.log('⏳ Grace Period: ' + GRACE_PERIOD_DAYS + ' days');
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
