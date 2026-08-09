import { addIcon, Notice, Plugin } from "obsidian";
import { Soma, type SomaSettings } from "./soma";
import { ICON, SomaSearchView, VIEW } from "./search-view";
import { SomaSettingTab } from "./settings-tab";

const DEFAULTS: SomaSettings = { executable: "", mode: "vector", limit: 20 };
const ICON_SVG = `<g transform="scale(4.1666667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="11" cy="11" r="8"/>
  <path d="m21 21-4.3-4.3"/>
  <path d="M14 7h-3a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4H8"/>
</g>`;

export default class SomaSearchPlugin extends Plugin {
  settings = { ...DEFAULTS };
  soma!: Soma;

  async onload(): Promise<void> {
    addIcon(ICON, ICON_SVG);
    const saved = await this.loadData() as Partial<SomaSettings> | null;
    this.settings = { ...DEFAULTS, ...saved };
    this.soma = new Soma(this.app.vault, this.settings);
    this.registerView(VIEW, (leaf) => new SomaSearchView(leaf, this));
    this.addRibbonIcon(ICON, "Open Soma Search", () => void this.activate());
    this.addCommand({ id: "open", name: "Open search", callback: () => void this.activate() });
    this.addSettingTab(new SomaSettingTab(this));
  }

  onunload(): void {
    this.soma?.stop();
  }

  async saveSettings(commandChanged = false): Promise<void> {
    if (commandChanged) this.soma.resetCommand();
    await this.saveData(this.settings);
  }

  private async activate(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(VIEW)[0] ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) return void new Notice("Could not open the Soma Search sidebar.");
    if (leaf.getViewState().type !== VIEW) await leaf.setViewState({ type: VIEW, active: true });
    await leaf.loadIfDeferred();
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof SomaSearchView) leaf.view.focus();
  }
}
