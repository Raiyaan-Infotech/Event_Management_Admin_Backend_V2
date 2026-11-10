const { DataTypes } = require('sequelize');

/** One saved Near By place of an event (2026-11-10). See the migration for the columns. */
module.exports = (sequelize) => {
    const EventNearbyPlace = sequelize.define('EventNearbyPlace', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        google_place_id: { type: DataTypes.STRING(255), allowNull: true },
        name: { type: DataTypes.STRING(150), allowNull: false },
        description: { type: DataTypes.STRING(200), allowNull: true },
        category_key: { type: DataTypes.STRING(30), allowNull: false },
        address: { type: DataTypes.STRING(300), allowNull: true },
        lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
        lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
        distance_km: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
        rating: { type: DataTypes.DECIMAL(2, 1), allowNull: true },
        rating_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        map_url: { type: DataTypes.STRING(500), allowNull: true },
        photo_url: { type: DataTypes.STRING(500), allowNull: true },
        show_in_app: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'event_nearby_places',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    EventNearbyPlace.associate = (models) => {
        EventNearbyPlace.belongsTo(models.Event, { foreignKey: 'event_id', as: 'event' });
    };

    return EventNearbyPlace;
};
