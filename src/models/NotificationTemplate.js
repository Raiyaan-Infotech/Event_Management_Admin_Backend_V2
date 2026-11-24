const { DataTypes } = require('sequelize');

/**
 * Admin-authored transactional message template — e.g. "RSVP Confirmation",
 * "Event Reminder". Distinct from `EventMessageCampaign` (one AD-HOC compose
 * sent to an audience): a template is a reusable blueprint, scoped by
 * notification category / event category, meant to be picked up
 * later by system-triggered sends (RSVP confirm, reminders) rather than
 * composed by hand each time.
 */
module.exports = (sequelize) => {
    const NotificationTemplate = sequelize.define('NotificationTemplate', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        /**
         * Explicit link to the system event that fires this template — set from
         * a fixed dropdown (see notificationTemplate.service.js's SYSTEM_TRIGGERS),
         * never derived from `name`. `name` is free-text and can be renamed at
         * will without breaking notificationTrigger.service.js's lookup. Unique:
         * only one template may own a given trigger at a time.
         */
        trigger_key: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        notification_category_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        event_category_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        /** Short admin note on when the template is used. */
        description: {
            type: DataTypes.STRING(250),
            allowNull: true,
        },
        /** organizer | guest | participant | contact_person (who receives it). */
        audience: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        /** In-app title + message. Required only when channels include in_app. */
        title: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        /** In-app deep link (screen or URL) opened on tap. */
        action_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        // ── Email channel ──────────────────────────────────────────────
        email_subject: { type: DataTypes.STRING(200), allowNull: true },
        email_preheader: { type: DataTypes.STRING(200), allowNull: true },
        email_heading: { type: DataTypes.STRING(200), allowNull: true },
        /** HTML body with {{var}} placeholders. */
        email_body: { type: DataTypes.TEXT('medium'), allowNull: true },
        email_button_label: { type: DataTypes.STRING(60), allowNull: true },
        email_button_url: { type: DataTypes.STRING(500), allowNull: true },
        email_footer: { type: DataTypes.STRING(500), allowNull: true },
        // ── WhatsApp channel (Meta-approved template, sent via MSG91) ─
        whatsapp_template_name: { type: DataTypes.STRING(100), allowNull: true },
        /** utility | authentication | marketing */
        whatsapp_category: { type: DataTypes.STRING(20), allowNull: true },
        /** none | text */
        whatsapp_header_type: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'none' },
        whatsapp_header_text: { type: DataTypes.STRING(60), allowNull: true },
        /** Named {{var}} placeholders; turned into Meta's numbered {{1}} at send time. */
        whatsapp_body: { type: DataTypes.TEXT, allowNull: true },
        whatsapp_footer: { type: DataTypes.STRING(60), allowNull: true },
        /** [{ type: 'url' | 'copy_code', text, url }] — at most 2. */
        whatsapp_buttons: { type: DataTypes.JSON, allowNull: true },
        /** { var: sample } used by previews and test sends. */
        sample_values: { type: DataTypes.JSON, allowNull: true },
        /** Placeholders actually referenced in title/content, derived on save. */
        variables_used: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        image_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        /** Subset of 'email' / 'whatsapp' / 'in_app' / 'push'. */
        channels: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: ['in_app'],
        },
        is_active: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1,
        },
        sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        company_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        created_by: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        updated_by: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
    }, {
        tableName: 'notification_templates',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });

    return NotificationTemplate;
};
