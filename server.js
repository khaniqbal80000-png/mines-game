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
    hasClaimedBonus: { type: Boolean, default: false },
    referralCode: { type: String, unique: true }, // 👈 Naya unique code field
    referredBy: String, 
    referralCount: { type: Number, default: 0 },
    transactions: Array
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

app.get('/api/admin/referral-stats', async (req, res) => {
    try {
        const users = await User.find({});
        
        let promoters = users.map(user => {
            // Sirf 'Referral Bonus' wali transactions ka sum nikaalein
            const earned = user.transactions
                .filter(tx => tx.type === 'Referral Bonus' && tx.status === 'Success')
                .reduce((sum, tx) => sum + Number(tx.amount), 0);

            return {
                phone: user.phone,
                referralCount: user.referralCount || 0,
                totalEarned: earned
            };
        });

        // Jin logo ne kam se kam 1 refer kiya hai sirf unhe dikhao aur rank karo
        promoters = promoters.filter(p => p.referralCount > 0)
                             .sort((a, b) => b.totalEarned - a.totalEarned);

        res.json({ success: true, promoters });
    } catch (e) {
        res.json({ success: false, message: "Error fetching referral stats" });
    }
});

// ==========================================
// 4. GAME & AUTH APIs
// ==========================================

// Random Code Generator Function
function generateRefCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, password, referralCode } = req.body;

        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.json({ success: false, message: "⚠️ Pehle se registered hai!" });

        // Naya Unique Referral Code banao
        const myNewRefCode = generateRefCode();

        const newUser = new User({
            name, phone, password,
            balance: 0, 
            transactions: [],
            referredBy: referralCode || "", // Jo code user ne dala
            referralCode: myNewRefCode,      // Is user ka apna naya code
            hasClaimedBonus: false 
        });

        await newUser.save();
        res.json({ success: true, message: "Registration Successful!", userId: newUser.phone });
    } catch (e) { res.json({ success: false, message: "Error!" }); }
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
    try {
        const user = await User.findOne({ phone: req.body.userId });
        if (user) {
            res.json({ 
                success: true, 
                balance: user.balance || 0,
                // Agar code nahi hai toh phone number hi bhej do backup ke liye
                referralCode: user.referralCode || user.phone 
            });
        } else {
            res.json({ success: false, message: "User not found" });
        }
    } catch (e) {
        res.json({ success: false, message: "Server Error" });
    }
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

// 1. User ki History dikhane ke liye
app.post('/api/user/history', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.body.userId });
        if (user) {
            res.json({ success: true, history: user.transactions });
        } else {
            res.json({ success: false, message: "User nahi mila!" });
        }
    } catch (e) { res.json({ success: false }); }
});

// --- 1. ADMIN DASHBOARD STATS (Total Balance & Pending Tasks) ---
// 1. Approve Request Fix (Paisa & Referral Count)
app.post('/api/admin/approve-request', async (req, res) => {
    const { userPhone, txId, action } = req.body;
    const user = await User.findOne({ phone: userPhone });
    if (!user) return res.json({ success: false });

    const tx = user.transactions.find(t => t.id === txId);
    if (tx && tx.status === 'Pending' && action === 'Approve') {
        tx.status = 'Success';
        if (tx.type === 'Deposit') {
            user.balance += Number(tx.amount);
            
            // Referral Logic
            const deposits = user.transactions.filter(t => t.type === 'Deposit' && t.status === 'Success');
            if (deposits.length === 1 && user.referredBy) {
                const referrer = await User.findOne({ referralCode: user.referredBy.toUpperCase() });
                if (referrer) {
                    referrer.balance += 20;
                    referrer.referralCount = (referrer.referralCount || 0) + 1; // Counter Update
                    referrer.transactions.unshift({ type: 'Referral Bonus', amount: 20, date: new Date().toLocaleString(), status: 'Success' });
                    referrer.markModified('transactions');
                    await referrer.save();
                }
            }
        }
    } else if (action === 'Reject') {
        tx.status = 'Rejected';
    }
    user.markModified('transactions');
    await user.save();
    res.json({ success: true });
});

// 2. Admin Stats Fix (Counter for Dashboard)
app.get('/api/admin/stats', async (req, res) => {
    const users = await User.find({});
    let totalBal = 0, pending = 0, totalRefs = 0;
    users.forEach(u => {
        totalBal += u.balance;
        totalRefs += (u.referralCount || 0); // Isse center counter chalega
        u.transactions.forEach(t => { if(t.status === 'Pending') pending++; });
    });
    res.json({ success: true, totalBalance: totalBal, pendingCount: pending, totalReferrals: totalRefs });
});

app.get('/api/admin/pending-requests', async (req, res) => {
    try {
        // Un users ko dhoondo jinke transactions mein status 'Pending' hai
        const users = await User.find({ "transactions.status": "Pending" });
        let pendingData = [];

        users.forEach(user => {
            if (user.transactions && user.transactions.length > 0) {
                user.transactions.forEach(tx => {
                    if (tx.status === 'Pending') {
                        // Saari zaroori details ek jagah jama karo
                        pendingData.push({
                            id: tx.id,
                            type: tx.type,
                            amount: tx.amount,
                            utr: tx.utr || '',
                            upiId: tx.upiId || '',
                            date: tx.date,
                            status: tx.status,
                            userPhone: user.phone,
                            userName: user.name
                        });
                    }
                });
            }
        });

        // Latest request pehle dikhane ke liye sort (Optional)
        pendingData.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, requests: pendingData });
    } catch (e) { 
        console.error("Admin Request Error:", e);
        res.json({ success: false, requests: [] }); 
    }
});

app.listen(PORT, () => console.log(`🚀 Server Live on Port ${PORT}`));