const { DataTypes } = require('sequelize');

/**
 * MSG91 provider configuration: a single row, one JSON column per settings tab.
 * Field rules live in services/msg91Config.service.js. Never send this model to the
 * client directly: the service's `present()` strips the encrypted secrets.
 */
module.exports = (sequelize) => {
    const json = (name) => ({ type: DataTypes.JSON, allowNull: true, field: name });
    return sequelize.define('Msg91Config', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        auth_key_enc: { type: DataTypes.TEXT, allowNull: true },
        webhook_token_enc: { type: DataTypes.TEXT, allowNull: true },
        general: json('general'),
        api: json('api'),
        sms: json('sms'),
        otp: json('otp'),
        dlt: json('dlt'),
        sms_templates: json('sms_templates'),
        email: json('email'),
        webhook: json('webhook'),
        alerts: json('alerts'),
        connection_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'not_tested' },
        last_tested_at: { type: DataTypes.DATE, allowNull: true },
        last_test_message: { type: DataTypes.STRING(500), allowNull: true },
        last_balance: json('last_balance'),
        updated_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'msg91_configs',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });
};
