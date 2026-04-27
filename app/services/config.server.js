export const AppConfig = {
  api: {
    defaultModel: 'claude-sonnet-4-6',
    maxTokens: 2000,
    defaultPromptType: 'standardAssistant',
  },
  errorMessages: {
    missingMessage: "Message is required",
    apiUnsupported: "This endpoint only supports server-sent events (SSE) requests or history requests.",
    authFailed: "Authentication failed with Claude API",
    apiKeyError: "Please check your API key in environment variables",
    rateLimitExceeded: "Rate limit exceeded",
    rateLimitDetails: "Please try again later",
    genericError: "Failed to get response from Claude"
  },
  tools: {
    productSearchName: "search_shop_catalog",
    maxProductsToDisplay: 3
  }
};

export default AppConfig;
