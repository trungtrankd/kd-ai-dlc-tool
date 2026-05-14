import * as vscode from 'vscode';

export interface AgentStyle {
  iconId: string;
  color: string; // hex for webview use
  themeColor?: vscode.ThemeColor;
}

const AGENT_STYLES: Record<string, AgentStyle> = {
  'tech-lead': { iconId: 'account', color: '#d2a8ff', themeColor: new vscode.ThemeColor('charts.purple') },
  'frontend': { iconId: 'browser', color: '#56d364', themeColor: new vscode.ThemeColor('charts.green') },
  'developer-frontend': { iconId: 'browser', color: '#56d364', themeColor: new vscode.ThemeColor('charts.green') },
  'backend': { iconId: 'server', color: '#79c0ff', themeColor: new vscode.ThemeColor('charts.blue') },
  'developer-backend': { iconId: 'server', color: '#79c0ff', themeColor: new vscode.ThemeColor('charts.blue') },
  'database': { iconId: 'database', color: '#e3b341', themeColor: new vscode.ThemeColor('charts.yellow') },
  'developer-database': { iconId: 'database', color: '#e3b341', themeColor: new vscode.ThemeColor('charts.yellow') },
  'devops': { iconId: 'cloud', color: '#f0883e', themeColor: new vscode.ThemeColor('charts.orange') },
  'developer-devops': { iconId: 'cloud', color: '#f0883e', themeColor: new vscode.ThemeColor('charts.orange') },
  'security': { iconId: 'shield', color: '#ff7b72', themeColor: new vscode.ThemeColor('charts.red') },
  'developer-security': { iconId: 'shield', color: '#ff7b72', themeColor: new vscode.ThemeColor('charts.red') },
  'qa': { iconId: 'beaker', color: '#39d353', themeColor: new vscode.ThemeColor('charts.green') },
  'qa-engineer': { iconId: 'beaker', color: '#39d353', themeColor: new vscode.ThemeColor('charts.green') },
  'product-owner': { iconId: 'person', color: '#ffa657', themeColor: new vscode.ThemeColor('charts.orange') },
  'developer': { iconId: 'code', color: '#79c0ff', themeColor: new vscode.ThemeColor('charts.blue') },
};

const DEFAULT_STYLE: AgentStyle = {
  iconId: 'person',
  color: '#8b949e',
  themeColor: new vscode.ThemeColor('charts.foreground'),
};

/**
 * Returns the display style for a given agent name.
 * Falls back to a partial-match check before using the default.
 */
export function getAgentStyle(agentName: string): AgentStyle {
  if (!agentName) {
    return DEFAULT_STYLE;
  }
  const lower = agentName.toLowerCase();
  if (AGENT_STYLES[lower]) {
    return AGENT_STYLES[lower];
  }
  // partial match
  for (const key of Object.keys(AGENT_STYLES)) {
    if (lower.includes(key) || key.includes(lower)) {
      return AGENT_STYLES[key];
    }
  }
  return DEFAULT_STYLE;
}
