import { lightTheme, type Theme } from "@rainbow-me/rainbowkit";

export function theoriseRainbowTheme(): Theme {
  const base = lightTheme({
    accentColor: "rgb(243, 159, 65)",
    accentColorForeground: "rgb(17, 17, 17)",
    borderRadius: "medium",
    fontStack: "system",
    overlayBlur: "small",
  });

  return {
    ...base,
    fonts: {
      body: "var(--font-geist-sans), system-ui, sans-serif",
    },
    colors: {
      ...base.colors,
      modalBackground: "rgb(255, 255, 255)",
      modalText: "rgb(17, 17, 17)",
      modalTextSecondary: "rgb(82, 82, 82)",
      modalBorder: "rgb(230, 230, 226)",
      generalBorder: "rgb(230, 230, 226)",
      profileForeground: "rgb(255, 255, 255)",
      profileAction: "rgb(245, 245, 242)",
      profileActionHover: "rgb(243, 159, 65)",
    },
  };
}
