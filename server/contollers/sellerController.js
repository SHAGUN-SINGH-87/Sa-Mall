const pool = require('../config/db');
const path = require('path');

const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

async function addRegisteredShop(shop) {
  const values = [
    shop.shop_name,
    shop.shop_type || null,
    shop.latitude || null,
    shop.longitude || null,
    shop.photo_url || null,
    shop.rating || null,
    shop.contact || null,
    shop.open_time || null,
    shop.close_time || null,
    JSON.stringify(shop.products || [])
  ];

  const [result] = await pool.query(
    `INSERT INTO registered_shops
    (shop_name, shop_type, latitude, longitude, photo_url, rating, contact, open_time, close_time, products)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values 
  );
  return result.insertId;
}

exports.register = async (req, res) => {
  try {
    const file = req.file;
    const body = req.body;

    const photoUrl = file ? `${baseUrl}/${uploadsDir}/${file.filename}` : null;

    const shop = {
      shop_name: body.shopName || body.shop_name,
      shop_type: body.shopType || body.shop_type || null,
      latitude: body.latitude ? Number(body.latitude) : (body.lat ? Number(body.lat) : null),
      longitude: body.longitude ? Number(body.longitude) : (body.lng ? Number(body.lng) : null),
      photo_url: photoUrl,
      rating: body.rating ? Number(body.rating) : null,
      contact: body.contactInfo || body.contact || null,
      open_time: body.openingTime || body.open_time || null,
      close_time: body.closingTime || body.close_time || null,
      products: []
    };

    if (body.products) {
      try {
        shop.products = JSON.parse(body.products);
      } catch (e) {
        shop.products = String(body.products).split('\n').map(l => {
          const [name, price] = l.split('-').map(x => x && x.trim());
          return { name: name || l, price: price ? Number(price.replace(/[^0-9.]/g, '')) : null };
        });
      }
    }

    const id = await addRegisteredShop(shop);
    res.json({ success: true, shop_id: id });
  } catch (err) {
    console.error('seller register error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to register shop.', details: err.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (!shopId) return res.status(400).json({ error: 'Invalid shop id' });

    const [rows] = await pool.query('SELECT products FROM registered_shops WHERE id = ?', [shopId]);
    if (!rows.length) return res.status(404).json({ error: 'Shop not found' });

    const products = rows[0].products ? JSON.parse(rows[0].products) : [];
    res.json({ products });
  } catch (err) {
    console.error('getInventory error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch inventory.', details: err.message });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (!shopId) return res.status(400).json({ error: 'Invalid shop id' });

    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'products must be an array' });
    }

    await pool.query(
      `UPDATE registered_shops SET products = ? WHERE id = ?`,
      [JSON.stringify(products), shopId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('updateInventory error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to update inventory.', details: err.message });
  }
};
