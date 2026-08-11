/**
 * GICH WiFi - Complete Backend with Google OAuth & Client Self-Service
 * Deployable on Render with .env support
 */

// Load environment variables from .env file
require('dotenv').config();

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// ===================== CONFIGURATION =====================
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
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://billing-system-fm9a.onrender.com/api/auth/google/callback';

console.log('\n========================================');
console.log('🌐 GICH WiFi API - Client Self-Service');
console.log('========================================');
console.log('📋 Configuration loaded:');
console.log(`   Consumer Key: ${CONSUMER_KEY ? CONSUMER_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
console.log(`   Shortcode: ${SHORTCODE}`);
console.log(`   Callback URL: ${CALLBACK_URL}`);
console.log(`   Port: ${PORT}`);
console.log(`   Admin PIN: ${ADMIN_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'}`);
console.log(`   Master PIN: ${MASTER_PASSWORD ? '✅ Configured' : '⚠️ NOT SET'}`);
console.log(`   Google OAuth: ${GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'}`);
console.log('========================================\n');

// ============================================================
// ===================== JWT HELPER =====================
// ============================================================

function generateToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET)
        .update(header + '.' + body)
        .digest('base64url');
    return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
    try {
        const [header, body, signature] = token.split('.');
        const expectedSignature = crypto.createHmac('sha256', JWT_SECRET)
            .update(header + '.' + body)
            .digest('base64url');
        if (signature !== expectedSignature) return null;
        return JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch (error) {
        return null;
    }
}

// ============================================================
// ===================== HTTPS AGENT =====================
// ============================================================

const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
});

// ============================================================
// ===================== DATA STORAGE =====================
// ============================================================

const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');
const VOUCHERS_FILE = path.join(__dirname, 'vouchers.json');
const PLANS_FILE = path.join(__dirname, 'plans.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const THEMES_FILE = path.join(__dirname, 'themes.json');
const CLIENTS_FILE = path.join(__dirname, 'clients.json');
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const ORGANIZATIONS_FILE = path.join(__dirname, 'organizations.json');
const MASTER_SETTINGS_FILE = path.join(__dirname, 'master-settings.json');
const CLIENT_USERS_FILE = path.join(__dirname, 'client-users.json');

let transactions = [];
let vouchers = [];
let plans = [];
let settings = {};
let themes = [];
let clients = [];
let products = [];
let organizations = [];
let masterSettings = {};
let clientUsers = [];

// ============================================================
// ===================== DEFAULT SETTINGS =====================
// ============================================================

const DEFAULT_SETTINGS = {
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

const DEFAULT_MASTER_SETTINGS = {
    masterBusinessName: 'GICH WiFi Master',
    masterEmail: 'master@gichwifi.co.ke',
    masterPhone: '0796587763',
    defaultPrimaryColor: '#00c853',
    defaultBgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    commissionRate: 5,
    createdAt: new Date().toISOString()
};

// ============================================================
// ===================== DEFAULT THEMES =====================
// ============================================================

const DEFAULT_THEMES = [
    {
        id: 'default',
        name: 'Default Green',
        preview: '🌿',
        colors: {
            primary: '#00c853',
            secondary: '#00e676',
            accent: '#0f2027',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)'
    },
    {
        id: 'ocean',
        name: 'Ocean Blue',
        preview: '🌊',
        colors: {
            primary: '#0077be',
            secondary: '#00b4d8',
            accent: '#03045e',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #03045e, #0077be, #00b4d8)'
    },
    {
        id: 'sunset',
        name: 'Sunset Orange',
        preview: '🌅',
        colors: {
            primary: '#ff6b35',
            secondary: '#ff9a56',
            accent: '#1a0a00',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #1a0a00, #ff6b35, #ff9a56)'
    },
    {
        id: 'midnight',
        name: 'Midnight Purple',
        preview: '🌙',
        colors: {
            primary: '#7c3aed',
            secondary: '#a78bfa',
            accent: '#0c0a1a',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #0c0a1a, #4c1d95, #7c3aed)'
    },
    {
        id: 'forest',
        name: 'Forest Green',
        preview: '🌲',
        colors: {
            primary: '#2d6a4f',
            secondary: '#40916c',
            accent: '#081c15',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #081c15, #2d6a4f, #40916c)'
    },
    {
        id: 'rose',
        name: 'Rose Pink',
        preview: '🌹',
        colors: {
            primary: '#e91e63',
            secondary: '#f06292',
            accent: '#1a0a12',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #1a0a12, #c2185b, #e91e63)'
    },
    {
        id: 'gold',
        name: 'Gold Premium',
        preview: '✨',
        colors: {
            primary: '#f9a825',
            secondary: '#fdd835',
            accent: '#1a1500',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #1a1500, #f9a825, #fdd835)'
    },
    {
        id: 'nebula',
        name: 'Nebula Cosmic',
        preview: '🌌',
        colors: {
            primary: '#e040fb',
            secondary: '#7c4dff',
            accent: '#0a0a1a',
            text: '#ffffff',
            headerText: '#ffffff',
            buttonText: '#000000'
        },
        gradient: 'linear-gradient(135deg, #0a0a1a, #7c4dff, #e040fb)'
    }
];

// ============================================================
// ===================== LOAD DATA =====================
// ============================================================

// Load all data files (same as before, plus clientUsers)
// ... [load all existing data files]

// Load client users
if (fs.existsSync(CLIENT_USERS_FILE)) {
    try {
        const data = fs.readFileSync(CLIENT_USERS_FILE, 'utf8');
        clientUsers = JSON.parse(data);
        console.log(`👤 Loaded ${clientUsers.length} client users`);
    } catch (error) {
        console.error('Error loading client users:', error);
        clientUsers = [];
    }
} else {
    clientUsers = [];
    saveClientUsers();
}

function saveClientUsers() {
    try {
        fs.writeFileSync(CLIENT_USERS_FILE, JSON.stringify(clientUsers, null, 2));
    } catch (error) {
        console.error('⚠️ Could not save client users:', error.message);
    }
}

// ============================================================
// ===================== GOOGLE OAUTH HELPER =====================
// ============================================================

function verifyGoogleToken(idToken) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            id_token: idToken
        });

        const options = {
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/tokeninfo?id_token=' + encodeURIComponent(idToken),
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000,
            agent: agent
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.aud && json.email) {
                        resolve(json);
                    } else {
                        reject(new Error('Invalid token'));
                    }
                } catch (e) {
                    reject(new Error('Invalid response'));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
        req.end();
    });
}

// ============================================================
// ===================== HELPERS =====================
// ============================================================

function generateOrgId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'CLIENT_' + code;
}

function getOrganizationByClientId(clientId) {
    return organizations.find(org => org.id === clientId);
}

function getOrganizationByEmail(email) {
    return organizations.find(org => org.email === email);
}

function getClientUserByEmail(email) {
    return clientUsers.find(u => u.email === email);
}

// ============================================================
// ===================== CLIENT AUTH ENDPOINTS =====================
// ============================================================

// Client Signup/Login with Google
if (req.method === 'POST' && url.pathname === '/api/client/auth/google') {
    const body = await readBody(req);
    const { idToken, email, name, picture } = body;

    if (!idToken || !email) {
        return sendJson(res, 400, { success: false, message: 'Missing required fields' });
    }

    try {
        // Verify Google token
        const googleData = await verifyGoogleToken(idToken);
        
        if (googleData.email !== email) {
            return sendJson(res, 401, { success: false, message: 'Email mismatch' });
        }

        // Check if user exists
        let user = getClientUserByEmail(email);
        let organization = getOrganizationByEmail(email);

        if (!user) {
            // Create new user
            user = {
                id: 'USER_' + Date.now() + Math.random().toString(36).substring(7),
                email: email,
                name: name || email.split('@')[0],
                picture: picture || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                hasOrganization: !!organization
            };
            clientUsers.push(user);
            saveClientUsers();
        }

        // Generate JWT for client
        const token = generateToken({
            email: email,
            userId: user.id,
            role: 'client',
            exp: Date.now() + 86400000 * 7 // 7 days
        });

        return sendJson(res, 200, {
            success: true,
            token: token,
            user: {
                email: user.email,
                name: user.name,
                picture: user.picture,
                hasOrganization: user.hasOrganization
            },
            organization: organization || null
        });

    } catch (error) {
        console.error('Google auth error:', error);
        return sendJson(res, 401, { success: false, message: 'Authentication failed: ' + error.message });
    }
}

// Get client's own data
if (req.method === 'GET' && url.pathname === '/api/client/me') {
    const auth = req.headers.authorization;
    if (!auth) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }
    const token = auth.replace('Bearer ', '');
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'client') {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }

    const user = getClientUserByEmail(decoded.email);
    if (!user) {
        return sendJson(res, 404, { success: false, message: 'User not found' });
    }

    const organization = getOrganizationByEmail(decoded.email);

    return sendJson(res, 200, {
        success: true,
        user: {
            email: user.email,
            name: user.name,
            picture: user.picture,
            hasOrganization: user.hasOrganization
        },
        organization: organization || null
    });
}

// Create/Update organization (client self-service)
if (req.method === 'POST' && url.pathname === '/api/client/organization') {
    const auth = req.headers.authorization;
    if (!auth) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }
    const token = auth.replace('Bearer ', '');
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'client') {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }

    const body = await readBody(req);
    const user = getClientUserByEmail(decoded.email);
    if (!user) {
        return sendJson(res, 404, { success: false, message: 'User not found' });
    }

    let organization = getOrganizationByEmail(decoded.email);

    const {
        businessName,
        businessTagline,
        logo,
        primaryColor,
        secondaryColor,
        accentColor,
        supportPhone,
        supportEmail,
        website,
        plans: customPlans
    } = body;

    if (!businessName) {
        return sendJson(res, 400, { success: false, message: 'Business name is required' });
    }

    if (!organization) {
        // Create new organization
        const clientId = generateOrgId();
        organization = {
            id: clientId,
            name: businessName,
            businessName: businessName,
            email: decoded.email,
            phone: supportPhone || '',
            logo: logo || '',
            primaryColor: primaryColor || '#00c853',
            secondaryColor: secondaryColor || '#00e676',
            accentColor: accentColor || '#0f2027',
            textColor: '#ffffff',
            headerTextColor: '#ffffff',
            buttonTextColor: '#000000',
            bgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
            supportPhone: supportPhone || '',
            supportEmail: supportEmail || decoded.email,
            website: website || '',
            businessTagline: businessTagline || 'Fast • Secure • Reliable',
            mpesaTill: '',
            mpesaShortcode: SHORTCODE,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            plans: customPlans || [
                { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, shared_users: 1, duration_seconds: 7200 },
                { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, shared_users: 1, duration_seconds: 18000 },
                { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, shared_users: 1, duration_seconds: 86400 }
            ]
        };
        organizations.push(organization);
        saveOrganizations();

        user.hasOrganization = true;
        saveClientUsers();

        // Also add to clients for backward compatibility
        const newClient = {
            id: organization.id,
            name: businessName,
            phone: supportPhone || '',
            email: decoded.email,
            businessName: businessName,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isOrganization: true,
            organizationId: organization.id
        };
        clients.push(newClient);
        saveClients();

        return sendJson(res, 200, {
            success: true,
            message: 'Organization created successfully!',
            organization: organization,
            clientId: organization.id
        });
    } else {
        // Update existing organization
        organization.businessName = businessName || organization.businessName;
        organization.name = businessName || organization.name;
        organization.businessTagline = businessTagline || organization.businessTagline;
        organization.logo = logo || organization.logo;
        organization.primaryColor = primaryColor || organization.primaryColor;
        organization.secondaryColor = secondaryColor || organization.secondaryColor;
        organization.accentColor = accentColor || organization.accentColor;
        organization.supportPhone = supportPhone || organization.supportPhone;
        organization.supportEmail = supportEmail || organization.supportEmail;
        organization.website = website || organization.website;
        if (customPlans && customPlans.length > 0) {
            organization.plans = customPlans;
        }
        organization.updatedAt = new Date().toISOString();

        saveOrganizations();

        // Update clients entry
        const clientIndex = clients.findIndex(c => c.id === organization.id);
        if (clientIndex !== -1) {
            clients[clientIndex].businessName = businessName || clients[clientIndex].businessName;
            clients[clientIndex].phone = supportPhone || clients[clientIndex].phone;
            clients[clientIndex].email = decoded.email;
            clients[clientIndex].updatedAt = new Date().toISOString();
            saveClients();
        }

        return sendJson(res, 200, {
            success: true,
            message: 'Organization updated successfully!',
            organization: organization
        });
    }
}

// Client gets their own vouchers
if (req.method === 'GET' && url.pathname === '/api/client/vouchers') {
    const auth = req.headers.authorization;
    if (!auth) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }
    const token = auth.replace('Bearer ', '');
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'client') {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }

    const organization = getOrganizationByEmail(decoded.email);
    if (!organization) {
        return sendJson(res, 404, { success: false, message: 'Organization not found' });
    }

    // Get vouchers belonging to this organization
    const orgVouchers = vouchers.filter(v => v.organizationId === organization.id);

    return sendJson(res, 200, {
        success: true,
        data: orgVouchers,
        count: orgVouchers.length,
        used: orgVouchers.filter(v => v.used).length,
        unused: orgVouchers.filter(v => !v.used).length
    });
}

// Client generates vouchers
if (req.method === 'POST' && url.pathname === '/api/client/voucher/generate') {
    const auth = req.headers.authorization;
    if (!auth) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }
    const token = auth.replace('Bearer ', '');
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'client') {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }

    const body = await readBody(req);
    const { planId, count, duration_seconds } = body;

    const organization = getOrganizationByEmail(decoded.email);
    if (!organization) {
        return sendJson(res, 404, { success: false, message: 'Organization not found' });
    }

    const plan = organization.plans.find(p => p.id === planId);
    if (!plan) {
        return sendJson(res, 400, { success: false, message: 'Invalid plan ID' });
    }

    const numVouchers = Math.min(count || 1, 100);
    const generated = [];

    for (let i = 0; i < numVouchers; i++) {
        const code = generateVoucherCode();
        const voucher = {
            code: code,
            planId: plan.id,
            planName: plan.name,
            duration_seconds: duration_seconds || plan.duration_seconds,
            devices: plan.devices || 1,
            organizationId: organization.id,
            used: false,
            usedBy: null,
            usedAt: null,
            expiresAt: null,
            createdAt: new Date().toISOString()
        };
        vouchers.push(voucher);
        generated.push(code);
    }
    saveVouchers();

    return sendJson(res, 200, {
        success: true,
        message: `Generated ${generated.length} vouchers`,
        vouchers: generated,
        count: generated.length
    });
}

// Client gets their transactions
if (req.method === 'GET' && url.pathname === '/api/client/transactions') {
    const auth = req.headers.authorization;
    if (!auth) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }
    const token = auth.replace('Bearer ', '');
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'client') {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    }

    const organization = getOrganizationByEmail(decoded.email);
    if (!organization) {
        return sendJson(res, 404, { success: false, message: 'Organization not found' });
    }

    // Get transactions for this organization
    // We need to filter transactions by organization ID
    // This requires adding organizationId to transactions
    const orgTransactions = transactions.filter(t => t.organizationId === organization.id);

    return sendJson(res, 200, {
        success: true,
        data: orgTransactions,
        count: orgTransactions.length,
        summary: {
            total: orgTransactions.length,
            completed: orgTransactions.filter(t => t.status === 'completed').length,
            pending: orgTransactions.filter(t => t.status === 'pending').length,
            totalRevenue: orgTransactions
                .filter(t => t.status === 'completed')
                .reduce((sum, t) => sum + (t.amount || 0), 0)
        }
    });
}

// ============================================================
// ===================== VOUCHER GENERATOR =====================
// ============================================================

function generateVoucherCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ============================================================
// ===================== CREATE SERVER =====================
// ============================================================

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log(`📥 ${req.method} ${url.pathname}`);

    try {
        // ===== SERVE HTML FILES =====
        if (req.method === 'GET' && url.pathname === '/') {
            sendHtml(res, 200, `
                <!DOCTYPE html>
                <html>
                <head><title>GICH WiFi</title></head>
                <body style="font-family:Arial;padding:20px;background:#0f172a;color:white;">
                    <h1>🌐 GICH WiFi Server</h1>
                    <p>✅ Server is running!</p>
                    <hr>
                    <p><a href="/client-signup.html">📝 Client Signup</a></p>
                    <p><a href="/master-admin.html">👑 Master Admin (Local Only)</a></p>
                </body>
                </html>
            `);
            return;
        }

        // Serve client-signup.html
        if (req.method === 'GET' && url.pathname === '/client-signup.html') {
            if (serveHtmlFile(res, 'client-signup.html')) {
                return;
            }
            sendHtml(res, 404, `<h1>File not found</h1><p>client-signup.html not found</p>`);
            return;
        }

        // ============================================================
        // ===================== CLIENT AUTH ENDPOINTS =====================
        // ============================================================

        // Client Signup/Login with Google
        if (req.method === 'POST' && url.pathname === '/api/client/auth/google') {
            const body = await readBody(req);
            const { idToken, email, name, picture } = body;

            if (!idToken || !email) {
                return sendJson(res, 400, { success: false, message: 'Missing required fields' });
            }

            try {
                const googleData = await verifyGoogleToken(idToken);
                if (googleData.email !== email) {
                    return sendJson(res, 401, { success: false, message: 'Email mismatch' });
                }

                let user = getClientUserByEmail(email);
                let organization = getOrganizationByEmail(email);

                if (!user) {
                    user = {
                        id: 'USER_' + Date.now() + Math.random().toString(36).substring(7),
                        email: email,
                        name: name || email.split('@')[0],
                        picture: picture || '',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        hasOrganization: !!organization
                    };
                    clientUsers.push(user);
                    saveClientUsers();
                }

                const token = generateToken({
                    email: email,
                    userId: user.id,
                    role: 'client',
                    exp: Date.now() + 86400000 * 7
                });

                return sendJson(res, 200, {
                    success: true,
                    token: token,
                    user: {
                        email: user.email,
                        name: user.name,
                        picture: user.picture,
                        hasOrganization: user.hasOrganization
                    },
                    organization: organization || null
                });

            } catch (error) {
                console.error('Google auth error:', error);
                return sendJson(res, 401, { success: false, message: 'Authentication failed: ' + error.message });
            }
        }

        // Get client's own data
        if (req.method === 'GET' && url.pathname === '/api/client/me') {
            const auth = req.headers.authorization;
            if (!auth) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const decoded = verifyToken(auth.replace('Bearer ', ''));
            if (!decoded || decoded.role !== 'client') return sendJson(res, 401, { success: false, message: 'Unauthorized' });

            const user = getClientUserByEmail(decoded.email);
            if (!user) return sendJson(res, 404, { success: false, message: 'User not found' });

            const organization = getOrganizationByEmail(decoded.email);

            return sendJson(res, 200, {
                success: true,
                user: {
                    email: user.email,
                    name: user.name,
                    picture: user.picture,
                    hasOrganization: user.hasOrganization
                },
                organization: organization || null
            });
        }

        // Create/Update organization (client self-service)
        if (req.method === 'POST' && url.pathname === '/api/client/organization') {
            const auth = req.headers.authorization;
            if (!auth) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const decoded = verifyToken(auth.replace('Bearer ', ''));
            if (!decoded || decoded.role !== 'client') return sendJson(res, 401, { success: false, message: 'Unauthorized' });

            const body = await readBody(req);
            const user = getClientUserByEmail(decoded.email);
            if (!user) return sendJson(res, 404, { success: false, message: 'User not found' });

            let organization = getOrganizationByEmail(decoded.email);
            const { businessName, businessTagline, logo, primaryColor, secondaryColor, accentColor, supportPhone, supportEmail, website, plans: customPlans } = body;

            if (!businessName) {
                return sendJson(res, 400, { success: false, message: 'Business name is required' });
            }

            if (!organization) {
                const clientId = generateOrgId();
                organization = {
                    id: clientId,
                    name: businessName,
                    businessName: businessName,
                    email: decoded.email,
                    phone: supportPhone || '',
                    logo: logo || '',
                    primaryColor: primaryColor || '#00c853',
                    secondaryColor: secondaryColor || '#00e676',
                    accentColor: accentColor || '#0f2027',
                    textColor: '#ffffff',
                    headerTextColor: '#ffffff',
                    buttonTextColor: '#000000',
                    bgGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
                    supportPhone: supportPhone || '',
                    supportEmail: supportEmail || decoded.email,
                    website: website || '',
                    businessTagline: businessTagline || 'Fast • Secure • Reliable',
                    mpesaTill: '',
                    mpesaShortcode: SHORTCODE,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    plans: customPlans || [
                        { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, shared_users: 1, duration_seconds: 7200 },
                        { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, shared_users: 1, duration_seconds: 18000 },
                        { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, shared_users: 1, duration_seconds: 86400 }
                    ]
                };
                organizations.push(organization);
                saveOrganizations();

                user.hasOrganization = true;
                saveClientUsers();

                const newClient = {
                    id: organization.id,
                    name: businessName,
                    phone: supportPhone || '',
                    email: decoded.email,
                    businessName: businessName,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isOrganization: true,
                    organizationId: organization.id
                };
                clients.push(newClient);
                saveClients();

                return sendJson(res, 200, {
                    success: true,
                    message: 'Organization created successfully!',
                    organization: organization,
                    clientId: organization.id
                });
            } else {
                organization.businessName = businessName || organization.businessName;
                organization.name = businessName || organization.name;
                organization.businessTagline = businessTagline || organization.businessTagline;
                organization.logo = logo || organization.logo;
                organization.primaryColor = primaryColor || organization.primaryColor;
                organization.secondaryColor = secondaryColor || organization.secondaryColor;
                organization.accentColor = accentColor || organization.accentColor;
                organization.supportPhone = supportPhone || organization.supportPhone;
                organization.supportEmail = supportEmail || organization.supportEmail;
                organization.website = website || organization.website;
                if (customPlans && customPlans.length > 0) {
                    organization.plans = customPlans;
                }
                organization.updatedAt = new Date().toISOString();

                saveOrganizations();

                const clientIndex = clients.findIndex(c => c.id === organization.id);
                if (clientIndex !== -1) {
                    clients[clientIndex].businessName = businessName || clients[clientIndex].businessName;
                    clients[clientIndex].phone = supportPhone || clients[clientIndex].phone;
                    clients[clientIndex].email = decoded.email;
                    clients[clientIndex].updatedAt = new Date().toISOString();
                    saveClients();
                }

                return sendJson(res, 200, {
                    success: true,
                    message: 'Organization updated successfully!',
                    organization: organization
                });
            }
        }

        // Client gets their vouchers
        if (req.method === 'GET' && url.pathname === '/api/client/vouchers') {
            const auth = req.headers.authorization;
            if (!auth) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const decoded = verifyToken(auth.replace('Bearer ', ''));
            if (!decoded || decoded.role !== 'client') return sendJson(res, 401, { success: false, message: 'Unauthorized' });

            const organization = getOrganizationByEmail(decoded.email);
            if (!organization) return sendJson(res, 404, { success: false, message: 'Organization not found' });

            const orgVouchers = vouchers.filter(v => v.organizationId === organization.id);

            return sendJson(res, 200, {
                success: true,
                data: orgVouchers,
                count: orgVouchers.length,
                used: orgVouchers.filter(v => v.used).length,
                unused: orgVouchers.filter(v => !v.used).length
            });
        }

        // Client generates vouchers
        if (req.method === 'POST' && url.pathname === '/api/client/voucher/generate') {
            const auth = req.headers.authorization;
            if (!auth) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const decoded = verifyToken(auth.replace('Bearer ', ''));
            if (!decoded || decoded.role !== 'client') return sendJson(res, 401, { success: false, message: 'Unauthorized' });

            const body = await readBody(req);
            const { planId, count, duration_seconds } = body;

            const organization = getOrganizationByEmail(decoded.email);
            if (!organization) return sendJson(res, 404, { success: false, message: 'Organization not found' });

            const plan = organization.plans.find(p => p.id === planId);
            if (!plan) return sendJson(res, 400, { success: false, message: 'Invalid plan ID' });

            const numVouchers = Math.min(count || 1, 100);
            const generated = [];

            for (let i = 0; i < numVouchers; i++) {
                const code = generateVoucherCode();
                const voucher = {
                    code: code,
                    planId: plan.id,
                    planName: plan.name,
                    duration_seconds: duration_seconds || plan.duration_seconds,
                    devices: plan.devices || 1,
                    organizationId: organization.id,
                    used: false,
                    usedBy: null,
                    usedAt: null,
                    expiresAt: null,
                    createdAt: new Date().toISOString()
                };
                vouchers.push(voucher);
                generated.push(code);
            }
            saveVouchers();

            return sendJson(res, 200, {
                success: true,
                message: `Generated ${generated.length} vouchers`,
                vouchers: generated,
                count: generated.length
            });
        }

        // Client gets their transactions
        if (req.method === 'GET' && url.pathname === '/api/client/transactions') {
            const auth = req.headers.authorization;
            if (!auth) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            const decoded = verifyToken(auth.replace('Bearer ', ''));
            if (!decoded || decoded.role !== 'client') return sendJson(res, 401, { success: false, message: 'Unauthorized' });

            const organization = getOrganizationByEmail(decoded.email);
            if (!organization) return sendJson(res, 404, { success: false, message: 'Organization not found' });

            const orgTransactions = transactions.filter(t => t.organizationId === organization.id);

            return sendJson(res, 200, {
                success: true,
                data: orgTransactions,
                count: orgTransactions.length,
                summary: {
                    total: orgTransactions.length,
                    completed: orgTransactions.filter(t => t.status === 'completed').length,
                    pending: orgTransactions.filter(t => t.status === 'pending').length,
                    totalRevenue: orgTransactions
                        .filter(t => t.status === 'completed')
                        .reduce((sum, t) => sum + (t.amount || 0), 0)
                }
            });
        }

        // ============================================================
        // ===================== REST OF EXISTING ENDPOINTS =====================
        // ============================================================
        // ... [All your existing endpoints for payment, plans, etc.]

        return sendJson(res, 404, { error: 'Route not found' });

    } catch (err) {
        console.error('Server error:', err);
        return sendJson(res, 500, { error: 'Internal server error' });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n========================================');
    console.log('🌐 GICH WiFi API - Client Self-Service');
    console.log('========================================');
    console.log(`✅ Server running on port: ${PORT}`);
    console.log(`📍 http://localhost:${PORT}/`);
    console.log(`📍 http://localhost:${PORT}/client-signup.html`);
    console.log('========================================');
    console.log(`👑 Master PIN: ${MASTER_PASSWORD ? '✅ Set' : '⚠️ NOT SET'}`);
    console.log(`🔑 Google OAuth: ${GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️ NOT SET'}`);
    console.log('========================================\n');
});

process.on('uncaughtException', (err) => console.error('❌ Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));
