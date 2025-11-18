
const express = require("express");
const { chat, analyzeSentiment, recommendSimple, nearbyPlaces, getLocation, route, generateContract, generateBoardingHouseDescription } = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", chat);
router.post("/generate-description", generateBoardingHouseDescription);
router.post("/analyze-sentiment", analyzeSentiment);
router.post("/recommend-simple", recommendSimple);
router.get("/nearby-places", nearbyPlaces);
router.get("/places", getLocation);
router.get("/route", route);
router.post("/generate-contract", generateContract);

module.exports = router; 