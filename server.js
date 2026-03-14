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

// 2. SCHEMAS (Updated with hasClaimedBonus)
const User = mongoose.model('User', new mongoose.Schema({
    name: String, 
    phone: String, 
    password: String, 
    balance: { type: Number, default: 0 },
    hasClaimedBonus: { type: Boolean, default: false }, // 🔥 Strictly Defined
    transactions: Array, 
    referredBy: String, 
    referralCount: { type: Number, default: 0 }
}));

const GiftCode = mongoose.model('GiftCode', new mongoose.Schema({
    code: String, amount: Number, usageLimit: Number, usedCount: {type:Number, default:0}, claimedUsers: Array
}));

// ==========================================
// 3. ADMIN & BONUS APIs (Fixed logic)
// ==========================================

// Check if user is eligible for Welcome Bonus
app.post('/api/check-bonus', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.body.userId });
        // Strict check: false hone par hi true bhejo
        if (user && user.hasClaimedBonus === false) {
            res.json({ isNewUser: true });
        } else {
            res.json({ isNewUser: false });
        }
    } catch (e) {
        res.json({ isNewUser: false });
    }
});

// Claim Bonus API
app.post('/api/claim-bonus', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.body.userId });
        
        // Double check taaki refresh glitch na ho
        if (user && user.hasClaimedBonus === false) {
            user.balance += 20; 
            user.hasClaimedBonus = true; // DB mein lock kar diya
            await user.save();
            res.json({ success: true, message: "₹20 Bonus Mil Gaya!" });
        } else {
            res.json({ success: false, message: "Pehle hi le chuke ho!" });
        }
    } catch (e) {
        res.json({ success: false });
    }
});

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
// 4. GAME & AUTH APIs
// ==========================================

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, password, referralCode } = req.body;
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.json({ success: false, message: "⚠️ Number pehle se registered hai!" });
        }

        const newUser = new User({
            name, phone, password,
            balance: 0, 
            transactions: [],
            referredBy: referralCode || "",
            hasClaimedBonus: false // Naye user ke liye hamesha false
        });

        await newUser.save();
        res.json({ success: true, message: "🎉 Registration Successful!", userId: newUser.phone });
    } catch (e) {
        res.json({ success: false, message: "Server Error!" });
    }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (user && user.password === password) res.json({ success: true, userId: user.phone });
    else res.json({ success: false, message: "Wrong details!" });
});

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

app.post('/api/cashout', async (req, res) => {
    try {
        const { winnings, userId } = req.body;
        const user = await User.findOne({ phone: userId });
        if (!user) return res.json({ success: false, message: "User nahi mila!" });
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
    } catch (e) { res.json({ success: false, message: "Cashout fail!" }); }
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(5);
    res.json(top.map(u => ({ phone: u.phone.substring(0,2)+"***"+u.phone.substring(8), totalProfit: u.balance || 0 })));
});

app.post('/api/user', async (req, res) => {
    const user = await User.findOne({ phone: req.body.userId });
    if(user) res.json({ success: true, balance: user.balance || 0 });
    else res.json({ success: false });
});

// 1. DEPOSIT API (User request bhejega)
app.post('/api/deposit', async (req, res) => {
    try {
        const { amount, utr, userId } = req.body;
        const user = await User.findOne({ phone: userId });
        if (!user) return res.json({ success: false, message: "User nahi mila!" });

        // Transaction history mein 'Pending' deposit add karein
        user.transactions.unshift({
            id: `DEP-${Date.now()}`,
            type: 'Deposit',
            amount: Number(amount),
            utr: utr,
            date: new Date().toLocaleString(),
            status: 'Pending' // Admin ise dashboard se approve karega
        });

        await user.save();
        res.json({ success: true, message: "Request bhej di gayi hai! Admin 30 min mein check karke paisa add kar dega." });
    } catch (e) {
        res.json({ success: false, message: "Deposit fail ho gaya!" });
    }
});

// 2. WITHDRAW API
app.post('/api/withdraw', async (req, res) => {
    try {
        const { amount, upiId, userId } = req.body;
        const user = await User.findOne({ phone: userId });

        if (!user || user.balance < amount) {
            return res.json({ success: false, message: "Balance kam hai bhai!" });
        }

        if (amount < 200) return res.json({ success: false, message: "Kam se kam ₹200 withdraw karein." });

        // Paisa turant deduct karo (taaki banda baar-baar request na bheje)
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
        res.json({ success: true, message: "Withdrawal request lag gayi hai. 1-2 ghante mein paise mil jayenge!", newBalance: user.balance });
    } catch (e) {
        res.json({ success: false, message: "Withdraw fail ho gaya!" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server Live on Port ${PORT}`));