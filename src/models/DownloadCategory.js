const { DataTypes } = require('sequelize');

/** A category chip of "Add Download" (2026-11-10) — Invitation, Travel, Stay, Agenda, Info, Other. */
module.exports = (sequelize) => sequelize.define('DownloadCategory', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    category_key: { type: DataTypes.STRING(30), allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    color: { type: DataTypes.STRING(20), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
    tableName: 'download_categories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
