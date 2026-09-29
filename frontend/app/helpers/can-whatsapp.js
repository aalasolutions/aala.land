import { helper } from '@ember/component/helper';
import { canWhatsapp } from '../utils/contact-display';

export default helper(([contact]) => canWhatsapp(contact));
