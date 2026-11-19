import { helper } from '@ember/component/helper';
import { tagLabel } from 'land/utils/tag-label';

export default helper(([domain, value]) => tagLabel(domain, value));
