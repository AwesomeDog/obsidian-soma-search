import {
  ButtonComponent, ExtraButtonComponent, ItemView, MarkdownView, Notice, SearchComponent,
  SliderComponent, type WorkspaceLeaf
} from "obsidian";
import path from "node:path";
import type SomaSearchPlugin from "./main";
import { message, type Hit, type SearchMode } from "./soma";

export const VIEW = "soma-search-view";
export const ICON = "soma-search";

const MODES: Record<SearchMode, string> = { hybrid: "Hybrid", lexical: "Keyword", vector: "Semantic" };

export class SomaSearchView extends ItemView {
  private search!: SearchComponent;
  private status!: HTMLElement;
  private results!: HTMLElement;
  private timer = 0;
  private request = 0;

  constructor(leaf: WorkspaceLeaf, private plugin: SomaSearchPlugin) { super(leaf); }
  getViewType(): string { return VIEW; }
  getDisplayText(): string { return "Soma Search"; }
  getIcon(): string { return ICON; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("soma-search-content");
    const searchRow = this.contentEl.createDiv({ cls: "search-row" });
    const searchEl = searchRow.createDiv({ cls: "global-search-input-container" });
    this.search = new SearchComponent(searchEl)
      .setPlaceholder("Search...")
      .setDisabled(true)
      .onChange(() => this.schedule());
    const params = this.contentEl.createDiv({ cls: "search-params" });
    params.hide();
    const optionsButton = new ExtraButtonComponent(searchRow)
      .setIcon("sliders-horizontal")
      .setTooltip("Search options")
      .onClick(() => {
        const expanded = !optionsButton.extraSettingsEl.hasClass("is-active");
        optionsButton.extraSettingsEl.toggleClass("is-active", expanded);
        optionsButton.extraSettingsEl.setAttr("aria-expanded", String(expanded));
        params.toggle(expanded);
      });
    optionsButton.extraSettingsEl.setAttr("aria-expanded", "false");
    const modesEl = params.createDiv({ cls: "nav-buttons-container" });
    const modeButtons = new Map<SearchMode, ButtonComponent>();
    for (const [mode, label] of Object.entries(MODES) as [SearchMode, string][]) {
      const button = new ButtonComponent(modesEl).setButtonText(label).onClick(async () => {
        if (mode === this.plugin.settings.mode) return;
        this.plugin.settings.mode = mode;
        for (const [value, modeButton] of modeButtons) {
          const active = value === mode;
          modeButton.buttonEl.toggleClass("is-active", active);
          modeButton.buttonEl.setAttr("aria-pressed", String(active));
        }
        await this.plugin.saveSettings();
        this.rerun();
      });
      button.buttonEl.addClass("clickable-icon");
      button.buttonEl.addClass("nav-action-button");
      modeButtons.set(mode, button);
      const active = mode === this.plugin.settings.mode;
      button.buttonEl.toggleClass("is-active", active);
      button.buttonEl.setAttr("aria-pressed", String(active));
    }
    const limitEl = params.createDiv({ cls: "setting-item-control" });
    limitEl.setAttr("title", "Result limit");
    new SliderComponent(limitEl)
      .setLimits(5, 100, 5)
      .setDynamicTooltip()
      .setValue(this.plugin.settings.limit)
      .onChange(async (value) => {
        this.plugin.settings.limit = value;
        await this.plugin.saveSettings();
        this.rerun();
      });
    this.status = this.contentEl.createDiv({
      cls: "soma-search-status search-results-info search-results-result-count",
      attr: { role: "status", "aria-live": "polite" }
    });
    this.results = this.contentEl.createDiv({
      cls: "soma-search-results search-result-container mod-global-search"
    });
    this.registerDomEvent(this.search.inputEl, "keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      window.clearTimeout(this.timer);
      void this.runSearch();
    });
    await this.check();
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.timer);
    this.request += 1;
  }

  focus(): void {
    if (this.search.inputEl.disabled) return;
    this.search.inputEl.focus();
    this.search.inputEl.select();
  }

  private async check(): Promise<void> {
    if (!await this.plugin.soma.isInitialized()) {
      this.showSetup("Soma is not initialized for the current vault.");
      return;
    }
    this.search.setDisabled(false);
    this.setStatus("");
    this.results.empty();
    this.focus();
  }

  private showSetup(text: string, retry = false): void {
    this.search.setDisabled(true);
    this.setStatus(text, retry);
    this.results.empty();
    const button = new ButtonComponent(this.results)
      .setButtonText(retry ? "Retry" : "Initialize current vault")
      .setCta();
    button.onClick(async () => {
      button.setDisabled(true).setButtonText("Initializing...");
      this.setStatus("Initializing Soma...");
      try {
        await this.plugin.soma.initialize();
        await this.check();
        this.setStatus("Soma initialization complete.");
      } catch (error) {
        this.showSetup(message(error), true);
      }
    });
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    if (!this.search.getValue().trim()) {
      this.request += 1;
      this.setStatus("");
      this.results.empty();
      return;
    }
    this.timer = window.setTimeout(() => void this.runSearch(), 450);
  }

  private rerun(): void {
    window.clearTimeout(this.timer);
    if (this.search.getValue().trim()) void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    window.clearTimeout(this.timer);
    const query = this.search.getValue().trim();
    if (this.search.inputEl.disabled || !query) return;
    const request = ++this.request;
    this.setStatus("Searching...");
    this.results.empty();
    try {
      const response = await this.plugin.soma.search(query);
      if (request !== this.request) return;
      this.setStatus(`${response.hits.length} result${response.hits.length === 1 ? "" : "s"} · ${formatTime(response.elapsed)}`);
      for (const hit of response.hits) this.renderHit(hit);
    } catch (error) {
      if (request === this.request) this.setStatus(message(error), true);
    }
  }

  private renderHit(hit: Hit): void {
    const filePath = pathFromSoma(hit.virtualPath);
    const item = this.results.createDiv({ cls: "tree-item search-result" });
    const row = item.createDiv({
      cls: "tree-item-self is-clickable",
      attr: { role: "button", tabindex: "0", title: filePath }
    });
    const inner = row.createDiv({ cls: "tree-item-inner" });
    inner.createDiv({
      cls: "tree-item-inner-text search-result-file-title",
      text: resultTitle(hit.title, filePath)
    });
    inner.createDiv({
      cls: "tree-item-inner-subtext",
      text: (hit.snippet || hit.body || filePath).replace(/\s+/g, " ").trim()
    });
    const line = lineNumber(hit.line);
    if (line) row.createDiv({ cls: "tree-item-flair-outer" })
      .createDiv({ cls: "tree-item-flair", text: String(line) });
    const open = () => void this.openHit(filePath, line);
    row.onclick = open;
    row.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    };
  }

  private async openHit(filePath: string, line?: number): Promise<void> {
    const file = this.app.vault.getFileByPath(filePath);
    if (!file) return void new Notice(`File not found: ${filePath}`);
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    if (!line || !(leaf.view instanceof MarkdownView)) return;
    const editor = leaf.view.editor;
    const position = { line: Math.min(line - 1, Math.max(editor.lineCount() - 1, 0)), ch: 0 };
    editor.setCursor(position);
    editor.scrollIntoView({ from: position, to: position }, true);
    editor.focus();
  }

  private setStatus(text: string, error = false): void {
    this.status.setText(text);
    this.status.toggleClass("is-error", error);
  }
}

function pathFromSoma(value: string): string {
  try { return decodeURIComponent(value.replace(/^soma:\/\/[^/]+\//, "")); }
  catch { return value; }
}

function resultTitle(title: string | undefined, filePath: string): string {
  const value = title?.trim() || "";
  return value.match(/^\[([^\]]+)]\([^)]*\)$/)?.[1] || value || path.basename(filePath, path.extname(filePath));
}

function lineNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.round(value)) : undefined;
}

function formatTime(ms: number): string { return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`; }
