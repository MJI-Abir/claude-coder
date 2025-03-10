"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sdk_1 = require("@anthropic-ai/sdk");
const promises_1 = require("fs/promises");
// Maximum number of files to include in context
const MAX_FILES = 10;
// Maximum size of each file to include (in characters)
const MAX_FILE_SIZE = 100000;
let chatViewProvider;
function activate(context) {
    console.log("Claude Coder extension is now active");
    // Create our custom WebView provider
    chatViewProvider = new ChatViewProvider(context.extensionUri);
    // Register the WebView provider
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("claudeCoderChat", chatViewProvider));
    // Register the start chat command
    let startChatCommand = vscode.commands.registerCommand("claude-coder.startChat", () => {
        vscode.commands.executeCommand("workbench.view.extension.claude-coder");
    });
    context.subscriptions.push(startChatCommand);
}
class ChatViewProvider {
    _extensionUri;
    _view;
    _anthropic;
    _conversations = new Map();
    _currentConversationId = "";
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        // Initialize the API client
        this.initializeApiClient();
        // Set the HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "sendMessage":
                    await this.handleUserMessage(data.message);
                    break;
                case "createNewChat":
                    this.createNewConversation();
                    break;
            }
        });
        // Create a new conversation when the view is first loaded
        this.createNewConversation();
    }
    initializeApiClient() {
        const config = vscode.workspace.getConfiguration("claudeCoder");
        const apiKey = config.get("apiKey");
        if (!apiKey) {
            vscode.window.showWarningMessage("Anthropic API key not found. Please set it in the extension settings.");
            return;
        }
        this._anthropic = new sdk_1.Anthropic({
            apiKey,
        });
    }
    createNewConversation() {
        this._currentConversationId = `conversation-${Date.now()}`;
        this._conversations.set(this._currentConversationId, []);
        if (this._view) {
            this._view.webview.postMessage({
                type: "conversationCreated",
                conversationId: this._currentConversationId,
            });
        }
    }
    async getRelevantFilesContent() {
        try {
            let fileContents = "";
            // Get current file if any
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const document = activeEditor.document;
                const fileName = document.fileName;
                const relativePath = vscode.workspace.asRelativePath(fileName);
                const content = document.getText();
                fileContents += `File: ${relativePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
            }
            // Get other relevant files
            if (vscode.workspace.workspaceFolders) {
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                // Get most recently modified files
                const fileUris = await vscode.workspace.findFiles("**/*.{js,ts,tsx,jsx,py,html,css,json}", "**/node_modules/**", MAX_FILES);
                let addedFiles = 0;
                for (const uri of fileUris) {
                    // Skip the current file as we've already added it
                    if (activeEditor && uri.fsPath === activeEditor.document.uri.fsPath) {
                        continue;
                    }
                    try {
                        const relativePath = vscode.workspace.asRelativePath(uri);
                        const content = await (0, promises_1.readFile)(uri.fsPath, "utf8");
                        // Only include file if it's not too big
                        if (content.length <= MAX_FILE_SIZE) {
                            fileContents += `File: ${relativePath}\n\`\`\`\n${content.substring(0, MAX_FILE_SIZE)}\n\`\`\`\n\n`;
                            addedFiles++;
                            if (addedFiles >= MAX_FILES - 1) {
                                // -1 because we already added current file
                                break;
                            }
                        }
                    }
                    catch (err) {
                        console.error(`Error reading file ${uri.fsPath}:`, err);
                    }
                }
            }
            return fileContents;
        }
        catch (err) {
            console.error("Error getting relevant files:", err);
            return "";
        }
    }
    async handleUserMessage(message) {
        if (!this._anthropic) {
            vscode.window.showErrorMessage("Anthropic API client not initialized");
            return;
        }
        if (!this._view) {
            return;
        }
        // Add user message to conversation
        const conversation = this._conversations.get(this._currentConversationId) || [];
        conversation.push({ role: "user", content: message });
        // Update UI with user message
        this._view.webview.postMessage({
            type: "messageReceived",
            message: {
                role: "user",
                content: message,
            },
        });
        // Show loading indicator
        this._view.webview.postMessage({
            type: "loadingStarted",
        });
        try {
            // Get relevant code context
            const filesContent = await this.getRelevantFilesContent();
            const config = vscode.workspace.getConfiguration("claudeCoder");
            const model = config.get("model") || "claude-3-7-sonnet-20250219";
            // Prepare system message with context about being a coding assistant
            const systemMessage = `You are Claude Coder, an AI coding assistant embedded in VS Code. 
You have access to the user's codebase and can help with writing, debugging, and improving code. 
Be concise, helpful, and focus on providing working solutions. 
Use markdown formatting for code blocks with the appropriate language specified.

Here are some relevant files from the user's codebase to help you understand the context:

${filesContent}`;
            // Create messages array for the API
            const messages = [
                { role: "system", content: systemMessage },
                ...conversation,
            ];
            // Call the API
            const response = await this._anthropic.messages.create({
                model,
                messages,
                max_tokens: 4000,
            });
            // Add assistant response to conversation
            conversation.push({
                role: "assistant",
                content: response.content[0].text,
            });
            // Update UI with assistant response
            this._view.webview.postMessage({
                type: "messageReceived",
                message: {
                    role: "assistant",
                    content: response.content[0].text,
                },
            });
        }
        catch (error) {
            console.error("Error calling Anthropic API:", error);
            // Show error in UI
            this._view.webview.postMessage({
                type: "messageReceived",
                message: {
                    role: "assistant",
                    content: "Sorry, I encountered an error while processing your request.",
                },
            });
        }
        finally {
            // Hide loading indicator
            this._view.webview.postMessage({
                type: "loadingFinished",
            });
        }
    }
    _getHtmlForWebview(webview) {
        // Get path to local resources
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "main.js"));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "style.css"));
        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();
        return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link href="${styleUri}" rel="stylesheet">
      <title>Claude Coder</title>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Claude Coder</h2>
          <button id="new-chat-btn">New Chat</button>
        </div>
        <div id="chat-container"></div>
        <div class="input-container">
          <textarea id="message-input" placeholder="Ask Claude about your code..."></textarea>
          <button id="send-button">Send</button>
        </div>
      </div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
    }
}
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map