# Report Management API Documentation

## Overview
This document provides comprehensive documentation for the admin report management system in the TroNhanh platform. The system handles two main types of reports:
1. **Customer Report Owner** - Customers reporting issues with property owners
2. **Owner Report Customer** - Property owners reporting issues with customers

## Authentication
All report management APIs require admin authentication:
- Headers: `Authorization: Bearer <admin_token>`
- Middleware: `adminAuth` (validates JWT token + admin role)

## API Endpoints

### 1. Get All Reports
**UC-Admin-12: View list of all reports with filtering**

```
GET /api/admin/reports
```

**Query Parameters:**
- `page` (number, default: 1) - Page number for pagination
- `limit` (number, default: 20, max: 50) - Items per page
- `status` (string) - Filter by status: `Pending`, `Reviewed`, `Approved`, `Rejected`
- `type` (string) - Filter by report type (partial match)
- `reportType` (string) - Filter by report category:
  - `customer_report_owner` - Customer reporting owner
  - `owner_report_customer` - Owner reporting customer
- `reporterId` (ObjectId) - Filter by specific reporter
- `reportedUserId` (ObjectId) - Filter by specific reported user
- `accommodationId` (ObjectId) - Filter by specific accommodation
- `fromDate` (date) - Start date for date range filter
- `toDate` (date) - End date for date range filter
- `search` (string) - Search in content, admin feedback, or type
- `sortBy` (string, default: 'createAt') - Sort field
- `sortOrder` (string, default: 'desc') - Sort order: `asc` or `desc`

**Response:**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "_id": "report_id",
        "type": "Inappropriate behavior",
        "content": "Report content...",
        "status": "Pending",
        "adminFeedback": "",
        "createAt": "2025-07-19T10:00:00.000Z",
        "category": "customer_report_owner",
        "reporter": {
          "_id": "user_id",
          "name": "John Doe",
          "email": "john@example.com",
          "role": "customer",
          "avatar": "avatar_url",
          "phone": "1234567890"
        },
        "reportedUser": {
          "_id": "owner_id",
          "name": "Jane Smith",
          "email": "jane@example.com",
          "role": "owner",
          "status": "active"
        },
        "accommodation": {
          "_id": "accommodation_id",
          "title": "Cozy Apartment",
          "location": { "district": "District 1", "street": "Main St" },
          "price": 1000000,
          "status": "Available"
        }
      }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 20,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "statistics": {
      "total": 50,
      "statusBreakdown": {
        "Pending": 20,
        "Approved": 15,
        "Rejected": 15
      },
      "categoryBreakdown": {
        "customer_report_owner": 30,
        "owner_report_customer": 15,
        "other": 5
      },
      "topReportTypes": [
        { "type": "Inappropriate behavior", "count": 12 },
        { "type": "Property mismatch", "count": 8 }
      ],
      "pendingCount": 20,
      "resolvedCount": 30
    }
  }
}
```

### 2. Get Report Details
**UC-Admin-13: View detailed information about a specific report**

```
GET /api/admin/reports/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "report_id",
    "type": "Inappropriate behavior",
    "content": "Detailed report content...",
    "status": "Pending",
    "adminFeedback": "",
    "createAt": "2025-07-19T10:00:00.000Z",
    "category": "customer_report_owner",
    "reporter": {
      "_id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "avatar": "avatar_url",
      "phone": "1234567890",
      "address": "123 Main St",
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    "reportedUser": {
      "_id": "owner_id",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "role": "owner",
      "status": "active",
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    "accommodation": {
      "_id": "accommodation_id",
      "title": "Cozy Apartment",
      "description": "Beautiful apartment...",
      "location": { "district": "District 1", "street": "Main St" },
      "price": 1000000,
      "status": "Available",
      "photos": ["photo1.jpg", "photo2.jpg"],
      "ownerId": {
        "_id": "owner_id",
        "name": "Jane Smith",
        "email": "jane@example.com",
        "phone": "0987654321"
      }
    }
  }
}
```

### 3. Resolve Report
**UC-Admin-14: Approve or reject a report with admin feedback**

```
PUT /api/admin/reports/:id/resolve
```

**Request Body:**
```json
{
  "action": "approve", // or "reject"
  "adminFeedback": "Report has been thoroughly reviewed. Action taken based on evidence provided.",
  "actionOnReportedUser": "lock_user" // optional, only for approved reports
}
```

**Available Actions on Reported User:**
- `lock_user` - Lock the reported user account
- `none` or omit - No action taken on the user

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "report_id",
    "type": "Inappropriate behavior",
    "status": "Approved",
    "adminFeedback": "Report has been thoroughly reviewed...",
    "category": "customer_report_owner",
    "actionTaken": "lock_user",
    "resolvedAt": "2025-07-19T12:00:00.000Z"
  },
  "message": "Report approved successfully"
}
```

### 4. Get Report Statistics
**UC-Admin-15: Get report statistics for dashboard**

```
GET /api/admin/reports/stats
```

**Query Parameters:**
- `fromDate` (date) - Start date for statistics
- `toDate` (date) - End date for statistics

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "statusBreakdown": {
      "Pending": 30,
      "Approved": 40,
      "Rejected": 30
    },
    "categoryBreakdown": {
      "customer_report_owner": 60,
      "owner_report_customer": 30,
      "other": 10
    },
    "topReportTypes": [
      { "type": "Inappropriate behavior", "count": 25 },
      { "type": "Property mismatch", "count": 20 },
      { "type": "Payment issues", "count": 15 }
    ],
    "recentTrend": [
      { "date": "2025-07-13", "count": 5 },
      { "date": "2025-07-14", "count": 8 },
      { "date": "2025-07-15", "count": 12 }
    ],
    "pendingCount": 30,
    "resolvedCount": 70
  }
}
```

## Report Categories

### Customer Report Owner
- **Description**: Reports submitted by customers about property owners
- **Common Types**: 
  - Inappropriate behavior
  - Property mismatch
  - Safety concerns
  - Contract violations
  - Communication issues

### Owner Report Customer
- **Description**: Reports submitted by property owners about customers
- **Common Types**:
  - Property damage
  - Inappropriate behavior
  - Payment issues
  - Contract violations
  - Noise complaints

## Business Rules

### BR-RP-01: Report Resolution Authority
- Only admin users can resolve reports
- All resolutions must include admin feedback
- Resolution actions are permanently logged

### BR-RP-02: User Action Consequences
- Approved reports against users may result in account restrictions
- User locking actions are automatically logged in audit system
- Locked users cannot perform platform actions until unlocked

### BR-RP-03: Report Categorization
- System automatically categorizes reports based on reporter and reported user roles
- Category helps in filtering and statistical analysis
- Categories: `customer_report_owner`, `owner_report_customer`, `other`, `general`

### BR-RP-04: Audit Trail
- All report resolution actions are logged with complete context
- Audit logs include admin details, action type, and resolution metadata
- Audit system tracks user locking actions triggered by report approvals

## Error Handling

### Common Error Responses
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (development only)"
}
```

### HTTP Status Codes
- `200` - Success
- `400` - Bad Request (invalid parameters, missing required fields)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (report doesn't exist)
- `500` - Internal Server Error

## Usage Examples

### Example 1: Get All Customer Reports About Owners
```bash
GET /api/admin/reports?reportType=customer_report_owner&status=Pending&page=1&limit=10
```

### Example 2: Search Reports by Content
```bash
GET /api/admin/reports?search=inappropriate&sortBy=createAt&sortOrder=desc
```

### Example 3: Approve Report and Lock User
```bash
PUT /api/admin/reports/64f5a1b2c3d4e5f6a7b8c9d0/resolve
Content-Type: application/json

{
  "action": "approve",
  "adminFeedback": "Report contains clear evidence of policy violation. User account will be temporarily locked pending further review.",
  "actionOnReportedUser": "lock_user"
}
```

### Example 4: Get Statistics for Last 30 Days
```bash
GET /api/admin/reports/stats?fromDate=2025-06-19&toDate=2025-07-19
```

## Security Features

1. **Admin Authentication**: All endpoints require valid admin JWT token
2. **Role-Based Access**: Only admin users can access report management endpoints
3. **Audit Logging**: All actions are logged for accountability
4. **Input Validation**: All inputs are validated and sanitized
5. **Rate Limiting**: Endpoints include rate limiting to prevent abuse

## Integration Notes

1. **User Management Integration**: Report resolution can trigger user account actions
2. **Accommodation Integration**: Reports can be linked to specific accommodations
3. **Audit System Integration**: All actions are logged in the audit trail
4. **Statistics Integration**: Report data feeds into admin dashboard analytics

## Best Practices

1. **Thorough Review**: Always provide detailed admin feedback when resolving reports
2. **Fair Resolution**: Consider evidence from both parties before making decisions
3. **Consistent Actions**: Apply similar actions for similar violations
4. **Documentation**: Use audit logs to track patterns and improve policies
5. **Regular Monitoring**: Monitor report statistics to identify platform issues

This report management system provides comprehensive tools for admins to maintain platform safety and resolve conflicts between users effectively.
