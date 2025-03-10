# Claude Coder - VS Code Extension

![Claude Coder Icon](https://github.com/yourusername/claude-coder/raw/main/resources/icon.png)

## Overview

Claude Coder is a VS Code extension that provides AI-powered coding assistance using Claude 3.7 Sonnet. It analyzes your codebase and helps you write, debug, and improve your code through a convenient chat interface.

## Features

- **Full Codebase Analysis**: Claude Coder analyzes your current file and other relevant files in your workspace to provide context-aware assistance.
- **Integrated Chat Interface**: Communicate with Claude directly within VS Code.
- **Markdown Support**: Code snippets and explanations are properly formatted with syntax highlighting.
- **Customizable**: Configure your API key and model preferences.

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Claude Coder"
4. Click Install

### From VSIX File

1. Download the `.vsix` file from the [releases page](https://github.com/yourusername/claude-coder/releases)
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click on the `...` menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

## Setup

1. Get an API key from [Anthropic](https://www.anthropic.com/)
2. Open VS Code settings (Ctrl+,)
3. Search for "Claude Coder"
4. Enter your API key in the "Claude Coder: API Key" field

## Usage

1. Click on the Claude Coder icon in the activity bar or run the "Claude Coder: Start Chat" command
2. Type your coding question in the chat input
3. Press Enter or click Send to get AI assistance

### Example Prompts

- "Explain how this function works"
- "Refactor this code to be more efficient"
- "Help me debug this error"
- "Generate a unit test for this class"
- "Suggest improvements for this algorithm"

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Building From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-coder.git
cd claude-coder

# Install dependencies
npm install

# Compile
npm run compile

# Package as VSIX
npx vsce package
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Anthropic](https://www.anthropic.com/) for providing the Claude AI model
- [VS Code Extension API](https://code.visualstudio.com/api) for making this extension possible