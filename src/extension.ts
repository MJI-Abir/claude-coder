import * as vscode from "vscode";
import { Anthropic } from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { normalize, join } from "path";

// Maximum number of files to include in context
const MAX_FILES = 10;
// Maximum size of each file to include (in characters)
const MAX_FILE_SIZE = 100000;

export function activate(context: vscode.ExtensionContext) {
  console.log("Claude Coder extension is now active");

  // Create our custom WebView provider
  const chatViewProvider = new ChatViewProvider(context.extensionUri);

  // Register the WebView provider - THIS IS THE CRITICAL PART
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "claudeCoderChat", // Make sure this matches exactly with the ID in package.json
      chatViewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true, // Keep the chat history when the panel is not visible
        },
      }
    )
  );

  // Register the start chat command
  let startChatCommand = vscode.commands.registerCommand(
    "claude-coder.startChat",
    () => {
      vscode.commands.executeCommand("workbench.view.extension.claude-coder");
    }
  );

  context.subscriptions.push(startChatCommand);
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _anthropic?: Anthropic;
  private _conversations: Map<string, any[]> = new Map();
  private _currentConversationId: string = "";

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    console.log("Resolving WebView for Claude Coder");
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
      console.log("Received message from webview:", data.type);

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

  private initializeApiClient() {
    console.log("Initializing Anthropic API client");
    const config = vscode.workspace.getConfiguration("claudeCoder");
    const apiKey = config.get<string>("apiKey");

    if (!apiKey) {
      vscode.window.showWarningMessage(
        "Anthropic API key not found. Please set it in the extension settings."
      );
      return;
    }

    this._anthropic = new Anthropic({
      apiKey,
    });
  }

  private createNewConversation() {
    console.log("Creating new conversation");
    this._currentConversationId = `conversation-${Date.now()}`;
    this._conversations.set(this._currentConversationId, []);

    if (this._view) {
      this._view.webview.postMessage({
        type: "conversationCreated",
        conversationId: this._currentConversationId,
      });
    }
  }

  private async getRelevantFilesContent(): Promise<string> {
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
        const fileUris = await vscode.workspace.findFiles(
          "**/*.{js,ts,tsx,jsx,py,html,css,json}",
          "**/node_modules/**",
          MAX_FILES
        );

        let addedFiles = 0;
        for (const uri of fileUris) {
          // Skip the current file as we've already added it
          if (activeEditor && uri.fsPath === activeEditor.document.uri.fsPath) {
            continue;
          }

          try {
            const relativePath = vscode.workspace.asRelativePath(uri);
            const content = await readFile(uri.fsPath, "utf8");

            // Only include file if it's not too big
            if (content.length <= MAX_FILE_SIZE) {
              fileContents += `File: ${relativePath}\n\`\`\`\n${content.substring(
                0,
                MAX_FILE_SIZE
              )}\n\`\`\`\n\n`;
              addedFiles++;

              if (addedFiles >= MAX_FILES - 1) {
                // -1 because we already added current file
                break;
              }
            }
          } catch (err) {
            console.error(`Error reading file ${uri.fsPath}:`, err);
          }
        }
      }

      return fileContents;
    } catch (err) {
      console.error("Error getting relevant files:", err);
      return "";
    }
  }

  // Fix for the Anthropic API call - update the handleUserMessage method in your ChatViewProvider class

  private async handleUserMessage(message: string) {
    if (!this._anthropic) {
      vscode.window.showErrorMessage("Anthropic API client not initialized");
      return;
    }

    if (!this._view) {
      return;
    }

    // Add user message to conversation
    const conversation =
      this._conversations.get(this._currentConversationId) || [];
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
      const model = config.get<string>("model") || "claude-3-7-sonnet-20250219";

      // Prepare system message
      const systemMessage = `You are Claude Coder, an AI coding assistant embedded in VS Code. 
You have access to the user's codebase and can help with writing, debugging, and improving code. 
Be concise, helpful, and focus on providing working solutions. 
Use markdown formatting for code blocks with the appropriate language specified.

Here are some relevant files from the user's codebase to help you understand the context:

${filesContent}`;

      // Create messages array for the API - FIXED FORMAT
      const messageParams: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "user",
          content: message,
        },
      ];

      // Add previous conversation messages if any
      const previousMessages = conversation.slice(0, -1); // Exclude the message we just added
      if (previousMessages.length > 0) {
        messageParams.unshift(...previousMessages);
      }

      console.log("Calling Anthropic API with model:", model);

      // Call the API with the CORRECT FORMAT - system goes in its own parameter
      const response = await this._anthropic.messages.create({
        model,
        system: systemMessage,
        messages: messageParams,
        max_tokens: 4000,
      });

      console.log("Received response from Anthropic API");

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
    } catch (error) {
      console.error("Error calling Anthropic API:", error);

      // Show error in UI
      this._view.webview.postMessage({
        type: "messageReceived",
        message: {
          role: "assistant",
          content:
            "Sorry, I encountered an error while processing your request. " +
            JSON.stringify(error),
        },
      });
    } finally {
      // Hide loading indicator
      this._view.webview.postMessage({
        type: "loadingFinished",
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get path to local resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "style.css")
    );

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
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function deactivate() {}
