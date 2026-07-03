import { helper } from '@ember/component/helper';

export default helper(function formatBytes([bytes]) {
  const n = Number(bytes ?? 0);
  if (n >= 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (n >= 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (n >= 1024) {
    return `${Math.round(n / 1024)} KB`;
  }
  return `${n} B`;
});
