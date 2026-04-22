export function openDeleteModal(controller, itemKey, item) {
  controller[itemKey] = item;
  controller.showDeleteModal = true;
}

export function closeDeleteModal(controller, itemKey) {
  controller.showDeleteModal = false;
  controller[itemKey] = null;
}

export async function confirmDeleteModal(controller, {
  itemKey,
  resourcePath,
  successMessage,
  refreshRoute,
  errorMessage = 'Delete failed',
}) {
  const item = controller[itemKey];

  if (!item || controller.isDeleting) {
    return;
  }

  controller.isDeleting = true;

  try {
    await controller.auth.fetchJson(`${resourcePath}/${item.id}`, { method: 'DELETE' });
    controller.notifications.success(successMessage);
    closeDeleteModal(controller, itemKey);
    controller.router.refresh(refreshRoute);
  } catch (e) {
    controller.notifications.error(e.message || errorMessage);
  } finally {
    controller.isDeleting = false;
  }
}
