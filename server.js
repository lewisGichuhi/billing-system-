/**
 * GICH WiFi - Complete Backend with Aggregator Payment Support
 * Supports Test & Production Modes
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
        },
        jambopay: {
            name: 'JamboPay',
            feePercent: 2.5,
            test: {
                apiKey: process.env.JAMBOPAY_TEST_API_KEY || 'test_jambopay_key',
                apiSecret: process.env.JAMBOPAY_TEST_API_SECRET || 'test_jambopay_secret',
                baseUrl: 'https://sandbox.jambopay.com/v1'
            },
            production: {
                apiKey: process.env.JAMBOPAY_PROD_API_KEY || '',
                apiSecret: process.env.JAMBOPAY_PROD_API_SECRET || '',
                baseUrl: 'https://api.jambopay.com/v1'
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
var THEMES_FILE = path.join(__dirname, 'themes.json');
var CLIENTS_FILE = path.join(__dirname, 'clients.json');
var ORGANIZATIONS_FILE = path.join(__dirname, 'organizations.json');
var SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

var transactions = [];
var vouchers = [];
var plans = [];
var settings = {};
var themes = [];
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
    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, shared_users: 1, duration_seconds: 86400 }
];

// ============================================================
// SUBSCRIPTION PLANS
// ============================================================

var SUBSCRIPTION_PLANS = {
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
    },
    'enterprise': {
        name: 'Enterprise',
        price: 5000,
        maxOrganizations: 9999,
        maxPlans: 9999,
        maxTransactions: 99999,
        features: ['Unlimited Organizations', 'Everything Included', 'Dedicated Support']
    }
};

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
function saveThemes() { try { fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2)); } catch (e) { console.error('⚠️ Could not save themes:', e.message); } }
function saveClients() { try { fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2)); } catch (e) { console.error('⚠️ Could not save clients:', e.message); } }
function saveOrganizations() { try { fs.writeFileSync(ORGANIZATIONS_FILE, JSON.stringify(organizations, null, 2)); } catch (e) { console.error('⚠️ Could not save organizations:', e.message); } }
function saveSubscriptions() { try { fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2)); } catch (e) { console.error('⚠️ Could not save subscriptions:', e.message); } }

// ============================================================
// HELPERS
// ============================================================

function generateVoucherCode() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 10; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return code; }
function generateOrgId() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function generateClientId() { var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var code = ''; for (var i = 0; i < 8; i++) { code += chars.charAt(Math.floor(Math.random() * chars.length)); } return 'CLIENT_' + code; }
function getOrganizationByClientId(clientId) { return organizations.find(function(org) { return org.id === clientId; }); }
function getOrganizationByEmail(email) { return organizations.find(function(org) { return org.email === email; }); }

// ============================================================
// SUBSCRIPTION HELPERS
// ============================================================

function getClientSubscription(clientId) {
    var sub = subscriptions.find(s => s.clientId === clientId);
    if (!sub) return null;
    
    // Check if subscription is active
    if (sub.status === 'active' && new Date(sub.expiresAt) > new Date()) {
        return sub;
    }
    
    // Check if trial is active
    if (sub.status === 'trial' && new Date(sub.trialEnds) > new Date()) {
        return sub;
    }
    
    return null;
}

function getClientSubscriptionStatus(clientId) {
    var client = clients.find(c => c.id === clientId || c.email === clientId);
    if (!client) return { exists: false };
    
    var sub = subscriptions.find(s => s.clientId === clientId);
    
    if (!sub) {
        return {
            exists: true,
            status: 'no_subscription',
            canStartTrial: true,
            trialDays: 60
        };
    }
    
    if (sub.status === 'trial') {
        var now = new Date();
        var trialEnd = new Date(sub.trialEnds);
        if (now < trialEnd) {
            var daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
            return {
                exists: true,
                status: 'trial_active',
                trialEnds: sub.trialEnds,
                daysLeft: daysLeft,
                plan: 'free_trial'
            };
        } else {
            return {
                exists: true,
                status: 'trial_expired',
                trialEnded: sub.trialEnds
            };
        }
    }
    
    if (sub.status === 'active') {
        var now = new Date();
        var expiresAt = new Date(sub.expiresAt);
        if (now < expiresAt) {
            var daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
            return {
                exists: true,
                status: 'active_paid',
                plan: sub.plan,
                expiresAt: sub.expiresAt,
                daysLeft: daysLeft
            };
        } else {
            return {
                exists: true,
                status: 'expired',
                expiredAt: sub.expiresAt
            };
        }
    }
    
    return { exists: true, status: 'unknown' };
}

function checkOrganizationLimit(clientId) {
    var client = clients.find(c => c.id === clientId || c.email === clientId);
    if (!client) return { allowed: false, message: 'Client not found' };
    
    var sub = getClientSubscription(clientId);
    if (!sub) {
        return { 
            allowed: false, 
            message: 'No active subscription. Please start a free trial or subscribe.',
            requiresAction: true
        };
    }
    
    var plan = SUBSCRIPTION_PLANS[sub.plan] || SUBSCRIPTION_PLANS.starter;
    var orgCount = organizations.filter(o => o.clientId === clientId).length;
    
    if (orgCount >= plan.maxOrganizations) {
        return {
            allowed: false,
            message: `You've reached your limit of ${plan.maxOrganizations} organization(s). Upgrade to create more.`,
            current: orgCount,
            max: plan.maxOrganizations,
            plan: plan.name,
            requiresUpgrade: true
        };
    }
    
    return {
        allowed: true,
        current: orgCount,
        max: plan.maxOrganizations,
        plan: plan.name
    };
}

// ============================================================
// AGGREGATOR HELPERS
// ============================================================

function getAggregatorConfig(provider, mode) {
    provider = provider || AGGREGATOR_CONFIG.defaultProvider;
    mode = mode || AGGREGATOR_CONFIG.defaultMode;
    
    var providerConfig = AGGREGATOR_CONFIG.providers[provider];
    if (!providerConfig) {
        throw new Error('Unsupported aggregator: ' + provider);
    }
    
    var modeConfig = providerConfig[mode] || providerConfig.test;
    return {
        name: providerConfig.name,
        feePercent: providerConfig.feePercent,
        mode: mode,
        provider: provider,
        ...modeConfig
    };
}

function calculatePriceWithFee(price, feePercent) {
    var fee = price * (feePercent / 100);
    return {
        basePrice: price,
        fee: Math.round(fee * 100) / 100,
        total: Math.round((price + fee) * 100) / 100,
        feePercent: feePercent
    };
}

// ============================================================
// AGGREGATOR PAYMENT FUNCTIONS
// ============================================================

async function initiateAggregatorPayment(organization, plan, customerPhone, provider, mode) {
    provider = provider || organization.aggregatorProvider || AGGREGATOR_CONFIG.defaultProvider;
    mode = mode || organization.aggregatorMode || AGGREGATOR_CONFIG.defaultMode;
    
    var config = getAggregatorConfig(provider, mode);
    var priceData = calculatePriceWithFee(plan.price, config.feePercent);
    
    var transactionId = 'AGG_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    
    // For test mode, simulate payment
    if (mode === 'test') {
        console.log('🧪 TEST MODE: Simulating payment for', organization.businessName);
        
        var testTransaction = {
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
            expiresAt: new Date(Date.now() + (plan.duration_seconds || 7200) * 1000).toISOString(),
            username: 'test_user_' + transactionId.substring(0, 8),
            password: 'test_pass_' + Date.now().toString(36)
        };
        
        // Store test transaction
        transactions.push(testTransaction);
        saveTransactions();
        
        return {
            success: true,
            transactionId: transactionId,
            isTest: true,
            mode: mode,
            amount: priceData.total,
            fee: priceData.fee,
            feePercent: priceData.feePercent,
            baseAmount: priceData.basePrice,
            username: testTransaction.username,
            password: testTransaction.password,
            expiresAt: testTransaction.expiresAt,
            message: '🧪 TEST MODE: Payment simulated successfully. No real money charged.'
        };
    }
    
    // Production mode - call actual aggregator API
    try {
        var payload = {
            amount: priceData.total,
            currency: 'KES',
            phoneNumber: customerPhone,
            email: customerPhone + '@gichwifi.co.ke',
            reference: transactionId,
            description: 'WiFi Plan: ' + plan.name,
            callbackUrl: 'https://' + (process.env.RENDER_URL || 'localhost:' + PORT) + '/api/aggregator/callback',
            settlementAccount: {
                phoneNumber: organization.mpesaPhoneNumber || organization.phone,
                name: organization.businessName,
                email: organization.supportEmail
            }
        };
        
        // Route to specific aggregator
        var result;
        switch(provider) {
            case 'dpo':
                result = await initiateDPOPayment(payload, config);
                break;
            case 'cellulant':
                result = await initiateCellulantPayment(payload, config);
                break;
            case 'jambopay':
                result = await initiateJamboPayPayment(payload, config);
                break;
            default:
                throw new Error('Unsupported aggregator: ' + provider);
        }
        
        // Store transaction
        var transaction = {
            id: result.transactionId || transactionId,
            organizationId: organization.id,
            planId: plan.id,
            planName: plan.name,
            customerPhone: customerPhone,
            amount: priceData.total,
            baseAmount: priceData.basePrice,
            fee: priceData.fee,
            feePercent: priceData.feePercent,
            status: 'pending',
            provider: provider,
            mode: mode,
            isTest: false,
            timestamp: new Date().toISOString(),
            paymentUrl: result.paymentUrl
        };
        transactions.push(transaction);
        saveTransactions();
        
        return {
            success: true,
            transactionId: transaction.id,
            isTest: false,
            mode: mode,
            amount: priceData.total,
            fee: priceData.fee,
            feePercent: priceData.feePercent,
            baseAmount: priceData.basePrice,
            paymentUrl: result.paymentUrl,
            redirectUrl: result.redirectUrl
        };
    } catch (error) {
        console.error('❌ Aggregator payment error:', error);
        throw error;
    }
}

// ============================================================
// AGGREGATOR API FUNCTIONS
// ============================================================

async function initiateDPOPayment(payload, config) {
    var url = config.baseUrl + '/payments';
    
    var requestPayload = {
        companyToken: config.apiKey,
        customerPhone: payload.phoneNumber,
        customerEmail: payload.email,
        amount: payload.amount,
        currency: payload.currency,
        reference: payload.reference,
        description: payload.description,
        callbackURL: payload.callbackUrl,
        settlementDetails: {
            phoneNumber: payload.settlementAccount.phoneNumber,
            accountName: payload.settlementAccount.name,
            email: payload.settlementAccount.email
        }
    };
    
    console.log('📤 DPO Request:', JSON.stringify(requestPayload, null, 2));
    
    // For testing without actual API
    if (config.mode === 'test') {
        return {
            transactionId: 'DPO_TEST_' + Date.now(),
            paymentUrl: config.baseUrl + '/pay/' + Date.now(),
            redirectUrl: config.baseUrl + '/pay/' + Date.now()
        };
    }
    
    var response = await simpleRequest('POST', url, {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiSecret
    }, requestPayload);
    
    if (response.statusCode === 200 || response.statusCode === 201) {
        return {
            transactionId: response.bodyJson.transactionId,
            paymentUrl: response.bodyJson.paymentUrl,
            redirectUrl: response.bodyJson.redirectUrl
        };
    } else {
        throw new Error('DPO payment failed: ' + response.bodyText);
    }
}

async function initiateCellulantPayment(payload, config) {
    var url = config.baseUrl + '/payments/request';
    
    var requestPayload = {
        apiKey: config.apiKey,
        productId: 'GICH_WIFI',
        amount: payload.amount,
        currency: payload.currency,
        msisdn: payload.phoneNumber,
        reference: payload.reference,
        description: payload.description,
        webhook: payload.callbackUrl,
        settlementDetails: {
            accountNumber: payload.settlementAccount.phoneNumber,
            accountName: payload.settlementAccount.name,
            email: payload.settlementAccount.email
        }
    };
    
    console.log('📤 Cellulant Request:', JSON.stringify(requestPayload, null, 2));
    
    if (config.mode === 'test') {
        return {
            transactionId: 'CEL_TEST_' + Date.now(),
            paymentUrl: config.baseUrl + '/pay/' + Date.now()
        };
    }
    
    var response = await simpleRequest('POST', url, {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiSecret
    }, requestPayload);
    
    if (response.statusCode === 200 || response.statusCode === 201) {
        return {
            transactionId: response.bodyJson.transactionId,
            paymentUrl: response.bodyJson.paymentUrl
        };
    } else {
        throw new Error('Cellulant payment failed: ' + response.bodyText);
    }
}

async function initiateJamboPayPayment(payload, config) {
    var url = config.baseUrl + '/transactions';
    
    var requestPayload = {
        merchantId: config.apiKey,
        amount: payload.amount,
        currency: payload.currency,
        phone: payload.phoneNumber,
        reference: payload.reference,
        description: payload.description,
        callbackUrl: payload.callbackUrl,
        settlement: {
            phoneNumber: payload.settlementAccount.phoneNumber,
            name: payload.settlementAccount.name,
            email: payload.settlementAccount.email
        }
    };
    
    console.log('📤 JamboPay Request:', JSON.stringify(requestPayload, null, 2));
    
    if (config.mode === 'test') {
        return {
            transactionId: 'JAMBO_TEST_' + Date.now(),
            paymentUrl: config.baseUrl + '/pay/' + Date.now()
        };
    }
    
    var response = await simpleRequest('POST', url, {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiSecret
    }, requestPayload);
    
    if (response.statusCode === 200 || response.statusCode === 201) {
        return {
            transactionId: response.bodyJson.transactionId,
            paymentUrl: response.bodyJson.paymentUrl
        };
    } else {
        throw new Error('JamboPay payment failed: ' + response.bodyText);
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
// AUTH - Accepts all token types
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

function isClient(req) {
    var auth = req.headers.authorization;
    if (!auth) return false;
    var token = auth.replace('Bearer ', '').trim();
    
    if (token && token.indexOf('master_bypass_') === 0) { return true; }
    if (token && token.indexOf('demo_token_') === 0) { return true; }
    if (token && token.indexOf('token_') === 0) { return true; }
    
    try {
        var decoded = verifyToken(token);
        if (decoded && decoded.role === 'client') return true;
    } catch (e) {}
    return false;
}

// ============================================================
// GENERATE BILLING HTML
// ============================================================

function generateBillingHtml(organization) {
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
    var businessAddress = escapeHtml(organization.businessAddress || '');
    var website = escapeHtml(organization.website || '');
    var plans = organization.plans || [];
    var orgId = escapeHtml(organization.id);

    var plansHtml = '';
    for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
        var duration = p.duration_seconds || 3600;
        var hours = Math.floor(duration / 3600);
        var days = Math.floor(duration / 86400);
        var durStr = days > 0 ? days + 'd' : hours + 'h';
        plansHtml += '<div class="plan-card' + (i === 0 ? ' selected' : '') + '" data-id="' + escapeHtml(p.id) + '" data-price="' + p.price + '" onclick="selectPlan(this, \'' + escapeHtml(p.id) + '\', ' + p.price + ')">\n';
        plansHtml += '    <div class="name">' + escapeHtml(p.name) + '</div>\n';
        plansHtml += '    <div class="price">KES ' + p.price + ' <span>/ ' + durStr + '</span></div>\n';
        plansHtml += '    <div class="features">\n';
        plansHtml += '        <span>📱 ' + (p.devices || 1) + ' device' + (p.devices > 1 ? 's' : '') + '</span>\n';
        plansHtml += '        <span>⏱ ' + durStr + '</span>\n';
        plansHtml += '    </div>\n';
        plansHtml += '</div>\n';
    }

    if (!plansHtml) {
        plansHtml = '<div style="text-align:center;padding:20px;color:#666;grid-column:1/-1;">No plans available.</div>';
    }

    var html = '<!DOCTYPE html>\n';
    html += '<html lang="en">\n';
    html += '<head>\n';
    html += '    <meta charset="UTF-8">\n';
    html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '    <title>' + bizName + ' - WiFi Services</title>\n';
    html += '    <style>\n';
    html += '        * { margin: 0; padding: 0; box-sizing: border-box; }\n';
    html += '        body { font-family: \'Segoe UI\', Roboto, system-ui, sans-serif; background: ' + accentColor + '; color: #ffffff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }\n';
    html += '        .container { max-width: 560px; width: 100%; background: rgba(18, 18, 31, 0.95); border-radius: 24px; padding: 32px 28px; border: 1px solid rgba(255,255,255,0.04); box-shadow: 0 20px 60px rgba(0,0,0,0.6); }\n';
    html += '        .brand { text-align: center; margin-bottom: 24px; }\n';
    html += '        .brand .logo { font-size: 42px; margin-bottom: 4px; }\n';
    html += '        .brand h1 { font-size: 26px; font-weight: 700; color: ' + primaryColor + '; }\n';
    html += '        .brand .tagline { color: #888; font-size: 14px; margin-top: 2px; }\n';
    html += '        .brand .badge { display: inline-block; background: rgba(0,200,83,0.12); color: ' + primaryColor + '; padding: 2px 16px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 4px; }\n';
    html += '        .section-title { font-size: 18px; font-weight: 600; margin: 22px 0 12px 0; color: #fff; display: flex; align-items: center; gap: 8px; }\n';
    html += '        .plan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }\n';
    html += '        .plan-card { background: rgba(255,255,255,0.03); border-radius: 14px; padding: 16px 14px; border: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: 0.25s; text-align: center; }\n';
    html += '        .plan-card:hover { background: rgba(255,255,255,0.06); border-color: ' + primaryColor + '40; transform: translateY(-2px); }\n';
    html += '        .plan-card.selected { border-color: ' + primaryColor + '; background: ' + primaryColor + '10; box-shadow: 0 0 0 1px ' + primaryColor + '; }\n';
    html += '        .plan-card .name { font-weight: 600; font-size: 15px; color: #fff; }\n';
    html += '        .plan-card .price { font-size: 22px; font-weight: 700; color: ' + primaryColor + '; margin: 4px 0; }\n';
    html += '        .plan-card .price span { font-size: 13px; font-weight: 400; color: #666; }\n';
    html += '        .plan-card .features { font-size: 12px; color: #888; margin-top: 4px; }\n';
    html += '        .plan-card .features span { display: inline-block; background: rgba(255,255,255,0.04); padding: 1px 10px; border-radius: 12px; margin: 2px 2px; }\n';
    html += '        .input-group { margin: 12px 0 16px 0; }\n';
    html += '        .input-group label { display: block; color: #aaa; font-size: 13px; font-weight: 500; margin-bottom: 4px; }\n';
    html += '        .input-group input { width: 100%; padding: 13px 16px; background: #0a0a1a; border: 2px solid rgba(255,255,255,0.06); border-radius: 12px; color: #fff; font-size: 16px; outline: none; transition: 0.25s; }\n';
    html += '        .input-group input:focus { border-color: ' + primaryColor + '; box-shadow: 0 0 0 3px ' + primaryColor + '10; }\n';
    html += '        .input-group input::placeholder { color: #444; }\n';
    html += '        .btn { width: 100%; padding: 14px; background: ' + primaryColor + '; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; color: #000; cursor: pointer; transition: 0.25s; font-family: inherit; }\n';
    html += '        .btn:hover { background: ' + secondaryColor + '; transform: scale(1.01); }\n';
    html += '        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }\n';
    html += '        .btn-secondary { background: #2a2a4a; color: #fff; }\n';
    html += '        .btn-secondary:hover { background: #3a3a5a; }\n';
    html += '        .divider { display: flex; align-items: center; gap: 16px; margin: 18px 0; color: #444; font-size: 13px; }\n';
    html += '        .divider::before, .divider::after { content: \'\'; flex: 1; height: 1px; background: rgba(255,255,255,0.04); }\n';
    html += '        .voucher-row { display: flex; gap: 10px; }\n';
    html += '        .voucher-row input { flex: 1; padding: 12px 14px; background: #0a0a1a; border: 2px solid rgba(255,255,255,0.06); border-radius: 10px; color: #fff; font-size: 14px; outline: none; }\n';
    html += '        .voucher-row input:focus { border-color: ' + primaryColor + '; }\n';
    html += '        .voucher-row .btn { flex: 0 0 auto; width: auto; padding: 12px 20px; font-size: 13px; }\n';
    html += '        .result-box { margin-top: 10px; padding: 10px 14px; border-radius: 10px; font-size: 13px; display: none; }\n';
    html += '        .result-box.success { display: block; background: ' + primaryColor + '15; color: ' + primaryColor + '; border: 1px solid ' + primaryColor + '20; }\n';
    html += '        .result-box.error { display: block; background: rgba(255,68,68,0.08); color: #ff4444; border: 1px solid rgba(255,68,68,0.1); }\n';
    html += '        .result-box.info { display: block; background: rgba(33,150,243,0.08); color: #2196f3; border: 1px solid rgba(33,150,243,0.1); }\n';
    html += '        .footer { text-align: center; color: #444; font-size: 12px; margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 16px; }\n';
    html += '        .footer .brand { color: ' + primaryColor + '; font-weight: 600; }\n';
    html += '        .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #1a1a2e; padding: 14px 28px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); color: #fff; font-size: 14px; z-index: 999; max-width: 90%; text-align: center; animation: toastIn 0.35s ease; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }\n';
    html += '        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(30px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }\n';
    html += '        .toast.success { border-color: ' + primaryColor + '; }\n';
    html += '        .toast.error { border-color: #ff4444; }\n';
    html += '        .toast.info { border-color: #2196f3; }\n';
    html += '        .connected-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: ' + accentColor + '; display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; padding: 30px; }\n';
    html += '        .connected-overlay.active { display: flex; }\n';
    html += '        .connected-overlay .icon { font-size: 72px; margin-bottom: 12px; }\n';
    html += '        .connected-overlay .title { font-size: 32px; font-weight: 700; color: ' + primaryColor + '; }\n';
    html += '        .connected-overlay .sub { color: #888; font-size: 16px; margin-top: 4px; }\n';
    html += '        .connected-overlay .timer-box { background: rgba(255,255,255,0.03); padding: 20px 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.04); margin: 16px 0; text-align: center; }\n';
    html += '        .connected-overlay .timer-box .label { color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; }\n';
    html += '        .connected-overlay .timer-box .time { font-size: 48px; font-weight: 700; color: ' + primaryColor + '; font-family: \'Courier New\', monospace; letter-spacing: 4px; }\n';
    html += '        .connected-overlay .timer-box .time.expired { color: #ff4444; }\n';
    html += '        .connected-overlay .creds { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 14px 24px; border: 1px solid rgba(255,255,255,0.04); width: 100%; max-width: 360px; margin: 8px 0; }\n';
    html += '        .connected-overlay .creds .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 13px; }\n';
    html += '        .connected-overlay .creds .row:last-child { border-bottom: none; }\n';
    html += '        .connected-overlay .creds .label { color: #666; }\n';
    html += '        .connected-overlay .creds .value { color: #fff; font-family: monospace; }\n';
    html += '        .connected-overlay .enjoy { color: ' + primaryColor + '; font-size: 18px; margin-top: 12px; opacity: 0.9; }\n';
    html += '        .connected-overlay .powered { color: #444; font-size: 12px; margin-top: 24px; }\n';
    html += '        .connected-overlay .powered .brand { color: ' + primaryColor + '; font-weight: 600; }\n';
    html += '        .connected-overlay .address { color: #555; font-size: 11px; margin-top: 8px; }\n';
    html += '        @media (max-width: 480px) { .container { padding: 20px 16px; } .plan-grid { grid-template-columns: 1fr 1fr; gap: 8px; } .plan-card { padding: 12px 10px; } .plan-card .price { font-size: 18px; } .connected-overlay .timer-box .time { font-size: 34px; } .voucher-row { flex-direction: column; } .voucher-row .btn { width: 100%; } }\n';
    html += '    </style>\n';
    html += '</head>\n';
    html += '<body>\n';

    html += '<div class="container" id="app">\n';
    html += '    <div class="brand">\n';
    html += '        <div class="logo">🌐</div>\n';
    html += '        <h1>' + bizName + '</h1>\n';
    html += '        <p class="tagline">' + tagline + '</p>\n';
    if (mpesaTill) {
        html += '        <span class="badge">🔐 Paybill: ' + mpesaTill + '</span>\n';
    }
    if (businessAddress) {
        html += '        <p style="color:#555;font-size:11px;margin-top:6px;">📍 ' + businessAddress + '</p>\n';
    }
    html += '    </div>\n';

    html += '    <div class="section-title">📦 Choose Your Plan</div>\n';
    html += '    <div class="plan-grid" id="planGrid">\n';
    html += plansHtml;
    html += '    </div>\n';

    html += '    <div class="input-group">\n';
    html += '        <label>📱 Phone Number</label>\n';
    html += '        <input type="tel" id="phoneInput" placeholder="0712345678" />\n';
    html += '    </div>\n';
    html += '    <button class="btn" id="payBtn" onclick="initiatePayment()">💳 Pay Now</button>\n';
    html += '    <div id="paymentResult" class="result-box" style="margin-top:12px;"></div>\n';

    html += '    <div class="divider">or use a voucher</div>\n';
    html += '    <div class="voucher-row">\n';
    html += '        <input type="text" id="voucherInput" placeholder="🎟️ Enter voucher code" />\n';
    html += '        <button class="btn btn-secondary" onclick="redeemVoucher()">Redeem</button>\n';
    html += '    </div>\n';
    html += '    <div id="voucherResult" class="result-box"></div>\n';

    html += '    <div style="margin-top:16px; display:flex; gap:10px;">\n';
    html += '        <input type="tel" id="checkPhoneInput" placeholder="🔍 Check your plan" style="flex:1; padding:12px 14px; background:#0a0a1a; border:2px solid rgba(255,255,255,0.06); border-radius:10px; color:#fff; font-size:14px; outline:none;" />\n';
    html += '        <button class="btn btn-secondary" onclick="checkPlan()" style="width:auto; padding:12px 20px; font-size:13px;">Check</button>\n';
    html += '    </div>\n';
    html += '    <div id="checkResult" class="result-box"></div>\n';

    html += '    <div class="footer">\n';
    html += '        Powered by <span class="brand">GICH WiFi</span> · Secure · Fast · Reliable\n';
    html += '        <br><span style="color:#555; font-size:11px;">📞 ' + supportPhone + ' · ✉️ ' + supportEmail + '</span>\n';
    if (website) {
        html += '        <br><span style="color:#555; font-size:11px;">🌐 ' + website + '</span>\n';
    }
    html += '    </div>\n';
    html += '</div>\n';

    html += '<div class="connected-overlay" id="connectedOverlay">\n';
    html += '    <div class="icon">🎉</div>\n';
    html += '    <div class="title">You\'re Connected!</div>\n';
    html += '    <div class="sub">Enjoy your high-speed internet</div>\n';
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
    if (businessAddress) {
        html += '    <div class="address">📍 ' + businessAddress + '</div>\n';
    }
    html += '</div>\n';

    html += '<script>\n';
    html += '    const API_URL = "' + (process.env.RENDER_URL || 'https://billing-system-fm9a.onrender.com') + '/api";\n';
    html += '    let selectedPlanId = "' + (plans.length > 0 ? plans[0].id : '') + '";\n';
    html += '    let selectedPlanPrice = ' + (plans.length > 0 ? plans[0].price : 0) + ';\n';
    html += '    let credentials = null;\n';
    html += '    let countdownInterval = null;\n';

    html += '    function selectPlan(el, id, price) {\n';
    html += '        document.querySelectorAll(".plan-card").forEach(c => c.classList.remove("selected"));\n';
    html += '        el.classList.add("selected");\n';
    html += '        selectedPlanId = id;\n';
    html += '        selectedPlanPrice = price;\n';
    html += '        document.getElementById("payBtn").disabled = false;\n';
    html += '        document.getElementById("payBtn").textContent = "💳 Pay KSh " + price;\n';
    html += '    }\n';

    html += '    async function initiatePayment() {\n';
    html += '        const phone = document.getElementById("phoneInput").value.trim();\n';
    html += '        if (!phone || phone.length < 10) { showToast("📱 Please enter a valid phone number", "error"); return; }\n';
    html += '        if (!selectedPlanId) { showToast("Please select a plan", "error"); return; }\n';
    html += '        const btn = document.getElementById("payBtn");\n';
    html += '        btn.disabled = true;\n';
    html += '        btn.textContent = "⏳ Processing...";\n';
    html += '        const resultEl = document.getElementById("paymentResult");\n';
    html += '        resultEl.className = "result-box info";\n';
    html += '        resultEl.textContent = "⏳ Sending payment request...";\n';
    html += '        try {\n';
    html += '            const res = await fetch(API_URL + "/aggregator/initiate", {\n';
    html += '                method: "POST",\n';
    html += '                headers: { "Content-Type": "application/json" },\n';
    html += '                body: JSON.stringify({ organizationId: "' + orgId + '", planId: selectedPlanId, phoneNumber: phone })\n';
    html += '            });\n';
    html += '            const data = await res.json();\n';
    html += '            if (data.success) {\n';
    html += '                const result = data.data;\n';
    html += '                if (result.isTest) {\n';
    html += '                    resultEl.className = "result-box success";\n';
    html += '                    resultEl.textContent = "🧪 TEST MODE: Payment simulated! No money charged.";\n';
    html += '                    showToast("🧪 TEST MODE: Payment simulated!", "info");\n';
    html += '                    setTimeout(() => {\n';
    html += '                        credentials = { username: result.username, password: result.password, planName: "' + (plans.length > 0 ? plans[0].name : 'Plan') + '", expiresAt: result.expiresAt };\n';
    html += '                        showConnectedPage(credentials);\n';
    html += '                    }, 1500);\n';
    html += '                } else {\n';
    html += '                    resultEl.className = "result-box success";\n';
    html += '                    resultEl.textContent = "✅ Payment initiated! Follow the instructions.";\n';
    html += '                    showToast("📱 Payment initiated!", "success");\n';
    html += '                    if (result.paymentUrl) {\n';
    html += '                        window.open(result.paymentUrl, "_blank");\n';
    html += '                    }\n';
    html += '                    await pollTransaction(result.transactionId);\n';
    html += '                }\n';
    html += '            } else {\n';
    html += '                resultEl.className = "result-box error";\n';
    html += '                resultEl.textContent = "❌ " + (data.message || "Payment failed");\n';
    html += '                showToast("❌ Payment failed", "error");\n';
    html += '                btn.disabled = false;\n';
    html += '                btn.textContent = "💳 Pay Now";\n';
    html += '            }\n';
    html += '        } catch (e) {\n';
    html += '            resultEl.className = "result-box error";\n';
    html += '            resultEl.textContent = "❌ Network error";\n';
    html += '            showToast("❌ Network error", "error");\n';
    html += '            btn.disabled = false;\n';
    html += '            btn.textContent = "💳 Pay Now";\n';
    html += '        }\n';
    html += '    }\n';

    html += '    async function pollTransaction(txnId) {\n';
    html += '        let attempts = 0;\n';
    html += '        const maxAttempts = 30;\n';
    html += '        while (attempts < maxAttempts) {\n';
    html += '            try {\n';
    html += '                const res = await fetch(API_URL + "/transaction/" + txnId);\n';
    html += '                const data = await res.json();\n';
    html += '                if (data.success) {\n';
    html += '                    const tx = data.data;\n';
    html += '                    if (tx.status === "completed") {\n';
    html += '                        credentials = { username: tx.mikrotikUsername || "user_" + txnId, password: tx.mikrotikPassword || "pass_" + Date.now(), planName: tx.planName || "Plan", expiresAt: tx.expiresAt || new Date(Date.now() + 7200000).toISOString() };\n';
    html += '                        showConnectedPage(credentials);\n';
    html += '                        return;\n';
    html += '                    } else if (tx.status === "failed" || tx.status === "cancelled") {\n';
    html += '                        const resultEl = document.getElementById("paymentResult");\n';
    html += '                        resultEl.className = "result-box error";\n';
    html += '                        resultEl.textContent = "❌ Payment " + tx.status;\n';
    html += '                        showToast("❌ Payment " + tx.status, "error");\n';
    html += '                        document.getElementById("payBtn").disabled = false;\n';
    html += '                        document.getElementById("payBtn").textContent = "💳 Pay Now";\n';
    html += '                        return;\n';
    html += '                    }\n';
    html += '                }\n';
    html += '                await sleep(2000);\n';
    html += '                attempts++;\n';
    html += '            } catch (e) { await sleep(2000); attempts++; }\n';
    html += '        }\n';
    html += '        const resultEl = document.getElementById("paymentResult");\n';
    html += '        resultEl.className = "result-box info";\n';
    html += '        resultEl.textContent = "⏳ Still processing... Please check your payment.";\n';
    html += '        document.getElementById("payBtn").disabled = false;\n';
    html += '        document.getElementById("payBtn").textContent = "💳 Pay Now";\n';
    html += '    }\n';

    html += '    function showConnectedPage(cred) {\n';
    html += '        document.getElementById("app").style.display = "none";\n';
    html += '        const overlay = document.getElementById("connectedOverlay");\n';
    html += '        overlay.classList.add("active");\n';
    html += '        document.getElementById("connUser").textContent = cred.username || "N/A";\n';
    html += '        document.getElementById("connPass").textContent = cred.password || "N/A";\n';
    html += '        document.getElementById("connPlan").textContent = cred.planName || "N/A";\n';
    html += '        startCountdown(cred.expiresAt);\n';
    html += '    }\n';

    html += '    function startCountdown(expiresAt) {\n';
    html += '        if (countdownInterval) clearInterval(countdownInterval);\n';
    html += '        const timer = document.getElementById("connTimer");\n';
    html += '        function update() {\n';
    html += '            const now = Date.now();\n';
    html += '            const expiry = new Date(expiresAt).getTime();\n';
    html += '            const diff = Math.max(0, expiry - now);\n';
    html += '            if (diff <= 0) {\n';
    html += '                timer.textContent = "00:00:00";\n';
    html += '                timer.classList.add("expired");\n';
    html += '                document.getElementById("connEnjoy").textContent = "⏰ Your plan has expired.";\n';
    html += '                clearInterval(countdownInterval);\n';
    html += '                return;\n';
    html += '            }\n';
    html += '            timer.classList.remove("expired");\n';
    html += '            const hours = Math.floor(diff / 3600000);\n';
    html += '            const mins = Math.floor((diff % 3600000) / 60000);\n';
    html += '            const secs = Math.floor((diff % 60000) / 1000);\n';
    html += '            timer.textContent = String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");\n';
    html += '        }\n';
    html += '        update();\n';
    html += '        countdownInterval = setInterval(update, 1000);\n';
    html += '    }\n';

    html += '    async function redeemVoucher() {\n';
    html += '        const code = document.getElementById("voucherInput").value.trim().toUpperCase();\n';
    html += '        if (!code) { showToast("Please enter a voucher code", "error"); return; }\n';
    html += '        const resultEl = document.getElementById("voucherResult");\n';
    html += '        resultEl.className = "result-box info";\n';
    html += '        resultEl.textContent = "⏳ Redeeming...";\n';
    html += '        try {\n';
    html += '            const res = await fetch(API_URL + "/voucher/redeem", {\n';
    html += '                method: "POST",\n';
    html += '                headers: { "Content-Type": "application/json" },\n';
    html += '                body: JSON.stringify({ code: code, phoneNumber: "voucher_user" })\n';
    html += '            });\n';
    html += '            const data = await res.json();\n';
    html += '            if (data.success) {\n';
    html += '                resultEl.className = "result-box success";\n';
    html += '                resultEl.textContent = "✅ Voucher redeemed! Connecting...";\n';
    html += '                credentials = { username: data.data.username || "voucher_user", password: data.data.password || "pass_" + Date.now(), planName: data.data.planName || "Voucher", expiresAt: data.data.expiresAt || new Date(Date.now() + 3600000).toISOString() };\n';
    html += '                showConnectedPage(credentials);\n';
    html += '            } else {\n';
    html += '                resultEl.className = "result-box error";\n';
    html += '                resultEl.textContent = "❌ " + (data.message || "Invalid voucher");\n';
    html += '            }\n';
    html += '        } catch (e) { resultEl.className = "result-box error"; resultEl.textContent = "❌ Network error"; }\n';
    html += '    }\n';

    html += '    async function checkPlan() {\n';
    html += '        const phone = document.getElementById("checkPhoneInput").value.trim();\n';
    html += '        if (!phone || phone.length < 10) { showToast("Please enter a valid phone number", "error"); return; }\n';
    html += '        const resultEl = document.getElementById("checkResult");\n';
    html += '        resultEl.className = "result-box info";\n';
    html += '        resultEl.textContent = "⏳ Checking...";\n';
    html += '        try {\n';
    html += '            const res = await fetch(API_URL + "/check-active?phone=" + encodeURIComponent(phone));\n';
    html += '            const data = await res.json();\n';
    html += '            if (data.success && data.active) {\n';
    html += '                resultEl.className = "result-box success";\n';
    html += '                resultEl.textContent = "✅ Active plan found! Connecting...";\n';
    html += '                credentials = { username: data.data.username, password: data.data.password, planName: data.data.planName, expiresAt: data.data.expiresAt };\n';
    html += '                showConnectedPage(credentials);\n';
    html += '            } else {\n';
    html += '                resultEl.className = "result-box error";\n';
    html += '                resultEl.textContent = "❌ No active plan found.";\n';
    html += '            }\n';
    html += '        } catch (e) { resultEl.className = "result-box error"; resultEl.textContent = "❌ Network error"; }\n';
    html += '    }\n';

    html += '    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }\n';
    html += '    function showToast(msg, type) {\n';
    html += '        type = type || "info";\n';
    html += '        const existing = document.querySelector(".toast");\n';
    html += '        if (existing) existing.remove();\n';
    html += '        const toast = document.createElement("div");\n';
    html += '        toast.className = "toast " + type;\n';
    html += '        toast.textContent = msg;\n';
    html += '        document.body.appendChild(toast);\n';
    html += '        setTimeout(() => { toast.style.opacity = "0"; toast.style.transition = "opacity 0.5s"; }, 3000);\n';
    html += '        setTimeout(() => toast.remove(), 4000);\n';
    html += '    }\n';

    html += '    document.getElementById("phoneInput").addEventListener("keydown", e => { if (e.key === "Enter") initiatePayment(); });\n';
    html += '    document.getElementById("voucherInput").addEventListener("keydown", e => { if (e.key === "Enter") redeemVoucher(); });\n';
    html += '    document.getElementById("checkPhoneInput").addEventListener("keydown", e => { if (e.key === "Enter") checkPlan(); });\n';

    html += '    if (document.querySelector(".plan-card")) {\n';
    html += '        const first = document.querySelector(".plan-card");\n';
    html += '        const price = parseInt(first.dataset.price) || 0;\n';
    html += '        document.getElementById("payBtn").textContent = "💳 Pay KSh " + price;\n';
    html += '        document.getElementById("payBtn").disabled = false;\n';
    html += '        selectedPlanPrice = price;\n';
    html += '    }\n';
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

        // Check if organization exists for email
        if (req.method === 'GET' && url.pathname === '/api/client/check-org') {
            var email = url.searchParams.get('email');
            if (!email) {
                return sendJson(res, 400, { success: false, message: 'Email required' });
            }

            var orgExists = organizations.some(o => o.email === email);
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
                    website: org.website,
                    businessTagline: org.businessTagline,
                    mpesaTill: org.mpesaTill || '',
                    businessAddress: org.businessAddress || '',
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
                textColor: '#ffffff',
                headerTextColor: '#ffffff',
                buttonTextColor: '#000000',
                bgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
                supportPhone: body.supportPhone || '0712345678',
                supportEmail: body.supportEmail || email,
                website: body.website || '',
                businessTagline: body.businessTagline || 'Fast • Secure • Reliable',
                mpesaTill: body.mpesaTill || '',
                mpesaPhoneNumber: body.mpesaPhoneNumber || body.phone || '0712345678',
                businessAddress: body.businessAddress || '',
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
                isOrganization: true,
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
                    website: org.website,
                    businessTagline: org.businessTagline,
                    mpesaTill: org.mpesaTill || '',
                    mpesaPhoneNumber: org.mpesaPhoneNumber || org.phone,
                    businessAddress: org.businessAddress || '',
                    plans: org.plans || [],
                    status: org.status,
                    aggregatorProvider: org.aggregatorProvider,
                    aggregatorMode: org.aggregatorMode
                }
            });
        }

        // ============================================================
        // UPDATE ORGANIZATION
        // ============================================================
        if (req.method === 'PUT' && url.pathname.startsWith('/api/master/organizations/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var orgId = url.pathname.split('/').pop();
            var body = await readBody(req);
            var index = organizations.findIndex(o => o.id === orgId);
            
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
                website: body.website !== undefined ? body.website : organizations[index].website,
                logo: body.logo !== undefined ? body.logo : organizations[index].logo,
                mpesaTill: body.mpesaTill !== undefined ? body.mpesaTill : organizations[index].mpesaTill,
                mpesaPhoneNumber: body.mpesaPhoneNumber !== undefined ? body.mpesaPhoneNumber : organizations[index].mpesaPhoneNumber,
                businessAddress: body.businessAddress !== undefined ? body.businessAddress : organizations[index].businessAddress,
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
        // AGGREGATOR PAYMENT INITIATE
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/aggregator/initiate') {
            var body = await readBody(req);
            
            var organizationId = body.organizationId;
            var planId = body.planId;
            var customerPhone = body.phoneNumber;
            var provider = body.provider;
            var mode = body.mode;
            
            var org = getOrganizationByClientId(organizationId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var plan = (org.plans || []).find(p => p.id === planId);
            if (!plan) {
                return sendJson(res, 404, { success: false, message: 'Plan not found' });
            }
            
            try {
                var result = await initiateAggregatorPayment(org, plan, customerPhone, provider, mode);
                
                // Store transaction for test mode
                if (result.isTest) {
                    var testTx = {
                        id: result.transactionId,
                        organizationId: org.id,
                        planId: plan.id,
                        planName: plan.name,
                        customerPhone: customerPhone,
                        amount: result.amount,
                        baseAmount: result.baseAmount,
                        fee: result.fee,
                        feePercent: result.feePercent,
                        status: 'completed',
                        provider: provider || AGGREGATOR_CONFIG.defaultProvider,
                        mode: 'test',
                        isTest: true,
                        timestamp: new Date().toISOString(),
                        expiresAt: result.expiresAt,
                        mikrotikUsername: result.username,
                        mikrotikPassword: result.password
                    };
                    transactions.push(testTx);
                    saveTransactions();
                }
                
                return sendJson(res, 200, {
                    success: true,
                    data: {
                        transactionId: result.transactionId,
                        paymentUrl: result.paymentUrl,
                        isTest: result.isTest || false,
                        mode: result.mode || AGGREGATOR_CONFIG.defaultMode,
                        amount: result.amount,
                        fee: result.fee,
                        feePercent: result.feePercent,
                        baseAmount: result.baseAmount,
                        username: result.username,
                        password: result.password,
                        expiresAt: result.expiresAt,
                        message: result.message || 'Payment initiated successfully'
                    }
                });
            } catch (error) {
                console.error('Payment error:', error);
                return sendJson(res, 500, { success: false, message: error.message });
            }
        }

        // ============================================================
        // GET TRANSACTION
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/transaction/')) {
            var id = url.pathname.split('/').pop();
            var tx = transactions.find(t => t.id === id);
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
                    mikrotikUsername: tx.mikrotikUsername,
                    mikrotikPassword: tx.mikrotikPassword,
                    isTest: tx.isTest || false
                }
            });
        }

        // ============================================================
        // GET CREDENTIALS
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/get-credentials/')) {
            var id = url.pathname.split('/').pop();
            var tx = transactions.find(t => t.id === id);
            if (!tx) {
                return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            }
            
            if (tx.status !== 'completed') {
                return sendJson(res, 400, { success: false, message: 'Payment not completed' });
            }
            
            return sendJson(res, 200, {
                success: true,
                username: tx.mikrotikUsername || 'user_' + id.substring(0, 8),
                password: tx.mikrotikPassword || 'pass_' + Date.now().toString(36),
                plan: tx.planName,
                expiresAt: tx.expiresAt || new Date(Date.now() + 7200000).toISOString()
            });
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
            
            var voucher = vouchers.find(v => v.code === code && !v.used);
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
                mikrotikUsername: 'vuser_' + transactionId.substring(0, 8),
                mikrotikPassword: 'vpass_' + Date.now().toString(36),
                isVoucher: true,
                voucherCode: voucher.code
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
                    username: tx.mikrotikUsername,
                    password: tx.mikrotikPassword
                }
            });
        }

        // ============================================================
        // ADMIN VOUCHERS - GENERATE
        // ============================================================
        if (req.method === 'POST' && url.pathname === '/api/admin/voucher/generate') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var body = await readBody(req);
            var planId = body.planId;
            var count = Math.min(body.count || 1, 100);
            
            if (!planId) {
                return sendJson(res, 400, { success: false, message: 'Plan ID required' });
            }
            
            var plan = plans.find(p => p.id === planId);
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

        // ============================================================
        // ADMIN VOUCHERS - LIST
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api/admin/vouchers') {
            if (!isAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var used = vouchers.filter(v => v.used).length;
            return sendJson(res, 200, {
                success: true,
                data: vouchers,
                count: vouchers.length,
                used: used,
                unused: vouchers.length - used
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
            return sendJson(res, 200, { success: true, data: organizations, count: organizations.length });
        }

        // ============================================================
        // GENERATE FULL HTML
        // ============================================================
        if (req.method === 'GET' && url.pathname.startsWith('/api/master/generate-full-html/')) {
            if (!isMasterAdmin(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            
            var orgId = url.pathname.split('/').pop();
            var org = getOrganizationByClientId(orgId);
            if (!org) {
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
            }
            
            var html = generateBillingHtml(org);
            return sendJson(res, 200, {
                success: true,
                html: html,
                filename: orgId + '_billing.html',
                message: 'Billing page generated successfully'
            });
        }

        // ============================================================
        // SERVE CLIENT PAGE
        // ============================================================
        if (req.method === 'GET' && url.pathname.match(/^\/CLIENT_[A-Z0-9]+\/?$/)) {
            var orgId = url.pathname.replace('/', '');
            var org = getOrganizationByClientId(orgId);
            if (!org) {
                return sendHtml(res, 404, '<h1>❌ Organization Not Found</h1><p>ID: ' + orgId + '</p>');
            }
            var html = generateBillingHtml(org);
            return sendHtml(res, 200, html);
        }

        // ============================================================
        // API INFO
        // ============================================================
        if (req.method === 'GET' && url.pathname === '/api') {
            var totalRevenue = transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '3.0.0',
                status: 'Running',
                statistics: {
                    totalTransactions: transactions.length,
                    totalRevenue: totalRevenue,
                    activeVouchers: vouchers.filter(v => !v.used).length,
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
    console.log('========================================');
    console.log('🛡️ Admin PIN: ' + (ADMIN_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
    console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
    console.log('🏢 Organizations: ' + organizations.length);
    console.log('🎟️ Vouchers: ' + vouchers.length);
    console.log('💳 Transactions: ' + transactions.length);
    console.log('📋 Subscriptions: ' + subscriptions.length);
    console.log('========================================\n');
});

process.on('uncaughtException', function(err) { console.error('❌ Uncaught Exception:', err); });
process.on('unhandledRejection', function(reason) { console.error('❌ Unhandled Rejection:', reason); });
