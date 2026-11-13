import { helper } from '@ember/component/helper';
import { tagVariant } from 'land/utils/tag-variant';

export default helper(([domain, value]) => tagVariant(domain, value));
