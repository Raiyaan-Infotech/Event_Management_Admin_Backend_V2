const express = require('express');
const router = express.Router();
const multer = require('multer');
const vendorController = require('../controllers/vendor.controller');
const vendorClientController = require('../controllers/vendorClient.controller');
const vendorClientAuthController = require('../controllers/vendorClientAuth.controller');
const vendorSubscriptionController = require('../controllers/vendorSubscription.controller');
const mediaService = require('../services/media.service');
const ApiResponse = require('../utils/apiResponse');
const { isAuthenticated, hasPermission } = require('../middleware/auth');
const { extractCompanyContext } = require('../middleware/company');
const { isVendorAuthenticated } = require('../middleware/vendorAuth');
const { isClientAuthenticated } = require('../middleware/clientAuth');
const { checkApprovalRequired } = require('../middleware/approval');
const { asyncHandler } = require('../utils/helpers');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    },
});

// ─── Client Portal Auth (public) ──────────────────────────────────────────────
router.post('/client/auth/handoff',         vendorClientAuthController.clientHandoff);
router.post('/client/auth/forgot-password', vendorClientAuthController.clientForgotPassword);
router.post('/client/auth/reset-password',  vendorClientAuthController.clientResetPassword);

// ─── Client Portal Auth (protected — client JWT) ──────────────────────────────
router.post('/client/auth/logout',          isClientAuthenticated, vendorClientAuthController.clientLogout);
router.get('/client/auth/me',               isClientAuthenticated, vendorClientAuthController.clientMe);
router.put('/client/auth/profile',          isClientAuthenticated, vendorClientAuthController.updateClientProfile);
router.put('/client/auth/change-password',  isClientAuthenticated, vendorClientAuthController.changeClientPassword);
router.get('/client/subscription/plans',    isClientAuthenticated, vendorSubscriptionController.getClientPlans);
// ─── Vendor Portal Auth (public) ─────────────────────────────────────────────
router.post('/auth/login',           vendorController.login);
router.post('/auth/logout',          vendorController.logout);
router.post('/auth/forgot-password', vendorController.forgotPassword);
router.post('/auth/reset-password',  vendorController.resetPassword);
router.post('/auth/handoff',         vendorController.handoff);

// ─── Vendor Portal — protected (vendor JWT) ───────────────────────────────────
router.get('/auth/me',               isVendorAuthenticated, vendorController.me);
router.put('/auth/profile',          isVendorAuthenticated, vendorController.updateProfile);
router.post('/auth/change-password', isVendorAuthenticated, vendorController.changePassword);
router.post('/auth/handoff-token',   isVendorAuthenticated, vendorController.createHandoffToken);
router.get('/auth/activity',         isVendorAuthenticated, vendorController.getMyActivity);
router.get('/auth/about',            isVendorAuthenticated, vendorController.getAbout);
router.put('/auth/about',            isVendorAuthenticated, vendorController.updateAbout);

// ─── Vendor Media Upload (vendor JWT) ────────────────────────────────────────
router.post('/auth/upload', isVendorAuthenticated, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
        next();
    });
}, asyncHandler(async (req, res) => {
    if (!req.file) return ApiResponse.error(res, 'No file provided', 400);
    const result = await mediaService.upload(req.file, { folder: req.body.folder || 'vendors' }, req.vendor.company_id);
    return ApiResponse.success(res, { file: result }, 'File uploaded successfully');
}));

// ─── Vendor Clients (vendor JWT) ─────────────────────────────────────────────
router.get('/clients',              isVendorAuthenticated, vendorClientController.getAll);
router.get('/clients/:id',          isVendorAuthenticated, vendorClientController.getById);
router.post('/clients',             isVendorAuthenticated, vendorClientController.create);
router.put('/clients/:id',          isVendorAuthenticated, vendorClientController.update);
router.patch('/clients/:id/status', isVendorAuthenticated, vendorClientController.updateStatus);
router.delete('/clients/:id',       isVendorAuthenticated, vendorClientController.remove);

// ─── Vendor Subscription (vendor JWT) ───────────────────────────────────────
router.get('/subscription',                  isVendorAuthenticated, vendorSubscriptionController.getMyPlan);

// ─── Admin CRUD (admin JWT) ───────────────────────────────────────────────────
router.use(isAuthenticated);
router.use(extractCompanyContext);

router.get('/',               hasPermission('vendors.view'),   vendorController.getAll);
router.get('/:id',            hasPermission('vendors.view'),   vendorController.getById);
router.post('/',
    hasPermission('vendors.create'),
    checkApprovalRequired('vendors', 'create', 'vendors'),
    vendorController.create
);
router.put('/:id',
    hasPermission('vendors.edit'),
    checkApprovalRequired('vendors', 'update', 'vendors'),
    vendorController.update
);
router.patch('/:id/status',   hasPermission('vendors.edit'),   vendorController.updateStatus);
router.post('/:id/impersonate', hasPermission('vendors.impersonate'), vendorController.impersonate);
router.delete('/:id',
    hasPermission('vendors.delete'),
    checkApprovalRequired('vendors', 'delete', 'vendors'),
    vendorController.remove
);

module.exports = router;
