import { helper } from '@ember/component/helper';
import { contactPhone } from '../utils/contact-display';

export default helper(([contact]) => contactPhone(contact));
