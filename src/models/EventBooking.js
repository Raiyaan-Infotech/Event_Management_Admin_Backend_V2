const { DataTypes } = require('sequelize');

/**
 * One booked event date with the plan chosen for that event (per-event plans, 2026-11-19).
 * See migrations/sql/20261119-event-bookings.sql. Written and read by clientBooking.service;
 * clientEvent.createEvent turns a 'reserved' row 'used'.
 *
 * `status`: 'reserved' | 'used' | 'cancelled'.  `payment_status`: 'free' | 'pending' | 'paid'.
 */
module.exports = (sequelize) => {
    const EventBooking = sequelize.define('EventBooking', {
        id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
        website_client_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        start_date: { type: DataTypes.DATEONLY, allowNull: false },
        end_date: { type: DataTypes.DATEONLY, allowNull: true },
        subscription_plan_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        plan_name: { type: DataTypes.STRING(120), allowNull: false },
        amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        currency_code: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
        payment_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'free' },
        client_transaction_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'reserved' },
        event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        used_at: { type: DataTypes.DATE, allowNull: true },
    }, {
        tableName: 'event_bookings',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    });

    return EventBooking;
};
