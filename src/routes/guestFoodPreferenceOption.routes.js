const controller = require('../controllers/guestFoodPreferenceOption.controller');
const crudRouter = require('./crud.router');

/** Admin CRUD of one option list; the list takes `?event_category_id=` (a number, or `null`). */
module.exports = crudRouter.build({
    controller,
    permission: 'guest_food_preference_options',
    approval: { module: 'guest_food_preference_options', resource: 'guest_food_preference_option' },
});
