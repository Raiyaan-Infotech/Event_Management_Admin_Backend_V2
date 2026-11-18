const { TemplateCategory, FrameStyle } = require('../models');
const slugCategory = require('./slugCategory.service');

/** Admin style master. Shared behaviour: slugCategory.service.js (on the common CRUD kit). */
module.exports = slugCategory.build({
    Model: TemplateCategory,
    modelName: 'TemplateCategory',
    moduleSlug: 'template_categories',
    Child: FrameStyle,
    childKey: 'template_category_id',
    countKey: 'frame_styles_count',
    orphanKey: 'orphaned_frame_styles',
    allowPending: false,
});
