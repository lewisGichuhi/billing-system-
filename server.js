/**
 * GICH WiFi - Complete Backend with Voucher System
 * Deployable on Render with .env support
 */

// Load environment variables from .env file
require('dotenv').config();

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// ============================================================
// ===================== CONFIGURATION =====================
// ============================================================

const SHORTCODE = process.env.SHORTCODE || '174379';
const PASSKEY = process.env.PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const CONSUMER_KEY = process.env.CONSUMER_KEY || '';
const CONSUMER_SECRET = process.env.CONSUMER_SECRET || '';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://billing-system-fm9a.onrender.com/api/mpesa-callback';
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

console.log('\n========================================');
console.log('🌐 GICH WiFi API');
console.log('========================================');
console.log('📋 Configuration loaded:');
console.log(`   Consumer Key: ${CONSUMER_KEY ? CONSUMER_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
console.log(`   Shortcode: ${SHORTCODE}`);
console.log(`   Callback URL: ${CALLBACK_URL}`);
console.log(`   Port: ${PORT}`);
console.log('========================================\n');

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

let transactions = [];
let vouchers = [];
let plans = [];

// Default plans
const DEFAULT_PLANS = [
    { id: '2_Hours', name: '2 Hours', price: 10, devices: 1, duration_seconds: 7200 },
    { id: '5_Hours', name: '5 Hours', price: 20, devices: 1, duration_seconds: 18000 },
    { id: '8_Hours', name: '8 Hours', price: 30, devices: 1, duration_seconds: 28800 },
    { id: '12_Hours', name: '12 Hours', price: 50, devices: 1, duration_seconds: 43200 },
    { id: '24_Hours', name: '24 Hours', price: 80, devices: 1, duration_seconds: 86400 },
    { id: '1_Week_1_Device', name: '1 Week (1 Device)', price: 300, devices: 1, duration_seconds: 604800 },
    { id: '1_Week_3_Devices', name: '1 Week (3 Devices)', price: 400, devices: 3, duration_seconds: 604800 },
    { id: '1_Month_1_Device', name: '1 Month (1 Device)', price: 1000, devices: 1, duration_seconds: 2592000 },
    { id: '1_Month_3_Devices', name: '1 Month (3 Devices)', price: 1200, devices: 3, duration_seconds: 2592000 }
];

// Load transactions
if (fs.existsSync(TRANSACTIONS_FILE)) {
    try {
        const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf8');
        transactions = JSON.parse(data);
        console.log(`📂 Loaded ${transactions.length} transactions`);
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Load vouchers
if (fs.existsSync(VOUCHERS_FILE)) {
    try {
        const data = fs.readFileSync(VOUCHERS_FILE, 'utf8');
        vouchers = JSON.parse(data);
        console.log(`🎟️ Loaded ${vouchers.length} vouchers`);
    } catch (error) {
        console.error('Error loading vouchers:', error);
    }
}

// Load plans
if (fs.existsSync(PLANS_FILE)) {
    try {
        const data = fs.readFileSync(PLANS_FILE, 'utf8');
        plans = JSON.parse(data);
        console.log(`📦 Loaded ${plans.length} plans`);
    } catch (error) {
        console.error('Error loading plans:', error);
        plans = DEFAULT_PLANS;
    }
} else {
    plans = DEFAULT_PLANS;
    savePlans();
}

function saveTransactions() {
    try {
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
        console.log('💾 Transactions saved');
    } catch (error) {
        console.error('⚠️ Could not save transactions:', error.message);
    }
}

function saveVouchers() {
    try {
        fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(vouchers, null, 2));
        console.log('💾 Vouchers saved');
    } catch (error) {
        console.error('⚠️ Could not save vouchers:', error.message);
    }
}

function savePlans() {
    try {
        fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
        console.log('💾 Plans saved');
    } catch (error) {
        console.error('⚠️ Could not save plans:', error.message);
    }
}

// ============================================================
// ===================== HELPERS =====================
// ============================================================

function getPlanName(planId) {
    const plan = plans.find(p => p.id === planId);
    return plan ? plan.name : planId;
}

function getPlanDuration(planId) {
    const plan = plans.find(p => p.id === planId);
    return plan ? plan.duration_seconds : 3600;
}

function generateVoucherCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function normalizePhone(rawPhone) {
    if (!rawPhone) return null;
    let digits = String(rawPhone).trim().replace(/[^0-9+]/g, '');
    digits = digits.replace(/^\+/, '');
    
    if (digits.startsWith('0')) digits = digits.substring(1);
    if (digits.length === 9 && digits.startsWith('7')) return `254${digits}`;
    if (digits.length === 10 && digits.startsWith('7')) return `254${digits}`;
    if (digits.startsWith('254')) return digits;
    
    return digits;
}

function timestampNow() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ============================================================
// ===================== REQUEST HELPER =====================
// ============================================================

function simpleRequest(method, urlString, headers = {}, jsonBody = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const payload = jsonBody ? JSON.stringify(jsonBody) : null;

        console.log(`\n[REQUEST] ${method} ${urlString}`);

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: method.toUpperCase(),
            headers: {
                ...headers,
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                'Connection': 'keep-alive'
            },
            timeout: 60000,
            agent: agent,
            family: 4
        };

        const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const bodyText = Buffer.concat(chunks).toString('utf8');
                let bodyJson = null;
                try { bodyJson = JSON.parse(bodyText); } catch (_) {}
                
                console.log(`[RESPONSE] Status: ${res.statusCode}`);
                if (bodyText && bodyText.length < 500) {
                    console.log(`[RESPONSE] Body: ${bodyText}`);
                }
                
                resolve({
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    bodyText,
                    bodyJson
                });
            });
        });

        req.on('error', (err) => {
            console.error('[REQUEST ERROR]', err.message);
            reject(new Error(`Request failed: ${err.message}`));
        });
        
        req.on('timeout', () => {
            console.error('[REQUEST TIMEOUT]');
            req.destroy();
            reject(new Error('Request timed out'));
        });

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

// ============================================================
// ===================== OAUTH =====================
// ============================================================

async function getAccessToken() {
    console.log('\n🔑 Getting access token...');
    
    if (!CONSUMER_KEY || !CONSUMER_SECRET) {
        throw new Error('Consumer Key or Secret not configured. Check .env file.');
    }
    
    const auth = Buffer.from(`${CONSUMER_KEY.trim()}:${CONSUMER_SECRET.trim()}`).toString('base64');

    const res = await simpleRequest(
        'GET',
        'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
        }
    );

    if (res.statusCode !== 200) {
        throw new Error(`OAuth failed (${res.statusCode}): ${res.bodyText}`);
    }

    if (!res.bodyJson || !res.bodyJson.access_token) {
        throw new Error('No access token in response');
    }

    console.log('✅ Access token obtained');
    return res.bodyJson.access_token;
}

// ============================================================
// ===================== STK PUSH =====================
// ============================================================

async function stkPush({ phone, amount, accountReference }) {
    console.log('\n💳 Starting STK Push...');
    console.log(`📱 Phone: ${phone}`);
    console.log(`💰 Amount: ${amount}`);

    const numericAmount = Math.round(Number(amount));
    if (isNaN(numericAmount) || numericAmount < 1) {
        throw new Error('Invalid amount');
    }

    const formattedPhone = normalizePhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
        throw new Error(`Invalid phone: ${phone}`);
    }

    const token = await getAccessToken();
    const timestamp = timestampNow();
    const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

    const payload = {
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: numericAmount,
        PartyA: formattedPhone,
        PartyB: SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: CALLBACK_URL,
        AccountReference: accountReference || 'GICH-WIFI',
        TransactionDesc: 'GICH WiFi Payment'
    };

    console.log('📤 Sending STK Push to Safaricom...');
    
    const res = await simpleRequest(
        'POST',
        'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        payload
    );

    if (!res.bodyJson) {
        throw new Error('Invalid response from Safaricom');
    }

    if (res.bodyJson.ResponseCode === '0') {
        console.log('✅ STK Push successful!');
        return {
            success: true,
            data: res.bodyJson,
            checkoutId: res.bodyJson.CheckoutRequestID,
            message: res.bodyJson.CustomerMessage || 'STK Push sent'
        };
    } else {
        throw new Error(res.bodyJson.ResponseDescription || 'STK Push failed');
    }
}

// ============================================================
// ===================== SERVER FUNCTIONS =====================
// ============================================================

function sendJson(res, statusCode, obj) {
    res.writeHead(statusCode, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(obj, null, 2));
}

function sendHtml(res, statusCode, html) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html' });
    res.end(html);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => raw += chunk);
        req.on('end', () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } 
            catch (e) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

// ============================================================
// ===================== FIND HTML FILE =====================
// ============================================================

function findHtmlFile(filename) {
    const possiblePaths = [
        path.join(__dirname, filename),
        path.join(__dirname, '..', filename),
        path.join(__dirname, 'public', filename),
        path.join(__dirname, '..', 'public', filename),
        path.join(__dirname, '..', '..', filename)
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

function serveHtmlFile(res, filename) {
    try {
        const filePath = findHtmlFile(filename);
        if (filePath) {
            const html = fs.readFileSync(filePath, 'utf8');
            console.log(`📄 Serving ${filename} from: ${filePath}`);
            sendHtml(res, 200, html);
            return true;
        } else {
            console.log(`❌ ${filename} not found`);
            return false;
        }
    } catch (err) {
        console.error(`Error serving ${filename}:`, err);
        return false;
    }
}

// ============================================================
// ===================== CREATE SERVER =====================
// ============================================================

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
            if (serveHtmlFile(res, 'GICH_wifi.html')) {
                return;
            }
            sendHtml(res, 200, `
                <!DOCTYPE html>
                <html>
                <head><title>GICH WiFi</title></head>
                <body style="font-family:Arial;padding:20px;background:#0f172a;color:white;">
                    <h1>🌐 GICH WiFi Server</h1>
                    <p>✅ Server is running!</p>
                    <hr>
                    <p><a href="/api/health">API Health</a></p>
                    <p><a href="/api/plans">Plans</a></p>
                    <p><a href="/api/admin/transactions">Transactions (Admin)</a></p>
                </body>
                </html>
            `);
            return;
        }

        // Serve GICH_wifi.html
        if (req.method === 'GET' && (url.pathname === '/GICH_wifi.html' || url.pathname === '/GICH%20wifi.html')) {
            if (serveHtmlFile(res, 'GICH_wifi.html')) {
                return;
            }
            sendHtml(res, 404, `<h1>File not found</h1><p>GICH_wifi.html not found</p>`);
            return;
        }

        // ============================================================
        // ===================== PUBLIC API ENDPOINTS =====================
        // ============================================================

        // Health
        if (req.method === 'GET' && url.pathname === '/api/health') {
            return sendJson(res, 200, { 
                status: 'ok', 
                timestamp: new Date().toISOString()
            });
        }

        // Get Plans
        if (req.method === 'GET' && url.pathname === '/api/plans') {
            return sendJson(res, 200, {
                success: true,
                data: plans
            });
        }

        // Get Transaction
        if (req.method === 'GET' && url.pathname.startsWith('/api/transaction/')) {
            const id = url.pathname.split('/').pop();
            const transaction = transactions.find(t => t.id === id);
            if (!transaction) {
                return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            }
            return sendJson(res, 200, { success: true, data: transaction });
        }

        // Get All Transactions (with phone filter)
        if (req.method === 'GET' && url.pathname === '/api/transactions') {
            const phone = url.searchParams.get('phone');
            let filtered = transactions;
            if (phone) {
                filtered = transactions.filter(t => t.phoneNumber === phone);
            }
            return sendJson(res, 200, {
                success: true,
                data: filtered,
                count: filtered.length
            });
        }

        // ===== CHECK EXISTING PLAN =====
        if (req.method === 'GET' && url.pathname === '/api/check-active') {
            const phone = url.searchParams.get('phone');
            if (!phone) {
                return sendJson(res, 400, { success: false, message: 'Phone number required' });
            }
            
            const active = transactions.find(t =>
                t.phoneNumber === phone &&
                t.status === 'completed' &&
                t.mikrotikCreated &&
                (!t.expiresAt || new Date(t.expiresAt) > new Date())
            );
            
            if (active) {
                return sendJson(res, 200, {
                    success: true,
                    active: true,
                    data: {
                        id: active.id,
                        planName: active.planName,
                        expiresAt: active.expiresAt,
                        username: active.mikrotikUsername,
                        password: active.mikrotikPassword,
                        mpesaCode: active.mpesaCode
                    }
                });
            } else {
                return sendJson(res, 200, { success: true, active: false });
            }
        }

        // ============================================================
        // ===================== PAYMENT =====================
        // ============================================================

        // Initiate Payment
        if (req.method === 'POST' && url.pathname === '/api/payment/initiate') {
            const body = await readBody(req);
            console.log('📥 Payment request:', body);
            
            const { phoneNumber, amount, planId, macAddress } = body;
            
            if (!phoneNumber || phoneNumber.length < 10) {
                return sendJson(res, 400, { 
                    success: false, 
                    message: 'Invalid phone number. Use 0712345678 for testing.'
                });
            }
            
            try {
                const transactionId = 'GICH' + Date.now() + Math.random().toString(36).substring(7);
                const accountRef = 'GICH' + Date.now().toString().slice(-8);
                const duration = getPlanDuration(planId);
                const planName = getPlanName(planId);
                
                const transaction = {
                    id: transactionId,
                    phoneNumber,
                    amount,
                    planId,
                    planName: planName,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    macAddress: macAddress || null,
                    mpesaCode: null,
                    checkoutId: null,
                    expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
                    mikrotikUsername: null,
                    mikrotikPassword: null,
                    mikrotikCreated: false,
                    deviceCount: plans.find(p => p.id === planId)?.devices || 1
                };
                transactions.push(transaction);
                saveTransactions();
                
                // For free plans (amount 0), skip STK Push
                if (amount === 0) {
                    transaction.status = 'completed';
                    transaction.mpesaCode = 'FREE' + Date.now();
                    transaction.completedAt = new Date().toISOString();
                    transaction.mikrotikUsername = 'user_' + transaction.id.substring(0, 12);
                    transaction.mikrotikPassword = 'pass_' + Date.now().toString(36);
                    transaction.mikrotikCreated = true;
                    saveTransactions();
                    
                    return sendJson(res, 200, {
                        success: true,
                        message: '✅ Free plan activated!',
                        transactionId: transactionId,
                        isFree: true
                    });
                }
                
                const result = await stkPush({
                    phone: phoneNumber,
                    amount: amount,
                    accountReference: accountRef
                });
                
                if (result.success) {
                    transaction.checkoutId = result.checkoutId;
                    transaction.mpesaResponse = result.data;
                    saveTransactions();
                    
                    return sendJson(res, 200, {
                        success: true,
                        message: '✅ STK Push sent! Check your phone.',
                        transactionId: transactionId,
                        checkoutId: result.checkoutId,
                        testPin: '12345'
                    });
                } else {
                    // Mock mode fallback
                    console.log('⚠️ STK Push failed, using mock mode as fallback...');
                    transaction.status = 'completed';
                    transaction.mpesaCode = 'MOCK' + Date.now();
                    transaction.completedAt = new Date().toISOString();
                    transaction.isMock = true;
                    transaction.mikrotikUsername = 'user_' + transaction.id.substring(0, 12);
                    transaction.mikrotikPassword = 'pass_' + Date.now().toString(36);
                    transaction.mikrotikCreated = true;
                    saveTransactions();
                    
                    return sendJson(res, 200, {
                        success: true,
                        message: '✅ MOCK MODE: Payment simulated.',
                        transactionId: transactionId,
                        mock: true
                    });
                }
                
            } catch (error) {
                console.error('❌ Payment error:', error.message);
                return sendJson(res, 502, {
                    success: false,
                    message: 'Payment failed: ' + error.message
                });
            }
        }

        // ===== MPESA CALLBACK =====
        if (req.method === 'POST' && url.pathname === '/api/mpesa-callback') {
            const callback = await readBody(req);
            console.log('📞 M-Pesa Callback Received:');
            console.log(JSON.stringify(callback, null, 2));
            
            const resultCode = callback.Body?.stkCallback?.ResultCode;
            const checkoutId = callback.Body?.stkCallback?.CheckoutRequestID;
            const receipt = callback.Body?.stkCallback?.CallbackMetadata?.Item?.find(
                item => item.Name === 'MpesaReceiptNumber'
            )?.Value;
            const amount = callback.Body?.stkCallback?.CallbackMetadata?.Item?.find(
                item => item.Name === 'Amount'
            )?.Value;
            const phoneNumber = callback.Body?.stkCallback?.CallbackMetadata?.Item?.find(
                item => item.Name === 'PhoneNumber'
            )?.Value;
            
            console.log(`📊 Callback: ID=${checkoutId}, Code=${resultCode}, Receipt=${receipt}`);
            
            let transaction = transactions.find(t => t.checkoutId === checkoutId);
            
            if (!transaction) {
                transaction = transactions.find(t => t.mpesaResponse?.CheckoutRequestID === checkoutId);
                if (transaction) {
                    console.log('✅ Found transaction by mpesaResponse.CheckoutRequestID');
                }
            }
            
            if (!transaction) {
                console.log('❌ Transaction not found for CheckoutRequestID:', checkoutId);
                return sendJson(res, 200, { 
                    ResultCode: 1, 
                    ResultDesc: 'Transaction not found' 
                });
            }
            
            if (resultCode === 0) {
                transaction.status = 'completed';
                transaction.mpesaCode = receipt || 'MPESA' + Date.now();
                transaction.completedAt = new Date().toISOString();
                if (amount) transaction.amount = amount;
                if (phoneNumber) transaction.phoneNumber = phoneNumber;
                
                // Generate hotspot credentials
                transaction.mikrotikUsername = 'user_' + (transaction.mpesaCode || transaction.id).substring(0, 12);
                transaction.mikrotikPassword = 'pass_' + Date.now().toString(36);
                transaction.mikrotikCreated = true;
                saveTransactions();
                
                console.log('✅ Payment completed for transaction:', transaction.id);
                console.log('👤 Hotspot user created:', transaction.mikrotikUsername);
                
                return sendJson(res, 200, { 
                    ResultCode: 0, 
                    ResultDesc: 'Success' 
                });
            } else {
                transaction.status = 'failed';
                transaction.error = callback.Body?.stkCallback?.ResultDesc || 'Payment failed';
                transaction.errorCode = resultCode;
                saveTransactions();
                
                console.log(`❌ Payment failed: ${transaction.error} (Code: ${resultCode})`);
                
                return sendJson(res, 200, { 
                    ResultCode: resultCode, 
                    ResultDesc: transaction.error 
                });
            }
        }

        // ============================================================
        // ===================== VOUCHER SYSTEM =====================
        // ============================================================

        // Redeem Voucher
        if (req.method === 'POST' && url.pathname === '/api/voucher/redeem') {
            const body = await readBody(req);
            const { code, phoneNumber } = body;
            
            console.log('🎟️ Voucher redemption request:', { code, phoneNumber });
            
            if (!code) {
                return sendJson(res, 400, { success: false, message: 'Voucher code required' });
            }
            
            const voucher = vouchers.find(v => v.code === code && !v.used);
            if (!voucher) {
                return sendJson(res, 404, { success: false, message: 'Invalid or already used voucher' });
            }
            
            // Check if voucher expired
            if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
                return sendJson(res, 400, { success: false, message: 'Voucher has expired' });
            }
            
            // Mark as used
            voucher.used = true;
            voucher.usedBy = phoneNumber || 'unknown';
            voucher.usedAt = new Date().toISOString();
            saveVouchers();
            
            // Create transaction for voucher redemption
            const transactionId = 'VOUCH' + Date.now() + Math.random().toString(36).substring(7);
            const duration = voucher.duration_seconds || 3600;
            const planName = voucher.planName || 'Voucher Plan';
            
            const transaction = {
                id: transactionId,
                phoneNumber: phoneNumber || 'voucher_user',
                amount: 0,
                planId: voucher.planId || 'voucher',
                planName: planName,
                status: 'completed',
                timestamp: new Date().toISOString(),
                mpesaCode: 'VOUCHER_' + voucher.code,
                completedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
                mikrotikUsername: 'vuser_' + transactionId.substring(0, 8),
                mikrotikPassword: 'vpass_' + Date.now().toString(36),
                mikrotikCreated: true,
                isVoucher: true,
                voucherCode: voucher.code
            };
            transactions.push(transaction);
            saveTransactions();
            
            return sendJson(res, 200, {
                success: true,
                message: '✅ Voucher redeemed successfully!',
                data: {
                    transactionId: transactionId,
                    planName: planName,
                    expiresAt: transaction.expiresAt,
                    username: transaction.mikrotikUsername,
                    password: transaction.mikrotikPassword
                }
            });
        }

        // ============================================================
        // ===================== ADMIN ENDPOINTS =====================
        // ============================================================

        // Admin auth check
        function isAdmin(req) {
            const auth = req.headers.authorization;
            if (!auth) return false;
            const token = auth.replace('Bearer ', '');
            return token === ADMIN_PASSWORD;
        }

        // Generate Vouchers (Admin)
        if (req.method === 'POST' && url.pathname === '/api/admin/voucher/generate') {
            if (!isAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            const body = await readBody(req);
            const { planId, count, duration_seconds } = body;
            
            if (!planId) {
                return sendJson(res, 400, { success: false, message: 'Plan ID required' });
            }
            
            const plan = plans.find(p => p.id === planId);
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

        // Get All Vouchers (Admin)
        if (req.method === 'GET' && url.pathname === '/api/admin/vouchers') {
            if (!isAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            return sendJson(res, 200, {
                success: true,
                data: vouchers,
                count: vouchers.length,
                used: vouchers.filter(v => v.used).length,
                unused: vouchers.filter(v => !v.used).length
            });
        }

        // Get All Transactions (Admin)
        if (req.method === 'GET' && url.pathname === '/api/admin/transactions') {
            if (!isAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            return sendJson(res, 200, {
                success: true,
                data: transactions,
                count: transactions.length,
                summary: {
                    total: transactions.length,
                    completed: transactions.filter(t => t.status === 'completed').length,
                    pending: transactions.filter(t => t.status === 'pending').length,
                    failed: transactions.filter(t => t.status === 'failed').length,
                    totalRevenue: transactions
                        .filter(t => t.status === 'completed')
                        .reduce((sum, t) => sum + (t.amount || 0), 0)
                }
            });
        }

        // Manage Plans (Admin)
        if (req.method === 'POST' && url.pathname === '/api/admin/plans') {
            if (!isAdmin(req)) {
                return sendJson(res, 401, { success: false, message: 'Unauthorized' });
            }
            
            const body = await readBody(req);
            const { action } = body;
            
            if (action === 'add') {
                const { id, name, price, devices, duration_seconds } = body;
                if (!id || !name || price === undefined) {
                    return sendJson(res, 400, { success: false, message: 'Missing required fields' });
                }
                if (plans.find(p => p.id === id)) {
                    return sendJson(res, 400, { success: false, message: 'Plan ID already exists' });
                }
                const newPlan = { id, name, price, devices: devices || 1, duration_seconds: duration_seconds || 3600 };
                plans.push(newPlan);
                savePlans();
                return sendJson(res, 200, { success: true, message: 'Plan added', data: newPlan });
            }
            
            if (action === 'update') {
                const { id, name, price, devices, duration_seconds } = body;
                const plan = plans.find(p => p.id === id);
                if (!plan) {
                    return sendJson(res, 404, { success: false, message: 'Plan not found' });
                }
                if (name) plan.name = name;
                if (price !== undefined) plan.price = price;
                if (devices !== undefined) plan.devices = devices;
                if (duration_seconds !== undefined) plan.duration_seconds = duration_seconds;
                savePlans();
                return sendJson(res, 200, { success: true, message: 'Plan updated', data: plan });
            }
            
            if (action === 'delete') {
                const { id } = body;
                const index = plans.findIndex(p => p.id === id);
                if (index === -1) {
                    return sendJson(res, 404, { success: false, message: 'Plan not found' });
                }
                plans.splice(index, 1);
                savePlans();
                return sendJson(res, 200, { success: true, message: 'Plan deleted' });
            }
            
            return sendJson(res, 400, { success: false, message: 'Invalid action' });
        }

        // ===== GET CREDENTIALS =====
        if (req.method === 'GET' && url.pathname.startsWith('/api/get-credentials/')) {
            const transactionId = url.pathname.split('/').pop();
            const transaction = transactions.find(t => t.id === transactionId);
            
            if (!transaction) {
                return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            }
            
            if (transaction.status !== 'completed') {
                return sendJson(res, 400, { success: false, message: 'Payment not completed' });
            }
            
            return sendJson(res, 200, {
                success: true,
                username: transaction.mikrotikUsername || 'user_' + (transaction.mpesaCode || transaction.id).substring(0, 12),
                password: transaction.mikrotikPassword || 'pass_' + Date.now().toString(36),
                plan: transaction.planName,
                expiresAt: transaction.expiresAt || new Date(Date.now() + 7200000).toISOString()
            });
        }

        // ===== API INFO =====
        if (req.method === 'GET' && url.pathname === '/api') {
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '2.0.0',
                status: 'Running',
                endpoints: {
                    public: {
                        health: 'GET /api/health',
                        plans: 'GET /api/plans',
                        payment: 'POST /api/payment/initiate',
                        transaction: 'GET /api/transaction/:id',
                        transactions: 'GET /api/transactions',
                        check_active: 'GET /api/check-active?phone=',
                        voucher_redeem: 'POST /api/voucher/redeem',
                        credentials: 'GET /api/get-credentials/:transactionId',
                        callback: 'POST /api/mpesa-callback'
                    },
                    admin: {
                        generate_voucher: 'POST /api/admin/voucher/generate',
                        vouchers: 'GET /api/admin/vouchers',
                        transactions: 'GET /api/admin/transactions',
                        plans_manage: 'POST /api/admin/plans'
                    }
                },
                statistics: {
                    totalTransactions: transactions.length,
                    totalAmount: transactions
                        .filter(t => t.status === 'completed')
                        .reduce((sum, t) => sum + (t.amount || 0), 0),
                    activeVouchers: vouchers.filter(v => !v.used).length
                }
            });
        }

        return sendJson(res, 404, { error: 'Route not found' });

    } catch (err) {
        console.error('Server error:', err);
        return sendJson(res, 500, { error: 'Internal server error' });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n========================================');
    console.log('🌐 GICH WiFi API');
    console.log('========================================');
    console.log(`✅ Server running on port: ${PORT}`);
    console.log(`📍 http://localhost:${PORT}/`);
    console.log(`📍 http://localhost:${PORT}/api/health`);
    console.log(`📍 http://localhost:${PORT}/api/plans`);
    console.log('========================================');
    console.log('📱 Test phone: 0712345678');
    console.log('🔑 Test PIN: 12345');
    console.log('🛡️ Admin Password: admin123 (set ADMIN_PASSWORD env var)');
    console.log('========================================\n');
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});
