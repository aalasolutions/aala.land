import { helper } from '@ember/component/helper';

export default helper(function gte([a, b]) {
  return a >= b;
});
