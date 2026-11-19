import { helper } from '@ember/component/helper';
import { tagLabel } from 'land/utils/tag-label';

const STAGE_CHANGE = /from ([A-Z_]+) to ([A-Z_]+)/;

export function activityNotes(type, notes) {
  if (type !== 'STATUS_CHANGE' || typeof notes !== 'string') return notes;
  return notes.replace(
    STAGE_CHANGE,
    (_, previous, next) =>
      `from ${tagLabel('lead', previous)} to ${tagLabel('lead', next)}`,
  );
}

export default helper(([type, notes]) => activityNotes(type, notes));
