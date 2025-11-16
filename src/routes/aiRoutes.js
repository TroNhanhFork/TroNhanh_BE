
const express = require("express");
const { chat, generateBoardingHouseDescription } = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", chat);
router.post("/generate-description", generateBoardingHouseDescription);


module.exports = router; 
