import { helper } from '@ember/component/helper';
import { contactName } from '../utils/contact-display';

export default helper(([contact]) => contactName(contact));
