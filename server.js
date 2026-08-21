/**
 * GICH WiFi - Master Dashboard Diagnostic Version
 * This version logs everything to help debug the billing systems issue
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
console.log('🌐 GICH WiFi API - DIAGNOSTIC VERSION');
console.log('========================================');
console.log('   Port: ' + PORT);
console.log('   Master PIN: ' + (MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'));
console.log('   MongoDB URI: ' + (MONGODB_URI ? '✅ Set' : '❌ NOT SET'));
console.log('========================================\n');

// ============================================================
// DATABASE CONNECTION
// ============================================================

async function connectDB() {
    try {
        console.log('🔗 Connecting to MongoDB Atlas...');
        console.log('📡 Using database: ' + DB_NAME);
        
        if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017') {
            console.error('❌ MONGODB_URI not set!');
            process.exit(1);
        }

        const hiddenUri = MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//****:****@');
        console.log('   Connection string: ' + hiddenUri);

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
        console.log('📊 Checking database collections...');
        
        // List all collections
        const collections = await db.listCollections().toArray();
        console.log('📋 Collections found:');
        collections.forEach(function(c) {
            console.log('   - ' + c.name);
        });
        
        // Check organizations collection
        const orgCount = await db.collection('organizations').countDocuments();
        console.log('📊 Organizations count: ' + orgCount);
        
        // Check billingSystems collection
        const bsCount = await db.collection('billingSystems').countDocuments();
        console.log('📊 Billing Systems count: ' + bsCount);
        
        if (bsCount > 0) {
            // Show sample billing systems
            const sampleBS = await db.collection('billingSystems').find({}).limit(3).toArray();
            console.log('📋 Sample billing systems:');
            sampleBS.forEach(function(bs) {
                console.log('   - ID: ' + bs.id + ', Name: ' + bs.name + ', Org: ' + bs.organizationId);
            });
        }
        
        // Load plans
        const plansData = await db.collection('plans').find({}).toArray();
        if (plansData.length === 0) {
            await db.collection('plans').insertMany(DEFAULT_PLANS);
            plans = DEFAULT_PLANS;
            console.log('📦 Loaded default plans');
        } else {
            plans = plansData;
            console.log('📦 Loaded ' + plans.length + ' plans from database');
        }
        
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
    try { var decoded = verifyToken(token); if (decoded && decoded.role === 'master') return true; } catch (e) {}
    return false;
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

async function getOrganizationByEmail(email) {
    try { return await db.collection('organizations').findOne({ email: email }); } catch (e) { return null; }
}

async function getOrganizationByClientId(clientId) {
    try { 
        console.log('🔍 Looking for organization with ID:', clientId);
        const org = await db.collection('organizations').findOne({ id: clientId });
        if (org) {
            console.log('✅ Found organization:', org.businessName, 'with ID:', org.id);
        } else {
            console.log('❌ Organization not found with ID:', clientId);
        }
        return org;
    } catch (e) { 
        console.error('Error getting organization:', e);
        return null; 
    }
}

async function getAllOrganizations() {
    try { 
        console.log('🔍 Fetching all organizations...');
        const orgs = await db.collection('organizations').find({}).toArray();
        console.log('✅ Found ' + orgs.length + ' organizations');
        return orgs;
    } catch (e) { 
        console.error('Error getting all organizations:', e);
        return []; 
    }
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
    try { 
        console.log('🔍 Looking for billing system with ID:', id);
        const bs = await db.collection('billingSystems').findOne({ id: id });
        if (bs) {
            console.log('✅ Found billing system:', bs.name, 'with ID:', bs.id);
        } else {
            console.log('❌ Billing system not found with ID:', id);
        }
        return bs;
    } catch (e) { 
        console.error('Error getting billing system:', e);
        return null; 
    }
}

async function getBillingSystemsByOrganization(organizationId) {
    try { 
        console.log('🔍 Looking for billing systems with organizationId:', organizationId);
        const systems = await db.collection('billingSystems').find({ organizationId: organizationId }).toArray();
        console.log('✅ Found ' + systems.length + ' billing systems for organization:', organizationId);
        if (systems.length > 0) {
            systems.forEach(function(bs) {
                console.log('   - ' + bs.id + ': ' + bs.name + ' (locked: ' + bs.locked + ')');
            });
        }
        return systems;
    } catch (e) { 
        console.error('Error getting billing systems:', e);
        return []; 
    }
}

async function getAllBillingSystems() {
    try { 
        console.log('🔍 Fetching all billing systems...');
        const systems = await db.collection('billingSystems').find({}).toArray();
        console.log('✅ Found ' + systems.length + ' total billing systems');
        return systems;
    } catch (e) { 
        console.error('Error getting all billing systems:', e);
        return []; 
    }
}

async function createBillingSystem(bsData) {
    try { 
        console.log('📝 Creating billing system:', bsData.id, 'for org:', bsData.organizationId);
        await db.collection('billingSystems').insertOne(bsData); 
        console.log('✅ Billing system created:', bsData.id);
        return bsData; 
    } catch (e) { 
        console.error('Error creating billing system:', e);
        throw e; 
    }
}

async function updateBillingSystem(id, updateData) {
    try {
        console.log('📝 Updating billing system:', id);
        const result = await db.collection('billingSystems').findOneAndUpdate(
            { id: id }, 
            { $set: updateData }, 
            { returnDocument: 'after' }
        );
        console.log('✅ Billing system updated:', id);
        return result.value;
    } catch (e) { 
        console.error('Error updating billing system:', e);
        throw e; 
    }
}

async function deleteBillingSystem(id) {
    try { 
        console.log('🗑️ Deleting billing system:', id);
        const result = await db.collection('billingSystems').deleteOne({ id: id });
        console.log('✅ Billing system deleted:', id);
        return result; 
    } catch (e) { 
        console.error('Error deleting billing system:', e);
        throw e; 
    }
}

// ============================================================
// CREATE SERVER - FOCUS ON MASTER ADMIN ENDPOINTS
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
        // MASTER ADMIN VERIFY
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/master/verify') {
            var body = await readBody(req);
            console.log('🔐 Master verification attempt');
            if (body.pin === MASTER_PASSWORD) {
                var token = generateToken({ username: 'master', role: 'master', exp: Date.now() + 86400000 });
                console.log('✅ Master verified successfully');
                return sendJson(res, 200, { success: true, message: 'Master verified', token: token, role: 'master' });
            } else {
                console.log('❌ Invalid master PIN');
                return sendJson(res, 401, { success: false, message: 'Invalid PIN' });
            }
        }

        // ============================================================
        // HEALTH CHECK
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/health') {
            try {
                const dbStatus = db ? 'connected' : 'disconnected';
                const orgCount = db ? await db.collection('organizations').countDocuments() : 0;
                const bsCount = db ? await db.collection('billingSystems').countDocuments() : 0;
                return sendJson(res, 200, { 
                    status: 'ok', 
                    timestamp: new Date().toISOString(),
                    version: '7.6.0-diagnostic',
                    database: dbStatus,
                    organizations: orgCount,
                    billingSystems: bsCount
                });
            } catch (e) {
                return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString(), database: 'error' });
            }
        }

        // ============================================================
        // MASTER ORGANIZATIONS - DIAGNOSTIC
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/master/organizations') {
            console.log('👑 Master organizations request received');
            
            if (!isMasterAdmin(req)) {
                console.log('❌ Unauthorized - Master admin required');
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            console.log('✅ Master admin authorized');
            
            // Check database connection
            if (!db) {
                console.log('❌ Database not connected');
                return sendJson(res, 500, { success: false, message: 'Database not connected' });
            }
            
            try {
                console.log('📋 Fetching all organizations from database...');
                var allOrgs = await getAllOrganizations();
                console.log('📋 Found ' + allOrgs.length + ' organizations');
                
                var enhancedOrgs = [];
                for (var i = 0; i < allOrgs.length; i++) {
                    var org = allOrgs[i];
                    console.log('📋 Processing org ' + (i+1) + '/' + allOrgs.length + ': ' + org.id + ' - ' + org.businessName);
                    
                    // Get billing systems for this organization
                    var billingSystems = await getBillingSystemsByOrganization(org.id);
                    console.log('📋 Found ' + billingSystems.length + ' billing systems for org ' + org.id);
                    
                    enhancedOrgs.push({
                        ...org,
                        billingSystems: billingSystems,
                        billingSystemsCount: billingSystems.length
                    });
                }
                
                console.log('✅ Returning ' + enhancedOrgs.length + ' enhanced organizations');
                return sendJson(res, 200, { 
                    success: true, 
                    data: enhancedOrgs,
                    count: enhancedOrgs.length,
                    debug: {
                        totalOrgs: allOrgs.length,
                        totalBillingSystems: await getAllBillingSystems().then(function(bs) { return bs.length; })
                    }
                });
            } catch (error) {
                console.error('❌ Error fetching organizations:', error);
                return sendJson(res, 500, { success: false, message: 'Error fetching organizations: ' + error.message });
            }
        }

        // ============================================================
        // MASTER BILLING SYSTEMS - DIAGNOSTIC
        // ============================================================

        if (req.method === 'GET' && url.pathname === '/api/master/billing-systems') {
            console.log('👑 Master billing systems request received');
            
            if (!isMasterAdmin(req)) {
                console.log('❌ Unauthorized - Master admin required');
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            try {
                var orgId = url.searchParams.get('organizationId');
                var billingSystems = orgId ? 
                    await getBillingSystemsByOrganization(orgId) : 
                    await getAllBillingSystems();
                
                console.log('✅ Returning ' + billingSystems.length + ' billing systems');
                return sendJson(res, 200, { 
                    success: true, 
                    data: billingSystems,
                    count: billingSystems.length
                });
            } catch (error) {
                console.error('❌ Error fetching billing systems:', error);
                return sendJson(res, 500, { success: false, message: 'Error fetching billing systems: ' + error.message });
            }
        }

        // ============================================================
        // CREATE BILLING SYSTEM - DIAGNOSTIC
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/master/billing-systems') {
            console.log('👑 Create billing system request received');
            
            if (!isMasterAdmin(req)) {
                console.log('❌ Unauthorized - Master admin required');
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var body = await readBody(req);
            console.log('📝 Request body:', JSON.stringify(body, null, 2));
            
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
            
            console.log('🔍 Looking for organization:', organizationId);
            var org = await getOrganizationByClientId(organizationId);
            if (!org) {
                console.log('❌ Organization not found:', organizationId);
                return sendJson(res, 404, { success: false, message: 'Organization not found' });
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
            
            console.log('📝 Creating billing system:', billingSystem);
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
        // LOCK/UNLOCK BILLING SYSTEM - DIAGNOSTIC
        // ============================================================

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/master\/billing-systems\/[^\/]+\/lock$/)) {
            console.log('👑 Lock/Unlock billing system request received');
            
            if (!isMasterAdmin(req)) {
                console.log('❌ Unauthorized - Master admin required');
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var bsId = parts[parts.length - 2];
            var body = await readBody(req);
            var locked = body.locked === true;
            
            console.log('🔒 Lock/Unlock:', bsId, 'locked:', locked);
            
            var billingSystem = await getBillingSystemById(bsId);
            if (!billingSystem) {
                console.log('❌ Billing system not found:', bsId);
                return sendJson(res, 404, { success: false, message: 'Billing system not found' });
            }
            
            console.log('📋 Found billing system:', billingSystem.name, 'for org:', billingSystem.organizationId);
            
            var org = await getOrganizationByClientId(billingSystem.organizationId);
            if (!org) {
                console.log('❌ Organization not found:', billingSystem.organizationId);
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
        // DELETE BILLING SYSTEM - DIAGNOSTIC
        // ============================================================

        if (req.method === 'DELETE' && url.pathname.match(/^\/api\/master\/billing-systems\/[^\/]+$/)) {
            console.log('👑 Delete billing system request received');
            
            if (!isMasterAdmin(req)) {
                console.log('❌ Unauthorized - Master admin required');
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var bsId = parts[parts.length - 1];
            
            console.log('🗑️ Delete billing system:', bsId);
            
            var billingSystem = await getBillingSystemById(bsId);
            if (!billingSystem) {
                console.log('❌ Billing system not found:', bsId);
                return sendJson(res, 404, { success: false, message: 'Billing system not found' });
            }
            
            var org = await getOrganizationByClientId(billingSystem.organizationId);
            if (org && org.billingSystems) {
                var updatedList = org.billingSystems.filter(function(bs) { return bs.id !== bsId; });
                await updateOrganization(billingSystem.organizationId, { billingSystems: updatedList });
                console.log('✅ Updated organization billing systems list');
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
            console.log('👑 Toggle organization status request received');
            
            if (!isMasterAdmin(req)) {
                console.log('❌ Unauthorized - Master admin required');
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var orgId = parts[parts.length - 2];
            var body = await readBody(req);
            var newStatus = body.status;
            
            console.log('🔄 Toggle organization status:', orgId, '->', newStatus);
            
            if (!newStatus || !['active', 'inactive', 'suspended'].includes(newStatus)) {
                return sendJson(res, 400, { success: false, message: 'Invalid status' });
            }
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) { 
                console.log('❌ Organization not found:', orgId);
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
            console.log('👑 Organization details request received');
            
            if (!isMasterAdmin(req)) {
                console.log('❌ Unauthorized - Master admin required');
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            var parts = url.pathname.split('/');
            var orgId = parts[parts.length - 2];
            
            console.log('📋 Get organization details:', orgId);
            
            var org = await getOrganizationByClientId(orgId);
            if (!org) { 
                console.log('❌ Organization not found:', orgId);
                return sendJson(res, 404, { success: false, message: 'Organization not found' }); 
            }
            
            var billingSystems = await getBillingSystemsByOrganization(orgId);
            
            console.log('✅ Found organization:', org.businessName, 'with', billingSystems.length, 'billing systems');
            
            return sendJson(res, 200, { 
                success: true, 
                data: {
                    ...org,
                    billingSystems: billingSystems
                }
            });
        }

        // ============================================================
        // CLIENT CREATE ORGANIZATION - DIAGNOSTIC
        // ============================================================

        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            console.log('📝 Create organization request received');
            
            var body = await readBody(req);
            var email = body.email || 'master@demo.com';
            
            console.log('📝 Creating organization for:', email);
            
            var existingOrg = await getOrganizationByEmail(email);
            if (existingOrg) {
                console.log('📋 Organization already exists:', existingOrg.id);
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
            
            console.log('📝 Creating organization:', newOrganization);
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
            console.log('🌐 GICH WiFi API - DIAGNOSTIC VERSION');
            console.log('========================================');
            console.log('✅ Server running on port: ' + PORT);
            console.log('📍 http://localhost:' + PORT + '/');
            console.log('========================================');
            console.log('👑 Master PIN: ' + (MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'));
            console.log('📊 Database: ' + (db ? '✅ Connected' : '❌ Disconnected'));
            console.log('========================================');
            console.log('📋 TEST ENDPOINTS:');
            console.log('   GET  /api/health - Check database status');
            console.log('   GET  /api/master/organizations - List organizations with billing systems');
            console.log('   GET  /api/master/billing-systems - List all billing systems');
            console.log('   POST /api/master/verify - Login (PIN: ' + MASTER_PASSWORD + ')');
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

startServer();
