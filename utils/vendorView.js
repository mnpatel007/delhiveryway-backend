/**
 * Shaping of order data for shop owners.
 *
 * Vendors are outside business partners, not staff. The platform's own cut -
 * the delivery fee, the convenience charge and the shopper's commission -
 * must never reach them, so it is stripped here on the server rather than
 * hidden in the portal. A vendor reading the raw API response sees only what
 * concerns their own shop: the items, any tax, and any packaging charge.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * The money a shop is entitled to see for one order.
 * Prefers the revised figures when the order was revised, since that is what
 * the customer actually bought.
 */
const shopFacingValue = (order) => {
  const revised = order?.revisedOrderValue;
  const wasRevised = revised && revised.total != null;
  const v = (wasRevised ? revised : order?.orderValue) || {};

  const subtotal = round2(v.subtotal);
  const taxes = round2(v.taxes);
  const packagingCharges = round2(v.packagingCharges);

  return {
    subtotal,
    taxes,
    packagingCharges,
    // What the shop's side of the order comes to. Deliberately NOT
    // orderValue.total, which carries the delivery fee and convenience charge.
    shopTotal: round2(subtotal + taxes + packagingCharges),
    wasRevised: Boolean(wasRevised),
  };
};

/** Items as the shop should see them, honouring a revision. */
const shopFacingItems = (order) =>
  (order?.items || []).map((item) => {
    const quantity = item.revisedQuantity != null ? item.revisedQuantity : item.quantity;
    const price = Number(item.price) || 0;
    return {
      name: item.name,
      price: round2(price),
      quantity: Number(quantity) || 0,
      lineTotal: round2(price * (Number(quantity) || 0)),
      unavailable: item.revisedQuantity === 0,
    };
  });

/**
 * One order, shaped for a shop owner. Only the fields named here are sent -
 * anything added to the Order model in future stays invisible to vendors
 * until someone deliberately adds it to this list.
 */
const toVendorOrder = (order) => {
  const o = typeof order.toObject === 'function' ? order.toObject() : order;

  return {
    _id: o._id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt || o.actualDeliveryTime || null,
    cancelledAt: o.cancelledAt || null,
    // Name only. The shopper handles contact with the customer, so a vendor
    // has no need for their phone number or address.
    customerName: o.customerId?.name || 'Customer',
    items: shopFacingItems(o),
    value: shopFacingValue(o),
  };
};

module.exports = { shopFacingValue, shopFacingItems, toVendorOrder, round2 };
