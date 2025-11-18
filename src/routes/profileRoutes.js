const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleWare');
const {updateUserInfoValidator} = require('../middleware/authValidator');
const profileController = require('../controllers/profileController');
const favoriteController = require('../controllers/favoriteController');
const messageController = require('../controllers/messageController');
const reportController = require('../controllers/reportController')
router.use(authMiddleware);

// ===== Personal Info =====
router.get('/personal-info', profileController.getProfileInfo);
router.put('/change-password', profileController.changePassword);

// ===== Favourites =====
router.get('/favorites', favoriteController.getUserFavorites);


// ===== Messages =====
router.get('/messages', messageController.getUserMessages);
router.post('/messages', messageController.sendMessage);

// ===== MyReports =====

router.get("/my-reports", reportController.getMyReports);

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: './uploads/avatars',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

router.put('/personal-info', upload.single('avatar'),updateUserInfoValidator, profileController.updateUserInfo);

module.exports = router;