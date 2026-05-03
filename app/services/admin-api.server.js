import { unauthenticated } from '../shopify.server.js';
import prisma from '../db.server.js';

const ORDER_QUERY = `
  query GetOrder($query: String!) {
    orders(first: 5, query: $query) {
      edges {
        node {
          name
          email
          displayFinancialStatus
          displayFulfillmentStatus
          createdAt
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
          lineItems(first: 10) {
            edges {
              node { title quantity }
            }
          }
          shippingAddress { city province country }
        }
      }
    }
  }
`;

async function getShopDomain() {
  const session = await prisma.session.findFirst({
    orderBy: [{ isOnline: 'asc' }, { expires: 'desc' }]
  });
  if (!session?.shop) throw new Error('No admin session found for shop');
  console.log(`Admin session: found (shop: ${session.shop})`);
  return session.shop;
}

export async function lookupOrder({ email, orderNumber }) {
  const shop = await getShopDomain();
  const { admin } = await unauthenticated.admin(shop);

  const normalized = orderNumber.replace(/^#*/, '#');
  const searchQuery = `name:"${normalized}"`;

  const response = await admin.graphql(ORDER_QUERY, {
    variables: { query: searchQuery }
  });

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
  }

  const orders = (data.data?.orders?.edges || []).map(e => e.node);

  if (orders.length === 0) return { found: false };

  const order = email
    ? orders.find(o => o.email?.toLowerCase() === email.toLowerCase()) || null
    : orders[0];

  if (!order) return { found: false };

  return {
    found: true,
    order: {
      number: order.name,
      payment_status: order.displayFinancialStatus,
      fulfillment_status: order.displayFulfillmentStatus,
      created_at: order.createdAt,
      total: `${order.totalPriceSet.shopMoney.currencyCode} ${order.totalPriceSet.shopMoney.amount}`,
      items: order.lineItems.edges.map(e => `${e.node.quantity}x ${e.node.title}`),
      shipping_destination: order.shippingAddress
        ? [order.shippingAddress.city, order.shippingAddress.province, order.shippingAddress.country]
            .filter(Boolean).join(', ')
        : null
    }
  };
}
