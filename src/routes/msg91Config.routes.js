const express = require('express');
const controller = require('../controllers/msg91Config.controller');
const { isAuthenticated, hasPermission } = require('../middleware/auth');

const router = express.Router();

router.use(isAuthenticated);

router.get('/', hasPermission('settings.view'), controller.get);
router.post('/test', hasPermission('settings.edit'), controller.testConnection);
router.post('/test-send', hasPermission('settings.edit'), controller.testSend);
router.post('/webhook-token', hasPermission('settings.edit'), controller.regenerateWebhookToken);
router.put('/:section', hasPermission('settings.edit'), controller.updateSection);

module.exports = router;
