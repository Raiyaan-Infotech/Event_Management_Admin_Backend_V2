const controller = require('../controllers/templateCategory.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({
    controller,
    permission: 'template_categories',
    approval: { module: 'template_categories', resource: 'template_category' },
    routes: (router, can) => router.patch('/reorder', can('edit'), controller.reorder),
});
