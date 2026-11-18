const controller = require('../controllers/homeScreenCategory.controller');
const crudRouter = require('./crud.router');

module.exports = crudRouter.build({
    controller,
    permission: 'home_screen_categories',
    approval: { module: 'home_screen_categories', resource: 'home_screen_category' },
    routes: (router, can) => router.patch('/reorder', can('edit'), controller.reorder),
});
