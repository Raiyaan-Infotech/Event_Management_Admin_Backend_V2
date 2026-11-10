const { DataTypes } = require('sequelize');

/**
 * A platform offered by "Add Social Link" (2026-11-10) — Instagram, WhatsApp, Others…
 * `platform_key` is what an event_social_links row stores; `is_custom` (Others) saves the link
 * without a key. `icon` is an Iconify id drawn in `color`.
 */
module.exports = (sequelize) => sequelize.define('SocialPlatform', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    platform_key: { type: DataTypes.STRING(30), allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    icon: { type: DataTypes.STRING(100), allowNull: false },
    color: { type: DataTypes.STRING(20), allowNull: true },
    url_placeholder: { type: DataTypes.STRING(200), allowNull: true },
    is_custom: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
    tableName: 'social_platforms',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
