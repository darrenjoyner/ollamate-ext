// media/chatViewScript.js

(function () {
    // --- Initial Checks ---
    if (typeof acquireVsCodeApi === 'undefined') {
        console.error("acquireVsCodeApi is not available.");
        return;
    }
    const vscode = acquireVsCodeApi();

    // --- DOM Element References ---
    const responseDiv = document.getElementById('response');
    const promptInput = document.getElementById('prompt');
    const modelNameSpan = document.getElementById('modelName');
    const sendButton = document.getElementById('send-button');
    const thinkingIndicator = document.getElementById('thinking-indicator');

    // --- Check Essential Elements ---
    if (!responseDiv || !promptInput || !modelNameSpan || !sendButton) {
        console.error("ChatView Error: One or more essential UI elements not found.");
        return;
    }

    // --- Helper Functions ---
    
    function sendMessage(command, data = {}) {
        vscode.postMessage({ command, ...data });
    }

    function appendToResponse(text, isPrompt = false) {
        const textNode = document.createTextNode(text);
        if (isPrompt) {
            const strong = document.createElement('strong');
            strong.appendChild(textNode);
            responseDiv.appendChild(strong);
        } else {
            responseDiv.appendChild(textNode);
        }
        responseDiv.scrollTop = responseDiv.scrollHeight;
    }

    function adjustTextareaHeight() {
        promptInput.style.height = 'auto';
        const newHeight = Math.min(promptInput.scrollHeight, 150);
        promptInput.style.height = newHeight + 'px';
    }

    // --- Command Handlers (Extracted Logic) ---

    function handleChatResponse(message) {
        if (message.clear) {
            responseDiv.innerHTML = '';
        }
        if (message.text) {
            appendToResponse(message.text, false);
        }
    }

    function handleUpdateModel(message) {
        const currentModel = message.model;
        const displayModelName = currentModel || 'No Model Selected';
        const hasValidModel = !!currentModel;

        modelNameSpan.textContent = `(${displayModelName})`;
        promptInput.disabled = !hasValidModel;
        promptInput.placeholder = hasValidModel
            ? 'Enter your prompt here... (Shift+Enter for newline)'
            : 'Select a model via the Manager to chat';

        sendButton.disabled = !hasValidModel;
        sendButton.textContent = 'Send';

        adjustTextareaHeight();
    }

    function handleSetThinking(message) {
        const thinking = message.thinking;
        const hasValidModel = !!modelNameSpan.textContent.match(/\(.*\)/) && modelNameSpan.textContent !== '(No Model Selected)';

        let placeholderText = '';
        if (thinking) {
            placeholderText = "Processing...";
        } else if (hasValidModel) {
            placeholderText = 'Enter your prompt here... (Shift+Enter for newline)';
        } else {
            placeholderText = 'Select a model via the Manager to chat';
        }
        promptInput.placeholder = placeholderText;
        promptInput.disabled = thinking;
        sendButton.disabled = thinking || !hasValidModel;
        sendButton.textContent = thinking ? 'Waiting...' : 'Send';

        if (thinkingIndicator) {
            thinkingIndicator.style.display = thinking ? 'flex' : 'none';
        }
    }

    // --- Event Listeners ---

    sendButton.addEventListener('click', () => {
        const text = promptInput.value.trim();
        if (text && !sendButton.disabled) {
            appendToResponse(`\n> ${text}\n\n`, true);
            sendMessage('chat', { text });
            promptInput.value = '';
            adjustTextareaHeight();
        }
    });

    promptInput.addEventListener('input', adjustTextareaHeight);

    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!sendButton.disabled) {
                sendButton.click();
            }
        }
    });

    window.addEventListener('message', event => {
        const message = event.data;
        console.log("ChatView received message:", message.command);

        switch (message.command) {
            case 'chatResponse':
                handleChatResponse(message);
                break;

            case 'updateModel':
                handleUpdateModel(message);
                break;

            case 'setThinking':
                handleSetThinking(message);
                break;

            default:
                console.warn("ChatView received unknown command:", message.command);
        }
    });

    // --- Initial Setup ---
    sendMessage('getModel');
    adjustTextareaHeight();

}()); // End IIFE