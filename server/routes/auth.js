const express = require('express');
const router = express.Router();
const authController = require('../contollers/authContoller');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/', (req, res) => {
    res.send('Auth API is working.');
});

module.exports = router;



