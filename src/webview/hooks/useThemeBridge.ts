import { useEffect } from 'react';

/**
 * Syncs VS Code's dark/light theme to `.dark` class on documentElement.
 * VS Code sets `data-vscode-theme-kind` on the document body.
 */
export function useThemeBridge(): void {
  useEffect(() => {
    function apply() {
      const kind = document.body.getAttribute('data-vscode-theme-kind');
      if (kind === 'vscode-light' || kind === 'vscode-high-contrast-light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    }
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind', 'class'] });
    return () => observer.disconnect();
  }, []);
}
