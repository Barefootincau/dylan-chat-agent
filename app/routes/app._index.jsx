export default function Index() {
  return (
    <s-page>
      <ui-title-bar title="Dylan CS Agent" />

      <s-section>
        <s-stack gap="base">
          <s-heading>Dylan is live on Barefoot Inc. 👟</s-heading>
          <s-paragraph>
            Dylan is an AI customer care assistant embedded on the Barefoot Inc. storefront,
            powered by Claude and connected to Shopify MCP.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Next steps" slot="aside">
        <s-text>Enable the AI Chat Assistant block in your Shopify theme editor.</s-text>
      </s-section>
    </s-page>
  );
}
