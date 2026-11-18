const controller = require('../controllers/colorPalette.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({ controller, permission: 'color_palettes', status: false });
