export function openDeleteModal(controller, itemKey, item) {
  controller[itemKey] = item;
  controller.showDeleteModal = true;
}

export function closeDeleteModal(controller, itemKey) {
  controller.showDeleteModal = false;
  controller[itemKey] = null;
}

// `body` given: POST {resourcePath}/{id}/delete with it. Otherwise DELETE.
export async function confirmDeleteModal(
  controller,
  {
    itemKey,
    resourcePath,
    successMessage,
    refreshRoute,
    errorMessage = 'Delete failed',
    body,
  },
) {
  const item = controller[itemKey];

  if (!item || controller.isDeleting) {
    return;
  }

  controller.isDeleting = true;

  const request = body
    ? {
        path: `${resourcePath}/${item.id}/delete`,
        options: { method: 'POST', body: JSON.stringify(body) },
      }
    : { path: `${resourcePath}/${item.id}`, options: { method: 'DELETE' } };

  try {
    await controller.auth.fetchJson(request.path, request.options);
    controller.notifications.success(successMessage);
    closeDeleteModal(controller, itemKey);
    controller.router.refresh(refreshRoute);
  } catch (e) {
    controller.notifications.error(e.message || errorMessage);
  } finally {
    controller.isDeleting = false;
  }
}
