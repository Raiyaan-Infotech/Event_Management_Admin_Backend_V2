const { DataTypes } = require('sequelize');

/** One downloadable file of an event (Downloads menu, 2026-11-10). See the migration for the columns. */
module.exports = (sequelize) => {
    const EventDownload = sequelize.define('EventDownload', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        title: { type: DataTypes.STRING(150), allowNull: false },
        category_key: { type: DataTypes.STRING(30), allowNull: false },
        file_url: { type: DataTypes.STRING(500), allowNull: false },
        file_name: { type: DataTypes.STRING(255), allowNull: false },
        file_type: { type: DataTypes.STRING(10), allowNull: false },
        file_size: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        description: { type: DataTypes.STRING(500), allowNull: true },
        visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'all' },
        download_access: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'all' },
        expires_at: { type: DataTypes.DATEONLY, allowNull: true },
        show_in_app: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        download_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'event_downloads',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    EventDownload.associate = (models) => {
        EventDownload.belongsTo(models.Event, { foreignKey: 'event_id', as: 'event' });
    };

    return EventDownload;
};
