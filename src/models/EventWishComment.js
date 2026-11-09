const { DataTypes } = require('sequelize');

/**
 * A comment under a Wed Wishes post (2026-11-09, the Wishes Monitor's Manage Comments).
 * Written by a participant (`author_client_id`) or by the organizer (NULL). The organizer
 * hides / shows / deletes any comment; `is_flagged` = the blocked-words filter caught it.
 */
module.exports = (sequelize) => {
    const EventWishComment = sequelize.define('EventWishComment', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        wish_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        author_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        guest_name: { type: DataTypes.STRING(150), allowNull: false },
        message: { type: DataTypes.STRING(500), allowNull: false },
        /** An attached image: the organizer's photo reply from the conversation (2026-11-09). */
        photo: { type: DataTypes.STRING(500), allowNull: true },
        size_bytes: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        is_hidden: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
        is_flagged: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'event_wish_comments',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    return EventWishComment;
};
