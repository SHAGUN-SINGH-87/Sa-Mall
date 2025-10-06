const express = require('express');
const shopController = require('../contollers/shopController'); // Note: spelling corrected 'controllers'
const router = express.Router();

router.get("/", shopController.getShops);

module.exports = router;
