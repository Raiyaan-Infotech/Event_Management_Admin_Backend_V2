const { NotificationCategory } = require('../models');
const crud = require('./crud.service');

/** Notification category master (admin). Common CRUD — see crud.service.js. */
module.exports = crud.build({
    Model: NotificationCategory,
    modelName: 'NotificationCategory',
    moduleSlug: 'notification_categories',
    writable: ['name', 'description', 'icon', 'color', 'sort_order', 'is_active'],
    searchFields: ['name', 'description'],
    sortableFields: ['sort_order', 'name', 'created_at'],
    defaultSort: { sort_by: 'sort_order', sort_order: 'ASC' },
    notFound: 'Notification category not found',
    name: {
        required: 'Category name is required',
        duplicate: (n) => `A notification category named "${n}" already exists.`,
    },
});
