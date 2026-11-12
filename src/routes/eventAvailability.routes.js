/**
 * Event Availability — super admin only (2026-11-12). Mounted at /api/v1/event-availability.
 * The client portal's calendar is GET /api/v1/client/availability (clientPortal.routes.js).
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/eventAvailability.controller');
const { isAuthenticated, hasPermission } = require('../middleware/auth');
const { extractCompanyContext } = require('../middleware/company');

router.use(isAuthenticated);
router.use(extractCompanyContext);

const view = hasPermission('event_availability.view');
const edit = hasPermission('event_availability.edit');

// Daily list (Daily Event Booking Availability) + its action menu
router.get('/daily', view, c.daily);
router.get('/daily/:configId/:date', view, c.dayDetails);
router.post('/daily/:configId/:date/action', edit, c.dayAction);

// Special limit overrides
router.get('/overrides', view, c.listOverrides);
router.post('/overrides/bulk', edit, c.bulkOverrides);
router.get('/overrides/:id', view, c.getOverride);
router.post('/overrides', edit, c.createOverride);
router.put('/overrides/:id', edit, c.updateOverride);
router.patch('/overrides/:id/status', edit, c.setOverrideStatus);
router.delete('/overrides/:id', edit, c.deleteOverride);

// Configs
router.get('/configs', view, c.listConfigs);
router.get('/configs/:id', view, c.getConfig);
router.post('/configs', edit, c.createConfig);
router.put('/configs/:id', edit, c.updateConfig);
router.patch('/configs/:id/status', edit, c.setConfigStatus);
router.delete('/configs/:id', edit, c.deleteConfig);

module.exports = router;
