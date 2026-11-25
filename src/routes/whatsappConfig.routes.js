const express = require('express');
const controller = require('../controllers/whatsappConfig.controller');
const { isAuthenticated, hasPermission } = require('../middleware/auth');

const router = express.Router();

router.use(isAuthenticated);

router.get('/', hasPermission('settings.view'), controller.get);
router.post('/test', hasPermission('settings.edit'), controller.testConnection);
router.post('/verify-token', hasPermission('settings.edit'), controller.regenerateVerifyToken);
router.put('/:section', hasPermission('settings.edit'), controller.updateSection);

module.exports = router;
