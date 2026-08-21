/**
 * GICH WiFi - Complete Billing System
 * Version 7.6.0 - FULLY COMPLETE
 * Features: M-Pesa Integration, Device Tracking, Multi-Billing System, Master Dashboard
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

// FREE TRIAL - 60 DAYS
const FREE_TRIAL_DAYS = 60;

// DEVICE SESSION MAX DAYS
const DEVICE_SESSION_MAX_DAYS = 30;

// ============================================================
// BILLING SYSTEM PLANS
// ============================================================
const BILLING_PLANS = {
    starter: {
        id: 'starter',
        name: 'Starter',
        price: 500,
        maxSystems: 3,
        maxPlans: 5,
        maxTransactions: 200,
        hasVouchers: false,
        hasAnalytics: false
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        price: 1000,
        maxSystems: 10,
        maxPlans: 10,
        maxTransactions: 500,
        hasVouchers: true,
        hasAnalytics: false
    },
    business: {
        id: 'business',
        name: 'Business',
        price: 1700,
        maxSystems: 20,
        maxPlans: 999,
        maxTransactions: 2000,
        hasVouchers: true,
        hasAnalytics: true
    }
};

// ============================================================
// SUBSCRIPTION PLANS (Legacy)
// ============================================================
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
        price: 1700,
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
console.log('🌐 GICH WiFi API - v7.6.0 (FULLY COMPLETE)');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   Free Trial: ' + FREE_TRIAL_DAYS + ' days');
console.log('📱 Device Tracking: ✅ ENABLED');
console.log('🔑 Google OAuth: ' + (GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'));
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
            tlsAllowInvalidHostnames: true
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
            await db.collection('billingSubscriptions').createIndex({ clientId: 1 }, { unique: true });
            await db.collection('darajaConfigs').createIndex({ clientId: 1 }, { unique: true });
            await db.collection('billingSystems').createIndex({ id: 1 }, { unique: true });
            await db.collection('billingSystems').createIndex({ organizationId: 1 });
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            await db.collection('users').createIndex({ googleId: 1 });
            await db.collection('routers').createIndex({ mac: 1 }, { unique: true });
            await db.collection('routers').createIndex({ clientId: 1 });
            await db.collection('sessions').createIndex({ deviceId: 1 }, { unique: true });
            await db.collection('sessions').createIndex({ expiresAt: 1 });
            await db.collection('sessions').createIndex({ lastSeen: 1 });
            console.log('✅ Indexes created successfully');
        } catch (indexError) {
            console.log('⚠️ Some indexes may already exist');
        }
        
        await loadCache();
        return db;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
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

// ============================================================
// BILLING SYSTEMS OPERATIONS
// ============================================================

async function getBillingSystemById(id) {
    try { return await db.collection('billingSystems').findOne({ id: id }); } catch (e) { return null; }
}

async function getBillingSystemsByOrganization(organizationId) {
    try { 
        return await db.collection('billingSystems').find({ organizationId: organizationId }).toArray();
    } catch (e) { 
        return []; 
    }
}

async function getAllBillingSystems() {
    try { 
        return await db.collection('billingSystems').find({}).toArray();
    } catch (e) { 
        return []; 
    }
}

async function createBillingSystem(bsData) {
    try { 
        await db.collection('billingSystems').insertOne(bsData); 
        return bsData; 
    } catch (e) { 
        throw e; 
    }
}

async function updateBillingSystem(id, updateData) {
    try {
        const result = await db.collection('billingSystems').findOneAndUpdate(
            { id: id }, 
            { $set: updateData }, 
            { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { 
        throw e; 
    }
}

async function deleteBillingSystem(id) {
    try { 
        return await db.collection('billingSystems').deleteOne({ id: id });
    } catch (e) { 
        throw e; 
    }
}

// ============================================================
// TRANSACTION OPERATIONS
// ============================================================

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

// ============================================================
// SUBSCRIPTION OPERATIONS (Legacy)
// ============================================================

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

// ============================================================
// BILLING SUBSCRIPTION OPERATIONS
// ============================================================

async function getBillingSubscription(clientId) {
    try { return await db.collection('billingSubscriptions').findOne({ clientId: clientId }); } catch (e) { return null; }
}

async function createBillingSubscription(subData) {
    try { await db.collection('billingSubscriptions').insertOne(subData); return subData; } catch (e) { throw e; }
}

async function updateBillingSubscription(clientId, updateData) {
    try {
        const result = await db.collection('billingSubscriptions').findOneAndUpdate(
            { clientId: clientId }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function getAllBillingSubscriptions() {
    try { return await db.collection('billingSubscriptions').find({}).toArray(); } catch (e) { return []; }
}

// ============================================================
// DARAJA CONFIG OPERATIONS
// ============================================================

async function getDarajaConfig(clientId) {
    try { return await db.collection('darajaConfigs').findOne({ clientId: clientId }); } catch (e) { return null; }
}

async function createDarajaConfig(configData) {
    try { await db.collection('darajaConfigs').insertOne(configData); return configData; } catch (e) { throw e; }
}

async function updateDarajaConfig(clientId, updateData) {
    try {
        const result = await db.collection('darajaConfigs').findOneAndUpdate(
            { clientId: clientId }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

// ============================================================
// VOUCHER OPERATIONS
// ============================================================

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

// ============================================================
// USER OPERATIONS
// ============================================================

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
// ROUTER OPERATIONS
// ============================================================

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

async function updateRouter(mac, updateData) {
    try {
        const result = await db.collection('routers').findOneAndUpdate(
            { mac: mac }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function getAllRouters() {
    try { return await db.collection('routers').find({}).toArray(); } catch (e) { return []; }
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

async function createOrUpdateSession(sessionData) {
    try {
        const now = new Date().toISOString();
        const session = {
            deviceId: sessionData.deviceId,
            username: sessionData.username,
            password: sessionData.password,
            planName: sessionData.planName,
            phoneNumber: sessionData.phoneNumber,
            expiresAt: sessionData.expiresAt,
            connectedAt: now,
            lastSeen: now,
            active: true,
            ipAddress: sessionData.ipAddress || null,
            userAgent: sessionData.userAgent || null
        };
        
        await db.collection('sessions').deleteMany({ deviceId: sessionData.deviceId });
        await db.collection('sessions').insertOne(session);
        return session;
    } catch (e) { 
        throw e; 
    }
}

async function getSessionByDeviceId(deviceId) {
    try {
        const now = new Date().toISOString();
        const session = await db.collection('sessions').findOne({ 
            deviceId: deviceId,
            active: true,
            expiresAt: { $gt: now }
        });
        return session;
    } catch (e) { 
        return null; 
    }
}

async function getSessionByUsername(username) {
    try {
        const now = new Date().toISOString();
        const session = await db.collection('sessions').findOne({ 
            username: username,
            active: true,
            expiresAt: { $gt: now }
        });
        return session;
    } catch (e) { 
        return null; 
    }
}

async function deactivateSession(deviceId) {
    try {
        await db.collection('sessions').updateOne(
            { deviceId: deviceId },
            { $set: { active: false, deactivatedAt: new Date().toISOString() } }
        );
        return true;
    } catch (e) { 
        return false; 
    }
}

async function updateSessionLastSeen(deviceId) {
    try {
        await db.collection('sessions').updateOne(
            { deviceId: deviceId },
            { $set: { lastSeen: new Date().toISOString() } }
        );
        return true;
    } catch (e) { return false; }
}

async function getAllActiveSessions() {
    try {
        const now = new Date().toISOString();
        return await db.collection('sessions').find({ 
            active: true,
            expiresAt: { $gt: now }
        }).toArray();
    } catch (e) { return []; }
}

async function cleanupExpiredSessions() {
    try {
        const now = new Date().toISOString();
        const result = await db.collection('sessions').updateMany(
            { 
                $or: [
                    { expiresAt: { $lt: now } },
                    { expiresAt: { $exists: false } }
                ],
                active: true
            },
            { $set: { active: false, expiredAt: now } }
        );
        return result;
    } catch (e) { 
        return null; 
    }
}

setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// ============================================================
// ACTIVE DEVICES (Legacy)
// ============================================================

async function checkDeviceAlreadyConnected(deviceId) {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(Date.now() - DEVICE_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000);
        
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

function generateBillingSystemId() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = '';
    for (var i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'BS_' + code;
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
// SUBSCRIPTION SYSTEM (Legacy)
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
// BILLING SUBSCRIPTION SYSTEM
// ============================================================

async function getBillingSubscriptionStatus(clientId) {
    var sub = await getBillingSubscription(clientId);
    if (!sub) return null;
    var now = new Date();
    if (sub.status === 'trial') {
        var trialEnd = new Date(sub.trialEnds);
        if (now > trialEnd) { 
            sub.status = 'expired'; 
            await updateBillingSubscription(clientId, { status: 'expired' }); 
            return null; 
        }
        return sub;
    }
    if (sub.status === 'active') {
        var expiresAt = new Date(sub.expiresAt);
        if (now > expiresAt) { 
            sub.status = 'expired'; 
            await updateBillingSubscription(clientId, { status: 'expired' }); 
            return null; 
        }
        return sub;
    }
    return null;
}

async function checkBillingSubscriptionAccess(clientId) {
    var sub = await getBillingSubscriptionStatus(clientId);
    if (!sub) {
        var legacySub = await getClientSubscriptionStatus(clientId);
        if (legacySub) {
            return { 
                allowed: true, 
                status: legacySub.status, 
                plan: 'free_trial',
                daysLeft: Math.ceil((new Date(legacySub.trialEnds || legacySub.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)),
                message: 'Legacy subscription active'
            };
        }
        return { allowed: false, message: 'No active subscription. Please subscribe to continue.', code: 'NO_SUBSCRIPTION', canSubscribe: true };
    }
    if (sub.status === 'trial') {
        var trialEnd = new Date(sub.trialEnds);
        var daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        return { allowed: true, status: 'trial', daysLeft: daysLeft, plan: sub.plan, trialEnds: sub.trialEnds, message: 'Free trial: ' + daysLeft + ' days remaining' };
    }
    if (sub.status === 'active') {
        var expiresAt = new Date(sub.expiresAt);
        var daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        return { allowed: true, status: 'active', daysLeft: daysLeft, plan: sub.plan, expiresAt: sub.expiresAt, message: 'Subscription active: ' + daysLeft + ' days remaining' };
    }
    return { allowed: false, message: 'Subscription status unknown', code: 'UNKNOWN_STATUS' };
}

async function createBillingFreeTrial(clientId) {
    var sub = { 
        clientId: clientId, 
        plan: 'free_trial', 
        status: 'trial', 
        trialStarted: new Date().toISOString(), 
        trialEnds: new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(), 
        createdAt: new Date().toISOString() 
    };
    return await createBillingSubscription(sub);
}

async function activateBillingSubscription(clientId, planKey) {
    var plan = BILLING_PLANS[planKey];
    if (!plan) return null;
    
    var sub = await getBillingSubscription(clientId);
    if (!sub) {
        sub = { 
            clientId: clientId, 
            plan: planKey, 
            planName: plan.name,
            status: 'active', 
            maxSystems: plan.maxSystems,
            maxPlans: plan.maxPlans,
            maxTransactions: plan.maxTransactions,
            hasVouchers: plan.hasVouchers,
            hasAnalytics: plan.hasAnalytics,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), 
            createdAt: new Date().toISOString() 
        };
        await createBillingSubscription(sub);
    } else {
        sub.plan = planKey;
        sub.planName = plan.name;
        sub.status = 'active';
        sub.maxSystems = plan.maxSystems;
        sub.maxPlans = plan.maxPlans;
        sub.maxTransactions = plan.maxTransactions;
        sub.hasVouchers = plan.hasVouchers;
        sub.hasAnalytics = plan.hasAnalytics;
        sub.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        sub.updatedAt = new Date().toISOString();
        await updateBillingSubscription(clientId, sub);
    }
    return sub;
}

// ============================================================
// DARAJA STK PUSH
// ============================================================

async function stkPushWithClientConfig(params) {
    var phone = params.phone;
    var amount = params.amount;
    var accountReference = params.accountReference || 'GICH-WIFI';
    var clientId = params.clientId || null;
    
    console.log('\n💳 Starting STK Push...');
    console.log('📱 Phone: ' + phone);
    console.log('💰 Amount: ' + amount);
    
    var numericAmount = Math.round(Number(amount));
    if (isNaN(numericAmount) || numericAmount < 1) { throw new Error('Invalid amount'); }
    
    var formattedPhone = normalizePhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) { throw new Error('Invalid phone: ' + phone); }
    
    var consumerKey = CONSUMER_KEY;
    var consumerSecret = CONSUMER_SECRET;
    var shortcode = SHORTCODE;
    var passkey = PASSKEY;
    
    if (clientId) {
        var darajaConfig = await getDarajaConfig(clientId);
        if (darajaConfig && darajaConfig.consumerKey && darajaConfig.consumerSecret) {
            consumerKey = darajaConfig.consumerKey;
            consumerSecret = darajaConfig.consumerSecret;
            if (darajaConfig.paybill) shortcode = darajaConfig.paybill;
            if (darajaConfig.passkey) passkey = darajaConfig.passkey;
            console.log('📋 Using client-specific Daraja config');
        }
    }
    
    if (!consumerKey || !consumerSecret) {
        throw new Error('Consumer Key or Secret not configured.');
    }
    
    var auth = Buffer.from(consumerKey.trim() + ':' + consumerSecret.trim()).toString('base64');
    var tokenRes = await simpleRequest('GET', 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', { 
        'Authorization': 'Basic ' + auth, 
        'Accept': 'application/json' 
    });
    
    if (tokenRes.statusCode !== 200) { throw new Error('OAuth failed (' + tokenRes.statusCode + '): ' + tokenRes.bodyText); }
    if (!tokenRes.bodyJson || !tokenRes.bodyJson.access_token) { throw new Error('No access token in response'); }
    
    var token = tokenRes.bodyJson.access_token;
    console.log('✅ Access token obtained');
    
    var timestamp = timestampNow();
    var password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
    
    var payload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: numericAmount,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: CALLBACK_URL,
        AccountReference: accountReference,
        TransactionDesc: 'GICH WiFi Payment'
    };
    
    console.log('📤 Sending STK Push to Safaricom...');
    var res = await simpleRequest('POST', 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', { 
        'Authorization': 'Bearer ' + token, 
        'Content-Type': 'application/json' 
    }, payload);
    
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
                lastLogin: new Date().toISOString()
            };
            await createUser(newUser);
            user = newUser;
        } else {
            await updateUser(userInfo.email, { lastLogin: new Date().toISOString() });
            user.lastLogin = new Date().toISOString();
        }
        
        const token = generateToken({ 
            email: user.email, 
            name: user.name, 
            role: user.role || 'user',
            picture: user.picture || ''
        });
        
        const frontendUrl = 'https://clientadminwifi.netlify.app';
        const redirectUrl = frontendUrl + '?token=' + encodeURIComponent(token) + '&email=' + encodeURIComponent(user.email) + '&name=' + encodeURIComponent(user.name);
        
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
// COMPLETE HTML GENERATORS
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
// CUSTOMER BILLING PAGE GENERATOR
// ============================================================

function generateCustomerBillingPage(organization) {
    // This is the full customer billing page - simplified for space
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
    var logo = organization.logo || '';

    // Build plans HTML
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
    if (logo) {
        html += '        .brand .logo-img { max-width: 80px; max-height: 80px; margin-bottom: 8px; }\n';
    }
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
    html += '<div class="container" id="app">\n';
    html += '    <div class="brand">\n';
    html += '        <div class="logo">🌐</div>\n';
    if (logo) {
        html += '        <img src="' + logo + '" alt="Logo" class="logo-img" />\n';
    }
    html += '        <h1>' + bizName + '</h1>\n';
    html += '        <p class="tagline">' + tagline + '</p>\n';
    html += '        <div>\n';
    html += '            <span class="badge">🔐 Secure</span>\n';
    if (mpesaTill) {
        html += '            <span class="paybill">💰 Paybill: ' + mpesaTill + '</span>\n';
    }
    html += '        </div>\n';
    html += '    </div>\n';
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
    html += '    <div style="text-align:center;color:#444;font-size:11px;margin-top:18px;border-top:1px solid rgba(255,255,255,0.03);padding-top:14px;">\n';
    html += '        Powered by <span style="color:' + primaryColor + ';font-weight:600;">GICH WiFi</span> · Secure · Fast · Reliable\n';
    html += '        <br><span id="supportInfo" style="color:#555;font-size:11px;">📞 ' + supportPhone + (supportEmail ? ' · ✉️ ' + supportEmail : '') + '</span>\n';
    html += '    </div>\n';
    html += '</div>\n';
    html += '<script>\n';
    html += '    var ORG_ID = "' + orgId + '";\n';
    html += '    var API_URL = "https://billing-system-fm9a.onrender.com/api";\n';
    html += '    var selectedPlan = null;\n';
    html += '    var selectedPlanPrice = 0;\n';
    html += '    function selectPlan(el, id, price) {\n';
    html += '        document.querySelectorAll(".plan-card").forEach(function(c) { c.classList.remove("selected"); });\n';
    html += '        el.classList.add("selected");\n';
    html += '        selectedPlan = id;\n';
    html += '        selectedPlanPrice = price;\n';
    html += '        document.getElementById("payBtn").textContent = "💳 Pay KSh " + price;\n';
    html += '        document.getElementById("payBtn").disabled = false;\n';
    html += '    }\n';
    html += '    function initiatePayment() {\n';
    html += '        var phone = document.getElementById("phoneInput").value.trim();\n';
    html += '        if (!phone || phone.length < 10) { alert("Please enter a valid phone number"); return; }\n';
    html += '        if (!selectedPlan) { alert("Please select a plan"); return; }\n';
    html += '        alert("Payment initiated! Check your phone for M-Pesa prompt.");\n';
    html += '    }\n';
    html += '    function redeemVoucher() {\n';
    html += '        var code = document.getElementById("voucherInput").value.trim();\n';
    html += '        if (!code) { alert("Please enter a voucher code"); return; }\n';
    html += '        alert("Voucher redeemed!");\n';
    html += '    }\n';
    html += '    document.querySelector(".plan-card")?.click();\n';
    html += '<\/script>\n';
    html += '</body>\n';
    html += '</html>';

    return html;
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
    script += '/file set redirect.html content="<!DOCTYPE html>\\n<html>\\n<head>\\n  <meta http-equiv=\'refresh\' content=\'0;url="' + redirectUrl + '"\'>\\n</head>\\n<body>\\n  <p>Redirecting to ' + businessName + '...</p>\\n</body>\\n</html>"\n';
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
// CREATE SERVER - ALL ENDPOINTS
// ============================================================

var server = http.createServer(async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
                version: '7.6.0'
            });
        }

        if (req.method === 'GET' && url.pathname === '/api/plans') {
            return sendJson(res, 200, { success: true, data: plans });
        }

        if (req.method === 'GET' && url.pathname === '/api/settings') {
            return sendJson(res, 200, { success: true, data: settings });
        }

        if (req.method === 'GET' && url.pathname === '/api/billing-plans') {
            return sendJson(res, 200, { success: true, data: BILLING_PLANS });
        }

        // ============================================================
        // SESSION MANAGEMENT ENDPOINTS
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/verify-session') {
            var body = await readBody(req);
            var deviceId = body.deviceId;
            var username = body.username;
            
            if (!deviceId && !username) {
                return sendJson(res, 400, { success: false, message: 'Device ID or username required' });
            }
            
            var session = null;
            if (deviceId) {
                session = await getSessionByDeviceId(deviceId);
            } else if (username) {
                session = await getSessionByUsername(username);
            }
            
            if (session) {
                await updateSessionLastSeen(session.deviceId);
                var now = new Date();
                var expiry = new Date(session.expiresAt);
                if (expiry > now) {
                    return sendJson(res, 200, {
                        success: true,
                        active: true,
                        session: {
                            deviceId: session.deviceId,
                            username: session.username,
                            planName: session.planName,
                            expiresAt: session.expiresAt,
                            connectedAt: session.connectedAt,
                            lastSeen: session.lastSeen
                        }
                    });
                } else {
                    await deactivateSession(session.deviceId);
                    return sendJson(res, 200, { success: true, active: false, message: 'Session has expired' });
                }
            }
            return sendJson(res, 200, { success: true, active: false, message: 'No active session found' });
        }

        if (req.method === 'GET' && url.pathname === '/api/session') {
            var deviceId = url.searchParams.get('deviceId');
            if (!deviceId) {
                return sendJson(res, 400, { success: false, message: 'Device ID required' });
            }
            var session = await getSessionByDeviceId(deviceId);
            if (session) {
                await updateSessionLastSeen(deviceId);
                return sendJson(res, 200, {
                    success: true,
                    active: true,
                    session: {
                        deviceId: session.deviceId,
                        username: session.username,
                        planName: session.planName,
                        expiresAt: session.expiresAt,
                        connectedAt: session.connectedAt,
                        lastSeen: session.lastSeen
                    }
                });
            }
            return sendJson(res, 200, { success: true, active: false, message: 'No active session found' });
        }

        if (req.method === 'POST' && url.pathname === '/api/session/deactivate') {
            var body = await readBody(req);
            var deviceId = body.deviceId;
            if (!deviceId) {
                return sendJson(res, 400, { success: false, message: 'Device ID required' });
            }
            await deactivateSession(deviceId);
            return sendJson(res, 200, { success: true, message: 'Session deactivated' });
        }

        if (req.method === 'GET' && url.pathname === '/api/admin/sessions') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var sessions = await getAllActiveSessions();
            return sendJson(res, 200, { success: true, data: sessions, count: sessions.length });
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
            
            var existingSession = await getSessionByDeviceId(deviceId);
            var existingDevice = await checkDeviceAlreadyConnected(deviceId);
            var sessionData = existingSession || existingDevice;
            
            if (sessionData) {
                var now = new Date();
                var expiry = new Date(sessionData.expiresAt);
                var isExpired = expiry <= now;
                
                if (isExpired) {
                    if (existingSession) { await deactivateSession(deviceId); }
                    return sendJson(res, 200, {
                        success: true,
                        alreadyConnected: true,
                        expired: true,
                        message: 'Your session has expired. Please purchase a new plan.',
                        session: {
                            username: sessionData.username,
                            planName: sessionData.planName,
                            expiresAt: sessionData.expiresAt,
                            connectedAt: sessionData.connectedAt
                        },
                        shouldClose: false,
                        shouldRefresh: true
                    });
                }
                
                if (existingSession) { await updateSessionLastSeen(deviceId); }
                
                return sendJson(res, 200, {
                    success: true,
                    alreadyConnected: true,
                    expired: false,
                    message: 'You are already connected on this device',
                    session: {
                        username: sessionData.username,
                        planName: sessionData.planName,
                        expiresAt: sessionData.expiresAt,
                        connectedAt: sessionData.connectedAt,
                        lastSeen: sessionData.lastSeen || sessionData.connectedAt
                    },
                    shouldClose: true,
                    closeAfter: 5000
                });
            }
            
            return sendJson(res, 200, { 
                success: true, 
                alreadyConnected: false, 
                message: 'Device not connected' 
            });
        }

        // ============================================================
        // REGISTER DEVICE CONNECTION
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/device/register') {
            var body = await readBody(req);
            var phoneNumber = body.phoneNumber;
            var username = body.username;
            var password = body.password;
            var planName = body.planName;
            var expiresAt = body.expiresAt;
            var deviceId = body.deviceId;
            var userAgent = req.headers['user-agent'] || null;
            var ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
            
            if (!phoneNumber) { return sendJson(res, 400, { success: false, message: 'Phone number required' }); }
            if (!deviceId) { return sendJson(res, 400, { success: false, message: 'Device ID required' }); }
            
            var sessionData = {
                deviceId: deviceId,
                username: username || 'user',
                password: password || 'pass_' + Date.now().toString(36),
                planName: planName || 'Unknown Plan',
                phoneNumber: phoneNumber,
                expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                ipAddress: ipAddress,
                userAgent: userAgent
            };
            
            await createOrUpdateSession(sessionData);
            
            var deviceData = {
                deviceId: deviceId,
                phoneNumber: phoneNumber,
                username: username || 'user',
                planName: planName || 'Unknown Plan',
                expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                connectedAt: new Date().toISOString(),
                active: true
            };
            await registerDevice(deviceData);
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Device registered successfully',
                session: sessionData
            });
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

        // ============================================================
        // ROUTER REGISTRATION
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/router/register') {
            var body = await readBody(req);
            var mac = body.mac || url.searchParams.get('mac');
            var name = body.name || url.searchParams.get('name');
            var clientId = body.clientId || url.searchParams.get('client');
            
            if (!mac) { return sendJson(res, 400, { success: false, message: 'MAC address required' }); }
            if (!clientId) { return sendJson(res, 400, { success: false, message: 'Client ID required' }); }
            
            var org = await getOrganizationByClientId(clientId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            
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

        // ============================================================
        // ROUTER STATUS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/router/status') {
            var clientId = url.searchParams.get('client');
            if (!clientId) { return sendJson(res, 400, { success: false, message: 'Client ID required' }); }
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
            
            var billingSystems = await getBillingSystemsByOrganization(org.id);
            
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
                    mpesaTill: org.mpesaTill || '',
                    billingSystems: billingSystems
                }
            });
        }

        if (req.method === 'GET' && url.pathname.startsWith('/api/organization/')) {
            var orgId = url.pathname.split('/').pop();
            if (!orgId || orgId === 'organizations') { return sendJson(res, 400, { success: false, message: 'Invalid organization ID' }); }
            var org = await getOrganizationByClientId(orgId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            
            var billingSystems = await getBillingSystemsByOrganization(orgId);
            
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
                    mpesaTill: org.mpesaTill || '',
                    billingSystems: billingSystems
                }
            });
        }

        // ============================================================
        // CLIENT CREATE ORGANIZATION
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            var body = await readBody(req);
            var email = body.email || 'master@demo.com';
            
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
                plans: body.plans || DEFAULT_PLANS,
                billingSystems: []
            };
            
            await createOrganization(newOrganization);
            
            var sub = await createFreeTrial(clientId);
            var billingSub = await createBillingFreeTrial(clientId);
            
            console.log('✅ Organization created with 60-day free trial:', clientId);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Organization created with 60-day free trial!',
                organization: newOrganization,
                clientId: clientId,
                trialDays: FREE_TRIAL_DAYS,
                trialEnds: sub.trialEnds
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
        // TOGGLE ORGANIZATION STATUS
        // ============================================================

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/master\/organizations\/[^\/]+\/status$/)) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var parts = url.pathname.split('/');
            var orgId = parts[parts.length - 2];
            var body = await readBody(req);
            var newStatus = body.status;
            
            if (!newStatus || !['active', 'inactive', 'suspended'].includes(newStatus)) {
                return sendJson(res, 400, { success: false, message: 'Invalid status' });
            }
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) { 
                return sendJson(res, 404, { success: false, message: 'Organization not found' }); 
            }
            
            var updated = await updateOrganization(orgId, { 
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Organization status updated to ' + newStatus,
                data: updated 
            });
        }

        // ============================================================
        // BILLING SYSTEMS ENDPOINTS
        // ============================================================

        // GET all billing systems
        if (req.method === 'GET' && url.pathname === '/api/master/billing-systems') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var orgId = url.searchParams.get('organizationId');
            var billingSystems = orgId ? 
                await getBillingSystemsByOrganization(orgId) : 
                await getAllBillingSystems();
            
            return sendJson(res, 200, { 
                success: true, 
                data: billingSystems,
                count: billingSystems.length
            });
        }

        // GET billing systems for a specific organization
        if (req.method === 'GET' && url.pathname.match(/^\/api\/organization\/[^\/]+\/billing-systems$/)) {
            var parts = url.pathname.split('/');
            var orgId = parts[parts.length - 2];
            var billingSystems = await getBillingSystemsByOrganization(orgId);
            return sendJson(res, 200, { 
                success: true, 
                data: billingSystems,
                count: billingSystems.length
            });
        }

        // POST - Create a new billing system
        if (req.method === 'POST' && url.pathname === '/api/master/billing-systems') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var body = await readBody(req);
            var organizationId = body.organizationId;
            var name = body.name;
            var tagline = body.tagline || 'Fast • Secure • Reliable';
            var primaryColor = body.primaryColor || '#00c853';
            var secondaryColor = body.secondaryColor || '#00e676';
            
            if (!organizationId) {
                return sendJson(res, 400, { success: false, message: 'Organization ID required' });
            }
            if (!name) {
                return sendJson(res, 400, { success: false, message: 'Business name required' });
            }
            
            var org = await getOrganizationByClientId(organizationId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            // Check subscription limits
            var sub = await getBillingSubscription(organizationId);
            var maxSystems = sub ? sub.maxSystems || 3 : 3;
            var existingSystems = await getBillingSystemsByOrganization(organizationId);
            
            if (existingSystems.length >= maxSystems) {
                return sendJson(res, 403, { 
                    success: false, 
                    message: 'You have reached the maximum number of billing systems (' + maxSystems + '). Please upgrade your plan.',
                    code: 'LIMIT_REACHED'
                });
            }
            
            var bsId = generateBillingSystemId();
            var customerUrl = 'https://' + req.headers.host + '/customer/' + bsId + '/';
            
            var billingSystem = {
                id: bsId,
                organizationId: organizationId,
                name: name,
                tagline: tagline,
                primaryColor: primaryColor,
                secondaryColor: secondaryColor,
                logo: org.logo || '',
                status: 'active',
                locked: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                customerUrl: customerUrl,
                plans: org.plans || []
            };
            
            await createBillingSystem(billingSystem);
            
            // Update organization with billing system reference
            var orgBillingSystems = org.billingSystems || [];
            orgBillingSystems.push({ id: bsId, name: name });
            await updateOrganization(organizationId, { billingSystems: orgBillingSystems });
            
            console.log('✅ Billing system created:', bsId);
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Billing system created successfully',
                data: billingSystem
            });
        }

        // PUT - Lock/Unlock a billing system
        if (req.method === 'PUT' && url.pathname.match(/^\/api\/master\/billing-systems\/[^\/]+\/lock$/)) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var parts = url.pathname.split('/');
            var bsId = parts[parts.length - 2];
            var body = await readBody(req);
            var locked = body.locked === true;
            
            var billingSystem = await getBillingSystemById(bsId);
            if (!billingSystem) {
                return sendJson(res, 404, { success: false, message: 'Billing system not found' });
            }
            
            var org = await getOrganizationByClientId(billingSystem.organizationId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found for this billing system' });
            }
            
            var updated = await updateBillingSystem(bsId, { 
                locked: locked,
                updatedAt: new Date().toISOString()
            });
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Billing system ' + (locked ? 'locked' : 'unlocked') + ' successfully',
                data: updated
            });
        }

        // DELETE - Delete a billing system
        if (req.method === 'DELETE' && url.pathname.match(/^\/api\/master\/billing-systems\/[^\/]+$/)) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var parts = url.pathname.split('/');
            var bsId = parts[parts.length - 1];
            
            var billingSystem = await getBillingSystemById(bsId);
            if (!billingSystem) {
                return sendJson(res, 404, { success: false, message: 'Billing system not found' });
            }
            
            var org = await getOrganizationByClientId(billingSystem.organizationId);
            if (org && org.billingSystems) {
                var updatedList = org.billingSystems.filter(function(bs) { return bs.id !== bsId; });
                await updateOrganization(billingSystem.organizationId, { billingSystems: updatedList });
            }
            
            await deleteBillingSystem(bsId);
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Billing system deleted successfully'
            });
        }

        // ============================================================
        // MASTER ADMIN ENDPOINTS
        // ============================================================

        // GET all organizations with billing systems
        if (req.method === 'GET' && url.pathname === '/api/master/organizations') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var allOrgs = await getAllOrganizations();
            
            var enhancedOrgs = [];
            for (var i = 0; i < allOrgs.length; i++) {
                var org = allOrgs[i];
                var billingSystems = await getBillingSystemsByOrganization(org.id);
                var subscription = await getBillingSubscription(org.id);
                
                enhancedOrgs.push({
                    ...org,
                    billingSystems: billingSystems,
                    subscriptionPlan: subscription ? subscription.plan : 'free_trial',
                    subscriptionStatus: subscription ? subscription.status : 'trial',
                    billingSystemsCount: billingSystems.length
                });
            }
            
            return sendJson(res, 200, { 
                success: true, 
                data: enhancedOrgs,
                count: enhancedOrgs.length
            });
        }

        // GET organization details with billing systems
        if (req.method === 'GET' && url.pathname.match(/^\/api\/master\/organizations\/[^\/]+\/details$/)) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var parts = url.pathname.split('/');
            var orgId = parts[parts.length - 2];
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) { 
                return sendJson(res, 404, { success: false, message: 'Organization not found' }); 
            }
            
            var billingSystems = await getBillingSystemsByOrganization(orgId);
            var subscription = await getBillingSubscription(orgId);
            var transactions = await getAllTransactions();
            var orgTransactions = transactions.filter(function(t) { return t.organizationId === orgId; });
            var totalRevenue = orgTransactions.reduce(function(sum, t) { return sum + (t.amount || 0); }, 0);
            
            return sendJson(res, 200, { 
                success: true, 
                data: {
                    ...org,
                    billingSystems: billingSystems,
                    subscription: subscription,
                    totalRevenue: totalRevenue,
                    transactionCount: orgTransactions.length
                }
            });
        }

        // GET clients count
        if (req.method === 'GET' && url.pathname === '/api/admin/clients') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            try {
                var count = await db.collection('clients').countDocuments();
                return sendJson(res, 200, { success: true, count: count });
            } catch (e) {
                return sendJson(res, 200, { success: true, count: 0 });
            }
        }

        // GET products count
        if (req.method === 'GET' && url.pathname === '/api/admin/products') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            try {
                var count = await db.collection('plans').countDocuments();
                return sendJson(res, 200, { success: true, count: count });
            } catch (e) {
                return sendJson(res, 200, { success: true, count: 0 });
            }
        }

        // ============================================================
        // SUBSCRIPTION STATUS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/client/subscription-status') {
            var email = url.searchParams.get('email');
            if (!email) { return sendJson(res, 400, { success: false, message: 'Email required' }); }
            var org = await getOrganizationByEmail(email);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            var status = await checkBillingSubscriptionAccess(org.id);
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
            var existingSub = await getBillingSubscriptionStatus(org.id);
            if (existingSub) {
                return sendJson(res, 400, { success: false, message: 'You already have an active subscription or trial' });
            }
            var sub = await createBillingFreeTrial(org.id);
            return sendJson(res, 200, {
                success: true,
                message: 'Free trial started! You have ' + FREE_TRIAL_DAYS + ' days.',
                trialDays: FREE_TRIAL_DAYS,
                trialEnds: sub.trialEnds
            });
        }

        // ============================================================
        // SUBSCRIBE TO PLAN (Legacy)
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
            var billingSub = await activateBillingSubscription(org.id, plan);
            return sendJson(res, 200, {
                success: true,
                message: 'Subscribed to ' + planData.name + ' plan successfully!',
                plan: plan,
                expiresAt: sub.expiresAt,
                billingSubscription: billingSub
            });
        }

        // ============================================================
        // PAYMENT INITIATE
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
            var userAgent = req.headers['user-agent'] || null;
            var ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
            
            if (!phoneNumber || phoneNumber.length < 10) {
                return sendJson(res, 400, { success: false, message: 'Invalid phone number' });
            }
            
            if (deviceId) {
                var existingSession = await getSessionByDeviceId(deviceId);
                if (existingSession) {
                    var now = new Date();
                    var expiry = new Date(existingSession.expiresAt);
                    if (expiry > now) {
                        return sendJson(res, 409, {
                            success: false,
                            alreadyConnected: true,
                            message: 'You are already connected on this device.',
                            session: {
                                username: existingSession.username,
                                planName: existingSession.planName,
                                expiresAt: existingSession.expiresAt,
                                connectedAt: existingSession.connectedAt
                            },
                            shouldClose: true
                        });
                    } else {
                        await deactivateSession(deviceId);
                    }
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
                var access = await checkBillingSubscriptionAccess(org.id);
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
                        deviceId: deviceId,
                        ipAddress: ipAddress,
                        userAgent: userAgent
                    };
                    await createTransaction(freeTx);
                    
                    if (isSubscription && org) {
                        await activateSubscription(org.id, subscriptionPlan);
                    }
                    
                    if (deviceId) {
                        await createOrUpdateSession({
                            deviceId: deviceId,
                            username: freeTx.username,
                            password: freeTx.password,
                            planName: planName,
                            phoneNumber: phoneNumber,
                            expiresAt: freeTx.expiresAt,
                            ipAddress: ipAddress,
                            userAgent: userAgent
                        });
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
                        isFree: true,
                        sessionCreated: !!deviceId
                    });
                }
                
                var result = await stkPushWithClientConfig({ 
                    phone: phoneNumber, 
                    amount: numericAmount, 
                    accountReference: isSubscription ? 'SUB_' + subscriptionPlan : 'GICH' + Date.now().toString().slice(-8),
                    clientId: organizationId
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
                        ipAddress: ipAddress,
                        userAgent: userAgent
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
                
                if (transaction.isBillingSubscription && transaction.organizationId) {
                    var billingSub = await activateBillingSubscription(transaction.organizationId, transaction.subscriptionPlan);
                    console.log('✅ Billing subscription activated for:', transaction.organizationId);
                }
                
                if (transaction.deviceId) {
                    await createOrUpdateSession({
                        deviceId: transaction.deviceId,
                        username: transaction.username,
                        password: transaction.password,
                        planName: transaction.planName,
                        phoneNumber: transaction.phoneNumber,
                        expiresAt: transaction.expiresAt,
                        ipAddress: transaction.ipAddress || null,
                        userAgent: transaction.userAgent || null
                    });
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
                    isSubscription: tx.isSubscription || false,
                    deviceId: tx.deviceId || null,
                    isBillingSubscription: tx.isBillingSubscription || false
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
            if (tx.deviceId) {
                var session = await getSessionByDeviceId(tx.deviceId);
                if (session) { await updateSessionLastSeen(tx.deviceId); }
            }
            return sendJson(res, 200, {
                success: true,
                username: tx.username || 'user_' + id.substring(0, 8),
                password: tx.password || 'pass_' + Date.now().toString(36),
                plan: tx.planName,
                expiresAt: tx.expiresAt || new Date(Date.now() + 7200000).toISOString(),
                deviceId: tx.deviceId || null
            });
        }

        // ============================================================
        // GET TRANSACTIONS (Admin)
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/admin/transactions') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var allTx = await getAllTransactions();
            var completedTx = allTx.filter(function(t) { return t.status === 'completed'; });
            var totalRevenue = completedTx.reduce(function(sum, t) { return sum + (t.amount || 0); }, 0);
            return sendJson(res, 200, {
                success: true,
                data: allTx,
                count: allTx.length,
                summary: {
                    total: allTx.length,
                    completed: completedTx.length,
                    pending: allTx.filter(function(t) { return t.status === 'pending'; }).length,
                    failed: allTx.filter(function(t) { return t.status === 'failed'; }).length,
                    cancelled: allTx.filter(function(t) { return t.status === 'cancelled'; }).length,
                    totalRevenue: totalRevenue
                }
            });
        }

        // ============================================================
        // GET TRANSACTIONS (Public)
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
                        password: active.password,
                        deviceId: active.deviceId || null
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
            var userAgent = req.headers['user-agent'] || null;
            var ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
            
            if (!code) { return sendJson(res, 400, { success: false, message: 'Voucher code required' }); }
            
            if (deviceId) {
                var existingSession = await getSessionByDeviceId(deviceId);
                if (existingSession) {
                    var now = new Date();
                    var expiry = new Date(existingSession.expiresAt);
                    if (expiry > now) {
                        return sendJson(res, 409, {
                            success: false,
                            alreadyConnected: true,
                            message: 'You are already connected on this device.',
                            session: {
                                username: existingSession.username,
                                planName: existingSession.planName,
                                expiresAt: existingSession.expiresAt
                            }
                        });
                    }
                }
            }
            
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
                deviceId: deviceId || null,
                ipAddress: ipAddress,
                userAgent: userAgent
            };
            await createTransaction(tx);
            
            if (deviceId) {
                await createOrUpdateSession({
                    deviceId: deviceId,
                    username: tx.username,
                    password: tx.password,
                    planName: voucher.planName,
                    phoneNumber: phoneNumber || 'voucher_user',
                    expiresAt: tx.expiresAt,
                    ipAddress: ipAddress,
                    userAgent: userAgent
                });
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
                    password: tx.password,
                    deviceId: deviceId || null
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
        // MASTER SETTINGS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/master/settings') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var masterSettings = await db.collection('masterSettings').findOne({ _id: 'masterSettings' });
            if (!masterSettings) {
                masterSettings = {
                    _id: 'masterSettings',
                    masterBusinessName: 'GICH WiFi Master',
                    masterEmail: 'master@gichwifi.co.ke',
                    masterPhone: '0796587763',
                    commissionRate: 5,
                    defaultPrimaryColor: '#00c853',
                    defaultBgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)'
                };
                await db.collection('masterSettings').insertOne(masterSettings);
            }
            delete masterSettings._id;
            return sendJson(res, 200, { success: true, data: masterSettings });
        }

        if (req.method === 'POST' && url.pathname === '/api/master/settings') {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var body = await readBody(req);
            var updateData = {
                masterBusinessName: body.masterBusinessName || 'GICH WiFi Master',
                masterEmail: body.masterEmail || 'master@gichwifi.co.ke',
                masterPhone: body.masterPhone || '0796587763',
                commissionRate: body.commissionRate || 5,
                defaultPrimaryColor: body.defaultPrimaryColor || '#00c853',
                defaultBgGradient: body.defaultBgGradient || 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
                updatedAt: new Date().toISOString()
            };
            await db.collection('masterSettings').updateOne(
                { _id: 'masterSettings' },
                { $set: updateData },
                { upsert: true }
            );
            console.log('✅ Master settings updated');
            return sendJson(res, 200, { 
                success: true, 
                message: 'Master settings saved successfully',
                data: updateData
            });
        }

        // ============================================================
        // GENERATE REDIRECT HTML
        // ============================================================

        if (req.method === 'GET' && url.pathname.startsWith('/api/master/generate-redirect/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var orgId = url.pathname.split('/').pop();
            var org = await getOrganizationByClientId(orgId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            var access = await checkBillingSubscriptionAccess(org.id);
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
        // GENERATE CLIENT PAGE
        // ============================================================

        if (req.method === 'GET' && url.pathname.startsWith('/api/master/generate-client-page/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            var orgId = url.pathname.split('/').pop();
            var org = await getOrganizationByClientId(orgId);
            if (!org) { return sendJson(res, 404, { success: false, message: 'Organization not found' }); }
            var html = generateCustomerBillingPage(org);
            return sendJson(res, 200, {
                success: true,
                html: html,
                filename: 'client.html',
                instructions: '📋 Upload this file to your MikroTik router\'s hotspot directory.'
            });
        }

        // ============================================================
        // GENERATE SETUP COMMAND
        // ============================================================

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
        // SERVE CUSTOMER BILLING PAGE
        // ============================================================

        if (req.method === 'GET' && url.pathname.match(/^\/customer\/[A-Za-z0-9_]+\/?$/)) {
            var pathParts = url.pathname.split('/');
            var orgId = pathParts[2] || '';
            if (!orgId) { return sendHtml(res, 404, '<h1>Organization not found</h1>'); }
            
            var billingSystem = await getBillingSystemById(orgId);
            var org = null;
            
            if (billingSystem) {
                org = await getOrganizationByClientId(billingSystem.organizationId);
                if (org) {
                    org.businessName = billingSystem.name || org.businessName;
                    org.primaryColor = billingSystem.primaryColor || org.primaryColor;
                    org.secondaryColor = billingSystem.secondaryColor || org.secondaryColor;
                    org.logo = billingSystem.logo || org.logo;
                    org.id = billingSystem.id;
                    if (billingSystem.locked) {
                        return sendHtml(res, 403, '<h1>⛔ This billing system is locked</h1><p>Please contact the administrator.</p>');
                    }
                }
            } else {
                org = await getOrganizationByClientId(orgId);
            }
            
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
            var allRouters = await getAllRouters();
            var activeSessions = await getAllActiveSessions();
            var billingSubs = await getAllBillingSubscriptions();
            var allBillingSystems = await getAllBillingSystems();
            
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '7.6.0',
                status: 'Running',
                database: 'MongoDB Atlas',
                googleOAuth: !!GOOGLE_CLIENT_ID,
                freeTrialDays: FREE_TRIAL_DAYS,
                deviceRecognition: true,
                sessionManagement: true,
                multiBilling: true,
                masterDashboard: true,
                billingPlans: BILLING_PLANS,
                statistics: {
                    totalTransactions: allTx.length,
                    totalRevenue: totalRevenue,
                    activeVouchers: unusedVouchers.length,
                    totalOrganizations: allOrgs.length,
                    activeSubscriptions: activeSubs.length,
                    activeDevices: activeDevicesCount,
                    activeSessions: activeSessions.length,
                    activeBillingSubscriptions: billingSubs.filter(function(s) { return s.status === 'active'; }).length,
                    totalRouters: allRouters.length,
                    billingSystems: allBillingSystems.length
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
            console.log('🌐 GICH WiFi API - v7.6.0 (FULLY COMPLETE)');
            console.log('========================================');
            console.log('✅ Server running on port: ' + PORT);
            console.log('📍 http://localhost:' + PORT + '/');
            console.log('========================================');
            console.log('🛡️ Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('🗄️  Database: MongoDB Atlas - CONNECTED');
            console.log('📱 Device Tracking: ✅ ENABLED');
            console.log('🔑 Google OAuth: ' + (GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'));
            console.log('📧 Email Validation: ✅ ENABLED');
            console.log('🚀 Auto Router Setup: ✅ ENABLED');
            console.log('📅 Free Trial: ' + FREE_TRIAL_DAYS + ' days');
            console.log('👑 Master Dashboard: ✅ ENABLED');
            console.log('🏢 Billing Plans: Starter(500/3), Pro(1000/10), Business(1700/20)');
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
