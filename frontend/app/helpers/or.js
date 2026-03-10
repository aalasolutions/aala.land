import { helper } from '@ember/component/helper';

export default helper(function or([...values]) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return '';
});
