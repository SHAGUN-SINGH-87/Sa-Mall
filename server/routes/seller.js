const express = require('express');
const sellerController = require('../contollers/sellerController');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const fs = require('fs');

const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req,file,cb) => cb(null, uploadsDir),
    filename: (req,file,cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random()*1E9) + ext);
    }
});

const upload = multer({ storage });

router.post('/register', upload.single('photo'), sellerController.register);
router.get('/:id/inventory', sellerController.getInventory);
router.put('/:id/inventory', sellerController.updateInventory);

module.exports = router;
