import MCPClient from "../mcp-client";
import { saveMessage, getConversationHistory } from "../db.server";
import AppConfig from "../services/config.server";
import { createSseStream } from "../services/streaming.server";
import { createClaudeService } from "../services/claude.server";
import { createToolService } from "../services/tool.server";
import { lookupOrder } from "../services/admin-api.server";

const ORDER_LOOKUP_TOOL = {
  name: 'get_order_status',
  description: 'Look up an order by email address and order number. You MUST have both the email address and order number from the customer before calling this tool. Never call with only an order number.',
  input_schema: {
    type: 'object',
    properties: {
      email: { type: 'string', description: 'Customer email address on the order' },
      order_number: { type: 'string', description: 'Order number exactly as shown, e.g. 1234, #1234, or FF42198' }
    },
    required: ['email', 'order_number']
  }
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  const url = new URL(request.url);

  if (url.searchParams.has('history') && url.searchParams.has('conversation_id')) {
    return handleHistoryRequest(request, url.searchParams.get('conversation_id'));
  }

  if (!url.searchParams.has('history') && request.headers.get("Accept") === "text/event-stream") {
    return handleChatRequest(request);
  }

  return new Response(JSON.stringify({ error: AppConfig.errorMessages.apiUnsupported }), { status: 400, headers: getCorsHeaders(request) });
}

export async function action({ request }) {
  return handleChatRequest(request);
}

async function handleHistoryRequest(request, conversationId) {
  const messages = await getConversationHistory(conversationId);
  return new Response(JSON.stringify({ messages }), { headers: getCorsHeaders(request) });
}

async function handleChatRequest(request) {
  try {
    const body = await request.json();
    const userMessage = body.message;

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: AppConfig.errorMessages.missingMessage }),
        { status: 400, headers: getSseHeaders(request) }
      );
    }

    const conversationId = body.conversation_id || Date.now().toString();
    const promptType = body.prompt_type || AppConfig.api.defaultPromptType;

    const responseStream = createSseStream(async (stream) => {
      await handleChatSession({ request, userMessage, conversationId, promptType, stream });
    });

    return new Response(responseStream, { headers: getSseHeaders(request) });
  } catch (error) {
    console.error('Error in chat request handler:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: getCorsHeaders(request)
    });
  }
}

async function handleChatSession({ request, userMessage, conversationId, promptType, stream }) {
  const claudeService = createClaudeService();
  const toolService = createToolService();

  const shopId = request.headers.get("X-Shopify-Shop-Id");
  const shopDomain = request.headers.get("Origin");
  const mcpClient = new MCPClient(shopDomain, conversationId, shopId);

  try {
    stream.sendMessage({ type: 'id', conversation_id: conversationId });

    let storefrontMcpTools = [];
    try {
      storefrontMcpTools = await mcpClient.connectToStorefrontServer();
      console.log(`Connected to MCP with ${storefrontMcpTools.length} tools`);
    } catch (error) {
      console.warn('Failed to connect to storefront MCP, continuing without tools:', error.message);
    }

    const allTools = [...mcpClient.tools, ORDER_LOOKUP_TOOL];

    let conversationHistory = [];
    let productsToDisplay = [];

    await saveMessage(conversationId, 'user', userMessage);

    const dbMessages = await getConversationHistory(conversationId);

    conversationHistory = dbMessages.map(dbMessage => {
      let content;
      try {
        content = JSON.parse(dbMessage.content);
      } catch (e) {
        content = dbMessage.content;
      }
      return { role: dbMessage.role, content };
    });

    let finalMessage = { role: 'user', content: userMessage };

    while (finalMessage.stop_reason !== "end_turn") {
      finalMessage = await claudeService.streamConversation(
        { messages: conversationHistory, promptType, tools: allTools },
        {
          onText: (textDelta) => {
            stream.sendMessage({ type: 'chunk', chunk: textDelta });
          },
          onMessage: (message) => {
            conversationHistory.push({ role: message.role, content: message.content });
            saveMessage(conversationId, message.role, JSON.stringify(message.content))
              .catch((error) => console.error("Error saving message:", error));
            stream.sendMessage({ type: 'message_complete' });
          },
          onToolUse: async (content) => {
            const toolName = content.name;
            const toolArgs = content.input;
            const toolUseId = content.id;

            stream.sendMessage({
              type: 'tool_use',
              tool_use_message: `Calling tool: ${toolName} with arguments: ${JSON.stringify(toolArgs)}`
            });

            let toolUseResponse;
            if (toolName === ORDER_LOOKUP_TOOL.name) {
              try {
                const result = await lookupOrder({ email: toolArgs.email, orderNumber: toolArgs.order_number });
                toolUseResponse = { content: [{ type: 'text', text: JSON.stringify(result) }] };
              } catch (err) {
                console.error('Order lookup failed:', err.message);
                toolUseResponse = { content: [{ type: 'text', text: JSON.stringify({ found: false, error: err.message }) }] };
              }
            } else {
              toolUseResponse = await mcpClient.callTool(toolName, toolArgs);
            }

            if (toolUseResponse.error) {
              await toolService.handleToolError(
                toolUseResponse, toolName, toolUseId, conversationHistory, stream.sendMessage, conversationId
              );
            } else {
              await toolService.handleToolSuccess(
                toolUseResponse, toolName, toolUseId, conversationHistory, productsToDisplay, conversationId
              );
            }

            stream.sendMessage({ type: 'new_message' });
          },
          onContentBlock: (contentBlock) => {
            if (contentBlock.type === 'text') {
              stream.sendMessage({ type: 'content_block_complete', content_block: contentBlock });
            }
          }
        }
      );
    }

    stream.sendMessage({ type: 'end_turn' });

    if (productsToDisplay.length > 0) {
      stream.sendMessage({ type: 'product_results', products: productsToDisplay });
    }
  } catch (error) {
    throw error;
  }
}

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  const requestHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Accept";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
}

function getSseHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
    "Access-Control-Allow-Headers": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  };
}
