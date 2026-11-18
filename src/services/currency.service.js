const { Currency } = require('../models');
const codedMaster = require('./codedMaster.service');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

/** Currencies (global). Shared behaviour: codedMaster.service.js (on the common CRUD kit). */
module.exports = codedMaster.build({
    Model: Currency,
    modelName: 'Currency',
    moduleSlug: 'currencies',
    title: 'Currency',
    searchFields: ['name', 'code', 'symbol'],
    sortableFields: ['created_at', 'name', 'code', 'exchange_rate'],
    activeAttributes: ['id', 'name', 'code', 'symbol', 'exchange_rate', 'decimal_places', 'is_default'],
    extend: () => ({
        updateExchangeRate: async (id, exchangeRate, userId = null) => {
            const currency = await Currency.findByPk(id);
            if (!currency) throw ApiError.notFound('Currency not found');
            const oldRate = currency.exchange_rate;
            await currency.update({ exchange_rate: exchangeRate, updated_by: userId });
            logger.logDB('updateExchangeRate', 'Currency', id);
            logger.logActivity(userId, 'update_exchange_rate', 'Currency', `Updated exchange rate for ${currency.code}`, { recordId: id, oldRate, newRate: exchangeRate });
            return currency;
        },
    }),
});
