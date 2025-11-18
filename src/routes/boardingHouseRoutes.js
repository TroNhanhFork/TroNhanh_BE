const express = require("express");
const router = express.Router();
const boardingHouseController = require("../controllers/boardingHouseController");
const uploadAccommodation = require("../middleware/accommodationUpload");
const { validateUploadedImages, optimizeUploadedImages } = require("../middleware/imageValidation");
const searchAc = require("../controllers/searchAccomodation");
const authMiddleware = require('../middleware/authMiddleWare');



router.get("/", boardingHouseController.getAllBoardingHouses);
router.get("/searchBoardingHouse", searchAc.SearchBoardingHouseNoUsingAI);
router.get("/:id", boardingHouseController.getBoardingHouseById);

router.get("/booking/:bookingId/details", boardingHouseController.getBoardingHouseDetailsByBooking);

router.post(
  "/:id/reviews",
  authMiddleware,
  boardingHouseController.submitReview
);

router.put(
  "/:id/reviews/:reviewId",
  authMiddleware,
  boardingHouseController.editReview
);

router.delete(
  "/:id/reviews/:reviewId",
  authMiddleware,
  boardingHouseController.deleteReview
);
router.delete("/:id", boardingHouseController.deleteBoardingHouse);


router.post(
  "/",
  uploadAccommodation.fields([
    { name: "photos", maxCount: 10 },
    { name: "files", maxCount: 50 },
  ]),
  validateUploadedImages,      // AI moderation
  optimizeUploadedImages,       // Image optimization
  boardingHouseController.createBoardingHouse
);

router.put(
  "/:id",
  uploadAccommodation.fields([
    { name: "photos", maxCount: 10 },
    { name: "files", maxCount: 50 },
  ]),
  validateUploadedImages,      // AI moderation
  optimizeUploadedImages,       // Image optimization
  boardingHouseController.updateBoardingHouse
);


// Owner rating routes
router.get("/owner/ratings", authMiddleware, boardingHouseController.getOwnerBoardingHousesWithRatings);
router.get("/owner/:id/ratings", authMiddleware, boardingHouseController.getBoardingHouseRatingsForOwner);

// Owner statistics routes
router.get("/owner/statistics", authMiddleware, boardingHouseController.getOwnerStatistics);
router.get("/owner/monthly-revenue", authMiddleware, boardingHouseController.getOwnerMonthlyRevenue);
router.get("/owner/recent-bookings", authMiddleware, boardingHouseController.getOwnerRecentBookings);
router.get("/owner/top-accommodations", authMiddleware, boardingHouseController.getOwnerTopAccommodations);
router.get("/owner/current-membership", authMiddleware, boardingHouseController.getOwnerCurrentMembership);
router.get("/owner/membership-info", authMiddleware, boardingHouseController.getOwnerMembershipInfo);

module.exports = router;