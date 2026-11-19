import Service, { service } from '@ember/service';

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// Reads the plain message the API sends; validation errors arrive as a list and are joined.
async function errorMessage(response) {
  const body = await response.json().catch(() => null);
  const message = body?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' && message ? message : GENERIC_ERROR;
}

export default class DataTransferService extends Service {
  @service auth;

  base(entity) {
    return `${this.auth.apiBase}/data-transfer/${entity}`;
  }

  async template(entity, format = 'csv') {
    const response = await this.auth.authorizedFetch(
      `${this.base(entity)}/template?format=${format}`,
    );
    if (!response.ok) throw new Error(await errorMessage(response));
    return response;
  }

  preview(entity, file, regionCode) {
    return this.upload(`${this.base(entity)}/preview`, file, regionCode);
  }

  commit(entity, file, regionCode) {
    return this.upload(`${this.base(entity)}/commit`, file, regionCode);
  }

  async failedFile(entity, rows, format = 'csv') {
    const response = await this.auth.authorizedFetch(
      `${this.base(entity)}/failed-file?format=${format}`,
      { method: 'POST', body: JSON.stringify({ rows }) },
    );
    if (!response.ok) throw new Error(await errorMessage(response));
    return response;
  }

  // The list's own filters ride along, so the file matches what the page shows.
  async exportList(entity, params, format = 'csv') {
    const search = new URLSearchParams(params);
    search.set('format', format);
    const response = await this.auth.authorizedFetch(
      `${this.auth.apiBase}/${entity}/export?${search.toString()}`,
    );
    if (!response.ok) throw new Error(await errorMessage(response));
    return response;
  }

  async upload(url, file, regionCode) {
    const form = new FormData();
    form.append('file', file, file.name);
    if (regionCode) form.append('regionCode', regionCode);
    const response = await this.auth.authorizedFetch(url, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const body = await response.json();
    return body?.data ?? body;
  }
}
