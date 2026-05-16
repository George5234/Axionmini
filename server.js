// ==================== 1. التهيئة ====================
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 2. نقطة الصحة (لـ UptimeRobot) ====================
app.get('/health', (req, res) => {
    res.json({ status: 'alive', timestamp: Date.now() });
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

// ==================== 3. تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log(`🌐 Keep-alive server running on port ${PORT}`);
});
