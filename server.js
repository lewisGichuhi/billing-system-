/**
 * GICH WiFi - M-Pesa STK Push API
 * Deployable on Render
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// ============================================================
// ===================== CONFIGURATION =====================
// ============================================================

const SHORTCODE = '174379';
const PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';

// Your working credentials
const CONSUMER_KEY = '8jAAnvNAIwiBXEbJsAsKNZQZTBOg7QGRIdQzvWN3abVuCMtQ';
const CONSUMER_SECRET = 'U3jAOtpJRDiOVj7w36Xa63EuuBT3fWGXXrWULxVBkBa22imOUrlA5l5CAuvvkPnn';

// For Render, use a relative callback URL or environment variable
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://your-app-name.onrender.com/api/mpesa-callback';
const PORT = process.env.PORT || 10000;

// ============================================================
// ===================== HTTPS AGENT =====================
// ============================================================

const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
});

// ============================================================
// ===================== TRANSACTION STORAGE =====================
// ============================================================

const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');
let transactions = [];

if (fs.existsSync(TRANSACTIONS_FILE)) {
    try {
        const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf8');
        transactions = JSON.parse(data);
        console.log(`📂 Loaded ${transactions.length} transactions`);
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function saveTransactions() {
    try {
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
        console.log('💾 Transactions saved');
    } catch (error) {
        console.error('⚠️ Could not save transactions:', error.message);
    }
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
// ===================== HELPERS =====================
// ============================================================

function timestampNow() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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

function getPlanName(planId) {
    const plans = {
        '2_Hours': '2 Hours',
        '5_Hours': '5 Hours',
        '8_Hours': '8 Hours',
        '12_Hours': '12 Hours',
        '24_Hours': '24 Hours',
        'Free_Trial': 'Free Trial'
    };
    return plans[planId] || planId;
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
            try {
                const html = fs.readFileSync(path.join(__dirname, 'GICH wifi.html'), 'utf8');
                sendHtml(res, 200, html);
                return;
            } catch (err) {
                sendHtml(res, 200, `
                    <!DOCTYPE html>
                    <html>
                    <head><title>GICH WiFi</title></head>
                    <body style="font-family:Arial;padding:20px;background:#0f172a;color:white;">
                        <h1>🌐 GICH WiFi Server</h1>
                        <p>✅ Server is running!</p>
                        <hr>
                        <p>API Endpoint: <a href="/api/health">/api/health</a></p>
                        <p>Test OAuth: <a href="/api/test-oauth">/api/test-oauth</a></p>
                    </body>
                    </html>
                `);
            }
            return;
        }

        // ===== SERVE GICH wifi.html =====
        if (req.method === 'GET' && url.pathname === '/GICH%20wifi.html') {
            try {
                const html = fs.readFileSync(path.join(__dirname, 'GICH wifi.html'), 'utf8');
                sendHtml(res, 200, html);
                return;
            } catch (err) {
                sendHtml(res, 200, `<h1>File not found</h1><p>GICH wifi.html not found</p>`);
            }
            return;
        }

        // ===== SERVE redirect.html =====
        if (req.method === 'GET' && url.pathname === '/redirect.html') {
            try {
                const html = fs.readFileSync(path.join(__dirname, 'redirect.html'), 'utf8');
                sendHtml(res, 200, html);
                return;
            } catch (err) {
                sendHtml(res, 200, `<h1>File not found</h1><p>redirect.html not found</p>`);
            }
            return;
        }

        // ===== HEALTH =====
        if (req.method === 'GET' && url.pathname === '/api/health') {
            return sendJson(res, 200, { 
                status: 'ok', 
                timestamp: new Date().toISOString()
            });
        }

        // ===== TEST OAUTH =====
        if (req.method === 'GET' && url.pathname === '/api/test-oauth') {
            try {
                const token = await getAccessToken();
                return sendJson(res, 200, { 
                    success: true, 
                    token_preview: token.substring(0, 20) + '...' 
                });
            } catch (err) {
                return sendJson(res, 502, { 
                    success: false, 
                    error: err.message 
                });
            }
        }

        // ===== GET PLANS =====
        if (req.method === 'GET' && url.pathname === '/api/plans') {
            return sendJson(res, 200, {
                success: true,
                data: [
                    { id: '2_Hours', name: '2 Hours', price: 10, duration: 2 },
                    { id: '5_Hours', name: '5 Hours', price: 20, duration: 5 },
                    { id: '8_Hours', name: '8 Hours', price: 30, duration: 8 },
                    { id: '12_Hours', name: '12 Hours', price: 50, duration: 12 },
                    { id: '24_Hours', name: '24 Hours', price: 80, duration: 24 },
                    { id: 'Free_Trial', name: 'Free Trial', price: 0, duration: 5 }
                ]
            });
        }

        // ===== GET TRANSACTION =====
        if (req.method === 'GET' && url.pathname.startsWith('/api/transaction/')) {
            const id = url.pathname.split('/').pop();
            const transaction = transactions.find(t => t.id === id);
            if (!transaction) {
                return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            }
            return sendJson(res, 200, { success: true, data: transaction });
        }

        // ===== GET ALL TRANSACTIONS =====
        if (req.method === 'GET' && url.pathname === '/api/transactions') {
            return sendJson(res, 200, {
                success: true,
                data: transactions,
                count: transactions.length
            });
        }

        // ===== INITIATE PAYMENT =====
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
                
                if (amount === 0) {
                    const transaction = {
                        id: transactionId,
                        phoneNumber,
                        amount,
                        planId,
                        planName: getPlanName(planId),
                        status: 'completed',
                        timestamp: new Date().toISOString(),
                        macAddress: macAddress || null,
                        mpesaCode: 'FREE' + Date.now(),
                        completedAt: new Date().toISOString(),
                        isFreeTrial: true
                    };
                    transactions.push(transaction);
                    saveTransactions();
                    
                    return sendJson(res, 200, {
                        success: true,
                        message: '✅ Free Trial Activated!',
                        transactionId: transactionId,
                        isFreeTrial: true
                    });
                }
                
                const transaction = {
                    id: transactionId,
                    phoneNumber,
                    amount,
                    planId,
                    planName: getPlanName(planId),
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    macAddress: macAddress || null,
                    mpesaCode: null,
                    checkoutId: null
                };
                transactions.push(transaction);
                saveTransactions();
                
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
                    throw new Error(result.message || 'STK Push failed');
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
            
            const transaction = transactions.find(t => t.checkoutId === checkoutId);
            
            if (transaction) {
                if (resultCode === 0) {
                    transaction.status = 'completed';
                    transaction.mpesaCode = receipt;
                    transaction.completedAt = new Date().toISOString();
                    console.log('✅ Payment completed for:', transaction.id);
                } else {
                    transaction.status = 'failed';
                    transaction.error = callback.Body?.stkCallback?.ResultDesc;
                    console.log('❌ Payment failed:', transaction.error);
                }
                saveTransactions();
            }
            
            return sendJson(res, 200, { ResultCode: 0, ResultDesc: 'Success' });
        }

        // ===== SIMULATE PAYMENT =====
        if (req.method === 'POST' && url.pathname === '/api/payment/simulate') {
            const body = await readBody(req);
            const { transactionId } = body;
            
            const transaction = transactions.find(t => t.id === transactionId);
            if (!transaction) {
                return sendJson(res, 404, { success: false, message: 'Transaction not found' });
            }
            
            transaction.status = 'completed';
            transaction.mpesaCode = 'SIM' + Date.now();
            transaction.completedAt = new Date().toISOString();
            saveTransactions();
            
            return sendJson(res, 200, {
                success: true,
                message: 'Payment simulated successfully',
                data: transaction
            });
        }

        // ===== CONNECT WITH MPESA CODE =====
        if (req.method === 'POST' && url.pathname === '/api/payment/connect') {
            const body = await readBody(req);
            const { mpesaCode } = body;
            
            const transaction = transactions.find(t => t.mpesaCode === mpesaCode && t.status === 'completed');
            
            if (!transaction) {
                return sendJson(res, 404, {
                    success: false,
                    message: 'Invalid or expired MPESA code'
                });
            }
            
            return sendJson(res, 200, {
                success: true,
                message: 'Connected successfully!',
                data: {
                    sessionId: 'session_' + Date.now(),
                    plan: transaction.planName,
                    phoneNumber: transaction.phoneNumber,
                    username: 'user_' + transaction.mpesaCode,
                    password: 'pass_' + Date.now()
                }
            });
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
                username: 'user_' + (transaction.mpesaCode || transaction.id),
                password: 'pass_' + Date.now(),
                plan: transaction.planName,
                expiresAt: new Date(Date.now() + 7200000).toISOString()
            });
        }

        // ===== API INFO =====
        if (req.method === 'GET' && url.pathname === '/api') {
            return sendJson(res, 200, {
                name: 'GICH WiFi API',
                version: '2.0.0',
                status: 'Running',
                endpoints: {
                    home: 'GET /',
                    health: 'GET /api/health',
                    test_oauth: 'GET /api/test-oauth',
                    plans: 'GET /api/plans',
                    payment: 'POST /api/payment/initiate',
                    transaction: 'GET /api/transaction/:id',
                    transactions: 'GET /api/transactions',
                    callback: 'POST /api/mpesa-callback',
                    connect: 'POST /api/payment/connect',
                    simulate: 'POST /api/payment/simulate',
                    credentials: 'GET /api/get-credentials/:transactionId'
                },
                statistics: {
                    totalTransactions: transactions.length,
                    totalAmount: transactions.reduce((sum, t) => sum + (t.amount || 0), 0)
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
    console.log(`📍 http://localhost:${PORT}/api/test-oauth`);
    console.log('========================================');
    console.log('📱 Test phone: 0712345678');
    console.log('🔑 Test PIN: 12345');
    console.log('========================================\n');
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});