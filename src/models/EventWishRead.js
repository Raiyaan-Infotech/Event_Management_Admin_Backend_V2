const { DataTypes } = require('sequelize');

/**
 * When the organizer last opened a Wed Wishes conversation (2026-11-09, the chat design's
 * Unread count). One row per event + reader + thread; `thread_key` = `c:<participant client id>`,
 * or `org` for the organizer's own posts.
 */
module.exports = (sequelize) => sequelize.define('EventWishRead', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    reader_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    thread_key: { type: DataTypes.STRING(24), allowNull: false },
    last_read_at: { type: DataTypes.DATE, allowNull: true },
    /** Hide Chat (2026-11-09): out of the organizer's main inbox, back from the Hidden tab. */
    is_hidden: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    hide_note: { type: DataTypes.STRING(250), allowNull: true },
    hidden_at: { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'event_wish_reads',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
