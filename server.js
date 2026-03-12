const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

// Render ke liye Port setup (Zaroori)
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
    name: String, phone: String, password: String, balance: Number,
    transactions: Array, referredBy: String, referralCount: {type:Number, default:0}
}));

const GiftCode = mongoose.model('GiftCode', new mongoose.Schema({
    code: String, amount: Number, usageLimit: Number, usedCount: {type:Number, default:0}, claimedUsers: Array
}));

// ==========================================
// 3. ADMIN APIs (Fixed Delete & Create)
// ==========================================

// DELETE GIFT API
app.delete('/api/admin/delete-gift/:id', async (req, res) => {
    try {
        await GiftCode.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Code Gayab!" });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/create-gift', async (req, res) => {
    try {
        const { code, amount, usageLimit } = req.body;
        await new GiftCode({ code, amount, usageLimit }).save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/admin/gift-codes', async (req, res) => {
    const codes = await GiftCode.find().sort({ _id: -1 });
    res.json({ success: true, codes });
});

// ==========================================
// 4. GAME APIs (Fixed Bet & Claim)
// ==========================================

app.post('/api/redeem-gift', async (req, res) => {
    const { code, userId } = req.body;
    try {
        const gift = await GiftCode.findOne({ code });
        if (!gift) return res.json({ success: false, message: "Invalid Code!" });
        if (gift.claimedUsers.includes(userId)) return res.json({ success: false, message: "Already Used!" });
        if (gift.usedCount >= gift.usageLimit) return res.json({ success: false, message: "Limit Full!" });

        const user = await User.findOne({ phone: userId });
        user.balance += Number(gift.amount);
        gift.usedCount += 1;
        gift.claimedUsers.push(userId);
        
        await user.save();
        await gift.save();
        res.json({ success: true, message: "Paisa mil gaya!", newBalance: user.balance });
    } catch (e) { res.json({ success: false, message: "Server Error!" }); }
});

app.post('/api/bet', async (req, res) => {
    const { betAmount, userId } = req.body;
    const user = await User.findOne({ phone: userId });
    if (!user || user.balance < betAmount) return res.json({ success: false, message: "Paisa kam hai!" });
    user.balance -= betAmount;
    await user.save();
    res.json({ success: true, newBalance: user.balance });
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.password === password) res.json({ success: true, userId: user.phone });
    else res.json({ success: false, message: "Wrong details!" });
});

// CASH OUT API (Winning Amount Balance mein add karne ke liye)
app.post('/api/cashout', async (req, res) => {
    try {
        const { winnings, userId } = req.body;
        
        const user = await User.findOne({ phone: userId });
        if (!user) return res.json({ success: false, message: "User nahi mila!" });

        // Balance update karo
        user.balance += Number(winnings);
        
        // Transaction history mein win record add karo (Optional)
        user.transactions.unshift({
            id: `WIN-${Date.now()}`,
            type: 'Win',
            amount: Number(winnings),
            date: new Date().toLocaleString(),
            status: 'Success'
        });

        await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch (e) {
        console.error("Cashout Error:", e);
        res.json({ success: false, message: "Cashout fail ho gaya!" });
    }
});

// Baki saare routes (Leaderboard, User, etc.) niche
app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(5);
    res.json(top.map(u => ({ phone: u.phone.substring(0,2)+"***"+u.phone.substring(8), totalProfit: u.balance || 0 })));
});

app.post('/api/user', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    res.json({ success: true, balance: user.balance || 0 });
});

// START SERVER
app.listen(PORT, () => console.log(`🚀 Server Live on Port ${PORT}`));