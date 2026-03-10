# AALA.LAND - Feature Breakdown

## MVP Features (10 Modules)

---

### 1. Multi-Tenant System
**Priority:** Critical | **Phase:** 1

| Component | Description |
|-----------|-------------|
| Companies | Tenant isolation, settings, subscription |
| Users | Auth, profiles, preferences |
| Roles | Admin, Broker, Agent, Manager |
| Permissions | Granular access control |

**Backend Entities:** `companies`, `users`, `roles`, `permissions`

---

### 2. Property Management
**Priority:** Critical | **Phase:** 2

| Component | Description |
|-----------|-------------|
| Areas | Geographic zones (Business Bay, DIFC) |
| Buildings | Building-level grouping |
| Properties | Individual units with details |
| Media | Photos, floor plans, docs |

**Hierarchy:** Area → Building → Property → Unit

**Key Features:**
- Bulk CSV/Excel import
- Status workflow: Available → Listed → Rented → Maintenance
- Advanced search & filters

---

### 3. Lead Management (CRM)
**Priority:** Critical | **Phase:** 3

| View | Columns |
|------|---------|
| Temperature | HOT → WARM → COLD → DEAD |
| Agent Board | One column per agent |
| Pipeline | NEW → CONTACTED → VIEWING → NEGOTIATING → WON/LOST |

**Key Features:**
- Lead scoring (1-100)
- Source tracking (Website, WhatsApp, Walk-in)
- Activity timeline
- One-click agent transfer

---

### 4. Boss Dashboard
**Priority:** High | **Phase:** 3

| Widget | Purpose |
|--------|---------|
| Agent Scoreboard | Leads, conversions, revenue per agent |
| Activity Feed | Real-time team actions |
| Red Flags | Untouched leads (24h/48h), stalled deals |
| Leaderboard | Top performers this month |

---

### 5. WhatsApp Integration
**Priority:** High | **Phase:** 3

| Feature | Description |
|---------|-------------|
| Broadcast Lists | Segment leads by criteria |
| Property Packets | One-click PDF with photos, details |
| Message Tracking | Sent, Delivered, Read status |
| Templates | Pre-approved WhatsApp templates |

**API:** WhatsApp Business API (Meta)

---

### 6. Financial Management
**Priority:** Medium | **Phase:** 2

| Component | Description |
|-----------|-------------|
| Transactions | Income/expense recording |
| Cheque Mgmt | OCR, post-dated tracking, reminders |
| Payments | Methods, status, references |
| Reports | Monthly summary, P&L basics |

---

### 7. Document Management
**Priority:** Medium | **Phase:** 2

| Feature | Description |
|---------|-------------|
| Upload | Drag-drop, multi-file |
| Categories | Contracts, IDs, Invoices, Photos |
| Access Control | Role-based visibility |
| Quick Share | Direct WhatsApp sharing |

---

### 8. Notifications
**Priority:** Medium | **Phase:** 3

| Channel | Use Case |
|---------|----------|
| Email | Daily digests, reports |
| SMS | Urgent alerts, reminders |
| Push | Mobile app alerts |
| In-app | Real-time activity |

---

### 9. Lease Management
**Priority:** Medium | **Phase:** 4

| Component | Description |
|-----------|-------------|
| Leases | Terms, rent, deposits |
| Tenants | Profile, history, contacts |
| Renewals | Auto-reminders, tracking |
| Move-in/out | Checklists, inspections |

---

### 10. Maintenance
**Priority:** Low | **Phase:** 4

| Component | Description |
|-----------|-------------|
| Work Orders | Create, assign, track |
| Vendors | Contractor database |
| Scheduling | Preventive maintenance |
| Cost Tracking | Per-property expenses |

---

### 11. Team Management
**Priority:** High | **Phase:** 5

| Component | Description |
|-----------|-------------|
| Team List | All company members with roles |
| Add/Edit | Invite team, update profiles |
| Permissions | Role-based access control |
| Performance | Agent metrics, lead counts |

**Key Features:**
- Role assignment (Admin, Agent, Viewer)
- Agent performance dashboard
- Lead assignment tracking
- Activity history per team member

**Sidebar Label:** "Team"

---

## Backend Modules Map

```
src/modules/
├── auth/           # JWT, guards
├── companies/      # Multi-tenant
├── users/          # User management
├── roles/          # RBAC
├── properties/     # Core property
├── leads/          # CRM
├── transactions/   # Finance
├── documents/      # Files
├── notifications/  # Multi-channel
├── leases/         # Contracts
├── maintenance/    # Work orders
└── whatsapp/       # Integration
```

---

## Development Order

1. **Foundation:** auth → companies → users → roles → team
2. **Core:** properties → documents → transactions
3. **CRM:** leads → notifications → whatsapp
4. **Advanced:** leases → maintenance → analytics
