"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type FontSize = "sm" | "md" | "lg";
type Theme = "dark" | "light";

interface DisplaySettings {
  fontSize: FontSize;
  theme: Theme;
  setFontSize: (size: FontSize) => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "lms-display-settings";

const defaultSettings: Pick<DisplaySettings, "fontSize" | "theme"> = {
  fontSize: "md",
  theme: "dark",
};

const DisplaySettingsContext = createContext<DisplaySettings>({
  ...defaultSettings,
  setFontSize: () => {},
  setTheme: () => {},
});

function applyThemeClass(theme: Theme) {
  if (typeof document !== "undefined") {
    if (theme === "light") {
      document.documentElement.classList.add("theme-light");
    } else {
      document.documentElement.classList.remove("theme-light");
    }
  }
}

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(defaultSettings.fontSize);
  const [theme, setThemeState] = useState<Theme>(defaultSettings.theme);

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.fontSize) setFontSizeState(parsed.fontSize);
        if (parsed.theme) {
          setThemeState(parsed.theme);
          applyThemeClass(parsed.theme);
        }
      }
    } catch {
      // Ignore invalid stored data
    }
  }, []);

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const current = stored ? JSON.parse(stored) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, fontSize: size }));
    } catch {
      // Ignore storage errors
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyThemeClass(newTheme);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const current = stored ? JSON.parse(stored) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, theme: newTheme }));
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <DisplaySettingsContext.Provider value={{ fontSize, theme, setFontSize, setTheme }}>
      {children}
    </DisplaySettingsContext.Provider>
  );
}

export function useDisplaySettings() {
  return useContext(DisplaySettingsContext);
}

export function getFontSizeClass(size: FontSize): string {
  switch (size) {
    case "sm":
      return "prose-sm";
    case "md":
      return "prose-base";
    case "lg":
      return "prose-lg";
  }
}
