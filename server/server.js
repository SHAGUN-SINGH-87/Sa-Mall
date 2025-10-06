// server.js
const cors = require('cors');
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

// Import routers
const assistantRouter = require('./routes/assistant.js');
const authRoutes = require('./routes/auth.js');
const geocodeRouter = require('./routes/geocode.js');
const sellerRouter = require('./routes/seller.js');
const shopsRouter = require('./routes/shops.js');
const newsRouter = require('./routes/news.js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
let pool;

// Initialize MySQL connection pool
async function initDB() {
  pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'local_commerce',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
  console.log("✅ Database connected.");
}

app.use(cors());
app.use(express.json());

// Serve uploaded files
const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
app.use(`/${uploadsDir}`, express.static(path.join(__dirname, uploadsDir)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopsRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/seller', sellerRouter);
app.use('/api/news', newsRouter);
if (geocodeRouter) app.use('/api/geocode', geocodeRouter);

app.post('/api/suggestions', async (req, res) => {
  try {
    const { location, query } = req.body;

    // Call Flask AI service (running on port 5001)
    const response = await axios.get("http://127.0.0.1:5001/api/assistant", {
      params: { location, query },
    });

    res.json(response.data);
  } catch (err) {
    console.error("❌ Assistant API Error:", err.message);
    res.status(500).json({ error: "Assistant request failed" });
  }
});

// Start Server
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
  });

module.exports = { pool };
