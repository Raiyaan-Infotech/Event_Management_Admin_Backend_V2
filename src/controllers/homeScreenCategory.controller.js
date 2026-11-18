const service = require('../services/homeScreenCategory.service');
const slugCategoryController = require('./slugCategory.controller');

module.exports = slugCategoryController.build({
    service,
    orphanKey: 'orphaned_templates',
    orphanWords: ['home screen template now have no style.', 'home screen templates now have no style.'],
});
