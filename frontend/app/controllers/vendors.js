import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../utils/delete-modal';

export default class VendorsController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit'];

  @tracked showModal = false;
  @tracked editVendor = null;
  @tracked showDeleteModal = false;
  @tracked vendorToDelete = null;
  @tracked isDeleting = false;

  columns = [
    { name: 'Name', valuePath: 'name', width: 220, isFixed: 'left' },
    { name: 'Specialty', valuePath: 'specialties', width: 220 },
    { name: 'Phone', valuePath: 'phone', width: 170 },
    { name: 'Email', valuePath: 'email', width: 240 },
    { name: 'Company', valuePath: 'companyName', width: 200 },
    { name: 'Rate/hr', valuePath: 'hourlyRate', width: 140, numeric: true },
    { name: 'Rating', valuePath: 'rating', width: 120, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isSortable: false,
      isResizable: false,
    },
  ];

  @action openCreate() {
    this.editVendor = null;
    this.showModal = true;
  }

  @action openEdit(vendor) {
    this.editVendor = vendor;
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editVendor = null;
  }

  @action refresh() {
    this.router.refresh('vendors');
  }

  @action openDelete(vendor) {
    openDeleteModal(this, 'vendorToDelete', vendor);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'vendorToDelete');
  }

  @action async confirmDelete() {
    await confirmDeleteModal(this, {
      itemKey: 'vendorToDelete',
      resourcePath: '/vendors',
      successMessage: 'Vendor deleted',
      refreshRoute: 'vendors',
    });
  }
}
