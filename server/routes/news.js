const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
    const query = req.query.query || 'local news';
    const apiKey = process.env.NEWS_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'News API key is not set in environment variables' });
    }

    const newsResponse = await axios.get('https://newsapi.org/v2/everything', {
        params: {
        q: query,
        apiKey,
        language: 'en',
        sortBy: 'relevance',
        pageSize: 10
    }
    });

    res.json(newsResponse.data);
    } catch (error) {
    console.error('Error fetching news:', error.message);
    res.status(500).json({ error: 'Failed to fetch news' });
    }
});

module.exports = router;
