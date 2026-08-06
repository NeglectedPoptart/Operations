import type { CapacitorConfig } from "@capacitor/cli";

// "Remote" mode - the native shell just opens the live deployed site in a
// WebView rather than bundling a static copy, so every push to main is
// instantly what the app shows too (same as the PWA), no separate app-store
// rebuild needed for ordinary content/feature changes. Only native-shell
// changes (icons, permissions, plugins) ever need a new store submission.
const config: CapacitorConfig = {
  appId: "com.harvestbestinc.operations",
  appName: "Operations",
  webDir: "public",
  server: {
    url: "https://operations-roan.vercel.app",
    cleartext: false,
  },
};

export default config;
