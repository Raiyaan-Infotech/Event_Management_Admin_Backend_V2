const crudController = require('./crud.controller');

/** Shared controller of the option lists — the common CRUD controller, answering "Option ...". */
const build = ({ service, resourceKey }) => crudController.build({ service, resourceKey, title: 'Option' });

module.exports = { build };
