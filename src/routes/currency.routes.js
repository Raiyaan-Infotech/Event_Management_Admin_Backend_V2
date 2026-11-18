const controller = require('../controllers/currency.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({
    controller,
    permission: 'currencies',
    approval: { module: 'currencies', resource: 'currency' },
    approvalActions: { update: 'edit' },
    status: false,
    publicRoutes: (router) => router.get('/active', controller.getActive),
    routes: (router, can) => router.patch('/:id/default', can('edit'), controller.setDefault),
});
