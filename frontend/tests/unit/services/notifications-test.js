import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';

module('Unit | Service | notifications', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    const service = this.owner.lookup('service:notifications');
    assert.ok(service);
  });

  test('starts with no toasts', function (assert) {
    const service = this.owner.lookup('service:notifications');
    assert.strictEqual(service.toasts.length, 0);
  });

  test('add() creates a toast with correct type', function (assert) {
    const service = this.owner.lookup('service:notifications');
    service.add('Test message', 'success', 0);

    assert.strictEqual(service.toasts.length, 1);
    assert.strictEqual(service.toasts[0].message, 'Test message');
    assert.strictEqual(service.toasts[0].type, 'success');
  });

  test('success() creates a success toast', function (assert) {
    const service = this.owner.lookup('service:notifications');
    service.success('Done!', 0);

    assert.strictEqual(service.toasts[0].type, 'success');
  });

  test('error() creates an error toast', function (assert) {
    const service = this.owner.lookup('service:notifications');
    service.error('Failed!', 0);

    assert.strictEqual(service.toasts[0].type, 'error');
  });

  test('warning() creates a warning toast', function (assert) {
    const service = this.owner.lookup('service:notifications');
    service.warning('Watch out!', 0);

    assert.strictEqual(service.toasts[0].type, 'warning');
  });

  test('remove() deletes a specific toast by id', function (assert) {
    const service = this.owner.lookup('service:notifications');
    service.add('First', 'info', 0);
    const id = service.add('Second', 'success', 0);
    service.add('Third', 'error', 0);

    service.remove(id);

    assert.strictEqual(service.toasts.length, 2);
    assert.notOk(service.toasts.find((t) => t.id === id));
  });

  test('clear() removes all toasts', function (assert) {
    const service = this.owner.lookup('service:notifications');
    service.add('One', 'info', 0);
    service.add('Two', 'info', 0);
    service.add('Three', 'info', 0);

    service.clear();

    assert.strictEqual(service.toasts.length, 0);
  });

  test('add() assigns unique ids', function (assert) {
    const service = this.owner.lookup('service:notifications');
    const id1 = service.add('First', 'info', 0);
    const id2 = service.add('Second', 'info', 0);

    assert.notEqual(id1, id2);
  });
});
