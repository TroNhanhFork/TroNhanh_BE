const express = require("express");
const router = express.Router();
const roomController = require("../controllers/roomController");
const authMiddleware = require('../middleware/authMiddleWare');
const uploadAccommodation = require('../middleware/accommodationUpload');
const { validateUploadedImages, optimizeUploadedImages } = require('../middleware/imageValidation');

router.get("/", roomController.getAllRoomsByBoardingHouse);
router.get("/:id", roomController.getRoomById);
// Accept multipart/form-data with optional files (field name: files)
router.post("/:boardingHouseId/rooms", authMiddleware, uploadAccommodation.array('files', 50), validateUploadedImages, optimizeUploadedImages, roomController.addRoomsToBoardingHouse);
// Upload photos for an existing room (append)
router.post("/:id/photos", authMiddleware, uploadAccommodation.array('files', 20), validateUploadedImages, optimizeUploadedImages, roomController.addRoomPhotos);
router.put("/:id", authMiddleware, roomController.updateRoom);
router.delete("/:id", authMiddleware, roomController.deleteRoom);

module.exports = router;