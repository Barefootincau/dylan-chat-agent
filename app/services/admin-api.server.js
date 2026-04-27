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

async function getAdminToken(shopDomain) {
  const hostname = new URL(shopDomain).hostname;

  let session = await prisma.session.findFirst({
    where: { shop: hostname },
    orderBy: [{ isOnline: 'asc' }, { expires: 'desc' }]
  });

  if (!session) {
    session = await prisma.session.findFirst({
      orderBy: [{ isOnline: 'asc' }, { expires: 'desc' }]
    });
  }

  console.log(`Admin session: ${session ? `found (shop: ${session.shop})` : 'not found'}`);

  return { token: session?.accessToken || null, hostname: session?.shop || hostname };
}

export async function lookupOrder({ shopDomain, email, orderNumber }) {
  const { token, hostname } = await getAdminToken(shopDomain);
  if (!token) throw new Error('No admin session found for shop');

  const normalized = orderNumber.replace(/^#*/, '#');
  const searchQuery = `name:${normalized}`;

  const response = await fetch(
    `https://${hostname}/admin/api/2026-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: ORDER_QUERY, variables: { query: searchQuery } })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Admin API HTTP ${response.status}: ${body}`);
  }

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
