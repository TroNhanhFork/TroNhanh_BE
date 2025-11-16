
const express = require("express");
const { chat, generateContract } = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", chat);
router.post("/generate-contract", generateContract);

module.exports = router; 
