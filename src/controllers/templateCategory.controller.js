const service = require('../services/templateCategory.service');
const slugCategoryController = require('./slugCategory.controller');

module.exports = slugCategoryController.build({
    service,
    orphanKey: 'orphaned_frame_styles',
    orphanWords: ['frame style became uncategorised.', 'frame styles became uncategorised.'],
});
