import { helper } from '@ember/component/helper';
import { contactEmail } from '../utils/contact-display';

export default helper(([contact]) => contactEmail(contact));
