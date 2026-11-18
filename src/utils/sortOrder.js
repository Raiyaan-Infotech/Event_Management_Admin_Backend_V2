const ApiError = require('./apiError');

/**
 * Drag reorder for any table with `sort_order` (V2, 2026-11-19).
 *
 *   const { updated } = await applySortOrder(Model, req.body.items, { userId, companyId });
 *
 * items = [{ id, sort_order }]. Rows of another company are skipped (when companyId is given).
 * ONE UPDATE … SET sort_order = CASE id WHEN … END for all rows — the hand-written versions sent
 * one UPDATE per row (~374 ms each against the live database). A repeated id keeps its last value.
 * Answers { updated: <rows that belonged to the company> } like before.
 */
const applySortOrder = async (Model, items, { userId = null, companyId = undefined, transaction } = {}) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw ApiError.badRequest('Provide an array of { id, sort_order }.');
    }
    const wanted = new Map();
    for (const item of items) {
        const id = parseInt(item.id, 10);
        if (!Number.isNaN(id)) wanted.set(id, parseInt(item.sort_order, 10) || 0);
    }
    const where = { id: [...wanted.keys()] };
    if (companyId !== undefined && companyId !== null) where.company_id = companyId;
    const owned = (await Model.findAll({ where, attributes: ['id'], raw: true, transaction })).map((r) => r.id);
    if (owned.length) {
        const cases = owned.map((id) => `WHEN ${Number(id)} THEN ${Number(wanted.get(id))}`).join(' ');
        await Model.update(
            { sort_order: Model.sequelize.literal(`CASE id ${cases} ELSE sort_order END`), updated_by: userId },
            { where: { id: owned }, transaction },
        );
    }
    return { updated: owned.length };
};

module.exports = { applySortOrder };
