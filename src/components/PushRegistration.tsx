"use client";

import { useEffect } from "react";
import { registerPushToken } from "@/app/actions";

// Renders nothing - just registers this device for push once, whenever
// mounted inside the native app shell. Dynamic imports keep @capacitor/core
// and the push plugin out of the regular web/PWA bundle entirely, since
// Capacitor.isNativePlatform() is false there and none of this ever runs.
export default function PushRegistration() {
  useEffect(() => {
    let cancelled = false;
    let removeListeners: (() => void) | undefined;

    async function setup() {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { PushNotifications } = await import("@capacitor/push-notifications");

      const registrationListener = await PushNotifications.addListener("registration", (token) => {
        if (cancelled) return;
        const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
        registerPushToken(token.value, platform).catch(() => {});
      });
      const errorListener = await PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration failed:", err);
      });
      removeListeners = () => {
        registrationListener.remove();
        errorListener.remove();
      };

      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") {
        permission = await PushNotifications.requestPermissions();
      }
      if (permission.receive !== "granted") return;
      await PushNotifications.register();
    }

    setup().catch((err) => console.error("Push setup failed:", err));

    return () => {
      cancelled = true;
      removeListeners?.();
    };
  }, []);

  return null;
}
