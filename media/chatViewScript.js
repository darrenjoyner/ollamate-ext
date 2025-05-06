// media/chatViewScript.js

// Use an IIFE (Immediately Invoked Function Expression) to avoid polluting the global scope
(function () {
  if (typeof acquireVsCodeApi === "undefined") {
    console.error(
      "acquireVsCodeApi is not available. Make sure this script is run within a VS Code webview context."
    );

    document.body.innerHTML =
      '<p style="padding: 1em; color: var(--vscode-errorForeground);">Error: Chat UI could not initialize VS Code API.</p>';
    return;
  }

  const vscode = acquireVsCodeApi();

  const responseDiv = document.getElementById("response");
  const promptInput = document.getElementById("prompt");
  const modelNameSpan = document.getElementById("modelName");
  const sendButton = document.getElementById("send-button");
  const thinkingIndicator = document.getElementById("thinking-indicator");

  if (!responseDiv || !promptInput || !modelNameSpan || !sendButton) {
    console.error(
      "ChatView Error: One or more essential UI elements not found in the HTML (check IDs: response, prompt, modelName, send-button)."
    );

    document.body.innerHTML =
      '<p style="padding: 1em; color: var(--vscode-errorForeground);">Error: Chat UI elements are missing.</p>';
    return;
  }

  console.log("[ChatView] Element Refs:", {
    responseDiv: !!responseDiv,
    promptInput: !!promptInput,
    modelNameSpan: !!modelNameSpan,
    sendButton: !!sendButton,
    thinkingIndicator: !!thinkingIndicator,
  });

  /**
   * Send messages from the webview content back to the VS Code extension host
   * @param {*} command
   * @param {*} [data={}]
   */
  function sendMessage(command, data = {}) {
    vscode.postMessage({ command, ...data });
  }

  /**
   * Append to response
   * @param {*} text
   * @param {boolean} [isPrompt=false]
   * @return {*}
   */
  function appendToResponse(text, isPrompt = false) {
    if (!responseDiv) {
      return;
    }

    const prefix = isPrompt ? "User: " : "Model: ";
    const formattedText =
      (responseDiv.innerHTML.trim() ? "\n" : "") +
      prefix +
      text +
      (isPrompt ? "\n" : "");
    const textNode = document.createTextNode(formattedText);
    const messageElement = document.createElement("div");
    messageElement.className = isPrompt ? "user-message" : "model-message";
    messageElement.appendChild(textNode);
    responseDiv.appendChild(messageElement);
    responseDiv.scrollTop = responseDiv.scrollHeight;
  }

  /**
   * Adjust text area height
   * @return {*}
   */
  function adjustTextareaHeight() {
    if (!promptInput) {
      return;
    }
    promptInput.style.height = "auto";
    const newHeight = Math.min(promptInput.scrollHeight, 150); // Use CSS max-height value
    promptInput.style.height = newHeight + "px";
  }

  /**
   * Handle chat response
   * @param {*} message
   * @return {*}
   */
  function handleChatResponse(message) {
    if (!responseDiv) {
      return;
    }
    if (message.text) {
      const textNode = document.createTextNode(message.text);
      responseDiv.appendChild(textNode);
      responseDiv.scrollTop = responseDiv.scrollHeight;
    }
  }

  /**
   * Handle updating the model
   * @param {*} message
   * @return {*}
   */
  function handleUpdateModel(message) {
    const currentModel = message.model;
    const displayModelName = currentModel || "No Model Selected";
    const hasValidModel = !!currentModel;

    console.log(
      `[ChatView] handleUpdateModel: Received model='${currentModel}', hasValidModel=${hasValidModel}`
    );

    if (!modelNameSpan || !promptInput || !sendButton) {
      console.error(
        "[ChatView] handleUpdateModel: ERROR - UI elements not found!"
      );
      return;
    }

    modelNameSpan.textContent = `(${displayModelName})`;
    promptInput.disabled = !hasValidModel;
    promptInput.placeholder = hasValidModel
      ? "Enter your prompt here... (Shift+Enter for newline)"
      : "Select a model via the Manager to chat";
    sendButton.disabled = !hasValidModel;
    sendButton.textContent = "Send";

    console.log(
      `[ChatView] handleUpdateModel: UI updated. Input disabled=${promptInput.disabled}, Button disabled=${sendButton.disabled}`
    );
    adjustTextareaHeight();
  }

  /**
   * Handle the model is currentlly generating a reponse
   * @param {*} message
   * @return {*}
   */
  function handleSetThinking(message) {
    const thinking = message.thinking;

    if (!promptInput || !sendButton || !modelNameSpan) {
      console.error(
        "[ChatView] handleSetThinking: ERROR - UI elements not found!"
      );
      return;
    }

    const hasValidModel =
      !!modelNameSpan.textContent.match(/\(.*\)/) &&
      modelNameSpan.textContent !== "(No Model Selected)";
    let placeholderText = "";

    if (thinking) {
      placeholderText = "Processing...";
    } else if (hasValidModel) {
      placeholderText = "Enter your prompt here... (Shift+Enter for newline)";
    } else {
      placeholderText = "Select a model via the Manager to chat";
    }

    promptInput.placeholder = placeholderText;
    promptInput.disabled = thinking;
    sendButton.disabled = thinking || !hasValidModel;
    sendButton.textContent = thinking ? "Waiting..." : "Send";

    if (thinkingIndicator) {
      thinkingIndicator.style.display = thinking ? "block" : "none";
    }
    console.log(
      `[ChatView] handleSetThinking: UI updated. Input disabled=${promptInput.disabled}, Button disabled=${sendButton.disabled}`
    );
  }

  /**
   * Handle loading the chat
   * @param {*} message
   */
  function handleLoadChat(message) {
    console.log("Handling loadChat message");
    handleClearDisplay();

    if (message.messages && Array.isArray(message.messages)) {
      message.messages.forEach((msg) => {
        if (msg.role && msg.content) {
          appendToResponse(msg.content, msg.role === "user");
        }
      });
    }

    const currentModel = message.currentModel;
    const displayModelName = currentModel || "No Model Selected";
    const hasValidModel = !!currentModel;

    if (modelNameSpan) {
      modelNameSpan.textContent = `(${displayModelName})`;
    }
    if (promptInput) {
      promptInput.disabled = !hasValidModel;
      promptInput.placeholder = hasValidModel
        ? "Enter your prompt..."
        : "Select a model...";
    }
    if (sendButton) {
      sendButton.disabled = !hasValidModel;
    }

    handleSetThinking({ thinking: false }); // Ensure UI is interactive
    if (responseDiv) {
      responseDiv.scrollTop = responseDiv.scrollHeight;
    }
  }

  /**
   * Handle clearing the display
   */
  function handleClearDisplay() {
    console.log("Handling clearDisplay message");
    if (responseDiv) {
      responseDiv.innerHTML = "";
    }
    if (promptInput) {
      promptInput.value = "";
      adjustTextareaHeight();
    }
  }

  sendButton.addEventListener("click", () => {
    const text = promptInput.value.trim();
    if (text && !sendButton.disabled) {
      appendToResponse(text, true);
      sendMessage("chat", { text });
      promptInput.value = "";
      adjustTextareaHeight();
    }
  });

  promptInput.addEventListener("input", adjustTextareaHeight);

  promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sendButton.disabled) {
        sendButton.click();
      }
    }
    // Optional: Handle Escape key
    // if (event.key === 'Escape') { sendMessage('close'); }
  });

  window.addEventListener("message", (event) => {
    const message = event.data;

    switch (message.command) {
      case "chatResponse":
        handleChatResponse(message);
        break;
      case "updateModel":
        handleUpdateModel(message);
        break;
      case "setThinking":
        handleSetThinking(message);
        break;
      case "loadChat":
        handleLoadChat(message);
        break;
      case "clearDisplay":
        handleClearDisplay();
        break;
      default:
        console.warn("ChatView received unknown command:", message.command);
    }
  });

  console.log("[ChatView] Script loaded. Requesting initial model.");
  sendMessage("getModel");
  adjustTextareaHeight();
})(); // End IIFE
