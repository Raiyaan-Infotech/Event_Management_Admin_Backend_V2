const { ColorPalette } = require('../models');
const crud = require('./crud.service');

/** Colour palettes (admin). Common CRUD — see crud.service.js. */
module.exports = crud.build({
    Model: ColorPalette,
    modelName: 'ColorPalette',
    writable: ['name', 'primary_bg_color', 'primary_text_color', 'secondary_text_color', 'paragraph_color', 'is_active'],
    searchFields: ['name'],
    sortableFields: ['name', 'created_at'],
    name: {
        required: 'Palette name is required',
        duplicate: (n) => `A colour palette named "${n}" already exists.`,
    },
});
