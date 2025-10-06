const axios = require('axios');
const pool = require('../config/db');
const XLSX = require('xlsx');
const { haversine } = require('../utils/geo');
const PY_SERVICE = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';
const XLSX_URL = process.env.XLSX_URL || '';
const CACHE_TTL = 1000 * 6 * 5;
let scrapedCache = { ts: 0, data: []};

async function loadScrapedOnce(){
  const now =Date.now();
  if (scrapedCache.data.length && now - scrapedCache.ts < CACHE_TTL) return scrapedCache.data;
  try{
    let arr = [];
    if (!XLSX_URL) { scrapedCache = { ts: now, data: [] }; return []; }
    if (/^https?:\/\//i.test(XLSX_URL)) {
      const resp = await axios.get(XLSX_URL, { responseType: 'arraybuffer' });
      const wb = XLSX.read(resp.data, { type: 'buffer' });
      arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    } else {
      const wb = XLSX.readFile(XLSX_URL);
      arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    }
    scrapedCache = { ts: now, data: arr };
    return arr;
  } catch (err) {
    console.error('loadScrapedOnce error', err.message);
    return [];
  }
}

// Proxy to Python service if available, else fallback to local logic
async function proxyToPython(path, payload) {
  if (!PY_SERVICE) throw new Error('No python service configured');
  const url = `${PY_SERVICE}${path}`;
  const resp = await axios.post(url, payload, { timeout: 15000 });
  return resp.data;
}
 
/* ----- CUSTOMER ASSISTANT -------*/

exports.customerAssistant = async (req, res) => {
  try {
    const payload = req.body || {};
    if(PY_SERVICE) {
      try {
        const data = await proxyToPython('/assistant/customer', payload);
        return res.json({ source: 'python', ...data });
      } catch (e) {
        console.warn('python customer assistant failed, fallback', e.message);
      }
    }

    const scraped = await loadScrapedOnce();
    const counts ={};
    for (const row of scraped) {
      const p =row.products || row.Products || row.products_json || row['products_json'] || null;
      if (!p) continue;
      if (typeof p ==='string') {
        for(const part of p.split(',')) {
          const name = part.split(':')[0]?.trim().toLowerCase();
          if (name) counts[String(name).toLowerCase()] = (counts[String(name).toLowerCase()] || 0) + 1;          
        }
      }
      }
      const trending = Object.entries(counts)
            .sort((a,b) => b[1]-a[1])
            .slice(0,20)
            .map(([product, count]) => ({ product, count }));

    const [rows] = await pool.query('SELECT id, shop_name, latitude, longitude, rating FROM registered_shops');
    const reg = (rows || []).map(r => ({ name: r.shop_name, lat: r.latitude, lng: r.longitude, rating: r.rating, source: 'registered' }));
    const sc = (scraped || []).map(s => ({ name: s.shop_name || s.name, lat: s.latitude || s.lat, lng: s.longitude || s.lng, rating: s.rating, source: 'scraped' }));

    const all = [...reg, ...sc];

    let nearby = [];
    if (payload.location && payload.location.includes(',')) {
      const [latStr, lngStr] = payload.location.split(',').map(x => x.trim());
      const qlat = parseFloat(latStr), qlng = parseFloat(lngStr);
      if (!isNaN(qlat) && !isNaN(qlng)) {
        for (const s of all) {
          if (!s.lat || !s.lng) continue;
          const dist = haversine(qlat, qlng, Number(s.lat), Number(s.lng));
          nearby.push({ name: s.name, distance_km: Number(dist.toFixed(2)), rating: s.rating || null, source: s.source });
        }
        nearby.sort((a,b) => a.distance_km - b.distance_km);
      }
    }

    // return
    return res.json({ source: 'fallback', nearby_shops: nearby.slice(0,20), trending_products: trending.slice(0,10) });
  }catch (err) {
    console.error('customerAssistant error', err);
    res.status(500).json({ error: 'Assistant failed' });
  }
};

/* ----- SELLER ASSISTANT ---- */
exports.sellerAssistant = async (req, res) => {
  try {
    const payload = req.body || {};

    // 1) try python service
    if (PY_SERVICE) {
      try {
        const data = await proxyToPython('/assistant/seller', payload);
        return res.json({ source: 'python', ...data });
      } catch (e) {
        console.warn('python seller assistant failed, falling back', e.message);
      }
    }

    // 2) fallback local logic
    const shopId = Number(payload.shop_id);
    if (!shopId) return res.status(400).json({ error: 'shop_id required' });

    // Load shop products from DB
    const [[shopRow]] = await pool.query('SELECT * FROM registered_shops WHERE id = ?', [shopId]);
    if (!shopRow) return res.status(404).json({ error: 'Shop not found' });

    let shopProducts = [];
    try { shopProducts = shopRow.products ? JSON.parse(shopRow.products) : []; } catch(e) { shopProducts = []; }

    // load scraped and compute trending/price stats
    const scraped = await loadScrapedOnce();

    const priceStats = {}; // { productName: { count, avgPrice } }
    for (const row of scraped) {
      const p = row.products || row.Products || row.products_json || null;
      if (!p) continue;
      // if string like "Rice:50,Tea:20"
      if (typeof p === 'string') {
        for (const part of p.split(',')) {
          const [nm, pr] = part.split(':').map(x => x && x.trim());
          if (!nm) continue;
          const name = nm.toLowerCase();
          const price = pr ? Number(pr.replace(/[^0-9.]/g, '')) : null;
          if (!price) continue;
          if (!priceStats[name]) priceStats[name] = { count: 0, sum: 0 };
          priceStats[name].count += 1;
          priceStats[name].sum += price;
        }
      } else if (Array.isArray(p)) {
        for (const it of p) {
          const nm = (it && (it.name || it.product)) || null;
          const pr = (it && (it.price || it.price_rupee)) || null;
          if (!nm || !pr) continue;
          const name = String(nm).toLowerCase();
          const price = Number(pr);
          if (!priceStats[name]) priceStats[name] = { count: 0, sum: 0 };
          priceStats[name].count += 1;
          priceStats[name].sum += price;
        }
      }
    }
    // compute averages
    const productPriceAverages = Object.entries(priceStats).map(([name, v]) => ({ product: name, avgPrice: +(v.sum / v.count).toFixed(2), samples: v.count }));

    // demand insight: top trending from scraped
    const counts = {};
    for (const row of scraped) {
      const p = row.products || row.Products || row.products_json || null;
      if (!p) continue;
      if (typeof p === 'string') {
        for (const part of p.split(',')) {
          const name = part.split(':')[0]?.trim().toLowerCase();
          if (name) counts[name] = (counts[name] || 0) + 1;
        }
      } else if (Array.isArray(p)) {
        for (const it of p) {
          const name = (it && (it.name || it.product)) || String(it);
          if (name) counts[String(name).toLowerCase()] = (counts[String(name).toLowerCase()] || 0) + 1;
        }
      }
    }
    const trending = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 30).map(([product, count]) => ({ product, count }));

    // recompute restock recommendations: if trending product not present in shopProducts -> recommend add
    const shopProductNames = (shopProducts || []).map(p => (p.name || p.product || '').toLowerCase());
    const restock = [];
    for (const t of trending.slice(0, 10)) {
      if (!shopProductNames.includes(t.product)) {
        // suggest approximate price if we have average
        const avg = productPriceAverages.find(p => p.product === t.product);
        restock.push({ product: t.product, trendingScore: t.count, suggestedPrice: avg ? avg.avgPrice : null });
      }
    }

    // price suggestions: for products that seller has, compare seller price vs market avg
    const price_suggestions = [];
    for (const p of shopProducts) {
      const pname = (p.name || p.product || '').toLowerCase();
      const sellerPrice = Number(p.price || p.price_rupee || p.price_inr || 0);
      const avg = productPriceAverages.find(x => x.product === pname);
      if (avg && sellerPrice) {
        const diff = +(sellerPrice - avg.avgPrice).toFixed(2);
        const pct = +((diff / avg.avgPrice) * 100).toFixed(1);
        price_suggestions.push({
          product: pname,
          sellerPrice,
          marketAvg: avg.avgPrice,
          diff,
          pct
        });
      }
    }

    // demand insights summary
    const demand_insights = {
      top_trending: trending.slice(0,10),
      market_price_samples: productPriceAverages.slice(0, 30)
    };

    res.json({
      source: 'fallback',
      demand_insights,
      restock_recommendations: restock,
      price_suggestions
    });
  } catch (err) {
    console.error('sellerAssistant error', err);
    res.status(500).json({ error: 'Seller assistant failed' });
  }
};