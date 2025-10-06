// routes/geocode.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/', async (req, res) => {
  const q = req.query.q;
  if (!q) {
    return res.status(400).json({ error: 'q parameter required' });
  }

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q,
        format: 'json',
        limit: 1,
      },
    });

    if (response.data && response.data.length > 0) {
      const place = response.data[0];
      return res.json({
        lat: Number(place.lat),
        lng: Number(place.lon),
        display_name: place.display_name,
      });
    } else {
      return res.status(404).json({ error: 'Location not found' });
    }
  } catch (error) {
    console.error('Geocode error:', error.message);
    return res.status(500).json({ error: 'Geocode request failed' });
  }
});

module.exports = router;
