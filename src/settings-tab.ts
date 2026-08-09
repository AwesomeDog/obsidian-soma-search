import { PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type SomaSearchPlugin from "./main";

export class SomaSettingTab extends PluginSettingTab {
  constructor(private plugin: SomaSearchPlugin) { super(plugin.app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem<"executable">[] {
    return [{
      name: "Soma command",
      desc: "Optional full executable path. Otherwise tries PATH, common Homebrew locations, then ~/.local/bin.",
      control: { type: "text", key: "executable", placeholder: "soma" },
    }];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key !== "executable" || typeof value !== "string") return;
    this.plugin.settings.executable = value;
    await this.plugin.saveSettings(true);
  }
}
