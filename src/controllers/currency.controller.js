const service = require('../services/currency.service');
const codedMasterController = require('./codedMaster.controller');

module.exports = codedMasterController.build({ service, resourceKey: 'currency', listKey: 'currencies', title: 'Currency' });
