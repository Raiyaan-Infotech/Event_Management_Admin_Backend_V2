/**
 * One question round of a Contact Person chat (2026-11-11): opened by the participant's
 * first message (or their first after Resolved / Removed), closed by Mark as Resolved.
 * See migrations/sql/20261111-contact-inquiries.sql and clientContactChat.service.
 */
module.exports = (sequelize, DataTypes) => sequelize.define(
    'EventContactInquiry',
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        chat_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        first_message: { type: DataTypes.STRING(255), allowNull: true },
        opened_at: { type: DataTypes.DATE, allowNull: false },
        resolved_at: { type: DataTypes.DATE, allowNull: true },
        resolution_type: { type: DataTypes.STRING(40), allowNull: true },
        /** Internal — never shown to the participant. */
        resolution_note: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'event_contact_inquiries', timestamps: true, underscored: true },
);
