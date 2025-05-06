# Ollamate VS Code Extension

Ollamate is a Visual Studio Code extension that integrates with local machine learning models using the Ollama API. It allows you to interact with large language models (LLMs) directly from within VS Code through a simple chat interface.

## Features

- **Model Selection:** Choose from a list of available LLM models to use for chatting.
- **Real-time Responses:** Get streaming responses from the selected model as you interact.
- **Customizable Interface:** A simple webview interface where you can enter prompts and see model responses in real-time.
- **Local Model Integration:** Leverages Ollama's API for local models, making it possible to run this extension offline.

## Installation

1. Ensure that you have [Node.js](https://nodejs.org/) and [Visual Studio Code](https://code.visualstudio.com/) installed.
2. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/yourusername/ollamate-vscode-extension.git
   ```
3. Install the necessary dependencies:
   ```bash
   npm install
   ```
4. Open the extension in VS Code:
   ```bash
   code .
   ```
5. Press `F5` to run and activate the extension in the VS Code Extension Development Host.

## Usage

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the command palette.
2. Type `ollamate: Start` and select the command to activate the chat interface.
3. Select a model from the list of available models.
4. Start typing your prompt in the text box and click "Ask" to get a response from the model.

(You can easily add more models to the `availableModels` array in the code.)

## Development

To make changes to the extension, follow these steps:

1. Make sure you have [VS Code Extension Development Tools](https://code.visualstudio.com/docs/extensions/developing-extensions) set up.
2. Make changes to the code.
3. Test your changes by pressing `F5` to open a new VS Code window with the extension loaded.
4. Package your extension using the following command:
   ```bash
   vsce package
   ```

## Dependencies

- `dotenv`: Loads environment variables from a `.env` file.
- `vscode`: Provides VS Code APIs for extension development.
- `ollama`: Integrates with Ollama's local chat API for LLM responses.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
