import Controller from '@ember/controller';

export default class AdminMarketersController extends Controller {
  columns = [
    { name: 'Code', valuePath: 'code', width: 240, isFixed: 'left' },
    { name: 'Companies', valuePath: 'companies', width: 130, numeric: true },
    { name: 'Paying', valuePath: 'paying', width: 120, numeric: true },
    {
      name: 'MRR',
      valuePath: 'mrr',
      width: 160,
      isSortable: false,
      numeric: true,
    },
    {
      name: 'Last signup',
      valuePath: 'lastSignupAt',
      width: 140,
      numeric: true,
    },
  ];

  get rows() {
    return (this.model.rows ?? []).map((row) => {
      const key = row.marketerCode ?? '__none__';
      return {
        ...row,
        id: key,
        code: row.marketerCode ?? '(none)',
        key,
        companies: row.companies,
        isCollapsed: true,
        children: (row.companyIds ?? []).map((id) => ({
          id: `${key}:${id}`,
          companyId: id,
          code: this.model.companyNames[id] ?? id,
        })),
      };
    });
  }
}
