# AALA.LAND - Complete Technical Breakdown
## Comprehensive System Architecture

> **Enterprise-Grade Property Management Platform**  
> *Based on proven architectural patterns and industry best practices*

---

## 🏗️ **SYSTEM ARCHITECTURE - DETAILED**

### **Core Technology Stack**
```yaml
# Backend
Framework: NestJS v11 with TypeScript 5+
Database: PostgreSQL 18 (Primary)
Cache: Dragonfly (Sessions, Temp Data) - Redis-compatible, 25x faster
Queue: BullMQ (Background Jobs)
Storage: AWS S3 / Local FS
Search: PostgreSQL Full-Text Search
Monitoring: Sentry + Custom Metrics

# Frontend
Framework: Ember.js 6.8.0 LTS
Mobile: Capacitor 7
UI: Bootstrap 5 + Custom SCSS
Charts: Chart.js
PDF: jsPDF + html2canvas
State: Ember Data + Local Storage

# Infrastructure
Hosting: AWS EC2 / DigitalOcean Droplets
CDN: CloudFlare
SSL: Let's Encrypt (Certbot)
Reverse Proxy: Nginx
Process Manager: PM2
CI/CD: GitHub Actions
```

---

## 📊 **DATABASE SCHEMA - COMPLETE**

### **Core Tables with Relationships**

```sql
-- Companies (Tenants)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE, -- future use
  settings JSONB DEFAULT '{}',
  subscription_plan VARCHAR(50) DEFAULT 'trial',
  subscription_expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Users with Locale Preferences
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  role_id UUID REFERENCES roles(id),
  preferred_language VARCHAR(5) DEFAULT 'en',
  date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
  currency VARCHAR(3) DEFAULT 'AED',
  timezone VARCHAR(50) DEFAULT 'Asia/Dubai',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced Property Hierarchy
CREATE TABLE property_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100),
  country VARCHAR(100),
  polygon JSONB, -- GeoJSON for area boundaries
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE property_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  area_id UUID REFERENCES property_areas(id),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  total_units INTEGER DEFAULT 0,
  amenities JSONB DEFAULT '[]',
  year_built INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  building_id UUID REFERENCES property_buildings(id),
  unit_number VARCHAR(50),
  floor INTEGER,
  bedrooms DECIMAL(3,1), -- 2.5 bedrooms
  bathrooms DECIMAL(3,1),
  area_sqft DECIMAL(10,2),
  area_sqm DECIMAL(10,2),
  property_type VARCHAR(50), -- APARTMENT, VILLA, OFFICE, SHOP
  status VARCHAR(50), -- AVAILABLE, RENTED, MAINTENANCE
  monthly_rent DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'AED',
  features JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CRM & Lead Management
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50), -- ME market essential
  source VARCHAR(100), -- WEBSITE, REFERRAL, WALK_IN, PORTAL
  status VARCHAR(50), -- NEW, CONTACTED, QUALIFIED, NEGOTIATION, CLOSED, LOST
  score INTEGER DEFAULT 0,
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  preferred_areas TEXT[],
  property_requirements JSONB,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Financial Management
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  lease_id UUID REFERENCES leases(id),
  type VARCHAR(50), -- RENT, DEPOSIT, COMMISSION, EXPENSE
  category VARCHAR(100),
  amount DECIMAL(10,2),
  currency VARCHAR(3),
  payment_method VARCHAR(50), -- CASH, BANK_TRANSFER, CHEQUE, CARD
  status VARCHAR(50), -- PENDING, COMPLETED, CANCELLED
  due_date DATE,
  paid_date DATE,
  reference_number VARCHAR(100),
  attachments JSONB DEFAULT '[]',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Commission Tracking
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  deal_id UUID, -- Can reference lease or sale
  agent_id UUID REFERENCES users(id),
  property_id UUID REFERENCES properties(id),
  commission_type VARCHAR(50), -- PERCENTAGE, FIXED
  commission_value DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  status VARCHAR(50), -- PENDING, APPROVED, PAID
  paid_date DATE,
  invoice_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Document Management
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  entity_type VARCHAR(50), -- PROPERTY, LEASE, USER, LEAD
  entity_id UUID,
  category VARCHAR(100), -- CONTRACT, INVOICE, RECEIPT, ID, PHOTO
  file_name VARCHAR(255),
  file_path TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  is_public BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp Integration
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  direction VARCHAR(10), -- INBOUND, OUTBOUND
  from_number VARCHAR(50),
  to_number VARCHAR(50),
  message_type VARCHAR(20), -- TEXT, IMAGE, DOCUMENT
  content TEXT,
  media_url TEXT,
  status VARCHAR(50), -- SENT, DELIVERED, READ, FAILED
  whatsapp_message_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Scheduled Jobs
CREATE TABLE scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  job_type VARCHAR(100), -- RENT_REMINDER, LEASE_EXPIRY, REPORT_GENERATION
  cron_expression VARCHAR(100),
  payload JSONB,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 **API STRUCTURE - COMPLETE**

### **RESTful Endpoints Design**

```typescript
// Base URL: https://api.aala.land/v1

// Authentication
POST   /auth/login
POST   /auth/logout  
POST   /auth/refresh
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/me

// Companies (Admin Only)
GET    /companies
POST   /companies
GET    /companies/:id
PATCH  /companies/:id
DELETE /companies/:id

// Users
GET    /users
POST   /users
GET    /users/:id
PATCH  /users/:id
DELETE /users/:id
POST   /users/invite
PATCH  /users/:id/activate

// Properties Hierarchy
GET    /property-areas
POST   /property-areas
GET    /property-areas/:id
PATCH  /property-areas/:id
DELETE /property-areas/:id

GET    /property-buildings
POST   /property-buildings
GET    /property-buildings/:id
PATCH  /property-buildings/:id
DELETE /property-buildings/:id
GET    /property-buildings/:id/units

GET    /properties
POST   /properties
GET    /properties/:id
PATCH  /properties/:id
DELETE /properties/:id
POST   /properties/bulk-import
GET    /properties/export

// Leads & CRM
GET    /leads
POST   /leads
GET    /leads/:id
PATCH  /leads/:id
DELETE /leads/:id
POST   /leads/:id/assign
POST   /leads/:id/convert
GET    /leads/:id/activities
POST   /leads/:id/activities
POST   /leads/import

// Leases
GET    /leases
POST   /leases
GET    /leases/:id
PATCH  /leases/:id
DELETE /leases/:id
POST   /leases/:id/renew
POST   /leases/:id/terminate
GET    /leases/:id/documents

// Financial
GET    /transactions
POST   /transactions
GET    /transactions/:id
PATCH  /transactions/:id
DELETE /transactions/:id
GET    /transactions/summary
POST   /transactions/bulk-import

GET    /commissions
POST   /commissions
GET    /commissions/:id
PATCH  /commissions/:id
POST   /commissions/:id/approve
POST   /commissions/:id/pay

// Documents
POST   /documents/upload
GET    /documents/:id
DELETE /documents/:id
GET    /documents/:id/download
POST   /documents/bulk-upload

// Reports & Analytics
GET    /reports/financial-summary
GET    /reports/occupancy
GET    /reports/lead-conversion
GET    /reports/commission-summary
POST   /reports/custom

// WhatsApp Integration
POST   /whatsapp/send
POST   /whatsapp/webhook
GET    /whatsapp/conversations/:leadId

// Maintenance
GET    /work-orders
POST   /work-orders
GET    /work-orders/:id
PATCH  /work-orders/:id
POST   /work-orders/:id/assign
POST   /work-orders/:id/complete

// Settings
GET    /settings/company
PATCH  /settings/company
GET    /settings/user
PATCH  /settings/user
GET    /settings/email-templates
PATCH  /settings/email-templates
```

---

## 🚀 **QUEUE SYSTEM IMPLEMENTATION**

### **BullMQ Job Definitions**

```typescript
// Queue Types
enum QueueName {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  REPORT = 'report',
  IMPORT = 'import',
  EXPORT = 'export',
  NOTIFICATION = 'notification',
  MAINTENANCE = 'maintenance'
}

// Job Processors
interface EmailJob {
  to: string[];
  template: string;
  data: Record<string, any>;
  attachments?: string[];
}

interface ReportJob {
  type: 'financial' | 'occupancy' | 'commission';
  companyId: string;
  userId: string;
  dateRange: { from: Date; to: Date };
  format: 'pdf' | 'excel';
}

interface WhatsAppJob {
  to: string;
  message: string;
  mediaUrl?: string;
  leadId: string;
}

interface MaintenanceJob {
  type: 'rent_reminder' | 'lease_expiry' | 'payment_due';
  companyId: string;
  daysAhead: number;
}

// Scheduled Jobs Configuration
const scheduledJobs = [
  {
    name: 'daily-rent-reminders',
    cron: '0 9 * * *', // 9 AM daily
    job: { type: 'rent_reminder', daysAhead: 3 }
  },
  {
    name: 'lease-expiry-notifications', 
    cron: '0 9 * * MON', // Monday 9 AM
    job: { type: 'lease_expiry', daysAhead: 60 }
  },
  {
    name: 'monthly-financial-reports',
    cron: '0 0 1 * *', // 1st of month
    job: { type: 'financial', format: 'pdf' }
  }
];
```

---

## 📄 **PDF GENERATION SYSTEM**

### **Document Templates**

```typescript
// PDF Templates
enum PDFTemplate {
  LEASE_CONTRACT = 'lease_contract',
  RENT_RECEIPT = 'rent_receipt',
  INVOICE = 'invoice',
  FINANCIAL_REPORT = 'financial_report',
  PROPERTY_LISTING = 'property_listing',
  COMMISSION_STATEMENT = 'commission_statement'
}

// PDF Service Implementation
import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';

@Injectable()
export class PDFService {
  async generatePDF(
    template: PDFTemplate,
    data: any,
    locale: string = 'en'
  ): Promise<Buffer> {
    const html = await this.renderTemplate(template, data, locale);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    await page.setContent(html);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm' }
    });
    
    await browser.close();
    return pdf;
  }
}
```

---

## 🔐 **SECURITY IMPLEMENTATION**

### **Multi-tenant Isolation**

```typescript
// Company Context Interceptor
@Injectable()
export class CompanyContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Inject company context into all queries
    request.companyId = user.companyId;
    
    return next.handle();
  }
}

// Company Isolation Guard
@Injectable()
export class CompanyIsolationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const resourceCompanyId = request.params.companyId || 
                             request.body.companyId;
    
    return !resourceCompanyId || 
           resourceCompanyId === request.user.companyId;
  }
}
```

---

## 🏗️ **INFRASTRUCTURE SETUP**

### **Docker Configuration**

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: aalaland
      POSTGRES_USER: aalaland
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    environment:
      - DFLY_requirepass=${REDIS_PASSWORD}
    ports:
      - "6379:6379"

  api:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://aalaland:${DB_PASSWORD}@postgres:5432/aalaland
      - DRAGONFLY_URL=redis://:${REDIS_PASSWORD}@dragonfly:6379
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - dragonfly

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api

volumes:
  postgres_data:
```

### **Deployment Scripts**

```bash
#!/bin/bash
# deploy.sh

# Build and push Docker images
docker build -t aalaland/api:latest .
docker push aalaland/api:latest

# Deploy to server
ssh deploy@server << 'EOF'
  cd /opt/aalaland
  docker-compose pull
  docker-compose down
  docker-compose up -d
  docker-compose exec api npm run migration:run
EOF

# Health check
curl -f https://api.aala.land/health || exit 1
```

---

## 📊 **MONITORING & OBSERVABILITY**

### **Metrics Collection**

```typescript
// Prometheus metrics
import { Counter, Histogram, register } from 'prom-client';

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

export const businessMetrics = {
  propertiesCreated: new Counter({
    name: 'properties_created_total',
    help: 'Total number of properties created',
    labelNames: ['company_id', 'property_type']
  }),
  
  leadsConverted: new Counter({
    name: 'leads_converted_total',
    help: 'Total number of leads converted',
    labelNames: ['company_id', 'source']
  })
};
```
