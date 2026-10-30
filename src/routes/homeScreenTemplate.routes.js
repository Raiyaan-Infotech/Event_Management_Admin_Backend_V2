const express = require('express');
const router = express.Router();
const controller = require('../controllers/homeScreenTemplate.controller');
const { isAuthenticated, hasPermission } = require('../middleware/auth');
const { extractCompanyContext } = require('../middleware/company');
const { checkApprovalRequired } = require('../middleware/approval');

// Admin → Template → Home Screen Templates (mobile app home screen designs).
router.use(isAuthenticated);
router.use(extractCompanyContext);

// Filters: ?search= &event_category_id= &template_category_id= &status=active|inactive &page= &limit=

// Before `/:id`, or Express reads "stats" as an id.
router.get('/stats', hasPermission('home_screen_templates.view'), controller.getStats);

router.get('/', hasPermission('home_screen_templates.view'), controller.getAll);
router.get('/:id', hasPermission('home_screen_templates.view'), controller.getById);

router.post('/',
    hasPermission('home_screen_templates.create'),
    checkApprovalRequired('home_screen_templates', 'create', 'home_screen_template'),
    controller.create
);
router.put('/:id',
    hasPermission('home_screen_templates.edit'),
    checkApprovalRequired('home_screen_templates', 'update', 'home_screen_template'),
    controller.update
);
router.patch('/:id/status', hasPermission('home_screen_templates.edit'), controller.updateStatus);
router.delete('/:id',
    hasPermission('home_screen_templates.delete'),
    checkApprovalRequired('home_screen_templates', 'delete', 'home_screen_template'),
    controller.deleteById
);

module.exports = router;
