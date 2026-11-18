const controller = require('../controllers/eventCategory.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({
    controller,
    permission: 'event_categories',
    approval: { module: 'event_categories', resource: 'event_category' },
});
