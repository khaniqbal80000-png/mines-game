const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();
// Yeh line aapke public folder (jisme HTML/CSS hain) ko server se connect karegi
app.use(express.static('public'));

// Yeh line website khulte hi index.html (Login page) dikhayegi
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==========================================
// 1. MONGODB CONNECTION
// ==========================================
// Yahan apna asli password daalna mat bhulna (brackets < > mat lagana)
const mongoURI = "mongodb+srv://Mines0123:s1o2h3e4l5@mines01.bzgca11.mongodb.net/?appName=Mines01";

mongoose.connect(mongoURI)
    .then(() => console.log('🟢 MongoDB Atlas se connection SUCCESSFUL ho gaya!'))
    .catch((err) => console.log('🔴 MongoDB Error:', err));

// ==========================================
// 2. DATABASE SCHEMA
// ==========================================
const userSchema = new mongoose.Schema({
    name: { type: String, default: "Player" },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    transactions: { type: Array, default: [] },
    gameHistory: { type: Array, default: [] }
});

const User = mongoose.model('User', userSchema);

// ==========================================
// 3. AUTHENTICATION (Login & Register)
// ==========================================

app.post('/api/register', async (req, res) => {
    const { name, phone, password } = req.body;
    try {
        let existingUser = await User.findOne({ phone: phone });
        if (existingUser) return res.json({ success: false, message: "Number pehle se register hai!" });

        const newUser = new User({ name, phone, password, balance: 0 });
        await newUser.save();
        res.json({ success: true, message: "Account ban gaya! Login karein." });
    } catch (e) { res.json({ success: false, message: "Server Error" }); }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone: phone });
    if (!user || user.password !== password) {
        return res.json({ success: false, message: "❌ Galat Number ya Password!" });
    }
    res.json({ success: true, message: "Login Success!", userId: user.phone });
});

// ==========================================
// 4. WALLET & USER DATA
// ==========================================

app.post('/api/user', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ phone: userId });
    if (!user) return res.json({ success: false });
    res.json({ success: true, balance: user.balance, transactions: user.transactions });
});

app.post('/api/deposit', async (req, res) => {
    const { amount, utr, userId } = req.body;
    let depAmount = Number(amount);
    const user = await User.findOne({ phone: userId });
    if (!user) return res.json({ success: false, message: "Login expired" });

    let bonus = Math.floor(depAmount / 100) * 10;
    user.transactions.unshift({
        id: utr, type: 'Deposit', amount: depAmount, bonus: bonus,
        date: new Date().toLocaleString(), status: 'Pending'
    });
    await user.save();
    console.log(`[🟡 PENDING] User ${userId} ne ₹${depAmount} deposit kiye.`);
    res.json({ success: true, message: "Request sent! Admin approve karega." });
});

app.post('/api/withdraw', async (req, res) => {
    const { amount, upiId, userId } = req.body;
    let withAmount = Number(amount);
    const user = await User.findOne({ phone: userId });

    if (!user || withAmount > user.balance) return res.json({ success: false, message: "Low Balance!" });

    user.balance -= withAmount;
    user.transactions.unshift({
        id: `WTH-${Math.random().toString(36).substr(2, 9)}`, type: 'Withdraw',
        amount: withAmount, upi: upiId, date: new Date().toLocaleString(), status: 'Pending'
    });
    await user.save();
    res.json({ success: true, message: "Withdraw request sent!" });
});

// ==========================================
// 5. GAME LOGIC
// ==========================================

app.post('/api/bet', async (req, res) => {
    const { betAmount, userId } = req.body;
    const user = await User.findOne({ phone: userId });
    if (!user || user.balance < betAmount) return res.json({ success: false, message: "Low Balance" });

    user.balance -= betAmount;
    await user.save();
    res.json({ success: true, newBalance: user.balance });
});

app.post('/api/cashout', async (req, res) => {
    const { winnings, userId } = req.body;
    const user = await User.findOne({ phone: userId });
    user.balance += winnings;
    await user.save();
    res.json({ success: true, newBalance: user.balance });
});

// ==========================================
// 6. ADMIN PANEL
// ==========================================

// 1. Saare Users ki Pending requests dikhane ke liye
app.get('/api/admin/transactions', async (req, res) => {
    try {
        // Database se wo saare users nikalo jinki 'transactions' array me status 'Pending' hai
        const users = await User.find({ "transactions.status": "Pending" });
        
        let allPending = [];

        // Har user ki transactions check karo aur sirf Pending wali ko list me daalo
        users.forEach(u => {
            u.transactions.forEach(t => {
                if (t.status === 'Pending') {
                    // Transaction ke saath user ka phone number bhi jodd rahe hain
                    allPending.push({ ...t, userPhone: u.phone });
                }
            });
        });

        res.json({ success: true, pendingTxns: allPending });
    } catch (err) {
        res.json({ success: false, message: "Server Error" });
    }
});

app.post('/api/admin/action', async (req, res) => {
    const { txnId, action, userPhone } = req.body;
    const user = await User.findOne({ phone: userPhone });
    let txn = user.transactions.find(t => t.id === txnId);

    if (action === 'Approve') {
        txn.status = 'Success';
        if (txn.type === 'Deposit') user.balance += (txn.amount + (txn.bonus || 0));
    } else {
        txn.status = 'Rejected';
        if (txn.type === 'Withdraw') user.balance += txn.amount;
    }

    user.markModified('transactions');
    await user.save();
    res.json({ success: true, message: `Transaction ${action}!` });
});

app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));