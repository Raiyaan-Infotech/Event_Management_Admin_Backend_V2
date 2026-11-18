const express = require('express');
const { isAuthenticated, hasPermission } = require('../middleware/auth');
const { extractCompanyContext } = require('../middleware/company');
const { checkApprovalRequired } = require('../middleware/approval');

/**
 * Common admin CRUD router (V2 clean-up step 4, 2026-11-19).
 *
 *   module.exports = crudRouter.build({
 *       controller,
 *       permission: 'notification_categories',                 // → .view / .create / .edit / .delete
 *       approval: { module: 'notification_categories', resource: 'notification_category' },  // or false
 *       status: true,                                           // PATCH /:id/status (never goes to approval)
 *       routes: (router, can) => { router.get('/stats', can('view'), controller.stats); },  // before /:id
 *   });
 *
 * Order is always: admin login → company context → module routes → GET / → GET /:id → POST →
 * PUT /:id → PATCH /:id/status → DELETE /:id. Create / update / delete go through approval when
 * `approval` is set (admin@admin.com's writes become requests; developer / super admin pass).
 */
const build = ({ controller, permission, approval = false, status = true, routes }) => {
    const router = express.Router();
    const can = (action) => hasPermission(`${permission}.${action}`);
    const approve = (action) => (approval ? [checkApprovalRequired(approval.module, action, approval.resource)] : []);

    router.use(isAuthenticated);
    router.use(extractCompanyContext);

    if (routes) routes(router, can);

    router.get('/', can('view'), controller.getAll);
    router.get('/:id', can('view'), controller.getById);
    router.post('/', can('create'), ...approve('create'), controller.create);
    router.put('/:id', can('edit'), ...approve('update'), controller.update);
    if (status) router.patch('/:id/status', can('edit'), controller.updateStatus);
    router.delete('/:id', can('delete'), ...approve('delete'), controller.deleteById);

    return router;
};

module.exports = { build };
