const { DataTypes } = require('sequelize');

/**
 * One download of one event file by one participant (File Downloads list, 2026-11-16).
 * See migrations/sql/20261116-event-download-logs.sql. Written by clientDownload.hit.
 */
module.exports = (sequelize) => {
    const EventDownloadLog = sequelize.define('EventDownloadLog', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        download_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        participant_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        participant_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        /** 'mobile' | 'tablet' | 'desktop' */
        device: { type: DataTypes.STRING(20), allowNull: true },
        platform: { type: DataTypes.STRING(40), allowNull: true },
        /** 'completed' | 'failed' */
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'completed' },
        failed_reason: { type: DataTypes.STRING(200), allowNull: true },
        /** 'app' (a real download) | 'sample' (seeder) */
        source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'app' },
        downloaded_at: { type: DataTypes.DATE, allowNull: false },
    }, {
        tableName: 'event_download_logs',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    EventDownloadLog.associate = (models) => {
        EventDownloadLog.belongsTo(models.EventDownload, { foreignKey: 'download_id', as: 'file' });
        EventDownloadLog.belongsTo(models.EventParticipant, { foreignKey: 'participant_id', as: 'participant' });
    };

    return EventDownloadLog;
};
