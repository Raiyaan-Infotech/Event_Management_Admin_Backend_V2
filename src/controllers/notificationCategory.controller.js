const service = require('../services/notificationCategory.service');
const crudController = require('./crud.controller');

module.exports = crudController.build({ service, resourceKey: 'notificationCategory', title: 'Notification category' });
