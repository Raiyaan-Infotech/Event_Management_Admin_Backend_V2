const { DataTypes } = require('sequelize');

/**
 * Meta WhatsApp Cloud API provider configuration: a single row, one JSON column per settings tab.
 * Field rules live in services/whatsappConfig.service.js. Never send this model to the client
 * directly: the service's `present()` strips the encrypted secrets.
 */
module.exports = (sequelize) => {
    // A function, not one shared object: Sequelize writes into each attribute definition.
    const json = () => ({ type: DataTypes.JSON, allowNull: true });
    return sequelize.define('WhatsAppConfig', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        app_secret_enc: { type: DataTypes.TEXT, allowNull: true },
        access_token_enc: { type: DataTypes.TEXT, allowNull: true },
        verify_token_enc: { type: DataTypes.TEXT, allowNull: true },
        general: json(),
        api: json(),
        business: json(),
        senders: json(),
        templates: json(),
        webhook: json(),
        limits: json(),
        budget: json(),
        connection_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'not_tested' },
        last_tested_at: { type: DataTypes.DATE, allowNull: true },
        last_test_message: { type: DataTypes.STRING(500), allowNull: true },
        last_test_info: json(),
        updated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'whatsapp_configs',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });
};
