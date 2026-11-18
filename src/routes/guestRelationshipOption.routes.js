const controller = require('../controllers/guestRelationshipOption.controller');
const crudRouter = require('./crud.router');

/** Admin CRUD of one option list; the list takes `?event_category_id=` (a number, or `null`). */
module.exports = crudRouter.build({
    controller,
    permission: 'guest_relationship_options',
    approval: { module: 'guest_relationship_options', resource: 'guest_relationship_option' },
});
