# Template Dedup Registry

Synthesized 2026-07-08 from 5 parallel cluster audits (properties, people, finance, system, shell). All line refs verified against files on disk. Source: branch `FE-Rearrange`.

Legend: breadth = distinct files. instances = total occurrences. Priority rule: HIGH = 5+ files or 10+ instances.

---

## TIER 1: Generic `ui/` primitives (extract first, biggest breadth)

### 1. Badge (status / type / role / temp / plan) - HIGH

The `class="X-badge X-{{lowercase value}}"` pattern. Unify all flavors.

- status-badge: ~21 instances / 12 files (maintenance 4, documents 2, email-templates 2, reports 2, leads 4, team, properties, owners, company, cheques, commissions, financials).
- type-badge: ~15 instances / 12 files.
- role-badge: team.hbs:66. temp-badge: leads 4x. plan-badge: admin/companies, company.
- Live defects it fixes: audit.hbs:66-69 leaks Tailwind `bg-green-100` classes instead of the CSS-var convention; audit.js getActionBadgeClass is hand-rolled.
- Proposed: `<Ui::Badge @variant="status|type|role|temp|plan" @value={{x.status}} @label={{optional}} />`. Internal map: value to lowercase + CSS class. Optional `@capitalize`.

### 2. PageHeader - HIGH

Two flavors today: `flex between x-center` with `<h2><Ui::Ph/> Title</h2><p>subtitle</p>` + actions; and `div.page-header` with `h1.page-title` + `p.page-subtitle`.

- finance 4 files, people 4 files, system 4 files (maintenance/documents/email-templates/audit), shell 3 files (company/profile/admin). ~10+ files app-wide.
- Proposed: `<Ui::PageHeader @icon @title @subtitle @count as |actions|>{{yield actions}}{{/Ui::PageHeader>`. Normalize h1/h2, optional count badge, yielded actions slot for the primary button.

### 3. EmptyState - HIGH

Three spellings today: glass-panel+p-8 centered icon; `p text-muted text-center py-8`; `div.empty-state`. Plus two-tier "no results on page" vs "nothing yet" branching.

- properties 9 instances (incl 3 rich variants in detail.hbs:198-339), finance 4 files, people, system 9 files, shell (company big CTA variant, dashboard, profile).
- Proposed: `<Ui::EmptyState @icon @title @hint @size="48|64" as |action|>{{yield}}{{/Ui::EmptyState>`. Two-tier handled via `@total` + `@pageEmptyTitle`/`@zeroTitle`.

### 4. ModalFooter / FormActions - HIGH

`<div class="flex gap-3 mt-2"> Cancel + primary submit (loading) </div>`. `loadingText="Saving..."` literal duplicated app-wide.

- finance 4 files (12 app-wide), people 5 instances, properties 6 (inconsistent: some AppButton, most raw `<button>`), system 3 files (13 app-wide for the footer shell), shell.
- Proposed: bake into `Ui::Modal` via `@onCancel @submitText @isSubmitting @loadingText="Saving..."`, AND expose standalone `<Ui::ModalFooter .../>` for non-modal forms. Standardize on Ui::AppButton internally (kills raw-button inconsistency).

### 5. StatTile / KPI - HIGH

`<div class="glass-panel p-4|p-5"><p class="text-muted ... uppercase">LABEL</p><h4 class="font-xl font-bold">VALUE</h4></div>`.

- dashboard 7 KPI tiles, financials 3, maintenance 4, reports 6 + variants. ~10+ instances once all summary pages counted.
- Proposed: `<Ui::StatTile @icon @label @value @tone="success|warning|danger" @format="currency|number|date" />`.

### 6. DataTable + single-pagination - HIGH (highest effort)

`<div class="data-table-wrapper[--with-pagination]"><table class="data-table">...`. 14 files. Plus the real defect: pagination block rendered TWICE per page (cheques 151+164, financials 147+162, team 159+172, contacts 83+98, vendors 82+97).

- Proposed: `<Ui::DataTable @columns={{array ...}} @rows @page @limit @total @onLimitChange @onPrevious @onNext as |T|><T.head/>...<T.body>{{#each}}<T.row>{{yield cell}}{{/T.row>{{/each}}</T.body></Ui::DataTable>`. Renders pagination ONCE. Empty state folded in.
- Risk: highest. Yielded-cell API needs care. Candidate to defer or do last.

### 7. FormError - MED/HIGH (very wide, trivial)

`{{#if this.errorMsg}}<p class="font-sm text-danger">{{this.errorMsg}}</p>{{/if}}`. 17 files app-wide.

- Live defect: leads.hbs:607 missing `font-sm` (inconsistent).
- Proposed: `<Ui::FormError @message={{this.errorMsg}} />`.

---

## TIER 2: Domain / entity components

### 8. Lead::LeadCard - HIGH (biggest single-file win)

leads.hbs has 3 near-complete copies of the lead card (111-180, 220-282, 327-381), ~210 duplicated lines. Collapses WaLink + badges + empty-column with it.

- Proposed: `<Lead::LeadCard @lead @showStatus @showTemp @showEmail @showAssign @onEdit @onAssign @onOpen />`.

### 9. Ui::WaLink - HIGH (6 copies, will recur)

`<a href={{wa-link phone}} ... class="wa-link" data-test-wa-link {{on "click" this.stopPropagation}}>` x6 in leads (14px and 16px). Cross-entity.

- Proposed: `<Ui::WaLink @phone @size="14px" @stopPropagation={{true}} />`.

### 10. Unit::AmenityPicker - MED

Amenities chip `{{#each}}` picker, 3 instances (properties/index filter 193-209, detail 524-542, unit 421-440). Sibling of existing Unit::AmenitiesPrint.

### 11. Unit::SpecRow - MED

beds/baths/sqft/floor inline spec row, 3 instances (properties/index 258-268, detail 145-171, unit 159-180).

### 12. Ui::AuthCard - MED

login/signup/accept-invite shell + footer link, 3 files, ~95% overlap.

### 13. Ui::SidebarGroup + Ui::SidebarLink - MED (app shell)

application.hbs sidebar: 5 collapsible groups (~200 lines near-duplicate) killing 5 copies of the `(or (eq expandedGroup) (eq activeGroup)) 'expanded'` conditional; 5 leaf links.

- Proposed: `<Ui::SidebarGroup @key @icon @label @expandedGroups @activeGroup @onToggle>...{{yield sublinks}}`.

### 14. Ui::Tabs - MED

Segmented control. cheques/financials/maintenance/company (3-4 files). Kills `{{if (eq activeTab 'x') 'active'}}` x N.

### 15. Ui::FilterBar - MED

Filter dropdown row + Clear button. audit/maintenance/documents/email-templates (4 files).

### 16. Ui::IconButton / Ui::RowActions - MED

Small `btn btn-secondary btn-xs` + Phosphor icon; Edit/Delete clusters. documents, maintenance, email-templates, contacts, vendors, team.

### 17. Billing::ResultPage - LOW (clean)

billing/success + billing/cancel, 2 files, ~95% overlap. `<Billing::ResultPage @icon @color @title @message />`.

### 18. Ui::ViewToggle / ToggleGroup - LOW

cards/list/browse toggles. properties (2 files), leads filters. Declarative options array.

### 19. Ui::Breadcrumb - LOW

properties detail/unit only.

---

## TIER 3: Helpers (no component needed)

### 20. format-property-type - HIGH (kills live drift)

The `{{if (eq x "FOR_SALE") "For Sale" ...}}` ternary drifts: index.hbs:276 returns "Sale"/"Rent" (2-way) while detail.hbs + unit.hbs return "For Sale"/"For Rent"/"Not Listed" (3-way). Live bug surface.

- Proposed: `app/helpers/format-property-type.js`, sibling of format-role. Pair with optional `<Ui::TypeBadge>`.

---

## FLAGS: in-place fixes (use existing component/helper, no new extraction)

### F1. Raw `<input class="form-input">` bypassing `<Ui::FormInput>` - HIGHEST LEVERAGE, zero new code

- Gaps: file input (documents) and checkbox (email-templates) are NOT covered by FormInput. Decide: extend FormInput family (Ui::FormFile, Ui::FormCheckbox) or accept one-offs.





## Proposed extraction order (bang-for-buck, risk-weighted)

Batch 1 (lowest risk, highest leverage, mostly reuse-existing):

- F1 raw inputs to Ui::FormInput (zero new components)
- F2/F3/F4 date + svg fixes
- T3.20 format-property-type helper

Batch 2 (new ui/ primitives, mechanical):

- 1 Badge, 7 FormError, 5 StatTile, 9 WaLink

Batch 3 (layout primitives):

- 2 PageHeader, 3 EmptyState, 4 ModalFooter

Batch 4 (domain):

- 8 LeadCard, 10 AmenityPicker, 11 SpecRow, 13 SidebarGroup, 14 Tabs, 15 FilterBar, 16 IconButton, 12 AuthCard, 17 BillingResultPage

Batch 5 (highest risk, do last or defer):

- 6 DataTable + single-pagination
