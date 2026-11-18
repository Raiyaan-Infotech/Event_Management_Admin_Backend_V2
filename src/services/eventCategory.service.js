const { EventCategory } = require('../models');
const crud = require('./crud.service');

/** Event category master (admin). Common CRUD — see crud.service.js. */
module.exports = crud.build({
    Model: EventCategory,
    modelName: 'EventCategory',
    moduleSlug: 'event_categories',
    writable: ['name', 'description', 'icon', 'color', 'sort_order', 'is_active'],
    searchFields: ['name', 'description'],
    sortableFields: ['sort_order', 'name', 'created_at'],
    defaultSort: { sort_by: 'sort_order', sort_order: 'ASC' },
    notFound: 'Event category not found',
    name: {
        required: 'Category name is required',
        duplicate: (n) => `An event category named "${n}" already exists.`,
    },
});
