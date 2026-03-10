# AALA.LAND Quick Start Guide
## Get Your Property Management Platform Running in 15 Minutes

### Prerequisites
- Node.js 22+ and npm/pnpm
- PostgreSQL 18
- Dragonfly (Redis-compatible cache)
- Git

---

## Backend Setup

### 1. Clone and Install
```bash
# Clone the repository
git clone https://github.com/aala/aala-land.git
cd aala-land/backend

# Install dependencies
pnpm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configurations
nano .env
```

**Required Environment Variables:**
```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=aalaland
DATABASE_PASSWORD=your_secure_password
DATABASE_NAME=aalaland

# Dragonfly (Redis-compatible)
DRAGONFLY_HOST=localhost
DRAGONFLY_PORT=6379
DRAGONFLY_PASSWORD=your_dragonfly_password

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRATION=3600

# AWS S3 (for file storage)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=aalaland-files

# Email (SendGrid)
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=noreply@aala.land

# WhatsApp Business API
WHATSAPP_API_KEY=your_whatsapp_key
WHATSAPP_PHONE_NUMBER=+1234567890
```

### 3. Database Setup
```bash
# Create database
createdb aalaland

# Run migrations
pnpm run migration:run

# Seed demo data (optional)
pnpm run seed
```

### 4. Start Backend
```bash
# Development mode
pnpm run start:dev

# Production mode
pnpm run build
pnpm run start:prod
```

Backend will be available at: `http://localhost:3000`

---

## Frontend Setup

### 1. Install Frontend
```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install
```

### 2. Configure API Endpoint
```javascript
// config/environment.js
module.exports = function(environment) {
  let ENV = {
    // ... other config
    API: {
      host: 'http://localhost:3000',
      namespace: 'v1'
    }
  };
  return ENV;
};
```

### 3. Start Frontend
```bash
# Development server
npm start

# Build for production
npm run build
```

Frontend will be available at: `http://localhost:4200`

---

## Docker Setup (Alternative)

### 1. Using Docker Compose
```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 2. Docker Compose File
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: aalaland
      POSTGRES_USER: aalaland
      POSTGRES_PASSWORD: aalaland123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    environment:
      - DFLY_requirepass=dragonfly123
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://aalaland:aalaland123@postgres:5432/aalaland
      DRAGONFLY_URL: redis://:dragonfly123@dragonfly:6379
    depends_on:
      - postgres
      - dragonfly

  frontend:
    build: ./frontend
    ports:
      - "4200:4200"
    depends_on:
      - backend

volumes:
  postgres_data:
```

---

## Initial Setup & Configuration

### 1. Create First Company
```bash
# Using CLI
pnpm run cli company:create "Demo Real Estate" --admin-email=admin@demo.com

# Or via API
curl -X POST http://localhost:3000/v1/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Real Estate",
    "adminEmail": "admin@demo.com",
    "adminPassword": "SecurePass123!"
  }'
```

### 2. Login and Get Token
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@demo.com",
    "password": "SecurePass123!"
  }'
```

### 3. Create Your First Property
```bash
# First create an area
curl -X POST http://localhost:3000/v1/property-areas \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Downtown",
    "city": "Dubai",
    "country": "UAE"
  }'

# Then create a building
curl -X POST http://localhost:3000/v1/property-buildings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "areaId": "AREA_ID",
    "name": "Sunset Tower",
    "address": "123 Main St, Downtown Dubai"
  }'

# Finally create a property
curl -X POST http://localhost:3000/v1/properties \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "buildingId": "BUILDING_ID",
    "unitNumber": "1001",
    "bedrooms": 2,
    "bathrooms": 2,
    "areaSqft": 1200,
    "monthlyRent": 10000,
    "propertyType": "APARTMENT"
  }'
```

---

## Testing

### Run Tests
```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration

# E2E tests
pnpm test:e2e

# Test coverage
pnpm test:cov
```

---

## Common Issues & Solutions

### 1. Database Connection Error
```bash
# Check PostgreSQL is running
pg_isready

# Check connection
psql -U aalaland -d aalaland -h localhost
```

### 2. Dragonfly Connection Error
```bash
# Check Dragonfly is running
redis-cli ping

# Test connection with password
redis-cli -a your_password ping
```

### 3. Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### 4. Migration Errors
```bash
# Reset database (WARNING: Deletes all data)
pnpm run schema:drop
pnpm run migration:run
pnpm run seed
```

---

## Development Tools

### Swagger API Documentation
Visit: `http://localhost:3000/api-docs`

### Database GUI
Use pgAdmin or DBeaver to connect:
- Host: localhost
- Port: 5432
- Database: aalaland
- Username: aalaland

### Dragonfly GUI
Use RedisInsight or Redis Commander (Dragonfly is Redis-compatible):
- Host: localhost
- Port: 6379
- Password: your_dragonfly_password

---

## Production Deployment

### 1. Build for Production
```bash
# Backend
cd backend
pnpm run build

# Frontend
cd frontend
npm run build
```

### 2. Environment Variables
Ensure all production environment variables are set:
- Use strong passwords
- Enable SSL/TLS
- Configure proper CORS origins
- Set up monitoring (Sentry, etc.)

### 3. Database Migrations
```bash
# Run migrations on production
NODE_ENV=production pnpm run migration:run
```

### 4. Process Management
Use PM2 for Node.js process management:
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/main.js --name aala-backend

# Save PM2 configuration
pm2 save
pm2 startup
```

---

## Next Steps

1. **Configure Email Templates**: Customize email templates in `backend/templates`
2. **Set Up SSL**: Configure SSL certificates for HTTPS
3. **Configure Backups**: Set up automated database backups
4. **Add Monitoring**: Integrate Sentry, New Relic, or similar
5. **Customize UI**: Modify frontend theme and branding

---

## Support

- Documentation: https://docs.aala.land
- GitHub Issues: https://github.com/aala/aala-land/issues
- Email: support@aala.land

---

**Welcome to AALA.LAND!** 🏢✨