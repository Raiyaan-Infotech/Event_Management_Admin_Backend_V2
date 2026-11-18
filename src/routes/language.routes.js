const controller = require('../controllers/language.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({
    controller,
    permission: 'languages',
    approval: { module: 'languages', resource: 'language' },
    approvalActions: { update: 'edit' },
    status: false,
    publicRoutes: (router) => router.get('/active', controller.getActive),
    routes: (router, can) => router.patch('/:id/default', can('edit'), controller.setDefault),
});
