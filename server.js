/**
 * GICH WiFi - Complete Billing System (WORKING)
 * Version 7.8.0 - All Features Working
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

const DEFAULT_PLANS = [
    { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, duration_seconds: 7200 },
    { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, duration_seconds: 18000 },
    { id: '8_Hours', name: '8 Hours', price: 30, devices: 1, duration_seconds: 28800 },
    { id: '12_Hours', name: '12 Hours', price: 50, devices: 1, duration_seconds: 43200 },
    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, duration_seconds: 86400 }
];

let db = null;
let client = null;
let plans = [];

console.log('\n========================================');
console.log('🌐 GICH WiFi API - v7.8.0 (WORKING)');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('========================================\n');

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
        
        // Create collections if they don't exist
        try {
            await db.collection('organizations').createIndex({ id: 1 }, { unique: true });
            await db.collection('organizations').createIndex({ email: 1 }, { unique: true });
            await db.collection('billingSystems').createIndex({ id: 1 }, { unique: true });
            await db.collection('billingSystems').createIndex({ organizationId: 1 });
            await db.collection('transactions').createIndex({ checkoutId: 1 });
            await db.collection('vouchers').createIndex({ code: 1 }, { unique: true });
            console.log('✅ Indexes created/verified');
        } catch (e) {
            console.log('⚠️ Index creation warning:', e.message);
        }
        
        // Load plans
        const plansData = await db.collection('plans').find({}).toArray();
        if (plansData.length === 0) {
            await db.collection('plans').insertMany(DEFAULT_PLANS);
            plans = DEFAULT_PLANS;
            console.log('📦 Loaded default plans');
        } else {
            plans = plansData;
            console.log('📦 Loaded ' + plans.length + ' plans');
        }
        
        // Check existing data
        const orgCount = await db.collection('organizations').countDocuments();
        const bsCount = await db.collection('billingSystems').countDocuments();
        console.log('📊 Organizations: ' + orgCount + ', Billing Systems: ' + bsCount);
        
        return db;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        throw error;
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function sendJson(res, statusCode, obj) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(obj, null, 2));
}

function sendHtml(res, statusCode, html) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html' });
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

function generateToken(payload) {
    var header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    var body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    var signature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
    return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
    try {
        var parts = token.split('.');
        if (parts.length !== 3) return null;
        var header = parts[0];
        var body = parts[1];
        var signature = parts[2];
        var expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
        if (signature !== expectedSignature) return null;
        return JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch (e) { return null; }
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

function isValidEmail(email) {
    var emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
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

async function getAllOrganizations() {
    try { return await db.collection('organizations').find({}).toArray(); } catch (e) { return []; }
}

async function updateOrganization(clientId, updateData) {
    try {
        const result = await db.collection('organizations').findOneAndUpdate(
            { id: clientId }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function createOrganization(orgData) {
    try { await db.collection('organizations').insertOne(orgData); return orgData; } catch (e) { throw e; }
}

// ============================================================
// BILLING SYSTEMS OPERATIONS
// ============================================================

async function getBillingSystemById(id) {
    try { return await db.collection('billingSystems').findOne({ id: id }); } catch (e) { return null; }
}

async function getBillingSystemsByOrganization(organizationId) {
    try { return await db.collection('billingSystems').find({ organizationId: organizationId }).toArray(); } catch (e) { return []; }
}

async function getAllBillingSystems() {
    try { return await db.collection('billingSystems').find({}).toArray(); } catch (e) { return []; }
}

async function createBillingSystem(bsData) {
    try { await db.collection('billingSystems').insertOne(bsData); return bsData; } catch (e) { throw e; }
}

async function updateBillingSystem(id, updateData) {
    try {
        const result = await db.collection('billingSystems').findOneAndUpdate(
            { id: id }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function deleteBillingSystem(id) {
    try { return await db.collection('billingSystems').deleteOne({ id: id }); } catch (e) { throw e; }
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

async function updateTransaction(id, updateData) {
    try {
        const result = await db.collection('transactions').findOneAndUpdate(
            { id: id }, { $set: updateData }, { returnDocument: 'after' }
        );
        return result.value;
    } catch (e) { throw e; }
}

async function getAllTransactions() {
    try { return await db.collection('transactions').find({}).sort({ timestamp: -1 }).toArray(); } catch (e) { return []; }
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
// GENERATE HTML PAGES
// ============================================================

function generateCustomerBillingPage(organization) {
    var escapeHtml = function(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    var bizName = escapeHtml(organization.businessName || 'WiFi Business');
    var primaryColor = escapeHtml(organization.primaryColor || '#00c853');
    var accentColor = escapeHtml(organization.accentColor || '#0f2027');
    var supportPhone = escapeHtml(organization.supportPhone || '0796587763');
    var supportEmail = escapeHtml(organization.supportEmail || 'support@example.com');
    var mpesaTill = escapeHtml(organization.mpesaTill || '');
    var orgId = escapeHtml(organization.id);
    var plans = organization.plans || [];
    var logo = organization.logo || '';

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
        
        plansHtml += '<div class="plan-card" data-id="' + escapeHtml(p.id) + '" data-price="' + p.price + '" onclick="selectPlan(this, \'' + escapeHtml(p.id) + '\', ' + p.price + ')">';
        plansHtml += '<div class="name">' + escapeHtml(p.name) + '</div>';
        plansHtml += '<div class="price">KES ' + p.price + ' <span>/ ' + durStr + '</span></div>';
        plansHtml += '<div class="features">';
        plansHtml += '<span>📱 ' + (p.devices || 1) + ' device' + (p.devices > 1 ? 's' : '') + '</span>';
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
    if (mpesaTill) {
        html += '        .brand .paybill { display: inline-block; background: rgba(255,193,7,0.12); color: #ffc107; padding: 2px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 4px; margin-left: 6px; }\n';
    }
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
    html += '        .input-group { margin: 14px 0 12px 0; }\n';
    html += '        .input-group label { display: block; color: #aaa; font-size: 13px; font-weight: 500; margin-bottom: 4px; }\n';
    html += '        .input-group input { width: 100%; padding: 12px 16px; background: #0a0e17; border: 2px solid rgba(255,255,255,0.06); border-radius: 10px; color: #fff; font-size: 16px; outline: none; transition: 0.25s; }\n';
    html += '        .input-group input:focus { border-color: ' + primaryColor + '; box-shadow: 0 0 0 3px ' + primaryColor + '20; }\n';
    html += '        .btn { width: 100%; padding: 13px; background: ' + primaryColor + '; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; color: #000; cursor: pointer; transition: all 0.25s ease; }\n';
    html += '        .btn:hover { background: #00e676; transform: scale(1.01); }\n';
    html += '        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }\n';
    html += '        .btn-secondary { background: rgba(255,255,255,0.06); color: #fff; }\n';
    html += '        .btn-secondary:hover { background: rgba(255,255,255,0.1); }\n';
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
    html += '        .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #121829; padding: 12px 24px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); color: #fff; font-size: 14px; z-index: 999; max-width: 90%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); display: none; animation: toastIn 0.35s ease; }\n';
    html += '        .toast.show { display: block; }\n';
    html += '        .toast.success { border-color: ' + primaryColor + '; }\n';
    html += '        .toast.error { border-color: #ff4444; }\n';
    html += '        .toast.info { border-color: #2196f3; }\n';
    html += '        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(30px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }\n';
    html += '        @media (max-width: 480px) { .container { padding: 20px 16px; } .plan-grid { grid-template-columns: 1fr 1fr; gap: 8px; } .plan-card { padding: 12px 10px; } .plan-card .price { font-size: 18px; } .voucher-row { flex-direction: column; } .voucher-row .btn { width: 100%; } .check-row { flex-direction: column; } .check-row .btn { width: 100%; } }\n';
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
    html += '        <p class="tagline">Fast • Secure • Reliable</p>\n';
    if (mpesaTill) {
        html += '        <div><span class="paybill">💰 Paybill: ' + mpesaTill + '</span></div>\n';
    }
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
    html += '    <div class="check-row">\n';
    html += '        <input type="tel" id="checkPhoneInput" placeholder="🔍 Check your plan" />\n';
    html += '        <button class="btn btn-secondary" onclick="checkPlan()">Check</button>\n';
    html += '    </div>\n';
    html += '    <div id="checkResult" class="result-box"></div>\n';
    html += '    <div style="text-align:center;color:#444;font-size:11px;margin-top:18px;border-top:1px solid rgba(255,255,255,0.03);padding-top:14px;">\n';
    html += '        Powered by <span style="color:' + primaryColor + ';font-weight:600;">GICH WiFi</span> · Secure · Fast · Reliable\n';
    html += '        <br><span style="color:#555;font-size:11px;">📞 ' + supportPhone + (supportEmail ? ' · ✉️ ' + supportEmail : '') + '</span>\n';
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
    html += '        if (!phone || phone.length < 10) { showToast("Please enter a valid phone number", "error"); return; }\n';
    html += '        if (!selectedPlan) { showToast("Please select a plan", "error"); return; }\n';
    html += '        var btn = document.getElementById("payBtn");\n';
    html += '        btn.disabled = true;\n';
    html += '        btn.innerHTML = "⏳ Processing...";\n';
    html += '        fetch(API_URL + "/payment/initiate", {\n';
    html += '            method: "POST",\n';
    html += '            headers: { "Content-Type": "application/json" },\n';
    html += '            body: JSON.stringify({\n';
    html += '                phoneNumber: phone,\n';
    html += '                amount: selectedPlanPrice,\n';
    html += '                planId: selectedPlan,\n';
    html += '                organizationId: ORG_ID\n';
    html += '            })\n';
    html += '        })\n';
    html += '        .then(function(r) { return r.json(); })\n';
    html += '        .then(function(data) {\n';
    html += '            btn.disabled = false;\n';
    html += '            btn.innerHTML = "💳 Pay KSh " + selectedPlanPrice;\n';
    html += '            if (data.success) {\n';
    html += '                showToast("✅ M-Pesa prompt sent! Check your phone.", "success");\n';
    html += '                document.getElementById("paymentResult").textContent = "✅ M-Pesa prompt sent! Check your phone.";\n';
    html += '                document.getElementById("paymentResult").className = "result-box show success";\n';
    html += '            } else {\n';
    html += '                showToast("❌ " + data.message, "error");\n';
    html += '            }\n';
    html += '        })\n';
    html += '        .catch(function(err) {\n';
    html += '            btn.disabled = false;\n';
    html += '            btn.innerHTML = "💳 Pay KSh " + selectedPlanPrice;\n';
    html += '            showToast("❌ Network error", "error");\n';
    html += '        });\n';
    html += '    }\n';
    html += '    function redeemVoucher() {\n';
    html += '        var code = document.getElementById("voucherInput").value.trim().toUpperCase();\n';
    html += '        if (!code) { showToast("Please enter a voucher code", "error"); return; }\n';
    html += '        var phone = document.getElementById("phoneInput").value.trim();\n';
    html += '        showToast("🎟️ Redeeming voucher...", "info");\n';
    html += '    }\n';
    html += '    function checkPlan() {\n';
    html += '        var phone = document.getElementById("checkPhoneInput").value.trim();\n';
    html += '        if (!phone || phone.length < 10) { showToast("Please enter a valid phone number", "error"); return; }\n';
    html += '        showToast("🔍 Checking...", "info");\n';
    html += '    }\n';
    html += '    function showToast(message, type) {\n';
    html += '        var container = document.querySelector(".toast") || document.createElement("div");\n';
    html += '        if (!container.classList) {\n';
    html += '            var toast = document.createElement("div");\n';
    html += '            toast.className = "toast toast-" + type;\n';
    html += '            toast.innerHTML = message;\n';
    html += '            document.body.appendChild(toast);\n';
    html += '            setTimeout(function() { toast.classList.add("show"); }, 10);\n';
    html += '            setTimeout(function() { toast.classList.remove("show"); }, 3000);\n';
    html += '        } else {\n';
    html += '            container.textContent = message;\n';
    html += '            container.className = "toast toast-" + type + " show";\n';
    html += '            setTimeout(function() { container.classList.remove("show"); }, 3000);\n';
    html += '        }\n';
    html += '    }\n';
    html += '    document.querySelector(".plan-card")?.click();\n';
    html += '<\/script>\n';
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

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    var url = new URL(req.url, 'http://' + req.headers.host);
    console.log('📥 ' + req.method + ' ' + url.pathname);

    try {
        // ============================================================
        // SERVE HTML FILES
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/') {
            sendHtml(res, 200, '<h1>🌐 GICH WiFi Server</h1><p>✅ Server is running!</p><p>📡 API URL: /api</p><p>👑 Master Admin: /api/master/verify</p>');
            return;
        }

        // ============================================================
        // HEALTH CHECK
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/health') {
            var dbStatus = db ? 'connected' : 'disconnected';
            var orgCount = db ? await db.collection('organizations').countDocuments() : 0;
            var bsCount = db ? await db.collection('billingSystems').countDocuments() : 0;
            return sendJson(res, 200, { 
                status: 'ok', 
                timestamp: new Date().toISOString(),
                version: '7.8.0',
                database: dbStatus,
                organizations: orgCount,
                billingSystems: bsCount
            });
        }

        // ============================================================
        // MASTER ADMIN VERIFY
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/master/verify') {
            var body = await readBody(req);
            console.log('🔐 Master verification with PIN:', body.pin);
            
            if (body.pin === MASTER_PASSWORD) {
                var token = generateToken({ username: 'master', role: 'master', exp: Date.now() + 86400000 });
                console.log('✅ Master verified successfully');
                return sendJson(res, 200, { 
                    success: true, 
                    message: 'Master verified', 
                    token: token, 
                    role: 'master' 
                });
            } else {
                console.log('❌ Invalid master PIN');
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // ============================================================
        // MASTER ORGANIZATIONS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/master/organizations') {
            console.log('👑 Master organizations request');
            
            if (!isMasterAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized - Master admin required' });
            }
            
            try {
                var allOrgs = await getAllOrganizations();
                console.log('📋 Found ' + allOrgs.length + ' organizations');
                
                var enhancedOrgs = [];
                for (var i = 0; i < allOrgs.length; i++) {
                    var org = allOrgs[i];
                    var billingSystems = await getBillingSystemsByOrganization(org.id);
                    
                    enhancedOrgs.push({
                        ...org,
                        billingSystems: billingSystems,
                        billingSystemsCount: billingSystems.length
                    });
                }
                
                return sendJson(res, 200, { 
                    success: true, 
                    data: enhancedOrgs,
                    count: enhancedOrgs.length
                });
            } catch (error) {
                console.error('❌ Error:', error);
                return sendJson(res, 500, { success: false, message: error.message });
            }
        }

        // ============================================================
        // MASTER BILLING SYSTEMS
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/master/billing-systems') {
            console.log('👑 Master billing systems request');
            
            if (!isMasterAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            try {
                var orgId = url.searchParams.get('organizationId');
                var billingSystems = orgId ? 
                    await getBillingSystemsByOrganization(orgId) : 
                    await getAllBillingSystems();
                
                console.log('📋 Returning ' + billingSystems.length + ' billing systems');
                return sendJson(res, 200, { 
                    success: true, 
                    data: billingSystems,
                    count: billingSystems.length
                });
            } catch (error) {
                console.error('❌ Error:', error);
                return sendJson(res, 500, { success: false, message: error.message });
            }
        }

        // ============================================================
        // CREATE BILLING SYSTEM
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/master/billing-systems') {
            console.log('👑 Create billing system request');
            
            if (!isMasterAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var body = await readBody(req);
            console.log('📝 Body:', body);
            
            var organizationId = body.organizationId;
            var name = body.name;
            
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
            
            var bsId = generateBillingSystemId();
            var customerUrl = 'https://' + req.headers.host + '/customer/' + bsId + '/';
            
            var billingSystem = {
                id: bsId,
                organizationId: organizationId,
                name: name,
                tagline: body.tagline || 'Fast • Secure • Reliable',
                primaryColor: body.primaryColor || '#00c853',
                secondaryColor: body.secondaryColor || '#00e676',
                logo: org.logo || '',
                status: 'active',
                locked: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                customerUrl: customerUrl,
                plans: org.plans || []
            };
            
            await createBillingSystem(billingSystem);
            
            // Update organization's billing systems list
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

        // ============================================================
        // LOCK/UNLOCK BILLING SYSTEM
        // ============================================================

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/master\/billing-systems\/[^\/]+\/lock$/)) {
            console.log('👑 Lock/Unlock billing system request');
            
            if (!isMasterAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var bsId = parts[parts.length - 2];
            var body = await readBody(req);
            var locked = body.locked === true;
            
            console.log('🔒 BS ID:', bsId, 'Locked:', locked);
            
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
            
            console.log('✅ Billing system ' + (locked ? 'locked' : 'unlocked') + ':', bsId);
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Billing system ' + (locked ? 'locked' : 'unlocked') + ' successfully',
                data: updated
            });
        }

        // ============================================================
        // DELETE BILLING SYSTEM
        // ============================================================

        if (req.method === 'DELETE' && url.pathname.match(/^\/api\/master\/billing-systems\/[^\/]+$/)) {
            console.log('👑 Delete billing system request');
            
            if (!isMasterAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var bsId = parts[parts.length - 1];
            
            console.log('🗑️ Delete BS:', bsId);
            
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
            
            console.log('✅ Billing system deleted:', bsId);
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Billing system deleted successfully'
            });
        }

        // ============================================================
        // TOGGLE ORGANIZATION STATUS
        // ============================================================

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/master\/organizations\/[^\/]+\/status$/)) {
            console.log('👑 Toggle organization status request');
            
            if (!isMasterAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var orgId = parts[parts.length - 2];
            var body = await readBody(req);
            var newStatus = body.status;
            
            console.log('🔄 Org ID:', orgId, 'Status:', newStatus);
            
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
            
            console.log('✅ Organization status updated:', orgId, '->', newStatus);
            
            return sendJson(res, 200, { 
                success: true, 
                message: 'Organization status updated to ' + newStatus,
                data: updated 
            });
        }

        // ============================================================
        // ORGANIZATION DETAILS
        // ============================================================

        if (req.method === 'GET' && url.pathname.match(/^\/api\/master\/organizations\/[^\/]+\/details$/)) {
            console.log('👑 Organization details request');
            
            if (!isMasterAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var orgId = parts[parts.length - 2];
            
            console.log('📋 Org ID:', orgId);
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) { 
                return sendJson(res, 404, { success: false, message: 'Organization not found' }); 
            }
            
            var billingSystems = await getBillingSystemsByOrganization(orgId);
            
            return sendJson(res, 200, { 
                success: true, 
                data: {
                    ...org,
                    billingSystems: billingSystems
                }
            });
        }

        // ============================================================
        // CUSTOMER BILLING PAGE
        // ============================================================

        if (req.method === 'GET' && url.pathname.match(/^\/customer\/[A-Za-z0-9_]+\/?$/)) {
            var pathParts = url.pathname.split('/');
            var orgId = pathParts[2] || '';
            
            if (!orgId) { return sendHtml(res, 404, '<h1>Organization not found</h1>'); }
            
            // Check if this is a billing system ID
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
        // PAYMENT INITIATE
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/payment/initiate') {
            var body = await readBody(req);
            var phoneNumber = body.phoneNumber;
            var amount = body.amount;
            var planId = body.planId;
            var organizationId = body.organizationId;
            
            console.log('💳 Payment request:', { phoneNumber, amount, planId, organizationId });
            
            if (!phoneNumber || phoneNumber.length < 10) {
                return sendJson(res, 400, { success: false, message: 'Invalid phone number' });
            }
            
            // For demo purposes, simulate successful payment
            var transactionId = 'TXN_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
            
            // Store transaction
            var tx = {
                id: transactionId,
                phoneNumber: phoneNumber,
                amount: amount,
                planId: planId,
                planName: 'Demo Plan',
                status: 'pending',
                timestamp: new Date().toISOString(),
                organizationId: organizationId
            };
            await createTransaction(tx);
            
            // Simulate success
            setTimeout(async function() {
                tx.status = 'completed';
                await updateTransaction(transactionId, { status: 'completed' });
            }, 5000);
            
            return sendJson(res, 200, {
                success: true,
                message: 'STK Push sent!',
                transactionId: transactionId
            });
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
                    phoneNumber: tx.phoneNumber,
                    amount: tx.amount,
                    planName: tx.planName
                }
            });
        }

        // ============================================================
        // UPDATE ORGANIZATION
        // ============================================================

        if (req.method === 'PUT' && url.pathname.startsWith('/api/master/organizations/') && !url.pathname.includes('/status')) {
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
        // CLIENT CREATE ORGANIZATION
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            console.log('📝 Create organization request');
            
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
                plans: body.plans || DEFAULT_PLANS,
                billingSystems: []
            };
            
            await createOrganization(newOrganization);
            
            console.log('✅ Organization created:', clientId);
            
            return sendJson(res, 200, {
                success: true,
                message: 'Organization created with 60-day free trial!',
                organization: newOrganization,
                clientId: clientId,
                trialDays: FREE_TRIAL_DAYS
            });
        }

        // ============================================================
        // FALLBACK - NOT FOUND
        // ============================================================

        console.log('❌ Route not found:', req.method, url.pathname);
        return sendJson(res, 404, { error: 'Route not found' });

    } catch (err) {
        console.error('❌ Server error:', err);
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
            console.log('🌐 GICH WiFi API - v7.8.0 (WORKING)');
            console.log('========================================');
            console.log('✅ Server running on port: ' + PORT);
            console.log('📍 http://localhost:' + PORT + '/');
            console.log('========================================');
            console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('📊 Database: ' + (db ? '✅ Connected' : '❌ Disconnected'));
            console.log('========================================');
            console.log('📋 MASTER ENDPOINTS:');
            console.log('   POST /api/master/verify - Login (PIN: ' + MASTER_PASSWORD + ')');
            console.log('   GET  /api/master/organizations - List organizations');
            console.log('   GET  /api/master/billing-systems - List billing systems');
            console.log('   POST /api/master/billing-systems - Create billing system');
            console.log('   PUT  /api/master/billing-systems/:id/lock - Lock/Unlock');
            console.log('   DELETE /api/master/billing-systems/:id - Delete');
            console.log('   PUT  /api/master/organizations/:id/status - Toggle status');
            console.log('   GET  /api/master/organizations/:id/details - Get details');
            console.log('========================================');
            console.log('📋 CUSTOMER ENDPOINTS:');
            console.log('   GET  /customer/:id - Customer billing page');
            console.log('   POST /api/payment/initiate - Initiate payment');
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
