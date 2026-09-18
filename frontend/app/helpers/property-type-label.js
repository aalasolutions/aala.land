import { helper } from '@ember/component/helper';
import { PROPERTY_TYPE_OPTIONS } from 'land/constants';

// Same words the listing-type dropdown uses, so a tag never disagrees with the form.
export function propertyTypeLabel(value) {
  const match = PROPERTY_TYPE_OPTIONS.find(
    (option) => option.value === (value ?? ''),
  );
  if (match) return match.label;
  return String(value)
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default helper(([value]) => propertyTypeLabel(value));
