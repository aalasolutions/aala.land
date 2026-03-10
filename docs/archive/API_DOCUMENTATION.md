# AALA.LAND API Documentation
## RESTful API Reference Guide

### Base URL
```
Production: https://api.aala.land/v1
Staging: https://staging-api.aala.land/v1
Development: http://localhost:3000/v1
```

### Authentication
All API requests require authentication using JWT tokens, except for public endpoints.

#### Headers
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
Accept-Language: en | ar | fr
X-Company-ID: <company_uuid> (optional, for super admin)
```

---

## Authentication Endpoints

### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "rememberMe": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600,
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": {
        "id": "role-uuid",
        "name": "Property Manager",
        "permissions": ["properties:read", "properties:write"]
      },
      "company": {
        "id": "company-uuid",
        "name": "AALA Properties LLC"
      }
    }
  }
}
```

### Refresh Token
```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Logout
```http
POST /auth/logout
```

**Request Headers:**
```http
Authorization: Bearer <jwt_token>
```

---

## Property Management Endpoints

### List Properties
```http
GET /properties
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `search` (string): Search in name, address
- `status` (string): Filter by status (AVAILABLE, RENTED, MAINTENANCE)
- `propertyType` (string): Filter by type (APARTMENT, VILLA, OFFICE, SHOP)
- `areaId` (uuid): Filter by area
- `buildingId` (uuid): Filter by building
- `minRent` (number): Minimum monthly rent
- `maxRent` (number): Maximum monthly rent
- `bedrooms` (number): Number of bedrooms
- `sortBy` (string): Sort field (createdAt, rent, area)
- `sortOrder` (string): ASC or DESC

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "property-uuid",
        "unitNumber": "2304",
        "building": {
          "id": "building-uuid",
          "name": "IrisBay Tower",
          "area": {
            "id": "area-uuid",
            "name": "Business Bay"
          }
        },
        "bedrooms": 2,
        "bathrooms": 2.5,
        "areaSqft": 1250,
        "areaSqm": 116.13,
        "monthlyRent": 12000,
        "currency": "AED",
        "status": "AVAILABLE",
        "propertyType": "APARTMENT",
        "features": ["Balcony", "Gym", "Pool"],
        "mediaCount": 8,
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### Get Property Details
```http
GET /properties/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "property-uuid",
    "unitNumber": "2304",
    "floor": 23,
    "building": {
      "id": "building-uuid",
      "name": "IrisBay Tower",
      "address": "Business Bay, Dubai",
      "totalUnits": 320,
      "yearBuilt": 2019,
      "amenities": ["Gym", "Pool", "Concierge", "Parking"],
      "area": {
        "id": "area-uuid",
        "name": "Business Bay",
        "city": "Dubai",
        "country": "UAE"
      }
    },
    "bedrooms": 2,
    "bathrooms": 2.5,
    "areaSqft": 1250,
    "areaSqm": 116.13,
    "monthlyRent": 12000,
    "currency": "AED",
    "status": "AVAILABLE",
    "propertyType": "APARTMENT",
    "features": ["Balcony", "Built-in Wardrobes", "Central A/C", "Kitchen Appliances"],
    "description": "Luxurious 2BR apartment with stunning canal views",
    "media": [
      {
        "id": "media-uuid",
        "type": "IMAGE",
        "url": "https://cdn.aala.land/properties/...",
        "thumbnailUrl": "https://cdn.aala.land/properties/...",
        "caption": "Living Room",
        "order": 1
      }
    ],
    "currentLease": null,
    "maintenanceHistory": [],
    "financialSummary": {
      "totalIncome": 144000,
      "totalExpenses": 12000,
      "netIncome": 132000,
      "occupancyRate": 92
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-02-20T14:45:00Z"
  }
}
```

### Create Property
```http
POST /properties
```

**Request Body:**
```json
{
  "buildingId": "building-uuid",
  "unitNumber": "2305",
  "floor": 23,
  "bedrooms": 3,
  "bathrooms": 3.5,
  "areaSqft": 1850,
  "propertyType": "APARTMENT",
  "monthlyRent": 18000,
  "currency": "AED",
  "features": ["Balcony", "Maid Room", "Study Room"],
  "description": "Spacious 3BR apartment with panoramic views"
}
```

### Update Property
```http
PATCH /properties/:id
```

**Request Body:** (partial update)
```json
{
  "status": "RENTED",
  "monthlyRent": 19000,
  "features": ["Balcony", "Maid Room", "Study Room", "Storage Room"]
}
```

### Delete Property
```http
DELETE /properties/:id
```

### Bulk Import Properties
```http
POST /properties/bulk-import
```

**Request:** Multipart form data
- `file`: CSV file with property data
- `buildingId`: Default building ID for all properties

**CSV Format:**
```csv
unit_number,bedrooms,bathrooms,area_sqft,monthly_rent,property_type,status
101,1,1,750,8000,APARTMENT,AVAILABLE
102,2,2,1100,12000,APARTMENT,RENTED
```

---

## Lead Management Endpoints

### List Leads
```http
GET /leads
```

**Query Parameters:**
- `status` (string): NEW, CONTACTED, QUALIFIED, NEGOTIATION, CLOSED, LOST
- `assignedTo` (uuid): Filter by assigned agent
- `source` (string): WEBSITE, REFERRAL, WALK_IN, PORTAL
- `minBudget` (number): Minimum budget
- `maxBudget` (number): Maximum budget
- `score` (number): Minimum lead score
- `dateFrom` (date): Created after date
- `dateTo` (date): Created before date

### Create Lead
```http
POST /leads
```

**Request Body:**
```json
{
  "firstName": "Ahmed",
  "lastName": "Hassan",
  "email": "ahmed.hassan@example.com",
  "phone": "+971501234567",
  "whatsapp": "+971501234567",
  "source": "WEBSITE",
  "budgetMin": 10000,
  "budgetMax": 15000,
  "preferredAreas": ["Business Bay", "Downtown"],
  "propertyRequirements": {
    "bedrooms": "2-3",
    "propertyType": "APARTMENT",
    "moveInDate": "2024-04-01",
    "pets": false,
    "parking": true
  },
  "notes": "Looking for 2-3 BR apartment with good amenities"
}
```

### Convert Lead to Client
```http
POST /leads/:id/convert
```

**Request Body:**
```json
{
  "propertyId": "property-uuid",
  "leaseStartDate": "2024-04-01",
  "leaseEndDate": "2025-03-31",
  "monthlyRent": 12000,
  "securityDeposit": 12000
}
```

---

## Financial Endpoints

### List Transactions
```http
GET /transactions
```

**Query Parameters:**
- `type` (string): RENT, DEPOSIT, COMMISSION, EXPENSE
- `status` (string): PENDING, COMPLETED, CANCELLED
- `propertyId` (uuid): Filter by property
- `dateFrom` (date): Transaction date from
- `dateTo` (date): Transaction date to
- `minAmount` (number): Minimum amount
- `maxAmount` (number): Maximum amount

### Create Transaction
```http
POST /transactions
```

**Request Body:**
```json
{
  "propertyId": "property-uuid",
  "leaseId": "lease-uuid",
  "type": "RENT",
  "category": "MONTHLY_RENT",
  "amount": 12000,
  "currency": "AED",
  "paymentMethod": "BANK_TRANSFER",
  "dueDate": "2024-03-01",
  "referenceNumber": "BT-2024-03-001",
  "notes": "March 2024 rent payment"
}
```

### Get Financial Summary
```http
GET /transactions/summary
```

**Query Parameters:**
- `period` (string): MONTHLY, QUARTERLY, YEARLY
- `year` (number): Year for the report
- `month` (number): Month for monthly report
- `propertyId` (uuid): Filter by property

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "MONTHLY",
    "year": 2024,
    "month": 3,
    "summary": {
      "totalIncome": 450000,
      "totalExpenses": 65000,
      "netIncome": 385000,
      "pendingPayments": 24000,
      "overduePayments": 12000
    },
    "breakdown": {
      "income": {
        "rent": 420000,
        "lateFees": 5000,
        "other": 25000
      },
      "expenses": {
        "maintenance": 35000,
        "utilities": 15000,
        "management": 10000,
        "other": 5000
      }
    },
    "topProperties": [
      {
        "propertyId": "property-uuid",
        "propertyName": "IrisBay Tower - 2304",
        "income": 12000,
        "expenses": 1000,
        "netIncome": 11000
      }
    ]
  }
}
```

---

## WhatsApp Integration

### Send WhatsApp Message
```http
POST /whatsapp/send
```

**Request Body:**
```json
{
  "leadId": "lead-uuid",
  "to": "+971501234567",
  "messageType": "TEXT",
  "content": "Hello! Thank you for your interest in our properties.",
  "templateName": "property_inquiry_response"
}
```

### WhatsApp Webhook
```http
POST /whatsapp/webhook
```

**Note:** This endpoint is called by WhatsApp Business API to deliver incoming messages.

---

## Reports

### Generate Custom Report
```http
POST /reports/custom
```

**Request Body:**
```json
{
  "reportType": "PROPERTY_PERFORMANCE",
  "dateRange": {
    "from": "2024-01-01",
    "to": "2024-03-31"
  },
  "filters": {
    "propertyIds": ["property-uuid-1", "property-uuid-2"],
    "groupBy": "MONTHLY"
  },
  "format": "PDF",
  "emailTo": "manager@example.com"
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Common Error Codes
- `UNAUTHORIZED`: Invalid or missing authentication
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Request validation failed
- `CONFLICT`: Resource conflict (e.g., duplicate)
- `INTERNAL_ERROR`: Server error

---

## Rate Limiting

API endpoints are rate limited:
- **Standard endpoints**: 100 requests per minute
- **Search endpoints**: 30 requests per minute
- **Bulk operations**: 10 requests per minute
- **Report generation**: 5 requests per minute

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1615962000
```

---

## Webhooks

Configure webhooks in company settings to receive real-time updates:

### Available Events
- `property.created`
- `property.updated`
- `property.deleted`
- `lead.created`
- `lead.converted`
- `lease.created`
- `lease.expiring`
- `payment.received`
- `payment.overdue`

### Webhook Payload
```json
{
  "event": "property.created",
  "timestamp": "2024-03-15T10:30:00Z",
  "companyId": "company-uuid",
  "data": {
    "id": "property-uuid",
    "unitNumber": "2304",
    "buildingId": "building-uuid"
  }
}
```

---

## SDK Support

Official SDKs available:
- JavaScript/TypeScript
- Python
- PHP
- Ruby
- Go

Example (JavaScript):
```javascript
const AalaClient = require('@aala/sdk');

const client = new AalaClient({
  apiKey: 'your-api-key',
  environment: 'production'
});

// List properties
const properties = await client.properties.list({
  status: 'AVAILABLE',
  limit: 50
});

// Create a lead
const lead = await client.leads.create({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  source: 'WEBSITE'
});
```