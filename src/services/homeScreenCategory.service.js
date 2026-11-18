const { HomeScreenCategory, HomeScreenTemplate } = require('../models');
const slugCategory = require('./slugCategory.service');

/** Admin style master. Shared behaviour: slugCategory.service.js (on the common CRUD kit). */
module.exports = slugCategory.build({
    Model: HomeScreenCategory,
    modelName: 'HomeScreenCategory',
    moduleSlug: 'home_screen_categories',
    Child: HomeScreenTemplate,
    childKey: 'home_screen_category_id',
    countKey: 'templates_count',
    orphanKey: 'orphaned_templates',
    allowPending: true,
});
