const express = require('express');
const router = express.Router();
const assistantController= require('../contollers/assistantController');

router.post('/customer', assistantController.customerAssistant);
router.post('/seller', assistantController.sellerAssistant);

module.exports = router;