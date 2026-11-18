const controller = require('../controllers/eventResponsibility.controller');
const crudRouter = require('./crud.router');

/** Admin CRUD of one option list; the list takes `?event_category_id=` (a number, or `null`). */
module.exports = crudRouter.build({
    controller,
    permission: 'event_responsibilities',
    approval: { module: 'event_responsibilities', resource: 'event_responsibility' },
});
