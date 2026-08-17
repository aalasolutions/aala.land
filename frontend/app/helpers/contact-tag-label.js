import { helper } from '@ember/component/helper';

export const CONTACT_TAG_LABELS = {
  lead: 'Lead',
  owner: 'Owner',
  tenant: 'Tenant',
  vendor: 'Portfolio Owner',
};

export function contactTagLabel(tag) {
  if (!tag) return '';
  return (
    CONTACT_TAG_LABELS[tag] ??
    tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
  );
}

export default helper(([tag]) => contactTagLabel(tag));
