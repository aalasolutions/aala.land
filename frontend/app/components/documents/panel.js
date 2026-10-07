import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { guidFor } from '@ember/object/internals';
import { isDestroying, isDestroyed } from '@ember/destroyable';
import { modifier } from 'ember-modifier';
import { validPage } from 'land/utils/page-number';
import { ROLES, isAdminRole } from 'land/utils/roles';
import { contactName } from 'land/utils/contact-display';
import { closeDeleteModal, openDeleteModal } from 'land/utils/delete-modal';
import {
  ACCESS_LEVELS,
  CATEGORIES,
  RELATED_TYPES,
  optionLabelFor,
} from 'land/constants';

const DEFAULT_PAGE_SIZE = 20;

// Upload and PATCH carry a link as exactly one of these fields.
const LINK_FIELDS = {
  unit: 'unitId',
  asset: 'assetId',
  contact: 'contactId',
  lease: 'leaseId',
  work_order: 'workOrderId',
};

const DERIVED_LABELS = { lease: 'via lease', work_order: 'via work order' };

// Mirrors the server's write routes: upload and edit MANAGER+ and AGENT (below admin, own uploads only), delete ADMIN+.
const EDIT_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.AGENT,
];

const COLUMNS = [
  { name: 'Name', valuePath: 'name', width: 250, isFixed: 'left' },
  { name: 'Category', valuePath: 'category', width: 140 },
  { name: 'Access', valuePath: 'accessLevel', width: 120 },
  { name: 'Property', valuePath: 'unit.assetName', width: 220 },
  { name: 'Related', valuePath: 'link.label', width: 260 },
  { name: 'Size', valuePath: 'fileSize', width: 120, numeric: true },
  { name: 'Uploaded By', valuePath: 'uploadedByName', width: 180 },
  { name: 'Uploaded', valuePath: 'createdAt', width: 140, numeric: true },
  {
    name: 'Actions',
    valuePath: 'id',
    width: 130,
    isFixed: 'right',
    isSortable: false,
    isResizable: false,
  },
];

function recordPicker(type, { label, ...transport }) {
  return {
    type,
    fieldLabel: optionLabelFor(RELATED_TYPES, type),
    mapItem: (item) => ({ ...item, label: label(item) }),
    ...transport,
  };
}

// "Property: X · Unit: Y", skipping empty parts.
const labelled = (...parts) =>
  parts
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');

// Units, assets and work orders have no server search, so their pickers preload one page.
const RECORD_PICKERS = {
  unit: recordPicker('unit', {
    listUrl: '/properties/units?page=1&limit=500',
    placeholder: 'Search unit...',
    label: (unit) =>
      labelled(['Property', unit.assetName], ['Unit', unit.unitNumber]),
  }),
  asset: recordPicker('asset', {
    listUrl: '/properties/assets?page=1&limit=500',
    placeholder: 'Search property...',
    label: (asset) => asset.name ?? '',
  }),
  contact: recordPicker('contact', {
    searchUrl: '/contacts',
    searchParam: 'search',
    placeholder: 'Search name, phone or email...',
    label: (contact) => contactName(contact),
  }),
  lease: recordPicker('lease', {
    searchUrl: '/leases',
    searchParam: 'search',
    placeholder: 'Search tenant, unit or registration ref...',
    label: (lease) =>
      labelled(
        ['Tenant', lease.contact ? contactName(lease.contact) : 'No tenant'],
        ['Property', lease.unit?.asset?.name],
        ['Unit', lease.unit?.unitNumber],
      ),
  }),
  work_order: recordPicker('work_order', {
    listUrl: '/maintenance?page=1&limit=500',
    placeholder: 'Search work order...',
    label: (order) =>
      [
        order.title,
        labelled(['Property', order.assetName], ['Unit', order.unitNumber]),
      ]
        .filter(Boolean)
        .join(' · '),
  }),
};

function relatedRoute(doc) {
  const link = doc.link;
  if (!link) return null;
  switch (link.type) {
    case 'unit':
      return doc.unit?.areaId
        ? { name: 'properties.unit', models: [doc.unit.areaId, link.id] }
        : null;
    case 'contact':
      return { name: 'contacts.detail', models: [link.id] };
    case 'lease':
      return { name: 'leases.detail', models: [link.id] };
    case 'work_order':
      return { name: 'maintenance.detail', models: [link.id] };
    default:
      return null;
  }
}

export default class DocumentsPanelComponent extends Component {
  @service auth;
  @service notifications;

  @tracked documents = [];
  @tracked total = 0;
  @tracked internalPage = 1;
  @tracked isLoading = true;
  @tracked errorMessage = '';

  @tracked showDrawer = false;
  @tracked editDocument = null;
  @tracked formName = '';
  @tracked formCategory = 'OTHER';
  @tracked formAccessLevel = 'TEAM';
  @tracked formRelatedType = 'none';
  @tracked formRecord = null;
  @tracked selectedFile = null;
  @tracked uploadProgress = null;
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @tracked showDeleteModal = false;
  @tracked documentToDelete = null;
  @tracked isDeleting = false;

  categoryOptions = CATEGORIES.filter((c) => c.value !== '');
  relatedTypeOptions = RELATED_TYPES.filter((t) => t.value !== '');

  // Two panels can share a page, so form and field ids must not collide.
  fieldPrefix = guidFor(this);
  formId = `${this.fieldPrefix}-form`;

  requestId = 0;
  loadedFilters = null;
  loadedPage = null;
  loadedPageSize = null;

  constructor(owner, args) {
    super(owner, args);
    // DataTable reads its columns once, so the compact choice is fixed at creation.
    const hidden = new Set();
    if (args.compact) hidden.add('link.label');
    // A unit-scoped panel repeats the same property on every row.
    if (args.filters?.unitId) hidden.add('unit.assetName');
    this.columns = COLUMNS.filter((column) => !hidden.has(column.valuePath));
  }

  get tableId() {
    return this.args.tableId ?? 'documents-panel';
  }

  get role() {
    return this.auth.currentUser?.role;
  }

  get canUpload() {
    return (this.args.canUpload ?? true) && this.role !== ROLES.ACCOUNTANT;
  }

  get canEdit() {
    return (this.args.canEdit ?? true) && EDIT_ROLES.includes(this.role);
  }

  canEditRow = (doc) =>
    this.canEdit &&
    (isAdminRole(this.role) || doc?.uploadedBy === this.currentUserId);

  get canDelete() {
    return isAdminRole(this.role);
  }

  get pageSize() {
    return Number(this.args.pageSize) || DEFAULT_PAGE_SIZE;
  }

  get isPageControlled() {
    return typeof this.args.onPageChange === 'function';
  }

  get page() {
    return this.isPageControlled
      ? Number(this.args.page) || 1
      : this.internalPage;
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get showPagination() {
    return (
      this.total > 0 &&
      (this.total > this.pageSize || Boolean(this.args.onPageSizeChange))
    );
  }

  get filterParams() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(this.args.filters ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      if (value === false) continue;
      params.set(key, String(value));
    }
    return params;
  }

  get filtersKey() {
    return this.filterParams.toString();
  }

  get listUrl() {
    const params = new URLSearchParams({
      page: String(this.page),
      limit: String(this.pageSize),
    });
    for (const [key, value] of this.filterParams) {
      params.set(key, value);
    }
    return `/documents?${params.toString()}`;
  }

  get currentUserId() {
    return this.auth.currentUser?.id;
  }

  get rows() {
    return this.documents.map((doc) => ({
      ...doc,
      isDerived: Boolean(doc.derivedFrom),
      derivedLabel: DERIVED_LABELS[doc.derivedFrom] ?? '',
      relatedTypeLabel: doc.link
        ? optionLabelFor(RELATED_TYPES, doc.link.type)
        : '',
      relatedLabel: doc.link?.label || '-',
      relatedRoute: relatedRoute(doc),
    }));
  }

  get showInitialLoading() {
    return this.isLoading && !this.documents.length && !this.errorMessage;
  }

  // An uploader keeps sight of their own admin-level files.
  get accessLevelOptions() {
    return ACCESS_LEVELS;
  }

  get presetTypeLabel() {
    const type = this.args.presetLink?.type;
    return type ? optionLabelFor(RELATED_TYPES, type) : '';
  }

  get recordPickers() {
    const picker = RECORD_PICKERS[this.formRelatedType];
    return picker ? [picker] : [];
  }

  get chosenLink() {
    const preset = this.args.presetLink;
    if (preset) return { type: preset.type, id: preset.id };
    if (this.formRelatedType === 'none' || !this.formRecord) return null;
    return { type: this.formRelatedType, id: this.formRecord.id };
  }

  get linkError() {
    if (this.args.presetLink || this.formRelatedType === 'none') return '';
    if (this.formRecord) return '';
    const label = optionLabelFor(RELATED_TYPES, this.formRelatedType);
    return `Choose a ${label.toLowerCase()} to link, or pick Library only.`;
  }

  // A relink clears the old field too; the server allows only one link per document.
  linkPatch(original) {
    if (this.args.presetLink) return {};
    const next = this.chosenLink;
    if (original?.type === next?.type && original?.id === next?.id) return {};
    const patch = {};
    if (original && LINK_FIELDS[original.type]) {
      patch[LINK_FIELDS[original.type]] = null;
    }
    if (next) patch[LINK_FIELDS[next.type]] = next.id;
    return patch;
  }

  reloadOn = modifier((element, [filtersKey, page, pageSize]) => {
    if (
      filtersKey === this.loadedFilters &&
      page === this.loadedPage &&
      pageSize === this.loadedPageSize
    ) {
      return;
    }
    const resetPage =
      this.loadedFilters !== null &&
      filtersKey !== this.loadedFilters &&
      !this.isPageControlled &&
      page !== 1;
    this.loadedFilters = filtersKey;
    this.loadedPage = resetPage ? 1 : page;
    this.loadedPageSize = pageSize;
    this.load(resetPage);
  });

  get isGone() {
    return isDestroying(this) || isDestroyed(this);
  }

  async load(resetPage = false) {
    const requestId = ++this.requestId;
    // Leave the render pass before touching tracked state.
    await Promise.resolve();
    if (requestId !== this.requestId || this.isGone) return;
    if (resetPage) this.internalPage = 1;

    this.isLoading = true;
    this.errorMessage = '';
    try {
      const json = await this.auth.fetchJson(this.listUrl);
      if (requestId !== this.requestId || this.isGone) return;
      this.documents = json?.data?.data ?? [];
      this.total = json?.data?.total ?? 0;
    } catch (e) {
      if (requestId !== this.requestId || this.isGone) return;
      this.documents = [];
      this.total = 0;
      this.errorMessage = e.message || 'Failed to load documents';
    } finally {
      if (requestId === this.requestId && !this.isGone) {
        this.isLoading = false;
      }
    }
  }

  @action goToPage(page) {
    const target = validPage(page, this.totalPages);
    if (target === null || target === this.page) return;
    if (this.isPageControlled) {
      this.args.onPageChange(target);
    } else {
      this.internalPage = target;
    }
  }

  fillForm(doc) {
    this.editDocument = doc;
    this.formName = doc?.name ?? '';
    this.formCategory = doc?.category ?? 'OTHER';
    this.formAccessLevel = doc?.accessLevel ?? 'TEAM';
    this.formRelatedType = doc?.link?.type ?? 'none';
    this.formRecord = doc?.link
      ? { id: doc.link.id, label: doc.link.label }
      : null;
    this.selectedFile = null;
    this.uploadProgress = null;
    this.errorMsg = '';
  }

  @action openUpload() {
    this.fillForm(null);
    this.showDrawer = true;
  }

  @action openEdit(doc) {
    this.fillForm(doc);
    this.showDrawer = true;
  }

  @action closeDrawer() {
    this.showDrawer = false;
  }

  @action resetDrawer() {
    this.editDocument = null;
    this.errorMsg = '';
    this.selectedFile = null;
    this.uploadProgress = null;
  }

  // Nuvo inputs and dropdowns report the value, not the DOM event.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action setRelatedType(value) {
    if (value === this.formRelatedType) return;
    this.formRelatedType = value;
    this.formRecord = null;
  }

  @action selectRecord(item) {
    this.formRecord = item ?? null;
  }

  @action clearRecord() {
    this.formRecord = null;
  }

  @action onFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    this.selectedFile = file;
    if (!this.formName) {
      this.formName = file.name;
    }
  }

  @action async saveDocument(event) {
    event.preventDefault();
    if (this.isSaving) return;
    if (this.linkError) {
      this.errorMsg = this.linkError;
      return;
    }
    this.isSaving = true;
    this.errorMsg = '';

    try {
      if (this.editDocument) {
        const body = {
          name: this.formName,
          category: this.formCategory,
          accessLevel: this.formAccessLevel,
          ...this.linkPatch(this.editDocument.link),
        };
        await this.auth.fetchJson(`/documents/${this.editDocument.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        this.notifications.success('Document updated');
      } else {
        if (!this.selectedFile) {
          throw new Error('Please select a file to upload');
        }
        this.uploadProgress = 0;

        const formData = new FormData();
        formData.append('file', this.selectedFile);
        formData.append('name', this.formName);
        formData.append('category', this.formCategory);
        formData.append('accessLevel', this.formAccessLevel);
        const link = this.chosenLink;
        if (link) formData.append(LINK_FIELDS[link.type], link.id);

        await this.auth.uploadWithProgress(
          '/documents/upload',
          formData,
          (percent) => (this.uploadProgress = percent),
        );
        this.notifications.success('Document uploaded');
      }

      this.closeDrawer();
      this.load();
    } catch (err) {
      if (err.message?.toLowerCase().includes('storage quota')) {
        this.errorMsg =
          'Storage quota exceeded. Add a seat or top up storage to upload more files.';
      } else {
        this.errorMsg = err.message || 'Save failed';
      }
    } finally {
      this.isSaving = false;
      this.uploadProgress = null;
    }
  }

  @action openDelete(doc) {
    openDeleteModal(this, 'documentToDelete', doc);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'documentToDelete');
  }

  @action async confirmDelete() {
    const doc = this.documentToDelete;
    if (!doc || this.isDeleting) return;
    this.isDeleting = true;
    try {
      await this.auth.fetchJson(`/documents/${doc.id}`, { method: 'DELETE' });
      this.notifications.success('Document deleted');
      closeDeleteModal(this, 'documentToDelete');
      this.load();
    } catch (e) {
      this.notifications.error(e.message || 'Delete failed');
    } finally {
      this.isDeleting = false;
    }
  }

  @action async downloadDocument(doc) {
    try {
      const res = await this.auth.authorizedFetch(
        `${this.auth.apiBase}/documents/${doc.id}/download`,
      );
      if (!res.ok) {
        throw new Error('Download failed');
      }

      // Blob download avoids exposing the storage URL; the endpoint re-checks access.
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = doc.name || 'document';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      this.notifications.error(err.message || 'Download failed');
    }
  }
}
