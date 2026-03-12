import { helper } from '@ember/component/helper';

export default helper(function objectAt([array, index]) {
  if (!Array.isArray(array) || index === undefined) return undefined;
  return array[index];
});
