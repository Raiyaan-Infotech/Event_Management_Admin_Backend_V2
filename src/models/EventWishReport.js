const { DataTypes } = require('sequelize');

/**
 * A participant reporting a Wed Wishes post (2026-11-09, the Wishes Monitor's Reported tab).
 * One row per person per wish; the organizer dismisses them (or hides / deletes the wish).
 */
module.exports = (sequelize) => {
    const EventWishReport = sequelize.define('EventWishReport', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        wish_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        reporter_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        /** inappropriate | spam | harassment | other */
        reason: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'other' },
        note: { type: DataTypes.STRING(300), allowNull: true },
    }, {
        tableName: 'event_wish_reports',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
    });

    return EventWishReport;
};
