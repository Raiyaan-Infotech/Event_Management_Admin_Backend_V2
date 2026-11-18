const service = require('../services/language.service');
const codedMasterController = require('./codedMaster.controller');

module.exports = codedMasterController.build({ service, resourceKey: 'language', listKey: 'languages', title: 'Language' });
