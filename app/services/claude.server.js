import { Anthropic } from "@anthropic-ai/sdk";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  const anthropic = new Anthropic({ apiKey });

  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools
  }, streamHandlers) => {
    const systemInstruction = getSystemPrompt(promptType);

    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: systemInstruction,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined
    });

    if (streamHandlers.onText) stream.on('text', streamHandlers.onText);
    if (streamHandlers.onMessage) stream.on('message', streamHandlers.onMessage);
    if (streamHandlers.onContentBlock) stream.on('contentBlock', streamHandlers.onContentBlock);

    const finalMessage = await stream.finalMessage();

    if (streamHandlers.onToolUse && finalMessage.content) {
      for (const content of finalMessage.content) {
        if (content.type === "tool_use") {
          await streamHandlers.onToolUse(content);
        }
      }
    }

    return finalMessage;
  };

  const getSystemPrompt = (promptType) => {
    return systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content;
  };

  return { streamConversation, getSystemPrompt };
}

export default { createClaudeService };
