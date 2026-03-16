const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 10000; 

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 1. MONGODB CONNECTION
const mongoURI = "mongodb+srv://Mines0123:s1o2h3e4l5@mines01.bzgca11.mongodb.net/?appName=Mines01";

mongoose.connect(mongoURI)
    .then(() => console.log('🟢 MongoDB Atlas SUCCESSFUL!'))
    .catch((err) => console.log('🔴 MongoDB Error:', err));

// 2. SCHEMAS
const User = mongoose.model('User', new mongoose.Schema({
    name: String, 
    phone: String, 
    password: String, 
    balance: { type: Number, default: 0 },
    hasClaimedBonus: { type: Boolean, default: false },
    referralCode: { type: String, unique: true }, 
    referredBy: String, 
    referralCount: { type: Number, default: 0 },
    transactions: Array
}));

const GiftCode = mongoose.model('GiftCode', new mongoose.Schema({
    code: String, amount: Number, usageLimit: Number, usedCount: {type:Number, default:0}, claimedUsers: Array
}));

// ==========================================
// 3. ADMIN & UTILS
// ==========================================

function generateRefCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/api/admin/stats', async (req, res) => {
    try {
        const users = await User.find({});
        let totalBal = 0, pending = 0, totalRefs = 0;
        users.forEach(u => {
            totalBal += (u.balance || 0);
            totalRefs += (u.referralCount || 0);
            u.transactions.forEach(t => { if(t.status === 'Pending') pending++; });
        });
        res.json({ success: true, totalBalance: totalBal, pendingCount: pending, totalReferrals: totalRefs });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/admin/referral-stats', async (req, res) => {
    try {
        const users = await User.find({ referralCount: { $gt: 0 } });
        const promoters = users.map(u => {
            const earned = u.transactions
                .filter(tx => tx.type === 'Referral Bonus' && tx.status === 'Success')
                .reduce((sum, tx) => sum + Number(tx.amount), 0);
            return { phone: u.phone, referralCount: u.referralCount, totalEarned: earned };
        }).sort((a, b) => b.totalEarned - a.totalEarned);
        
        res.json({ success: true, promoters }); // UI matches 'promoters' key
    } catch (e) { res.json({ success: false }); }
});

// ==========================================
// 4. TRANSACTION APPROVAL (Ref Reward Logic Fixed)
// ==========================================

app.post('/api/admin/approve-request', async (req, res) => {
    try {
        const { userPhone, txId, action } = req.body;
        const user = await User.findOne({ phone: userPhone });
        if (!user) return res.json({ success: false, message: "User not found" });

        const tx = user.transactions.find(t => t.id === txId);
        if (!tx || tx.status !== 'Pending') return res.json({ success: false, message: "Invalid Request" });

        if (action === 'Approve') {
            tx.status = 'Success';
            if (tx.type === 'Deposit') {
                // 1. Give 10% Extra Bonus
                const bonus = Number(tx.amount) * 0.10;
                user.balance += (Number(tx.amount) + bonus);

                // 2. Referral Logic (On First Deposit Only)
                const successDeposits = user.transactions.filter(t => t.type === 'Deposit' && t.status === 'Success');
                if (successDeposits.length === 1 && user.referredBy) {
                    const cleanCode = user.referredBy.trim().toUpperCase();
                    const referrer = await User.findOne({ referralCode: cleanCode });
                    if (referrer) {
                        referrer.balance += 20;
                        referrer.referralCount = (referrer.referralCount || 0) + 1;
                        referrer.transactions.unshift({
                            id: `REF-${Date.now()}`,
                            type: 'Referral Bonus',
                            amount: 20,
                            date: new Date().toLocaleString(),
                            status: 'Success',
                            note: `From: ${userPhone}`
                        });
                        referrer.markModified('transactions');
                        await referrer.save();
                    }
                }
            }
        } else {
            tx.status = 'Rejected';
            if (tx.type === 'Withdraw') user.balance += Number(tx.amount); // Refund on reject
        }

        user.markModified('transactions');
        await user.save();
        res.json({ success: true, message: `Request ${action}ed successfully!` });
    } catch (e) { res.json({ success: false, message: "Error!" }); }
});

// ==========================================
// 5. AUTH & USER APIs
// ==========================================

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, password, referralCode } = req.body;
        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.json({ success: false, message: "⚠️ Already registered!" });

        const newUser = new User({
            name, phone, password,
            balance: 0, 
            transactions: [],
            referredBy: referralCode ? referralCode.toUpperCase() : "", 
            referralCode: generateRefCode(),
            hasClaimedBonus: false 
        });

        await newUser.save();
        res.json({ success: true, message: "Success!" });
    } catch (e) { res.json({ success: false, message: "Error!" }); }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.password === password) res.json({ success: true, userId: user.phone });
    else res.json({ success: false, message: "Wrong details!" });
});

app.post('/api/user', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    if (user) res.json({ success: true, balance: user.balance || 0, referralCode: user.referralCode });
    else res.json({ success: false });
});

app.post('/api/user/history', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    res.json({ success: true, history: user ? user.transactions : [] });
});

// ==========================================
// 6. DEPOSIT, WITHDRAW & GAME
// ==========================================

app.post('/api/deposit', async (req, res) => {
    const { amount, utr, userId } = req.body;
    const user = await User.findOne({ phone: userId });
    if (!user) return res.json({ success: false });

    user.transactions.unshift({
        id: `DEP-${Date.now()}`,
        type: 'Deposit',
        amount: Number(amount),
        utr: utr,
        date: new Date().toLocaleString(),
        status: 'Pending'
    });
    await user.save();
    res.json({ success: true, message: "Request sent!" });
});

app.post('/api/withdraw', async (req, res) => {
    const { amount, upiId, userId } = req.body;
    const user = await User.findOne({ phone: userId });
    if (!user || user.balance < amount) return res.json({ success: false, message: "Low Balance" });

    user.balance -= Number(amount);
    user.transactions.unshift({
        id: `WITH-${Date.now()}`,
        type: 'Withdraw',
        amount: Number(amount),
        upiId: upiId,
        date: new Date().toLocaleString(),
        status: 'Pending'
    });
    await user.save();
    res.json({ success: true, message: "Withdrawal Pending!", newBalance: user.balance });
});

app.post('/api/bet', async (req, res) => {
    const { betAmount, userId } = req.body;
    const user = await User.findOne({ phone: userId });
    if (!user || user.balance < betAmount) return res.json({ success: false, message: "No Money" });
    user.balance -= betAmount;
    await user.save();
    res.json({ success: true, newBalance: user.balance });
});

app.post('/api/cashout', async (req, res) => {
    const { winnings, userId } = req.body;
    const user = await User.findOne({ phone: userId });
    user.balance += Number(winnings);
    user.transactions.unshift({
        id: `WIN-${Date.now()}`,
        type: 'Win',
        amount: Number(winnings),
        date: new Date().toLocaleString(),
        status: 'Success'
    });
    await user.save();
    res.json({ success: true, newBalance: user.balance });
});

// ==========================================
// 7. BONUS & GIFTS
// ==========================================

app.post('/api/check-bonus', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    res.json({ isNewUser: user && !user.hasClaimedBonus });
});

app.post('/api/claim-bonus', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    if (user && !user.hasClaimedBonus) {
        user.balance += 20;
        user.hasClaimedBonus = true;
        await user.save();
        res.json({ success: true });
    } else res.json({ success: false });
});

app.get('/api/admin/pending-requests', async (req, res) => {
    const users = await User.find({ "transactions.status": "Pending" });
    let requests = [];
    users.forEach(u => {
        u.transactions.forEach(t => {
            if(t.status === 'Pending') requests.push({...t, userPhone: u.phone, userName: u.name});
        });
    });
    res.json({ success: true, requests });
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(5);
    res.json(top.map(u => ({ phone: u.phone.substring(0,2)+"***"+u.phone.substring(8), totalProfit: u.balance || 0 })));
});

app.delete('/api/admin/delete-gift/:id', async (req, res) => {
    await GiftCode.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/admin/gift-codes', async (req, res) => {
    const codes = await GiftCode.find().sort({ _id: -1 });
    res.json({ success: true, codes });
});

app.post('/api/admin/create-gift', async (req, res) => {
    const { code, amount, usageLimit } = req.body;
    await new GiftCode({ code, amount, usageLimit }).save();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Server Live on Port ${PORT}`));