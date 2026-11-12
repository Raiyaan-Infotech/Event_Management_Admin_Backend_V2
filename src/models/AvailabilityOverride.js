const { DataTypes } = require('sequelize');

/** A per-date change to an availability config (2026-11-12). See the migration for the columns. */
module.exports = (sequelize) => {
    const AvailabilityOverride = sequelize.define('AvailabilityOverride', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        config_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        start_date: { type: DataTypes.DATEONLY, allowNull: false },
        end_date: { type: DataTypes.DATEONLY, allowNull: false },
        mode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'limit' },
        daily_limit: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        reason: { type: DataTypes.STRING(250), allowNull: true },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'availability_overrides',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });


    return AvailabilityOverride;
};
