const { DataTypes } = require('sequelize');

/** One participant's opens of one live stream (2026-11-11): the Viewers numbers. */
module.exports = (sequelize) => {
    const EventLiveStreamView = sequelize.define('EventLiveStreamView', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        stream_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        views: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
        first_viewed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        last_viewed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    }, {
        tableName: 'event_live_stream_views',
        timestamps: false,
    });
    return EventLiveStreamView;
};
