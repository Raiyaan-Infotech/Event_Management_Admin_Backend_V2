const { DataTypes } = require('sequelize');

/** A client's support / allocation request for unavailable dates (2026-11-13). See the migration. */
module.exports = (sequelize) => {
    const AvailabilityRequest = sequelize.define('AvailabilityRequest', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        ticket_no: { type: DataTypes.STRING(30), allowNull: true },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        booking_type: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'single' },
        start_date: { type: DataTypes.DATEONLY, allowNull: false },
        end_date: { type: DataTypes.DATEONLY, allowNull: false },
        unavailable_dates: { type: DataTypes.JSON, allowNull: true },
        contact_method: { type: DataTypes.STRING(10), allowNull: false },
        contact_name: { type: DataTypes.STRING(150), allowNull: false },
        contact_mobile: { type: DataTypes.STRING(30), allowNull: true },
        contact_email: { type: DataTypes.STRING(190), allowNull: true },
        preferred_call_time: { type: DataTypes.STRING(60), allowNull: true },
        subject: { type: DataTypes.STRING(200), allowNull: true },
        message: { type: DataTypes.STRING(500), allowNull: false },
        attachment_url: { type: DataTypes.STRING(500), allowNull: true },
        attachment_name: { type: DataTypes.STRING(255), allowNull: true },
        status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' },
        decision_reason: { type: DataTypes.STRING(500), allowNull: true },
        decision: { type: DataTypes.JSON, allowNull: true },
        decided_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        decided_at: { type: DataTypes.DATE, allowNull: true },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    }, {
        tableName: 'availability_requests',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    return AvailabilityRequest;
};
