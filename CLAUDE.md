# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Dylan is an AI customer care chat agent (powered by Claude) embedded on the Barefoot Inc. Shopify storefront (barefootincau.myshopify.com / barefootinc.com.au). The backend is a Shopify app built with React Router 7, hosted on Render. The chat widget is a Shopify theme extension.

## Commands

```bash
# Local development (runs Shopify CLI dev tunnel)
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Build + run DB migrations
npm run build

# Run DB migrations only (after schema changes)
npx prisma migrate deploy

# Generate Prisma client after schema changes
npx prisma generate

# Create a new migration
npx prisma migrate dev --name <migration-name>

# Inspect live DB (point at DATABASE_URL for production)
npx prisma studio
```

There are no tests in this codebase.

## Architecture

### Request flow

1. Customer sends a message from the chat widget (`extensions/chat-bubble/assets/chat.js`)
2. Widget POSTs to `/chat` on the Render backend with `{ message, conversation_id, prompt_type }` and headers `X-Shopify-Shop-Id` and `Origin`
3. `app/routes/chat.jsx` handles the request and opens a Server-Sent Events (SSE) stream back to the browser
4. The route initialises an `MCPClient` and connects to two MCP endpoints:
   - **Storefront MCP** (`{shopDomain}/api/mcp`) -- public, no auth, product/catalog tools
   - **Customer MCP** (`{accountHost}/customer/api/mcp`) -- requires customer OAuth token, order tools
5. Claude streams a response via `app/services/claude.server.js`, calling MCP tools as needed
6. SSE events (`chunk`, `tool_use`, `auth_required`, `product_results`, `end_turn`, etc.) are consumed by the widget

### Key files

| File | Purpose |
|------|----------|
| `app/routes/chat.jsx` | Main chat endpoint -- SSE handler, MCP orchestration, conversation loop |
| `app/mcp-client.js` | `MCPClient` class -- connects to Shopify MCP servers, dispatches tool calls, handles 401 auth flow |
| `app/services/claude.server.js` | Thin wrapper around `@anthropic-ai/sdk` streaming |
| `app/services/config.server.js` | Central config: model name, max tokens, prompt type, tool names |
| `app/services/tool.server.js` | Tool response processing: auth errors, product result formatting, history updates |
| `app/services/streaming.server.js` | `ReadableStream` + SSE helper (`createSseStream`, `createStreamManager`) |
| `app/auth.server.js` | PKCE OAuth flow -- generates auth URL and code verifier for customer login |
| `app/routes/auth.callback.jsx` | Receives the OAuth redirect, exchanges code for token, stores in DB |
| `app/db.server.js` | All Prisma DB helpers: conversations, messages, tokens, code verifiers, customer account URLs |
| `app/shopify.server.js` | Shopify app SDK init (admin auth, session storage) |
| `app/prompts/prompts.json` | System prompts for Dylan -- edit here to change voice/behaviour |
| `extensions/chat-bubble/` | Shopify theme extension: Liquid block + vanilla JS + CSS |
| `shopify.app.dylan-chat-agent.toml` | **Active** Shopify app config -- update client_id and URLs after Partners setup |

### Database (SQLite via Prisma)

- `Session` -- Shopify admin OAuth sessions
- `Conversation` + `Message` -- chat history, messages stored as JSON strings (Claude content arrays)
- `CustomerToken` -- customer OAuth access tokens keyed by `conversationId`
- `CodeVerifier` -- PKCE verifiers, expire after 10 minutes, deleted on retrieval
- `CustomerAccountUrls` -- cached per-conversation MCP/auth/token URLs fetched from Shopify's `.well-known` endpoints

In production, `DATABASE_URL` points at `file:/data/dylan.db` on the Render persistent disk mounted at `/data`.

### Customer auth flow

When a customer tool call returns 401:
1. `MCPClient.callCustomerTool` catches the 401 and calls `generateAuthUrl` in `auth.server.js`
2. `generateAuthUrl` builds a PKCE auth URL using `authorizationUrl` stored in `CustomerAccountUrls` for that conversation
3. The auth URL is returned to Claude as the tool result; Claude surfaces it to the customer
4. Customer clicks the link, authenticates, and is redirected to `/auth/callback`
5. `auth.callback.jsx` exchanges the code for a token and stores it in `CustomerToken`
6. The state parameter encodes `{conversationId}-{shopId}-{timestamp}`, which is how the callback knows which conversation to associate the token with

### Model and prompts

- Model: `claude-sonnet-4-6` (configured in `app/services/config.server.js` -- update here to upgrade)
- Max tokens: 2000
- System prompt: `app/prompts/prompts.json` under `systemPrompts.standardAssistant.content`
- The `enthusiasticAssistant` prompt exists but has identical content to `standardAssistant`
- `prompt_type` can be passed per-request from the theme extension (configurable in the Shopify theme editor)

### Shopify app config

- Active config file: `shopify.app.dylan-chat-agent.toml` (do not create or use `shopify.app.toml`)
- `use_legacy_install_flow = false` is required -- setting it to `true` causes OAuth scope errors
- App distribution: `AppStore` (hardcoded in `app/shopify.server.js`)
- API version: `2026-04`

## Environment variables (Render)

```
CLAUDE_API_KEY=                          # Anthropic API key
SHOPIFY_API_KEY=                         # Client ID from Shopify Partners
SHOPIFY_API_SECRET=                      # Client secret from Shopify Partners
SHOPIFY_APP_URL=https://YOUR_RENDER_URL.onrender.com
SHOPIFY_API_VERSION=2026-04
REDIRECT_URL=https://YOUR_RENDER_URL.onrender.com/auth/callback
DATABASE_URL=file:/data/dylan.db         # SQLite on Render disk mounted at /data
SCOPES=read_orders,read_product_listings,read_products,read_returns,read_shipping
```

## SSE event types

The backend emits these event types to the chat widget:

| Type | Payload |
|------|----------|
| `id` | `{ conversation_id }` |
| `chunk` | `{ chunk: string }` -- streaming text delta |
| `tool_use` | `{ tool_use_message }` -- shown as status text |
| `message_complete` | signals end of one Claude turn |
| `new_message` | signals a tool result was added |
| `auth_required` | triggers auth UI in the widget |
| `product_results` | `{ products: [] }` -- rendered as product cards |
| `content_block_complete` | `{ content_block }` |
| `end_turn` | stream is done |
| `error` / `rate_limit_exceeded` | error state |
