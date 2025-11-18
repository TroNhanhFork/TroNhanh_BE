const User = require('../../models/User');
const Accommodation = require('../../models/BoardingHouse');
const Payment = require('../../models/Payment');
const Report = require('../../models/Report');
const MembershipPackage = require('../../models/MembershipPackage');
const AuditLog = require('../../models/AuditLog');

// UC-Admin-Dashboard-Users: Get detailed user statistics
exports.getUserDashboard = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const userStats = await getUserStatistics(startDate, true); // detailed = true

    res.status(200).json({
      success: true,
      data: userStats,
      message: 'User dashboard data retrieved successfully'
    });

  } catch (error) {
    console.error('[USER DASHBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Helper function: Get user statistics
async function getUserStatistics(startDate, detailed = false) {
  const total = await User.countDocuments();
  const newUsers = await User.countDocuments({ createdAt: { $gte: startDate } });

  // 1. User counts by role and status
  const customerCount = await User.countDocuments({ role: 'customer' });
  const ownerCount = await User.countDocuments({ role: 'owner' });
  const blockedCount = await User.countDocuments({ status: 'locked' });

  const roleBreakdown = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);

  const statusBreakdown = await User.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const membershipBreakdown = await User.aggregate([
    { $group: { _id: '$membershipStatus', count: { $sum: 1 } } }
  ]);

  let dailyRegistrations = [];
  let topUsers = [];

  if (detailed) {
    // Daily registration trend
    dailyRegistrations = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Top active users (users with most accommodations)
    topUsers = await User.aggregate([
      { $match: { role: 'owner' } },
      {
        $lookup: {
          from: 'accommodations',
          localField: '_id',
          foreignField: 'ownerId',
          as: 'accommodations'
        }
      },
      {
        $addFields: {
          accommodationCount: { $size: '$accommodations' }
        }
      },
      { $sort: { accommodationCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          name: 1,
          email: 1,
          accommodationCount: 1,
          membershipStatus: 1,
          createdAt: 1
        }
      }
    ]);
  }

  return {
    total,
    customerCount,
    ownerCount,
    blockedCount,
    newUsers,
    growthRate: total > 0 ? ((newUsers / total) * 100).toFixed(2) : 0,
    roleBreakdown: roleBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    statusBreakdown: statusBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    membershipBreakdown: membershipBreakdown.reduce((acc, item) => {
      acc[item._id || 'none'] = item.count;
      return acc;
    }, {}),
    dailyRegistrations: dailyRegistrations.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      count: item.count
    })),
    topUsers
  };
}

// UC-Admin-Dashboard-Accommodations: Get accommodation analytics
exports.getAccommodationDashboard = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const accommodationStats = await getAccommodationStatistics(startDate);

    res.status(200).json({
      success: true,
      data: accommodationStats,
      message: 'Accommodation dashboard data retrieved successfully'
    });

  } catch (error) {
    console.error('[ACCOMMODATION DASHBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve accommodation dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Helper function: Get accommodation statistics
async function getAccommodationStatistics(startDate) {
  const total = await Accommodation.countDocuments();
  const newAccommodations = await Accommodation.countDocuments({ createdAt: { $gte: startDate } });

  const statusBreakdown = await Accommodation.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const approvalBreakdown = await Accommodation.aggregate([
    { $group: { _id: '$approvedStatus', count: { $sum: 1 } } }
  ]);

  // 3. Owner with most accommodations and their post status breakdown
  const ownerWithMostPosts = await Accommodation.aggregate([
    {
      $group: {
        _id: '$ownerId',
        totalPosts: { $sum: 1 },
        pendingPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'pending'] }, 1, 0] } },
        approvedPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'approved'] }, 1, 0] } },
        rejectedPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'rejected'] }, 1, 0] } },
        deletedPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'deleted'] }, 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'owner'
      }
    },
    {
      $project: {
        ownerId: '$_id',
        ownerName: { $arrayElemAt: ['$owner.name', 0] },
        ownerEmail: { $arrayElemAt: ['$owner.email', 0] },
        totalPosts: 1,
        pendingPosts: 1,
        approvedPosts: 1,
        rejectedPosts: 1,
        deletedPosts: 1
      }
    },
    { $sort: { totalPosts: -1 } },
    { $limit: 10 }
  ]);

  // Post status summary for all owners
  const postStatusSummary = await Accommodation.aggregate([
    {
      $group: {
        _id: null,
        totalPosts: { $sum: 1 },
        pendingPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'pending'] }, 1, 0] } },
        approvedPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'approved'] }, 1, 0] } },
        rejectedPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'rejected'] }, 1, 0] } },
        deletedPosts: { $sum: { $cond: [{ $eq: ['$approvedStatus', 'deleted'] }, 1, 0] } }
      }
    }
  ]);

  const occupancyStats = await Accommodation.aggregate([
    {
      $group: {
        _id: null,
        totalAccommodations: { $sum: 1 },
        occupiedAccommodations: {
          $sum: { $cond: [{ $ne: ['$customerId', null] }, 1, 0] }
        }
      }
    }
  ]);

  // Average price analysis
  const priceStats = await Accommodation.aggregate([
    {
      $group: {
        _id: null,
        averagePrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    }
  ]);

  const occupancyRate = occupancyStats[0]
    ? ((occupancyStats[0].occupiedAccommodations / occupancyStats[0].totalAccommodations) * 100).toFixed(2)
    : 0;

  return {
    total,
    newAccommodations,
    occupancyRate,
    statusBreakdown: statusBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    approvalBreakdown: approvalBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    priceStats: priceStats[0] || { averagePrice: 0, minPrice: 0, maxPrice: 0 },
    ownerWithMostPosts,
    postStatusSummary: postStatusSummary[0] || {
      totalPosts: 0,
      pendingPosts: 0,
      approvedPosts: 0,
      rejectedPosts: 0,
      deletedPosts: 0
    }
  };
}

// UC-Admin-Dashboard-Reports: Get report analytics
exports.getReportDashboard = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const reportStats = await getReportStatistics(startDate);

    res.status(200).json({
      success: true,
      data: reportStats,
      message: 'Report dashboard data retrieved successfully'
    });

  } catch (error) {
    console.error('[REPORT DASHBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve report dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Helper function: Get report statistics
async function getReportStatistics(startDate) {
  const totalReports = await Report.countDocuments();
  const recentReports = await Report.countDocuments({ createAt: { $gte: startDate } });
  const pendingCount = await Report.countDocuments({ status: 'Pending' });

  const statusBreakdown = await Report.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  // 2. Owner Reports vs Customer Reports by status
  const reportsByUserType = await Report.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'reporterId',
        foreignField: '_id',
        as: 'reporter'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'reportedUserId',
        foreignField: '_id',
        as: 'reportedUser'
      }
    },
    {
      $addFields: {
        reporterRole: { $arrayElemAt: ['$reporter.role', 0] },
        reportedUserRole: { $arrayElemAt: ['$reportedUser.role', 0] }
      }
    },
    {
      $group: {
        _id: {
          reporterRole: '$reporterRole',
          reportedUserRole: '$reportedUserRole',
          status: '$status'
        },
        count: { $sum: 1 }
      }
    }
  ]);

  // Separate owner reports and customer reports
  const ownerReports = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  };

  const customerReports = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  };

  reportsByUserType.forEach(item => {
    const count = item.count;
    const status = item._id.status;

    // Owner reports (owner reporting customer)
    if (item._id.reporterRole === 'owner' && item._id.reportedUserRole === 'customer') {
      ownerReports.total += count;
      if (status === 'Pending') ownerReports.pending += count;
      else if (status === 'Approved') ownerReports.approved += count;
      else if (status === 'Rejected') ownerReports.rejected += count;
    }

    // Customer reports (customer reporting owner)
    if (item._id.reporterRole === 'customer' && item._id.reportedUserRole === 'owner') {
      customerReports.total += count;
      if (status === 'Pending') customerReports.pending += count;
      else if (status === 'Approved') customerReports.approved += count;
      else if (status === 'Rejected') customerReports.rejected += count;
    }
  });

  const typeBreakdown = await Report.aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  return {
    totalReports,
    recentReports,
    pendingCount,
    resolutionRate: totalReports > 0 ? (((totalReports - pendingCount) / totalReports) * 100).toFixed(2) : 0,
    statusBreakdown: statusBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    ownerReports,
    customerReports,
    topReportTypes: typeBreakdown.map(item => ({
      type: item._id,
      count: item.count
    }))
  };
}

// UC-Admin-Dashboard-Memberships: Get membership analytics
exports.getMembershipDashboard = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const membershipStats = await getMembershipStatistics(startDate);

    res.status(200).json({
      success: true,
      data: membershipStats,
      message: 'Membership dashboard data retrieved successfully'
    });

  } catch (error) {
    console.error('[MEMBERSHIP DASHBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve membership dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Helper function: Get membership statistics
async function getMembershipStatistics(startDate) {
  const totalPackages = await MembershipPackage.countDocuments({ isDeleted: { $ne: true } });

  // 5. Package with most owner purchases
  const packagePopularity = await Payment.aggregate([
    {
      $match: {
        status: 'success',
        membershipPackageId: { $exists: true, $ne: null }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'ownerId',
        foreignField: '_id',
        as: 'owner'
      }
    },
    {
      $lookup: {
        from: 'membershippackages',
        localField: 'membershipPackageId',
        foreignField: '_id',
        as: 'package'
      }
    },
    {
      $match: {
        'owner.role': 'owner',
        'package': { $ne: [] }
      }
    },
    {
      $group: {
        _id: '$membershipPackageId',
        packageName: { $first: { $arrayElemAt: ['$package.name', 0] } },
        packagePrice: { $first: { $arrayElemAt: ['$package.price', 0] } },
        packageDuration: { $first: { $arrayElemAt: ['$package.duration', 0] } },
        ownerPurchaseCount: { $sum: 1 },
        totalRevenue: { $sum: '$amount' }
      }
    },
    { $sort: { ownerPurchaseCount: -1 } }
  ]);

  // Total purchases - count all successful payments in database
  const totalPurchases = await Payment.countDocuments({
    status: 'Paid'
  });

  const recentPurchases = await Payment.countDocuments({
    status: 'success',
    membershipPackageId: { $exists: true, $ne: null },
    createdAt: { $gte: startDate }
  });

  // Active memberships - count owners with active membership status
  const activePurchases = await User.countDocuments({
    role: 'owner',
    isMembership: 'active'
  });

  const mostPopularPackage = packagePopularity[0] || null;

  return {
    totalPackages,
    totalPurchases,
    recentPurchases,
    activePurchases,
    packagePopularity,
    mostPopularPackage,
    conversionRate: totalPackages > 0 ? ((totalPurchases / totalPackages) * 100).toFixed(2) : 0
  };
}

// UC-Admin-Dashboard-Financial: Get detailed financial analytics
exports.getFinancialDashboard = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const financialStats = await getTransactionStatistics(startDate, true); // detailed = true

    res.status(200).json({
      success: true,
      data: financialStats,
      message: 'Financial dashboard data retrieved successfully'
    });

  } catch (error) {
    console.error('[FINANCIAL DASHBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve financial dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Helper function: Get transaction statistics for column chart display
async function getTransactionStatistics(startDate, detailed = false) {
  const baseMatch = {
    status: { $in: ['success', 'Paid'] },
    membershipPackageId: { $ne: null },
    bookingId: { $eq: null }
  };

  const totalTransactions = await Payment.countDocuments(baseMatch);
  const recentTransactions = await Payment.countDocuments({
    ...baseMatch,
    createAt: { $gte: startDate }
  });

  const revenueStats = await Payment.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        averageTransaction: { $avg: '$amount' }
      }
    }
  ]);

  const recentRevenue = await Payment.aggregate([
    {
      $match: { ...baseMatch, createAt: { $gte: startDate } },
    },
    {
      $group: {
        _id: null,
        recentRevenue: { $sum: '$amount' }
      }
    }
  ]);

  const statusBreakdown = await Payment.aggregate([
    { $match: baseMatch },
    { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$amount' } } }
  ]);

  const dailyRevenueChart = await Payment.aggregate([
    { $match: { ...baseMatch, createAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          year: { $year: '$createAt' },
          month: { $month: '$createAt' },
          day: { $dayOfMonth: '$createAt' }
        },
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  const statusRevenueChart = await Payment.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: '$status',
        revenue: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  let membershipRevenueChart = [];

  if (detailed) {
    membershipRevenueChart = await Payment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: 'membershippackages',
          localField: 'membershipPackageId',
          foreignField: '_id',
          as: 'package'
        }
      },
      {
        $group: {
          _id: '$membershipPackageId',
          packageName: { $first: { $arrayElemAt: ['$package.name', 0] } },
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } }
    ]);
  }

  // ✅ Format lại data trả về
  return {
    summary: {
      totalTransactions,
      recentTransactions,
      totalRevenue: revenueStats[0]?.totalRevenue || 0,
      recentRevenue: recentRevenue[0]?.recentRevenue || 0,
      averageTransaction: revenueStats[0]?.averageTransaction || 0,
      growthRate:
        revenueStats[0]?.totalRevenue > 0
          ? (((recentRevenue[0]?.recentRevenue || 0) / revenueStats[0].totalRevenue) * 100).toFixed(2)
          : 0,
    },

    dailyRevenueList: dailyRevenueChart.map(item => ({
      date: `${String(item._id.day).padStart(2, '0')}/${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
      dayOfWeek: new Date(item._id.year, item._id.month - 1, item._id.day).toLocaleDateString('us-US', { weekday: 'long' }),
      revenue: item.revenue,
      transactions: item.transactions,
      averagePerTransaction: item.transactions > 0 ? (item.revenue / item.transactions).toFixed(0) : 0
    })),

    charts: {
      statusRevenue: {
        type: 'column',
        title: 'Revenue by Payment Status',
        categories: statusRevenueChart.map(item => item._id || 'Unknown'),
        series: [
          { name: 'Revenue (VND)', data: statusRevenueChart.map(item => item.revenue) },
          { name: 'Transaction Count', data: statusRevenueChart.map(item => item.count) },
        ]
      },
      ...(detailed && {
        membershipRevenue: {
          type: 'column',
          title: 'Revenue by Membership Package',
          categories: membershipRevenueChart.map(item => item.packageName || 'Unknown Package'),
          series: [
            { name: 'Revenue (VND)', data: membershipRevenueChart.map(item => item.revenue) },
            { name: 'Purchases', data: membershipRevenueChart.map(item => item.transactions) },
          ]
        }
      })
    },

    rawData: {
      statusBreakdown: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = { count: item.count, revenue: item.revenue };
        return acc;
      }, {}),
      membershipPackages: membershipRevenueChart
    }
  };
}
