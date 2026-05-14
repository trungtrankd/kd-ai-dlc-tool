import * as vscode from 'vscode';
import { readMailbox } from '../data/mailboxReader';
import { MailMessage } from '../types';

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

class AgentFolderItem extends vscode.TreeItem {
  constructor(
    public readonly agentName: string,
    public readonly messages: MailMessage[],
  ) {
    super(agentName, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${messages.length} message${messages.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('mail');
    this.contextValue = 'agentFolder';
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(public readonly message: MailMessage) {
    const label =
      message.subject ||
      (message.body ? message.body.slice(0, 60) + (message.body.length > 60 ? '...' : '') : '(no subject)');
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = `from: ${message.from}`;
    this.iconPath =
      message.type === 'result'
        ? new vscode.ThemeIcon('reply')
        : new vscode.ThemeIcon('mail');
    this.contextValue = 'messageItem';

    const bodyText = message.body || message.summary || '';
    const tooltipParts = [
      `**From:** ${message.from}`,
      `**To:** ${message.to}`,
      `**Type:** ${message.type}`,
      `**Sent:** ${message.sent_at}`,
    ];
    if (message.subject) {
      tooltipParts.push(`**Subject:** ${message.subject}`);
    }
    if (bodyText) {
      tooltipParts.push('', bodyText.slice(0, 500));
    }
    this.tooltip = new vscode.MarkdownString(tooltipParts.join('\n\n'));
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type MailNode = AgentFolderItem | MessageItem;

export class MailboxProvider implements vscode.TreeDataProvider<MailNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MailNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly workspaceRoot: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MailNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MailNode): vscode.ProviderResult<MailNode[]> {
    if (!element) {
      // Root level — group messages by recipient (to)
      const messages = readMailbox(this.workspaceRoot);
      if (messages.length === 0) {
        const empty = new vscode.TreeItem('No messages found');
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty as MailNode];
      }

      const grouped = new Map<string, MailMessage[]>();
      for (const msg of messages) {
        const key = msg.to || 'unknown';
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(msg);
      }

      return Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([agent, msgs]) => new AgentFolderItem(agent, msgs));
    }

    if (element instanceof AgentFolderItem) {
      return element.messages.map((m) => new MessageItem(m));
    }

    return [];
  }
}
