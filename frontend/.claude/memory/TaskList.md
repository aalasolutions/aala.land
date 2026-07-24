# Frontend TaskList

## Active
- [ ] **ENUM RECONCILIATION (cross-repo, BLOCKING Aamir's status changes).** FE constants.js diverges from 12 backend Postgres enums. Plan: ../backend/docs/ENUM_RECONCILIATION_PLAN.md. Pending owner decision A/B/C (recommended B). 8 data-rewrite mappings needed. Refactor leads convert (leads.service.ts:318) + funnel (reports.service.ts:378,496) to category-based BEFORE touching LeadStatus.
- [ ] **Commit F1-F4 dedup work** (uncommitted; independent of enum work).
- [ ] **F1 Group C:** profile 4 fields + admin-expiry -> Ui::FormInput (needs form layout fix + accepts label normalization).
- [ ] **format-property-type helper** (T3.20 — fixes live 2-way vs 3-way drift).
- [ ] **Batch 2:** Ui::Badge (unified), Ui::FormError, Ui::StatTile, Ui::WaLink + tests.
- [ ] **Batch 3:** Ui::PageHeader, Ui::EmptyState, Ui::ModalFooter + tests.
- [ ] **Batch 4:** Lead::LeadCard, Ui::IconButton, Unit::AmenityPicker, Unit::SpecRow, Ui::SidebarGroup+SidebarLink, Ui::Tabs, Ui::FilterBar, Ui::AuthCard, Billing::ResultPage.
- [ ] **Batch 5:** Ui::DataTable + single-pagination (highest risk; pilot on contacts.hbs first).
- [ ] Verify after each batch: pnpm lint:hbs && pnpm lint:js && pnpm build && pnpm test, plus browser smoke.

## Done
- [x] Dedup audit across all 24 templates (5 parallel agents). Registry: .claude/memory/dedup-registry.md.
- [x] Executable extraction plan: docs/DEDUPLICATION_PLAN.md.
- [x] **F2** audit formatDate -> format-date-time helper (added withSeconds opt). Files: helpers/format-date-time.js, audit.hbs, audit.js.
- [x] **F3** 9 raw dates -> format-date (leases, cheques x2, financials x2, commissions, maintenance x2). +4 beyond registry.
- [x] **F4** audit hand-rolled svg chevron -> Ui::Ph (kept CSS rotation, per Aamir).
- [x] **F1 Groups A+B** 17 raw inputs -> Ui::FormInput (accept-invite x2, cheques x2, properties detail x7, unit x6). Events + data-test selectors preserved. Group C + file/textarea gaps skipped.

## Defects the plan fixes (not just style)
- leads.hbs:607 form-error missing font-sm. property-type label drift 2-way vs 3-way. audit.js hand-rolled formatDate (FIXED). audit.hbs Tailwind badge leak. Raw ISO dates on list views (FIXED via F3). Pagination rendered twice per page (cheques/financials/team/contacts/vendors). ~21 raw inputs bypassing Ui::FormInput (F1 partial fix).
