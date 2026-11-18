const service = require('../services/planType.service');
const crudController = require('./crud.controller');

module.exports = crudController.build({ service, resourceKey: 'planType', title: 'Plan type' });
