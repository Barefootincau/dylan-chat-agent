import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

export async function storeCodeVerifier(state, verifier) {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  try {
    return await prisma.codeVerifier.upsert({
      where: { state },
      update: { verifier, expiresAt },
      create: {
        id: `cv_${Date.now()}`,
        state,
        verifier,
        expiresAt
      }
    });
  } catch (error) {
    console.error('Error storing code verifier:', error);
    throw error;
  }
}

export async function getCodeVerifier(state) {
  try {
    const verifier = await prisma.codeVerifier.findFirst({
      where: {
        state,
        expiresAt: { gt: new Date() }
      }
    });

    if (verifier) {
      await prisma.codeVerifier.delete({ where: { id: verifier.id } });
    }

    return verifier;
  } catch (error) {
    console.error('Error retrieving code verifier:', error);
    return null;
  }
}

export async function storeCustomerToken(conversationId, accessToken, expiresAt) {
  try {
    const existingToken = await prisma.customerToken.findFirst({
      where: { conversationId }
    });

    if (existingToken) {
      return await prisma.customerToken.update({
        where: { id: existingToken.id },
        data: { accessToken, expiresAt, updatedAt: new Date() }
      });
    }

    return await prisma.customerToken.create({
      data: {
        id: `ct_${Date.now()}`,
        conversationId,
        accessToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer token:', error);
    throw error;
  }
}

export async function getCustomerToken(conversationId) {
  try {
    return await prisma.customerToken.findFirst({
      where: {
        conversationId,
        expiresAt: { gt: new Date() }
      }
    });
  } catch (error) {
    console.error('Error retrieving customer token:', error);
    return null;
  }
}

export async function createOrUpdateConversation(conversationId) {
  try {
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (existing) {
      return await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });
    }

    return await prisma.conversation.create({ data: { id: conversationId } });
  } catch (error) {
    console.error('Error creating/updating conversation:', error);
    throw error;
  }
}

export async function saveMessage(conversationId, role, content) {
  try {
    await createOrUpdateConversation(conversationId);
    return await prisma.message.create({
      data: { conversationId, role, content }
    });
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

export async function getConversationHistory(conversationId) {
  try {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    return [];
  }
}

export async function storeCustomerAccountUrls({conversationId, mcpApiUrl, authorizationUrl, tokenUrl}) {
  try {
    return await prisma.customerAccountUrls.upsert({
      where: { conversationId },
      create: { conversationId, mcpApiUrl, authorizationUrl, tokenUrl, updatedAt: new Date() },
      update: { mcpApiUrl, authorizationUrl, tokenUrl, updatedAt: new Date() },
    });
  } catch (error) {
    console.error('Error storing customer account URLs:', error);
    throw error;
  }
}

export async function getCustomerAccountUrls(conversationId) {
  try {
    return await prisma.customerAccountUrls.findUnique({
      where: { conversationId }
    });
  } catch (error) {
    console.error('Error retrieving customer account URLs:', error);
    return null;
  }
}
