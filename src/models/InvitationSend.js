const { DataTypes } = require('sequelize');

/**
 * One invitation sent to one guest (Invitations flow step 3, 2026-11-18).
 * See migrations/sql/20261118-invitation-sends.sql. Written and read by
 * clientInvitationSend.service.
 *
 * `status`: 'recorded' (saved; no provider connected yet) | 'scheduled' |
 * 'sent' | 'delivered' | 'failed'.
 */
module.exports = (sequelize) => {
    const InvitationSend = sequelize.define('InvitationSend', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        guest_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        batch_key: { type: DataTypes.STRING(40), allowNull: false },
        channel: { type: DataTypes.STRING(20), allowNull: false },
        subject: { type: DataTypes.STRING(255), allowNull: true },
        message: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'recorded' },
        scheduled_at: { type: DataTypes.DATE, allowNull: true },
        sent_at: { type: DataTypes.DATE, allowNull: true },
        delivered_at: { type: DataTypes.DATE, allowNull: true },
        opened_at: { type: DataTypes.DATE, allowNull: true },
        failed_reason: { type: DataTypes.STRING(255), allowNull: true },
    }, {
        tableName: 'invitation_sends',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });

    // No associations: the service reads the guests of a page in one query by id.
    return InvitationSend;
};
