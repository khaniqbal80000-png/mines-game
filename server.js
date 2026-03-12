const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==========================================
// 1. MONGODB CONNECTION
// ==========================================
const mongoURI = "mongodb+srv://Mines0123:s1o2h3e4l5@mines01.bzgca11.mongodb.net/?appName=Mines01";

mongoose.connect(mongoURI)
    .then(() => console.log('🟢 MongoDB Connected Successfully!'))
    .catch((err) => console.log('🔴 MongoDB Error:', err));

// ==========================================
// 2. DATABASE SCHEMAS
// ==========================================
const userSchema = new mongoose.Schema({
    name: { type: String, default: "Player" },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    transactions: { type: Array, default: [] },
    hasClaimedBonus: { type: Boolean, default: false },
    referredBy: { type: String, default: null }, 
    referralCount: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

const giftCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    usageLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    expiryDate: { type: Date },
    claimedUsers: { type: Array, default: [] }
});

const GiftCode = mongoose.model('GiftCode', giftCodeSchema);

// ==========================================
// 3. AUTHENTICATION
// ==========================================
app.post('/api/register', async (req, res) => {
    const { name, phone, password, refCode } = req.body;
    try {
        let existingUser = await User.findOne({ phone });
        if (existingUser) return res.json({ success: false, message: "Number registered hai!" });
        const newUser = new User({ name, phone, password, referredBy: refCode || null });
        await newUser.save();
        res.json({ success: true, message: "Account Created!" });
    } catch (e) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || user.password !== password) return res.json({ success: false, message: "Galat Password!" });
    res.json({ success: true, userId: user.phone });
});

// ==========================================
// 4. WALLET & ADMIN ACTION (Cleaned)
// ==========================================
app.post('/api/deposit', async (req, res) => {
    const { amount, utr, userId } = req.body;
    if (Number(amount) < 100) return res.json({ success: false, message: "Min ₹100!" });
    const user = await User.findOne({ phone: userId });
    user.transactions.unshift({ id: utr, type: 'Deposit', amount: Number(amount), bonus: Math.floor(amount/10), date: new Date().toLocaleString(), status: 'Pending' });
    await user.save();
    res.json({ success: true });
});

app.post('/api/admin/action', async (req, res) => {
    const { txnId, action, userPhone } = req.body;
    const user = await User.findOne({ phone: userPhone });
    let txn = user.transactions.find(t => t.id === txnId);

    if (action === 'Approve') {
        txn.status = 'Success';
        if (txn.type === 'Deposit') {
            user.balance += (txn.amount + (txn.bonus || 0));
            // Referral Logic: Reward on FIRST deposit only
            const successfulDeps = user.transactions.filter(t => t.type === 'Deposit' && t.status === 'Success').length;
            if (user.referredBy && successfulDeps === 1) {
                const referrer = await User.findOne({ phone: user.referredBy });
                if (referrer) {
                    referrer.balance += 20;
                    referrer.referralEarnings += 20;
                    referrer.referralCount += 1;
                    await referrer.save();
                }
            }
        }
    } else {
        txn.status = 'Rejected';
        if (txn.type === 'Withdraw') user.balance += txn.amount;
    }
    user.markModified('transactions');
    await user.save();
    res.json({ success: true });
});

// ==========================================
// 5. LEADERBOARD (FIXED)
// ==========================================
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Sabse zyada balance wale 5 log
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const data = topUsers.map(u => ({
            phone: u.phone ? u.phone.substring(0, 2) + "***" + u.phone.substring(8) : "Player",
            totalProfit: u.balance || 0
        }));
        res.json(data);
    } catch (e) { res.json([]); }
});

// ==========================================
// 6. OTHER ROUTES
// ==========================================
app.post('/api/user', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    res.json({ success: true, balance: user.balance, transactions: user.transactions, referralCount: user.referralCount });
});

app.post('/api/cashout', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    if (user) { user.balance += req.body.winnings; await user.save(); res.json({ success: true, newBalance: user.balance }); }
});

app.get('/api/admin/transactions', async (req, res) => {
    const users = await User.find({ "transactions.status": "Pending" });
    let allPending = [];
    users.forEach(u => u.transactions.forEach(t => { if (t.status === 'Pending') allPending.push({ ...t, userPhone: u.phone }); }));
    res.json({ success: true, pendingTxns: allPending });
});

app.post('/api/admin/create-gift', async (req, res) => {
    const { code, amount, usageLimit, expiryDays } = req.body;
    let expiryDate = expiryDays ? new Date(Date.now() + expiryDays * 86400000) : null;
    await new GiftCode({ code, amount, usageLimit, expiryDate }).save();
    res.json({ success: true });
});

app.get('/api/admin/gift-codes', async (req, res) => {
    const codes = await GiftCode.find().sort({ _id: -1 });
    res.json({ success: true, codes });
});

app.get('/api/admin/referral-stats', async (req, res) => {
    const topReferrers = await User.find({ referralCount: { $gt: 0 } }).sort({ referralCount: -1 }).limit(10);
    res.json({ success: true, topReferrers });
});

app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));