// media/chatViewScript.js
(function () {
    // ... (api check, element refs, helpers) ...

    function appendToResponse(text, isPrompt = false) {
        const prefix = isPrompt ? 'User: ' : 'Model: ';
        const formattedText = (responseDiv.innerHTML ? '\n' : '') + prefix + text + (isPrompt ? '\n' : ''); // Add newline before, and after user prompt
        const textNode = document.createTextNode(formattedText);
        const messageElement = document.createElement('div');
        messageElement.className = isPrompt ? 'user-message' : 'model-message';
        messageElement.appendChild(textNode);
        responseDiv.appendChild(messageElement);
        responseDiv.scrollTop = responseDiv.scrollHeight;
    }

    // --- Command Handlers ---
    function handleChatResponse(message) {
        if (message.text) {
            // Append AI response chunk (no prefix added here)
            const textNode = document.createTextNode(message.text);
            responseDiv.appendChild(textNode);
            responseDiv.scrollTop = responseDiv.scrollHeight;
        }
    }

    function handleUpdateModel(message) {
         const currentModel = message.model; // This is the *currently selected* model
         const displayModelName = currentModel || 'No Model Selected';
         const hasValidModel = !!currentModel;

         // Update the main model display span
         modelNameSpan.textContent = `(${displayModelName})`;

         // Enable/disable based on *currently selected* model
         promptInput.disabled = !hasValidModel;
         promptInput.placeholder = hasValidModel
             ? 'Enter your prompt here...'
             : 'Select a model via the Manager to chat';
         sendButton.disabled = !hasValidModel; // Also disable send button if no model selected
         adjustTextareaHeight();
    }

    function handleSetThinking(message) { /* ... same as before ... */ }

    function handleLoadChat(message) {
        console.log("Handling loadChat message");
        // Clear display first
        handleClearDisplay();

        // Render loaded messages
        if (message.messages && Array.isArray(message.messages)) {
            message.messages.forEach(msg => {
                if (msg.role && msg.content) {
                    appendToResponse(msg.content, msg.role === 'user');
                }
            });
        }

        // Update model display - show *currently selected* model for new prompts
        // The historical model used is shown in the history list itself
         const currentModel = message.currentModel; // Model currently selected in extension
         const displayModelName = currentModel || 'No Model Selected';
         const hasValidModel = !!currentModel;

         modelNameSpan.textContent = `(${displayModelName})`;
         promptInput.disabled = !hasValidModel;
         promptInput.placeholder = hasValidModel ? 'Enter your prompt...' : 'Select a model...';
         sendButton.disabled = !hasValidModel;

         handleSetThinking({ thinking: false }); // Ensure UI is interactive
         if (responseDiv) { responseDiv.scrollTop = responseDiv.scrollHeight; } // Scroll to bottom
    }

    // Handle explicit clear command from extension
    function handleClearDisplay() {
        console.log("Handling clearDisplay message");
        if (responseDiv) {responseDiv.innerHTML = '';}
        if (promptInput) { promptInput.value = ''; adjustTextareaHeight(); }
        // Don't necessarily clear the model name here
    }

    // --- Event Listeners ---
    sendButton.addEventListener('click', () => {
        const text = promptInput.value.trim();
        if (text && !sendButton.disabled) {
            // Display user prompt immediately for better UX
             appendToResponse(text, true); // Display formatted user prompt
            sendMessage('chat', { text }); // Send raw text to extension
            promptInput.value = '';
            adjustTextareaHeight();
        }
    });
    // ... (input, keydown) ...

    // --- Main Message Listener ---
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'chatResponse': handleChatResponse(message); break;
            case 'updateModel': handleUpdateModel(message); break;
            case 'setThinking': handleSetThinking(message); break;
            case 'loadChat': handleLoadChat(message); break;
            case 'clearDisplay': handleClearDisplay(); break; // Handle explicit clear
            default: console.warn("ChatView received unknown command:", message.command);
        }
    });

    // --- Initial Setup ---
    sendMessage('getModel');
    adjustTextareaHeight();
}());