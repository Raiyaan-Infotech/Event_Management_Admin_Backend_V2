const { DataTypes } = require('sequelize');

/**
 * ── EVENT-BASED SINCE 2026-10-28 (Jamal) ─────────────────────────────────
 * A guest now belongs to ONE event (`event_id`) and is invited to it
 * (`invited_at`). Their status (added / invited / pending / confirmed /
 * declined) is worked out on read from `invited_at` and that event's
 * participants — see clientGuest.service GUEST_STATUS. The notes below are the
 * §581 phone-book history.
 *
 * A guest in the client's PHONE BOOK (§581).
 *
 * The client adds the people they know, organised in groups, and SHARES an
 * event's invitation with them. Sharing writes nothing: a guest is never
 * attached to an event by being invited. Only scanning the QR does that, and
 * it creates a PARTICIPANT (`event_participants`), linked back here by `guest_id`
 * when the scanner's mobile matches.
 *
 * So there are no RSVP, party-size or table columns on this row — those are
 * answers about ONE event and live on the participant.
 *
 * Limited by the plan's `max_guests_per_event`, which counts the phone book in
 * total (§569), not per event.
 */
module.exports = (sequelize) => {
    const Guest = sequelize.define('Guest', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        company_id: { type: DataTypes.INTEGER, allowNull: true },
        group_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        /** The event this guest belongs to (2026-10-28). NULL = older, not on an event yet. */
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

        title: { type: DataTypes.STRING(30), allowNull: true },
        first_name: { type: DataTypes.STRING(100), allowNull: true },
        last_name: { type: DataTypes.STRING(100), allowNull: true },
        // Composed from first + last on every write, so it never drifts.
        name: { type: DataTypes.STRING(200), allowNull: false },
        date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
        gender: { type: DataTypes.ENUM('male', 'female', 'other'), allowNull: true },

        email: { type: DataTypes.STRING(255), allowNull: true },
        dial_code: { type: DataTypes.STRING(8), allowNull: true, defaultValue: '+91' },
        // The key a guest is known by (§576) — invitations are shared to it.
        mobile: { type: DataTypes.STRING(20), allowNull: true },
        whatsapp: { type: DataTypes.STRING(20), allowNull: true },
        company: { type: DataTypes.STRING(200), allowNull: true },

        relationship: { type: DataTypes.STRING(60), allowNull: true },
        relationship_option_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

        address_line1: { type: DataTypes.STRING(255), allowNull: true },
        address_line2: { type: DataTypes.STRING(255), allowNull: true },
        city: { type: DataTypes.STRING(120), allowNull: true },
        state: { type: DataTypes.STRING(120), allowNull: true },
        postal_code: { type: DataTypes.STRING(20), allowNull: true },
        country: { type: DataTypes.STRING(100), allowNull: true, defaultValue: 'India' },

        dietary_preference: { type: DataTypes.STRING(255), allowNull: true },
        food_preference_option_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        special_requirements: { type: DataTypes.STRING(500), allowNull: true },
        notes: { type: DataTypes.STRING(500), allowNull: true },
        photo: { type: DataTypes.STRING(500), allowNull: true },

        // ── Guests web design (2026-11-04) ──
        /** Guest Type on the Add Guest form: individual | couple | family | group. */
        guest_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'individual' },
        /** Family Side. */
        side: { type: DataTypes.ENUM('groom', 'bride'), allowNull: true },
        /** Number of Guests / Invite Count — people this invitation covers. */
        invite_count: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
        rsvp_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        /** false = Hide from App: kept for the organizer, left out of participant-facing lists. */
        is_visible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        hidden_reason: { type: DataTypes.STRING(60), allowNull: true },
        hidden_note: { type: DataTypes.STRING(500), allowNull: true },
        is_vip: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        vip_category: { type: DataTypes.STRING(60), allowNull: true },
        vip_label: { type: DataTypes.STRING(60), allowNull: true },
        /** Where the VIP badge shows: organizer_list, app_directory, invitation_contacts. */
        vip_highlight: { type: DataTypes.JSON, allowNull: true },
        /** The channels and message the last Send Invitation used. */
        invite_channels: { type: DataTypes.JSON, allowNull: true },
        invite_message: { type: DataTypes.STRING(1000), allowNull: true },
        // ── RSVP board (2026-11-04) — see clientRsvpBoard.service ──
        /** The organizer's answer for a guest who has NOT joined (a joined guest's is on event_participants). */
        rsvp_response: { type: DataTypes.ENUM('yes', 'no', 'maybe'), allowNull: true },
        rsvp_attending: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
        rsvp_meal: { type: DataTypes.STRING(255), allowNull: true },
        rsvp_note: { type: DataTypes.STRING(500), allowNull: true },
        rsvp_decline_reason: { type: DataTypes.STRING(60), allowNull: true },
        rsvp_responded_at: { type: DataTypes.DATE, allowNull: true },
        /** Hide Response: out of the main RSVP list, every record kept. */
        rsvp_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        rsvp_hidden_reason: { type: DataTypes.STRING(60), allowNull: true },

        /** How the guest got into the phone book. */
        source: {
            type: DataTypes.ENUM('manual', 'import'),
            allowNull: false,
            defaultValue: 'manual',
        },
        /** UTC; when the invitation was sent to this guest. NULL = not invited yet. */
        invited_at: { type: DataTypes.DATE, allowNull: true },
        /** The event_participants row this was moved from by the §581 split. Audit only. */
        migrated_from_guest_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'guests',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });

    return Guest;
};
