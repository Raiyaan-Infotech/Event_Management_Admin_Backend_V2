const { DataTypes } = require('sequelize');

/**
 * Home Screen Categories — the style a mobile app home screen template belongs to
 * (Classic, Royal, Minimal…). Admin → Template → Home Screen Categories.
 *
 * Its OWN master table, separate from `template_categories` (the invitation
 * design families), so the two lists can grow apart (Jamal, 2026-10-31).
 * Drives the "Template Style" dropdown on the Home Screen Template form and the
 * style chips in the Client Portal's Create Event picker.
 */
module.exports = (sequelize) => {
    const HomeScreenCategory = sequelize.define('HomeScreenCategory', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING(150), allowNull: false },
        slug: { type: DataTypes.STRING(150), allowNull: false },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // 1 active, 0 inactive, 2 pending approval (approval middleware).
        is_active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
        company_id: { type: DataTypes.INTEGER, allowNull: true },
        created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'home_screen_categories',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });

    return HomeScreenCategory;
};
