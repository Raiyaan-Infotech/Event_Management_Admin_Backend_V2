const { PlanType } = require('../models');
const crud = require('./crud.service');

/** Plan types (admin -> Subscription -> Plan Types). Common CRUD — see crud.service.js. */
module.exports = crud.build({
    Model: PlanType,
    modelName: 'PlanType',
    moduleSlug: 'plan_types',
    writable: ['name', 'description', 'menu_ids', 'price', 'discounted_price', 'validity', 'features', 'sort_order', 'is_active', 'is_custom', 'label_color'],
    searchFields: ['name'],
    sortableFields: ['created_at', 'name', 'price'],
    name: {
        required: 'Plan type name is required',
        duplicate: (n) => `A plan type named "${n}" already exists.`,
    },
});
