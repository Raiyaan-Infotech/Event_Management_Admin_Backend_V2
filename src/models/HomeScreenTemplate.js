const { DataTypes } = require('sequelize');

/**
 * Home Screen Templates — the mobile app's event home screen design, per event
 * category (admin portal → Template → Home Screen Templates, 2026-10-30).
 *
 * The uploaded image is the design; `colors` are the palette the app paints
 * the rest of the home screen with (countdown, menu tiles, background):
 *   [{ key: 'primary', label: 'Primary', hex: '#F76AA5' }, ...]
 * `color_count` (2–5) entries, keys in the fixed order of COLOR_ROLES in the
 * service. `template_category_id` is the "Template Style" (Royal, Floral...),
 * the same design families the invitation templates use.
 */
module.exports = (sequelize) => {
    const HomeScreenTemplate = sequelize.define('HomeScreenTemplate', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING(150), allowNull: false },
        description: { type: DataTypes.STRING(300), allowNull: true },
        event_category_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        template_category_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        image_url: { type: DataTypes.STRING(500), allowNull: true },
        image_name: { type: DataTypes.STRING(255), allowNull: true },
        image_size: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        color_count: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 4 },
        colors: { type: DataTypes.JSON, allowNull: true },
        notes: { type: DataTypes.STRING(200), allowNull: true },
        // 1 active, 0 inactive, 2 pending approval (approval middleware).
        is_active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        company_id: { type: DataTypes.INTEGER, allowNull: true },
        created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'home_screen_templates',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });

    return HomeScreenTemplate;
};
