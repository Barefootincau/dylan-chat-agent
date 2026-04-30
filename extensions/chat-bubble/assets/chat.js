(function() {
  'use strict';

  const ShopAIChat = {
    UI: {
      elements: {},
      isMobile: false,

      init: function(container) {
        if (!container) return;
        this.elements = {
          container,
          chatBubble: container.querySelector('.shop-ai-chat-bubble'),
          chatWindow: container.querySelector('.shop-ai-chat-window'),
          closeButton: container.querySelector('.shop-ai-chat-close'),
          chatInput: container.querySelector('.shop-ai-chat-input input'),
          sendButton: container.querySelector('.shop-ai-chat-send'),
          messagesContainer: container.querySelector('.shop-ai-chat-messages')
        };
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.setupEventListeners();
        if (this.isMobile) this.setupMobileViewport();
      },

      setupEventListeners: function() {
        const { chatBubble, closeButton, chatInput, sendButton, messagesContainer } = this.elements;
        chatBubble.addEventListener('click', () => this.toggleChatWindow());
        closeButton.addEventListener('click', () => this.closeChatWindow());
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && chatInput.value.trim() !== '') {
            ShopAIChat.Message.send(chatInput, messagesContainer);
            if (this.isMobile) { chatInput.blur(); setTimeout(() => chatInput.focus(), 300); }
          }
        });
        sendButton.addEventListener('click', () => {
          if (chatInput.value.trim() !== '') {
            ShopAIChat.Message.send(chatInput, messagesContainer);
            if (this.isMobile) setTimeout(() => chatInput.focus(), 300);
          }
        });
        window.addEventListener('resize', () => this.scrollToBottom());
        document.addEventListener('click', function(event) {
          if (event.target && event.target.classList.contains('shop-auth-trigger')) {
            event.preventDefault();
            if (window.shopAuthUrl) ShopAIChat.Auth.openAuthPopup(window.shopAuthUrl);
          }
        });
      },

      setupMobileViewport: function() {
        const setViewportHeight = () => {
          document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
        };
        window.addEventListener('resize', setViewportHeight);
        setViewportHeight();
      },

      toggleChatWindow: function() {
        const { chatWindow, chatInput } = this.elements;
        chatWindow.classList.toggle('active');
        if (chatWindow.classList.contains('active')) {
          if (this.isMobile) { document.body.classList.add('shop-ai-chat-open'); setTimeout(() => chatInput.focus(), 500); }
          else chatInput.focus();
          this.scrollToBottom();
        } else {
          document.body.classList.remove('shop-ai-chat-open');
        }
      },

      closeChatWindow: function() {
        const { chatWindow, chatInput } = this.elements;
        chatWindow.classList.remove('active');
        if (this.isMobile) { chatInput.blur(); document.body.classList.remove('shop-ai-chat-open'); }
      },

      scrollToBottom: function() {
        const { messagesContainer } = this.elements;
        setTimeout(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 100);
      },

      showTypingIndicator: function() {
        const { messagesContainer } = this.elements;
        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('shop-ai-typing-indicator');
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        messagesContainer.appendChild(typingIndicator);
        this.scrollToBottom();
      },

      removeTypingIndicator: function() {
        const { messagesContainer } = this.elements;
        const typingIndicator = messagesContainer.querySelector('.shop-ai-typing-indicator');
        if (typingIndicator) typingIndicator.remove();
      },

      displayProductResults: function(products) {
        const { messagesContainer } = this.elements;
        const productSection = document.createElement('div');
        productSection.classList.add('shop-ai-product-section');
        messagesContainer.appendChild(productSection);

        const header = document.createElement('div');
        header.classList.add('shop-ai-product-header');
        header.innerHTML = '<h4>Top Matching Products</h4>';
        productSection.appendChild(header);

        const productsContainer = document.createElement('div');
        productsContainer.classList.add('shop-ai-product-grid');
        productSection.appendChild(productsContainer);

        if (!products || !Array.isArray(products) || products.length === 0) {
          const msg = document.createElement('p');
          msg.textContent = 'No products found';
          productsContainer.appendChild(msg);
        } else {
          products.forEach(product => productsContainer.appendChild(ShopAIChat.Product.createCard(product)));
        }
        this.scrollToBottom();
      }
    },

    Message: {
      send: async function(chatInput, messagesContainer) {
        const userMessage = chatInput.value.trim();
        const conversationId = sessionStorage.getItem('shopAiConversationId');
        ShopAIChat.QuickReplies.hide();
        this.add(userMessage, 'user', messagesContainer);
        chatInput.value = '';
        ShopAIChat.UI.showTypingIndicator();
        try {
          ShopAIChat.API.streamResponse(userMessage, conversationId, messagesContainer);
        } catch (error) {
          ShopAIChat.UI.removeTypingIndicator();
          this.add("Sorry, I couldn't process your request at the moment. Please try again later.", 'assistant', messagesContainer);
        }
      },

      add: function(text, sender, messagesContainer) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('shop-ai-message', sender);
        if (sender === 'assistant') {
          messageElement.dataset.rawText = text;
          ShopAIChat.Formatting.formatMessageContent(messageElement);
        } else {
          messageElement.textContent = text;
        }
        messagesContainer.appendChild(messageElement);
        ShopAIChat.UI.scrollToBottom();
        return messageElement;
      },

      addToolUse: function(toolMessage, messagesContainer) {
        const match = toolMessage.match(/Calling tool: (\w+) with arguments: (.+)/);
        if (!match) {
          const el = document.createElement('div');
          el.classList.add('shop-ai-message', 'tool-use');
          el.textContent = toolMessage;
          messagesContainer.appendChild(el);
          ShopAIChat.UI.scrollToBottom();
          return;
        }
        const toolName = match[1];
        const argsString = match[2];
        const toolUseElement = document.createElement('div');
        toolUseElement.classList.add('shop-ai-message', 'tool-use');
        const headerElement = document.createElement('div');
        headerElement.classList.add('shop-ai-tool-header');
        const toolText = document.createElement('span');
        toolText.classList.add('shop-ai-tool-text');
        toolText.textContent = `Calling tool: ${toolName}`;
        const toggleElement = document.createElement('span');
        toggleElement.classList.add('shop-ai-tool-toggle');
        toggleElement.textContent = '[+]';
        headerElement.appendChild(toolText);
        headerElement.appendChild(toggleElement);
        const argsElement = document.createElement('div');
        argsElement.classList.add('shop-ai-tool-args');
        try { argsElement.textContent = JSON.stringify(JSON.parse(argsString), null, 2); }
        catch (e) { argsElement.textContent = argsString; }
        headerElement.addEventListener('click', function() {
          const isExpanded = argsElement.classList.contains('expanded');
          argsElement.classList.toggle('expanded', !isExpanded);
          toggleElement.textContent = isExpanded ? '[+]' : '[-]';
        });
        toolUseElement.appendChild(headerElement);
        toolUseElement.appendChild(argsElement);
        messagesContainer.appendChild(toolUseElement);
        ShopAIChat.UI.scrollToBottom();
      }
    },

    Formatting: {
      formatMessageContent: function(element) {
        if (!element || !element.dataset.rawText) return;
        let processedText = element.dataset.rawText;
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        processedText = processedText.replace(markdownLinkRegex, (match, text, url) => {
          if (url.includes('shopify.com/authentication') && (url.includes('oauth/authorize') || url.includes('authentication'))) {
            window.shopAuthUrl = url;
            return '<a href="#auth" class="shop-auth-trigger">' + text + '</a>';
          } else if (url.includes('/cart') || url.includes('checkout')) {
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">click here to proceed to checkout</a>';
          } else {
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
          }
        });
        processedText = processedText.replace(
          /(?<!href=["'])(https?:\/\/[^\s<>"'`,;!?)]+)/g,
          '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        processedText = processedText.replace(
          /(?<!href=["']|mailto:)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
          '<a href="mailto:$1">$1</a>'
        );
        processedText = this.convertMarkdownToHtml(processedText);
        element.innerHTML = processedText;
      },

      convertMarkdownToHtml: function(text) {
        text = text.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
        const lines = text.split('\n');
        let currentList = null, listItems = [], htmlContent = '', startNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const unorderedMatch = line.match(/^\s*([-*])\s+(.*)/);
          const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)/);
          if (unorderedMatch) {
            if (currentList !== 'ul') {
              if (currentList === 'ol') { htmlContent += `<ol start="${startNumber}">` + listItems.join('') + '</ol>'; listItems = []; }
              currentList = 'ul';
            }
            listItems.push('<li>' + unorderedMatch[2] + '</li>');
          } else if (orderedMatch) {
            if (currentList !== 'ol') {
              if (currentList === 'ul') { htmlContent += '<ul>' + listItems.join('') + '</ul>'; listItems = []; }
              currentList = 'ol';
              startNumber = parseInt(orderedMatch[1], 10);
            }
            listItems.push('<li>' + orderedMatch[2] + '</li>');
          } else {
            if (currentList) {
              htmlContent += currentList === 'ul' ? '<ul>' + listItems.join('') + '</ul>' : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
              listItems = []; currentList = null;
            }
            htmlContent += line.trim() === '' ? '<br>' : '<p>' + line + '</p>';
          }
        }
        if (currentList) {
          htmlContent += currentList === 'ul' ? '<ul>' + listItems.join('') + '</ul>' : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
        }
        return htmlContent;
      }
    },

    API: {
      streamResponse: async function(userMessage, conversationId, messagesContainer) {
        let currentMessageElement = null;
        try {
          const promptType = window.shopChatConfig?.promptType || 'standardAssistant';
          const requestBody = JSON.stringify({ message: userMessage, conversation_id: conversationId, prompt_type: promptType });
          const streamUrl = (window.shopChatConfig?.apiUrl || '').replace(/\/$/, '') + '/chat';
          const shopId = window.shopId;

          const response = await fetch(streamUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'X-Shopify-Shop-Id': shopId },
            body: requestBody
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          let messageElement = document.createElement('div');
          messageElement.classList.add('shop-ai-message', 'assistant');
          messageElement.textContent = '';
          messageElement.dataset.rawText = '';
          messagesContainer.appendChild(messageElement);
          currentMessageElement = messageElement;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  this.handleStreamEvent(data, currentMessageElement, messagesContainer, userMessage, (el) => { currentMessageElement = el; });
                } catch (e) { console.error('Error parsing event data:', e, line); }
              }
            }
          }
        } catch (error) {
          console.error('Error in streaming:', error);
          ShopAIChat.UI.removeTypingIndicator();
          ShopAIChat.Message.add("Sorry, I couldn't process your request. Please try again later.", 'assistant', messagesContainer);
        }
      },

      handleStreamEvent: function(data, currentMessageElement, messagesContainer, userMessage, updateCurrentElement) {
        switch (data.type) {
          case 'id':
            if (data.conversation_id) sessionStorage.setItem('shopAiConversationId', data.conversation_id);
            break;
          case 'chunk':
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.dataset.rawText += data.chunk;
            currentMessageElement.textContent = currentMessageElement.dataset.rawText;
            ShopAIChat.UI.scrollToBottom();
            break;
          case 'message_complete':
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            ShopAIChat.UI.scrollToBottom();
            break;
          case 'end_turn':
            ShopAIChat.UI.removeTypingIndicator();
            break;
          case 'error':
          case 'billing_error':
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.textContent = "Sorry, I couldn't process your request. Please try again later.";
            break;
          case 'rate_limit_exceeded':
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.textContent = "Sorry, our servers are currently busy. Please try again later.";
            break;
          case 'auth_required':
            sessionStorage.setItem('shopAiLastMessage', userMessage || '');
            break;
          case 'product_results':
            ShopAIChat.UI.displayProductResults(data.products);
            break;
          case 'tool_use':
            if (data.tool_use_message) ShopAIChat.Message.addToolUse(data.tool_use_message, messagesContainer);
            break;
          case 'new_message':
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            ShopAIChat.UI.showTypingIndicator();
            const newEl = document.createElement('div');
            newEl.classList.add('shop-ai-message', 'assistant');
            newEl.textContent = '';
            newEl.dataset.rawText = '';
            messagesContainer.appendChild(newEl);
            updateCurrentElement(newEl);
            break;
          case 'content_block_complete':
            ShopAIChat.UI.showTypingIndicator();
            break;
        }
      },

      fetchChatHistory: async function(conversationId, messagesContainer) {
        try {
          const loadingMessage = document.createElement('div');
          loadingMessage.classList.add('shop-ai-message', 'assistant');
          loadingMessage.textContent = 'Loading conversation history...';
          messagesContainer.appendChild(loadingMessage);

          const baseUrl = (window.shopChatConfig?.apiUrl || '').replace(/\/$/, '');
          const historyUrl = `${baseUrl}/chat?history=true&conversation_id=${encodeURIComponent(conversationId)}`;

          const response = await fetch(historyUrl, { method: 'GET', headers: { 'Accept': 'application/json' }, mode: 'cors' });

          if (!response.ok) throw new Error('Failed to fetch chat history: ' + response.status);

          const data = await response.json();
          messagesContainer.removeChild(loadingMessage);

          if (!data.messages || data.messages.length === 0) {
            ShopAIChat.Message.add(window.shopChatConfig?.welcomeMessage || "Hi! How can I help you today?", 'assistant', messagesContainer);
            return;
          }

          data.messages.forEach(message => {
            try {
              const contents = JSON.parse(message.content);
              for (const block of contents) {
                if (block.type === 'text') ShopAIChat.Message.add(block.text, message.role, messagesContainer);
              }
            } catch (e) {
              ShopAIChat.Message.add(message.content, message.role, messagesContainer);
            }
          });

          ShopAIChat.UI.scrollToBottom();
        } catch (error) {
          console.error('Error fetching chat history:', error);
          const loading = messagesContainer.querySelector('.shop-ai-message.assistant');
          if (loading && loading.textContent === 'Loading conversation history...') messagesContainer.removeChild(loading);
          ShopAIChat.Message.add(window.shopChatConfig?.welcomeMessage || "Hi! How can I help you today?", 'assistant', messagesContainer);
          sessionStorage.removeItem('shopAiConversationId');
        }
      }
    },

    Auth: {
      openAuthPopup: function(authUrl) {
        const width = 600, height = 700;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;
        const popup = window.open(authUrl, 'ShopifyAuth', `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
        if (popup) popup.focus();
        else alert('Please allow popups for this site to authenticate with Shopify.');

        const conversationId = sessionStorage.getItem('shopAiConversationId');
        if (conversationId) {
          const messagesContainer = document.querySelector('.shop-ai-chat-messages');
          ShopAIChat.Message.add('Authentication in progress. Please complete the process in the popup window.', 'assistant', messagesContainer);
          this.startTokenPolling(conversationId, messagesContainer);
        }
      },

      startTokenPolling: function(conversationId, messagesContainer) {
        if (!conversationId) return;
        const pollingId = 'polling_' + Date.now();
        sessionStorage.setItem('shopAiTokenPollingId', pollingId);
        let attemptCount = 0;
        const maxAttempts = 30;

        const poll = async () => {
          if (sessionStorage.getItem('shopAiTokenPollingId') !== pollingId || attemptCount >= maxAttempts) return;
          attemptCount++;
          try {
            const baseUrl = (window.shopChatConfig?.apiUrl || '').replace(/\/$/, '');
            const tokenUrl = `${baseUrl}/auth/token-status?conversation_id=${encodeURIComponent(conversationId)}`;
            const response = await fetch(tokenUrl);
            if (!response.ok) throw new Error('Token status check failed');
            const data = await response.json();
            if (data.status === 'authorized') {
              const message = sessionStorage.getItem('shopAiLastMessage');
              if (message) {
                sessionStorage.removeItem('shopAiLastMessage');
                setTimeout(() => {
                  ShopAIChat.Message.add('Authorization successful! Continuing with your request.', 'assistant', messagesContainer);
                  ShopAIChat.API.streamResponse(message, conversationId, messagesContainer);
                  ShopAIChat.UI.showTypingIndicator();
                }, 500);
              }
              sessionStorage.removeItem('shopAiTokenPollingId');
              return;
            }
            setTimeout(poll, 10000);
          } catch (error) {
            setTimeout(poll, 10000);
          }
        };

        setTimeout(poll, 2000);
      }
    },

    Product: {
      createCard: function(product) {
        const card = document.createElement('div');
        card.classList.add('shop-ai-product-card');
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('shop-ai-product-image');
        const image = document.createElement('img');
        image.src = product.image_url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
        image.alt = product.title;
        image.onerror = function() { this.src = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png'; };
        imageContainer.appendChild(image);
        card.appendChild(imageContainer);
        const info = document.createElement('div');
        info.classList.add('shop-ai-product-info');
        const title = document.createElement('h3');
        title.classList.add('shop-ai-product-title');
        if (product.url) {
          const link = document.createElement('a');
          link.href = product.url;
          link.target = '_blank';
          link.textContent = product.title;
          title.appendChild(link);
        } else {
          title.textContent = product.title;
        }
        info.appendChild(title);
        const price = document.createElement('p');
        price.classList.add('shop-ai-product-price');
        price.textContent = product.price;
        info.appendChild(price);
        const button = document.createElement('button');
        button.classList.add('shop-ai-add-to-cart');
        button.textContent = 'Add to Cart';
        button.addEventListener('click', function() {
          const input = document.querySelector('.shop-ai-chat-input input');
          if (input) {
            input.value = `Add ${product.title} to my cart`;
            document.querySelector('.shop-ai-chat-send')?.click();
          }
        });
        info.appendChild(button);
        card.appendChild(info);
        return card;
      }
    },

    QuickReplies: {
      container: null,
      show: function(messagesContainer) {
        const replies = window.shopChatConfig?.quickReplies;
        if (!replies || replies.length === 0) return;
        const color = window.shopChatConfig?.bubbleColor || '#5046e4';
        const container = document.createElement('div');
        container.classList.add('shop-ai-quick-replies');
        replies.forEach(reply => {
          if (!reply || !reply.trim()) return;
          const btn = document.createElement('button');
          btn.classList.add('shop-ai-quick-reply-btn');
          btn.textContent = reply;
          btn.style.setProperty('--qr-color', color);
          btn.addEventListener('click', () => {
            this.hide();
            const chatInput = ShopAIChat.UI.elements.chatInput;
            chatInput.value = reply;
            ShopAIChat.Message.send(chatInput, messagesContainer);
          });
          container.appendChild(btn);
        });
        messagesContainer.appendChild(container);
        this.container = container;
        ShopAIChat.UI.scrollToBottom();
      },
      hide: function() {
        if (this.container) { this.container.remove(); this.container = null; }
      }
    },

    init: function() {
      const container = document.querySelector('.shop-ai-chat-container');
      if (!container) return;
      this.UI.init(container);
      const conversationId = sessionStorage.getItem('shopAiConversationId');
      if (conversationId) {
        this.API.fetchChatHistory(conversationId, this.UI.elements.messagesContainer);
      } else {
        const welcomeMessage = window.shopChatConfig?.welcomeMessage || "Hi! How can I help you today?";
        this.Message.add(welcomeMessage, 'assistant', this.UI.elements.messagesContainer);
        this.QuickReplies.show(this.UI.elements.messagesContainer);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    ShopAIChat.init();
    window.openDylanChat = function(message) {
      ShopAIChat.UI.toggleChatWindow();
      if (message) {
        setTimeout(function() {
          ShopAIChat.QuickReplies.hide();
          ShopAIChat.UI.elements.chatInput.value = message;
          ShopAIChat.Message.send(ShopAIChat.UI.elements.chatInput, ShopAIChat.UI.elements.messagesContainer);
        }, 300);
      }
    };
  });
})();
