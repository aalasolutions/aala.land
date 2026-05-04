import { helper } from '@ember/component/helper';

export default helper(function hasValue([value]) {
  return value !== null && value !== undefined && value !== '';
});
