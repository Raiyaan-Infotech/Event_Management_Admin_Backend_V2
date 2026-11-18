const controller = require('../controllers/planType.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({
    controller,
    permission: 'plan_types',
    approval: { module: 'plan_types', resource: 'plan_type' },
});
