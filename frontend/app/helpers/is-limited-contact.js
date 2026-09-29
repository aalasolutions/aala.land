import { helper } from '@ember/component/helper';
import { isLimited } from '../utils/contact-display';

export default helper(([contact]) => isLimited(contact));
