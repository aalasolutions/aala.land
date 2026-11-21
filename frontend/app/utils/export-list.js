import { saveResponseAsFile } from './download';

const EXPORT_WAIT_NOTICE_MS = 1000;
// Mirrors EXPORT_LIMITS.cap in the backend export services; change both together.
export const EXPORT_CAP = 20000;

// One export flow for every list page: wait notice, download, cap notice, plain error.
export async function downloadExport(
  { dataTransfer, notifications },
  { entity, params, format, noun },
) {
  const notice = setTimeout(
    () => notifications.info('Preparing your file'),
    EXPORT_WAIT_NOTICE_MS,
  );
  try {
    const response = await dataTransfer.exportList(entity, params, format);
    clearTimeout(notice);
    await saveResponseAsFile(response, `${entity}.${format}`);
    if (response.headers.get('X-Export-Truncated') === 'true') {
      notifications.info(
        `Only the first ${EXPORT_CAP.toLocaleString()} ${noun} were exported. Narrow the filters to export the rest.`,
      );
    }
  } catch (error) {
    clearTimeout(notice);
    notifications.error(error.message);
  }
}
