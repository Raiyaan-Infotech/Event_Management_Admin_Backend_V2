const service = require('../services/colorPalette.service');
const crudController = require('./crud.controller');

module.exports = crudController.build({ service, resourceKey: 'palette', title: 'Color palette' });
