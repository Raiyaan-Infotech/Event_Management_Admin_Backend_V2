const { DataTypes } = require('sequelize');

/** A category tile of "Add Nearby Place" (2026-11-10) — Hotel, Restaurant, Hospital… */
module.exports = (sequelize) => sequelize.define('NearbyCategory', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    category_key: { type: DataTypes.STRING(30), allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    icon: { type: DataTypes.STRING(100), allowNull: false },
    color: { type: DataTypes.STRING(20), allowNull: true },
    google_types: { type: DataTypes.STRING(255), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
    tableName: 'nearby_categories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
