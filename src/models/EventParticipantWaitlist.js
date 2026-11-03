const { DataTypes } = require('sequelize');

/**
 * Someone waiting to join an event because the host's guest limit is full
 * (Jamal, 2026-11-03). See services/participantWaitlist.service.js.
 * One row per person per event; deleted once they are let in.
 */
module.exports = (sequelize) => {
    const EventParticipantWaitlist = sequelize.define('EventParticipantWaitlist', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        // The HOST — the event's owner.
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        // The waiting person.
        participant_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        // Their join form, replayed when they are let in.
        payload: { type: DataTypes.JSON, allowNull: true },
    }, {
        tableName: 'event_participant_waitlist',
        timestamps: true,
        underscored: true,
    });
    return EventParticipantWaitlist;
};
