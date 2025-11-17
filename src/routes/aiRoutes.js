
const express = require("express");
const { chat} = require("../controllers/aiController");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleWare");
const router = express.Router();


router.post("/chat",optionalAuthMiddleware, chat);


module.exports = router; 
