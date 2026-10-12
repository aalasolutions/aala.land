import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { sameOriginPath } from '../utils/same-origin-path';

export default class CheckoutController extends Controller {
  @service paddle;
  @service router;

  // `_ptxn` is the transaction id Paddle appends to its payment link.
  queryParams = ['success', 'cancel', { transactionId: '_ptxn' }];

  @tracked success = null;
  @tracked cancel = null;
  @tracked transactionId = null;
  @tracked errorMsg = '';
  isCompleted = false;

  async start() {
    this.errorMsg = '';
    this.isCompleted = false;
    if (!this.transactionId) {
      this.errorMsg = 'This checkout link is missing its transaction.';
      return;
    }
    try {
      const opensItself = await this.paddle.setup(this.handleEvent);
      if (!opensItself) this.paddle.open(this.transactionId);
    } catch (e) {
      this.errorMsg = e.message;
    }
  }

  stop() {
    this.paddle.teardown();
  }

  @action handleEvent(event) {
    if (event?.name === 'checkout.completed') {
      this.isCompleted = true;
      this.leave(this.success, 'billing.success');
    } else if (event?.name === 'checkout.closed' && !this.isCompleted) {
      this.leave(this.cancel, 'billing.cancel');
    }
  }

  leave(url, fallbackRoute) {
    const path = sameOriginPath(url) ?? this.router.urlFor(fallbackRoute);
    this.router.replaceWith(path);
  }
}
