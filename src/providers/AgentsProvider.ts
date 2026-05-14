import * as vscode from 'vscode';
import { AgentDef, readAgents } from '../data/agentReader';

// ---------------------------------------------------------------------------
// Icons & colors per agent role
// ---------------------------------------------------------------------------

function agentIcon(name: string): vscode.ThemeIcon {
  if (name.includes('tech-lead'))  return new vscode.ThemeIcon('telescope',   new vscode.ThemeColor('charts.purple'));
  if (name.includes('frontend'))   return new vscode.ThemeIcon('browser',     new vscode.ThemeColor('charts.green'));
  if (name.includes('backend'))    return new vscode.ThemeIcon('server',      new vscode.ThemeColor('charts.blue'));
  if (name.includes('database'))   return new vscode.ThemeIcon('database',    new vscode.ThemeColor('charts.yellow'));
  if (name.includes('devops'))     return new vscode.ThemeIcon('cloud',       new vscode.ThemeColor('charts.orange'));
  if (name.includes('security'))   return new vscode.ThemeIcon('shield',      new vscode.ThemeColor('charts.red'));
  if (name.includes('qa'))         return new vscode.ThemeIcon('beaker',      new vscode.ThemeColor('charts.green'));
  if (name.includes('product-owner')) return new vscode.ThemeIcon('person',   new vscode.ThemeColor('charts.purple'));
  if (name.includes('orchestrator'))  return new vscode.ThemeIcon('workflow', new vscode.ThemeColor('charts.blue'));
  return new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.blue'));
}

function modelIcon(model: string): vscode.ThemeIcon {
  if (model.includes('opus'))   return new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.purple'));
  if (model.includes('sonnet')) return new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.blue'));
  if (model.includes('haiku'))  return new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.green'));
  return new vscode.ThemeIcon('sparkle');
}

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

export class AgentRootItem extends vscode.TreeItem {
  constructor(public readonly agent: AgentDef) {
    super(agent.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description  = agent.model || '';
    this.iconPath     = agentIcon(agent.name);
    this.contextValue = 'agentRoot';
    this.tooltip      = new vscode.MarkdownString(
      `**${agent.name}**\n\n${agent.description}\n\n` +
      `- Model: \`${agent.model}\`\n` +
      `- Tools: ${agent.tools.join(', ')}\n` +
      `- Permission: \`${agent.permissionMode}\``,
    );
    this.command = {
      command: 'agentDashboard.openAgentFile',
      title: 'Open agent file',
      arguments: [agent.filePath],
    };
  }
}

class AgentDetailItem extends vscode.TreeItem {
  constructor(label: string, detail: string, icon: vscode.ThemeIcon, tooltip?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description  = detail;
    this.iconPath     = icon;
    this.tooltip      = tooltip ?? `${label}: ${detail}`;
    this.contextValue = 'agentDetail';
  }
}

class ToolItem extends vscode.TreeItem {
  constructor(tool: string) {
    super(tool, vscode.TreeItemCollapsibleState.None);
    this.iconPath     = new vscode.ThemeIcon('tools');
    this.contextValue = 'agentTool';
    this.tooltip      = `Tool: ${tool}`;
  }
}

class ToolsGroupItem extends vscode.TreeItem {
  constructor(public readonly tools: string[]) {
    super(`Tools (${tools.length})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath     = new vscode.ThemeIcon('extensions');
    this.description  = tools.join(', ');
    this.contextValue = 'toolsGroup';
    this.tooltip      = tools.join(', ');
  }
}

class DescriptionItem extends vscode.TreeItem {
  constructor(description: string) {
    super('Description', vscode.TreeItemCollapsibleState.None);
    this.description  = description.length > 80 ? description.slice(0, 77) + '…' : description;
    this.iconPath     = new vscode.ThemeIcon('info');
    this.tooltip      = new vscode.MarkdownString(description);
    this.contextValue = 'agentDetail';
  }
}

// ---------------------------------------------------------------------------
// Union type for all nodes in the tree
// ---------------------------------------------------------------------------

type AgentNode = AgentRootItem | AgentDetailItem | ToolsGroupItem | ToolItem | DescriptionItem | vscode.TreeItem;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class AgentsProvider implements vscode.TreeDataProvider<AgentNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly workspaceRoot: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AgentNode): vscode.ProviderResult<AgentNode[]> {
    // Root level — list all agents
    if (!element) {
      const agents = readAgents(this.workspaceRoot);
      if (!agents.length) {
        const empty = new vscode.TreeItem('No agents found in .claude/agents/');
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty];
      }
      return agents.map((a) => new AgentRootItem(a));
    }

    // Agent root expanded — show detail rows
    if (element instanceof AgentRootItem) {
      const a = element.agent;
      const items: AgentNode[] = [
        new DescriptionItem(a.description),
        new ToolsGroupItem(a.tools),
        new AgentDetailItem(
          'Model',
          a.model,
          modelIcon(a.model),
          `Claude model: ${a.model}`,
        ),
        new AgentDetailItem(
          'Permission',
          a.permissionMode,
          new vscode.ThemeIcon(
            a.permissionMode === 'bypassPermissions' ? 'unlock' : 'lock',
            new vscode.ThemeColor(
              a.permissionMode === 'bypassPermissions' ? 'charts.green' : 'charts.yellow',
            ),
          ),
          `Permission mode: ${a.permissionMode}`,
        ),
      ];
      return items;
    }

    // Tools group expanded — show individual tool items
    if (element instanceof ToolsGroupItem) {
      return element.tools.map((t) => new ToolItem(t));
    }

    return [];
  }
}
