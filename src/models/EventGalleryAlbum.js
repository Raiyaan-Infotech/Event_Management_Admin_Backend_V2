const { DataTypes } = require('sequelize');

/**
 * A gallery ALBUM — a slideshow built from the event's gallery photos (Gallery
 * web design "Create Album", 2026-11-04): cover, animated intro text, background
 * music, and the slides in order, each shown for its own number of seconds.
 *
 * `slides` = [{ item_id, seconds }] — ids of event_gallery_items (images). A
 * photo deleted from the gallery simply drops out of the album on read.
 */
module.exports = (sequelize) => {
    const EventGalleryAlbum = sequelize.define('EventGalleryAlbum', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

        name: { type: DataTypes.STRING(150), allowNull: false },
        description: { type: DataTypes.STRING(300), allowNull: true },
        cover_image: { type: DataTypes.STRING(500), allowNull: true },

        /** Animated intro text before the first slide. */
        intro_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        intro_text: { type: DataTypes.STRING(120), allowNull: true },
        /** fade_slide_up | fade | zoom | typewriter */
        intro_animation: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'fade_slide_up' },
        intro_seconds: { type: DataTypes.DECIMAL(4, 1), allowNull: false, defaultValue: 5 },
        /** { font, color, size, align, position, bold, italic, shadow } — NULL = defaults (2026-11-05). */
        intro_style: { type: DataTypes.JSON, allowNull: true },

        /** Background song for the whole slideshow. */
        music_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        music_url: { type: DataTypes.STRING(500), allowNull: true },
        music_name: { type: DataTypes.STRING(200), allowNull: true },

        /** The default seconds per slide (each slide may override it). */
        slide_seconds: { type: DataTypes.DECIMAL(4, 1), allowNull: false, defaultValue: 5 },
        slides: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },

        show_in_app: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    }, {
        tableName: 'event_gallery_albums',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    EventGalleryAlbum.associate = (models) => {
        EventGalleryAlbum.belongsTo(models.Event, { foreignKey: 'event_id', as: 'event' });
    };

    return EventGalleryAlbum;
};
