import { helper } from '@ember/component/helper';
import { initialsOf } from 'land/utils/initials';

export default helper(function initials([name]) {
  return initialsOf(name);
});
