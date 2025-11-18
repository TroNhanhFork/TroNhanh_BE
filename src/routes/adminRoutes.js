// file TroNhanh_BE/src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getUserStats,
  getUserStatsEndpoint,
  getUserById,
  lockUnlockUser,
  editUserInfo,
  deleteUser,
  getAuditLogs
} = require('../controllers/AdminController/UserController');

const { getAllBoardingHousesAdmin, getBoardingHouseDetailAdmin, approveBoardingHouseAdmin, deleteBoardingHouseAdmin } = require('../controllers/AdminController/BoardingHouseController');

const {
  createMembershipPackage,
  getAllMembershipPackages,
  getMembershipPackageById,
  updateMembershipPackage,
  deleteMembershipPackage
} = require('../controllers/AdminController/MembershipController');

const {
  getTransactionHistory,
  getTransactionStats,
  getTransactionById
} = require('../controllers/AdminController/TransactionController');

const {
  getAllReports,
  getReportById,
  resolveReport,
  getReportStats
} = require('../controllers/AdminController/ReportController');

const {
  getFlaggedImages,
  getFlaggedImageById,
  approveFlaggedImage,
  rejectFlaggedImage,
  deleteFlaggedImage,
  getFlaggedImageStats,
  batchApprove,
  batchReject
} = require('../controllers/AdminController/imageModerationController');

const {
  getUserDashboard,
  getAccommodationDashboard,
  getReportDashboard,
  getMembershipDashboard,
  getFinancialDashboard
} = require('../controllers/AdminController/DashboardController');

// Import admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

// Apply admin authentication to all routes
router.use(adminAuth);

// UC-Admin-Dashboard: Dashboard Analytics (5 APIs)
router.get('/dashboard/users', getUserDashboard);                  // GET /api/admin/dashboard/users
router.get('/dashboard/accommodations', getAccommodationDashboard); // GET /api/admin/dashboard/accommodations
router.get('/dashboard/reports', getReportDashboard);              // GET /api/admin/dashboard/reports
router.get('/dashboard/memberships', getMembershipDashboard);      // GET /api/admin/dashboard/memberships
router.get('/dashboard/financial', getFinancialDashboard);         // GET /api/admin/dashboard/financial

// UC-Admin-01: View User List
router.get('/users', getAllUsers);                    // GET /api/admin/users
router.get('/users/stats', getUserStatsEndpoint);    // GET /api/admin/users/stats

// UC-Admin-02: Lock/Unlock User
router.put('/users/:id/lock-unlock', lockUnlockUser); // PUT /api/admin/users/:id/lock-unlock

// UC-Admin-03: Edit User Information  
router.put('/users/:id/edit', editUserInfo);         // PUT /api/admin/users/:id/edit

// UC-Admin-04: Delete User Account
router.delete('/users/:id', deleteUser);             // DELETE /api/admin/users/:id

// Additional endpoints
router.get('/users/:id', getUserById);               // GET /api/admin/users/:id
router.get('/audit-logs', getAuditLogs);            // GET /api/admin/audit-logs

// UC-Admin-05: Admin view all accommodation posts
router.get('/boarding-houses', getAllBoardingHousesAdmin); // GET /api/admin/boardinghouse

// UC-Admin-06: Admin view accommodation post details
router.get('/boarding-houses/:id', getBoardingHouseDetailAdmin); // GET /api/admin/boardinghouse/:id

// UC-Admin-Approve: Admin approve/reject accommodation post
router.put('/boarding-houses/:id/approve', approveBoardingHouseAdmin); // PUT /api/admin/boardinghouse/:id/approve

// UC-Admin-07: Admin soft delete accommodation post
router.put('/boarding-houses/:id/delete', deleteBoardingHouseAdmin); // PUT /api/admin/boardinghouse/:id/delete

// UC-Admin-14: Membership Package Management
router.post('/membership-packages', createMembershipPackage);        // POST /api/admin/membership-packages
router.get('/membership-packages', getAllMembershipPackages);        // GET /api/admin/membership-packages
router.get('/membership-packages/:id', getMembershipPackageById);    // GET /api/admin/membership-packages/:id
router.put('/membership-packages/:id', updateMembershipPackage);     // PUT /api/admin/membership-packages/:id
router.delete('/membership-packages/:id', deleteMembershipPackage);  // DELETE /api/admin/membership-packages/:id

// UC-Admin-11: View Transaction History
router.get('/transactions', getTransactionHistory);                  // GET /api/admin/transactions
router.get('/transactions/stats', getTransactionStats);              // GET /api/admin/transactions/stats  
router.get('/transactions/:id', getTransactionById);                 // GET /api/admin/transactions/:id

// UC-Admin-12 to UC-Admin-15: Report Management
router.get('/reports', getAllReports);                               // GET /api/admin/reports
router.get('/reports/stats', getReportStats);                        // GET /api/admin/reports/stats
router.get('/reports/:id', getReportById);                           // GET /api/admin/reports/:id
router.put('/reports/:id/resolve', resolveReport);                   // PUT /api/admin/reports/:id/resolve

// UC-Admin-ImageModeration: AI Image Moderation & Review
router.get('/flagged-images/stats', getFlaggedImageStats);           // GET /api/admin/flagged-images/stats
router.get('/flagged-images', getFlaggedImages);                     // GET /api/admin/flagged-images
router.get('/flagged-images/:id', getFlaggedImageById);              // GET /api/admin/flagged-images/:id
router.put('/flagged-images/:id/approve', approveFlaggedImage);      // PUT /api/admin/flagged-images/:id/approve
router.put('/flagged-images/:id/reject', rejectFlaggedImage);        // PUT /api/admin/flagged-images/:id/reject
router.delete('/flagged-images/:id', deleteFlaggedImage);            // DELETE /api/admin/flagged-images/:id
router.post('/flagged-images/batch-approve', batchApprove);          // POST /api/admin/flagged-images/batch-approve
router.post('/flagged-images/batch-reject', batchReject);            // POST /api/admin/flagged-images/batch-reject

module.exports = router;