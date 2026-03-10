# AALA.LAND

Property Management SaaS for the Middle East market.

## Project Structure

```
aala.land/
├── landing/           # Next.js landing page
├── backend/           # NestJS backend (to be created)
├── .agent/workflows/  # Agent command workflows
└── .claude/memory/    # Multi-agent context
```

## Quick Start

### Landing Page
```bash
cd landing && npm install && npm run dev
```

### Backend (after setup)
```bash
cd backend && pnpm install && pnpm run start:dev
```

## Agent Workflows

Use slash commands for common tasks:
- `/backend-setup` - Initialize NestJS backend
- `/create-module` - Create new NestJS module
- `/verify` - Run verification checks

## Tech Stack
- **Backend:** NestJS + TypeScript
- **Frontend:** Ember.js 6.4 + Capacitor
- **Database:** PostgreSQL + Redis
- **Landing:** Next.js

## Documentation
See implementation plan in project artifacts.


/ralph-loop:ralph-loop "Create complete backend, one task at a time reading backend-module file and TaskList.md file and when a task is done, do a complete testing of it, if failed redo it, fix it. task complets mark it done and loop to next"