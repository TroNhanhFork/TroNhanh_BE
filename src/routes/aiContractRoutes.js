const express = require('express');
const { preview, generateAndSave } = require('../controllers/aiContractController');
const authMiddleware = require('../middleware/authMiddleWare');

const router = express.Router();

router.post('/generate-contract', authMiddleware, preview);
router.post('/generate-contract/save', authMiddleware, generateAndSave);

module.exports = router;