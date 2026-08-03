import Component from '@glimmer/component';
import { service } from '@ember/service';

// Singleton host for the `dialogs` service, mounted once in application.hbs.
// Same shape as Nuvo::TooltipHost: the service holds the state, this renders it.
export default class NuDialogHostComponent extends Component {
  @service dialogs;
}
