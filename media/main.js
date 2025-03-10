// Get access to the VS Code API
const vscode = acquireVsCodeApi();

// Store conversation state
let state = {
  messages: [],
  isLoading: false,
};

// Initialize elements
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const chatContainer = document.getElementById("chat-container");
const newChatButton = document.getElementById("new-chat-btn");

// Add event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Send message on button click
  sendButton.addEventListener("click", sendMessage);

  // Send message on Enter key (but allow Shift+Enter for new lines)
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Create new chat
  newChatButton.addEventListener("click", () => {
    vscode.postMessage({
      type: "createNewChat",
    });
  });
});

// Handle messages from the extension
window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "messageReceived":
      addMessageToUI(message.message);
      break;
    case "loadingStarted":
      state.isLoading = true;
      updateLoadingState();
      break;
    case "loadingFinished":
      state.isLoading = false;
      updateLoadingState();
      break;
    case "conversationCreated":
      // Clear the UI for a new conversation
      state.messages = [];
      chatContainer.innerHTML = "";
      break;
  }
});

// Send message to extension
function sendMessage() {
  const message = messageInput.value.trim();
  if (message && !state.isLoading) {
    vscode.postMessage({
      type: "sendMessage",
      message,
    });

    // Clear input
    messageInput.value = "";
  }
}

// Add a message to the UI
function addMessageToUI(message) {
  // Add to state
  state.messages.push(message);

  // Create message element
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  messageElement.classList.add(
    message.role === "user" ? "user-message" : "assistant-message"
  );

  // Create avatar
  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  avatar.textContent = message.role === "user" ? "👤" : "🤖";

  // Create content
  const content = document.createElement("div");
  content.classList.add("content");

  // Add markdown content
  content.innerHTML = markdownToHtml(message.content);

  // Add syntax highlighting to code blocks
  highlightCodeBlocks(content);

  // Assemble message
  messageElement.appendChild(avatar);
  messageElement.appendChild(content);

  // Add to chat container
  chatContainer.appendChild(messageElement);

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Simple markdown to HTML converter
function markdownToHtml(markdown) {
  let html = markdown;

  // Convert code blocks
  html = html.replace(
    /```(\w*)([\s\S]*?)```/g,
    '<pre><code class="language-$1">$2</code></pre>'
  );

  // Convert inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Convert bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Convert italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Convert headers
  html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>");

  // Convert paragraphs
  html = html.replace(/^\s*(\n)?(.+)/gm, function (m) {
    return /\<(\/)?(h1|h2|h3|pre|ul|ol|li)/.test(m) ? m : "<p>" + m + "</p>";
  });

  // Convert line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

// Highlight code blocks
function highlightCodeBlocks(element) {
  // This is just a placeholder. In a real implementation,
  // you would use a library like highlight.js or prism.js
  const codeBlocks = element.querySelectorAll("pre code");
  codeBlocks.forEach((block) => {
    block.classList.add("highlighted");
  });
}

// Update UI based on loading state
function updateLoadingState() {
  if (state.isLoading) {
    sendButton.disabled = true;
    sendButton.textContent = "...";
  } else {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
  }
}
