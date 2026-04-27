import { saveMessage } from "../db.server";
import AppConfig from "./config.server";

export function createToolService() {
  const handleToolError = async (toolUseResponse, toolName, toolUseId, conversationHistory, sendMessage, conversationId) => {
    if (toolUseResponse.error.type === "auth_required") {
      await addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.error.data, conversationId);
      sendMessage({ type: 'auth_required' });
    } else {
      await addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.error.data, conversationId);
    }
  };

  const handleToolSuccess = async (toolUseResponse, toolName, toolUseId, conversationHistory, productsToDisplay, conversationId) => {
    if (toolName === AppConfig.tools.productSearchName) {
      productsToDisplay.push(...processProductSearchResult(toolUseResponse));
    }
    addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.content, conversationId);
  };

  const processProductSearchResult = (toolUseResponse) => {
    try {
      let products = [];

      if (toolUseResponse.content && toolUseResponse.content.length > 0) {
        const content = toolUseResponse.content[0].text;

        try {
          let responseData = typeof content === 'object' ? content : JSON.parse(content);

          if (responseData?.products && Array.isArray(responseData.products)) {
            products = responseData.products
              .slice(0, AppConfig.tools.maxProductsToDisplay)
              .map(formatProductData);
          }
        } catch (e) {
          console.error("Error parsing product data:", e);
        }
      }

      return products;
    } catch (error) {
      console.error("Error processing product search results:", error);
      return [];
    }
  };

  const formatProductData = (product) => {
    const price = product.price_range
      ? `${product.price_range.currency} ${product.price_range.min}`
      : (product.variants && product.variants.length > 0
        ? `${product.variants[0].currency} ${product.variants[0].price}`
        : 'Price not available');

    return {
      id: product.product_id || `product-${Math.random().toString(36).substring(7)}`,
      title: product.title || 'Product',
      price,
      image_url: product.image_url || '',
      description: product.description || '',
      url: product.url || ''
    };
  };

  const addToolResultToHistory = async (conversationHistory, toolUseId, content, conversationId) => {
    const toolResultMessage = {
      role: 'user',
      content: [{ type: "tool_result", tool_use_id: toolUseId, content }]
    };

    conversationHistory.push(toolResultMessage);

    if (conversationId) {
      try {
        await saveMessage(conversationId, 'user', JSON.stringify(toolResultMessage.content));
      } catch (error) {
        console.error('Error saving tool result to database:', error);
      }
    }
  };

  return { handleToolError, handleToolSuccess, processProductSearchResult, addToolResultToHistory };
}

export default { createToolService };
