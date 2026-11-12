const { DataTypes } = require('sequelize');

/** Daily event limit rule set by the super admin (2026-11-12). See the migration for the columns. */
module.exports = (sequelize) => {
    const AvailabilityConfig = sequelize.define('AvailabilityConfig', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING(120), allowNull: false },
        event_category_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        applies_to: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'all' },
        config_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'daily_limit' },
        start_date: { type: DataTypes.DATEONLY, allowNull: false },
        end_date: { type: DataTypes.DATEONLY, allowNull: false },
        daily_max: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        allow_single_date: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        allow_multi_date: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        auto_full: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        block_weekends: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        exclude_holidays: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        holidays: { type: DataTypes.JSON, allowNull: true },
        notes: { type: DataTypes.STRING(500), allowNull: true },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        publish_status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'draft' },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'availability_configs',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });


    return AvailabilityConfig;
};
