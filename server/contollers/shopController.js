// controllers/shopController.js
const pool = require('../config/db');
const axios = require('axios');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { haversine } = require('../utils/geo');

const CSV_URL = process.env.CSV_URL || './data/shops.csv';

// Load CSV shops (scraped shops)
const fetchScrapedShops = async () => {
  try {
    let csvBuffer;

    if (/^https?:\/\//i.test(CSV_URL)) {
      const response = await axios.get(CSV_URL, { responseType: 'arraybuffer' });
      csvBuffer = Buffer.from(response.data);
      console.log(`✅ Loaded CSV shops from remote: ${CSV_URL}`);
    } else {
      csvBuffer = fs.readFileSync(CSV_URL);
      console.log(`✅ Loaded CSV shops from local file: ${CSV_URL}`);
    }

    const records = parse(csvBuffer.toString(), {
      columns: true,
      skip_empty_lines: true,
    });

    if (records.length > 0) {
      console.log('📑 CSV Headers:', Object.keys(records[0]));
    }
    console.log(`📦 Parsed ${records.length} scraped shops from CSV`);

    // Track missing coordinates
    const missingCoords = records.filter(
      (r) => !r.Latitude || !r.Longitude || r.Latitude.trim() === '' || r.Longitude.trim() === ''
    );

    return { records, missingCoordsCount: missingCoords.length };
  } catch (error) {
    console.error('❌ Error reading CSV shops file:', error.message);
    return { records: [], missingCoordsCount: 0 };
  }
};

// Normalize registered shops
function normalizeRegistered(r) {
  let products = [];
  try {
    products = r.products ? JSON.parse(r.products) : [];
  } catch {
    products = [];
  }

  return {
    id: `reg_${r.id}`,
    name: r.shop_name || r.name || 'Unnamed',
    source: 'registered',
    lat: r.latitude ? Number(r.latitude) : null,
    lng: r.longitude ? Number(r.longitude) : null,
    photo: r.photo_url || null,
    address: r.address || null,
    rating: r.rating !== undefined ? Number(r.rating) : null,
    contact: r.contact || null,
    open_time: r.open_time || null,
    close_time: r.close_time || null,
    shop_type: r.shop_type || null,
    products,
    distance_km: null,
  };
}

// Normalize scraped shops
function normalizeScraped(s, idx) {
  const normalized = {};
  Object.keys(s).forEach((key) => {
    normalized[key.toLowerCase().replace(/\s+/g, '').replace(/_/g, '')] = s[key];
  });

  const name = normalized['shopname'] || normalized['storename'] || normalized['name'] || 'Unnamed';
  const photo =
    normalized['imageurl'] || normalized['image'] || normalized['photo'] || null;

  const products = [];
  if (normalized['product1']) {
    products.push({
      name: normalized['product1'],
      price: normalized['price1'] ? Number(normalized['price1']) : null,
    });
  }
  if (normalized['product2']) {
    products.push({
      name: normalized['product2'],
      price: normalized['price2'] ? Number(normalized['price2']) : null,
    });
  }

  return {
    id: `scr_${idx}`,
    name,
    source: 'scraped',
    lat: normalized['latitude'] ? Number(normalized['latitude']) : null,
    lng: normalized['longitude'] ? Number(normalized['longitude']) : null,
    address: normalized['address'] || null,
    photo,
    rating: normalized['rating'] ? Number(normalized['rating']) : null,
    contact: normalized['phone'] || null,
    open_time: normalized['opens'] || null,
    close_time: normalized['closes'] || null,
    shop_type: normalized['status'] || null,
    products,
    distance_km: null,
  };
}

// Main controller
exports.getShops = async (req, res) => {
  try {
    const { location, shop_type, maxDistanceKM = 5 } = req.query;

    // 1) Registered shops
    const [rows] = await pool.query('SELECT * FROM registered_shops');
    const registered = rows.map(normalizeRegistered);

    // 2) Scraped shops
    const { records, missingCoordsCount } = await fetchScrapedShops();
    const scraped = records.map((s, idx) => normalizeScraped(s, idx));

    // 3) Combine
    let allShops = [...registered, ...scraped];
    console.log(`📊 Total shops before filtering: ${allShops.length}`);

    // 4) Shop type filter
    if (shop_type && shop_type.trim() !== '') {
      const q = shop_type.toLowerCase();
      allShops = allShops.filter(
        (s) =>
          (s.shop_type || '').toLowerCase().includes(q) ||
          (s.name || '').toLowerCase().includes(q)
      );
    }

    // 5) Location filter
    if (location && location.trim() !== '') {
      let filteredShops = [];

      if (location.includes(',')) {
        // Coordinates
        const [latStr, lngStr] = location.split(',').map((x) => x.trim());
        const qlat = parseFloat(latStr);
        const qlng = parseFloat(lngStr);

        if (!isNaN(qlat) && !isNaN(qlng)) {
          filteredShops = allShops
            .map((s) => {
              if (s.lat && s.lng) {
                const dist = haversine(qlat, qlng, s.lat, s.lng);
                return { ...s, distance_km: Number(dist.toFixed(2)) };
              }
              return { ...s, distance_km: null };
            })
            .filter((s) => s.distance_km !== null && s.distance_km <= Number(maxDistanceKM))
            .sort((a, b) => a.distance_km - b.distance_km);
        }
      } else {
        // Free-text search
        const q = location.toLowerCase().trim();
        filteredShops = allShops.filter(
          (s) =>
            (s.address && s.address.toLowerCase().includes(q)) ||
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.shop_type && s.shop_type.toLowerCase().includes(q))
        );
      }

      allShops = filteredShops;
    }

    res.json({ shops: allShops, missingCoordsCount });
  } catch (err) {
    console.error('❌ getShops error:', err);
    res.status(500).json({
      error: 'Server error getting shops',
      message: err.message,
    });
  }
};
