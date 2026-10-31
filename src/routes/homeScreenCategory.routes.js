const express = require('express');
const router = express.Router();
const controller = require('../controllers/homeScreenCategory.controller');
const { isAuthenticated, hasPermission } = require('../middleware/auth');
const { extractCompanyContext } = require('../middleware/company');
const { checkApprovalRequired } = require('../middleware/approval');

// Admin → Template → Home Screen Categories (style master for home screen templates).
router.use(isAuthenticated);
router.use(extractCompanyContext);

// Before `/:id`, or Express reads "reorder" as an id.
router.patch('/reorder', hasPermission('home_screen_categories.edit'), controller.reorder);

router.get('/', hasPermission('home_screen_categories.view'), controller.getAll);
router.get('/:id', hasPermission('home_screen_categories.view'), controller.getById);

router.post('/',
    hasPermission('home_screen_categories.create'),
    checkApprovalRequired('home_screen_categories', 'create', 'home_screen_category'),
    controller.create
);
router.put('/:id',
    hasPermission('home_screen_categories.edit'),
    checkApprovalRequired('home_screen_categories', 'update', 'home_screen_category'),
    controller.update
);
router.patch('/:id/status', hasPermission('home_screen_categories.edit'), controller.updateStatus);
router.delete('/:id',
    hasPermission('home_screen_categories.delete'),
    checkApprovalRequired('home_screen_categories', 'delete', 'home_screen_category'),
    controller.deleteById
);

module.exports = router;
