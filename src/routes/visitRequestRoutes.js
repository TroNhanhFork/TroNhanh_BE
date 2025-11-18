
const express = require('express');
const router = express.Router();
const visitController = require('../controllers/visitRequestController');
const authMiddleware = require('../middleware/authMiddleWare');

// @route   POST /api/visit-requests
// @desc    Khách hàng tạo yêu cầu xem trọ
// @access  Private (Customer)
router.post('/', authMiddleware, visitController.createVisitRequest);

// @route   GET /api/visit-requests/customer
// @desc    Khách hàng xem các lịch hẹn của mình
// @access  Private (Customer)
router.get('/customer', authMiddleware, visitController.getCustomerVisitRequests);

// @route   GET /api/visit-requests/owner
// @desc    Chủ nhà xem các lịch hẹn gửi đến mình
// @access  Private (Owner/User)
router.get('/owner', authMiddleware, visitController.getOwnerVisitRequests);

// @route   PUT /api/visit-requests/:id/respond
// @desc    Chủ nhà phản hồi (chấp nhận/từ chối) lịch hẹn
// @access  Private (Owner/User)
router.put('/:id/respond', authMiddleware, visitController.respondToVisitRequest);
router.get(
    '/owner/pending-count', 
    authMiddleware, 
    visitController.getPendingVisitRequestCount
);
module.exports = router;