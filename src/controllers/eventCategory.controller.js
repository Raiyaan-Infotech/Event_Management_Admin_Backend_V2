const service = require('../services/eventCategory.service');
const crudController = require('./crud.controller');

module.exports = crudController.build({ service, resourceKey: 'eventCategory', title: 'Event category' });
