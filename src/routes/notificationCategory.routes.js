const controller = require('../controllers/notificationCategory.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({
    controller,
    permission: 'notification_categories',
    approval: { module: 'notification_categories', resource: 'notification_category' },
});
