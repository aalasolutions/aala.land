import Route from '@ember/routing/route';

/**
 * Passthrough layout for the companies section: its template is a bare outlet
 * so the list (index) and the full-page detail each own the whole screen. The
 * super_admin gate is inherited from the parent admin route.
 */
export default class AdminCompaniesRoute extends Route {}
