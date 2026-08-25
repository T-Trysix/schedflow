export type ThemeMode = "light" | "dark";

export function resolveTheme(setting: "light" | "dark" | "system"): ThemeMode {
  if (setting === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return setting;
}

export function applyThemeToDom(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}
