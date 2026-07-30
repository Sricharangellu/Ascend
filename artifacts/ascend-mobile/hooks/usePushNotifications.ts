import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { registerPushToken, unregisterPushToken } from '@/lib/api';

// Show notifications while the app is in the foreground too
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers for push notifications when the user is signed in and wires up
 * the notification-tap listener to deep-link to the relevant order.
 *
 * Must be called inside AuthProvider (needs useAuth) and after expo-router is
 * mounted (needs useRouter).
 */
export function usePushNotifications(): void {
  const { user } = useAuth();
  const router = useRouter();
  // Keep the token around so we can unregister it on logout
  const tokenRef = useRef<string | null>(null);

  // ── Permission + token registration ──────────────────────────────────────
  useEffect(() => {
    // Push notifications are not supported on web
    if (Platform.OS === 'web') return;
    if (!user) return;

    let cancelled = false;

    async function setup() {
      // Request permission (asks the OS dialog on first call)
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (existing !== 'granted') {
        const { status: asked } = await Notifications.requestPermissionsAsync();
        status = asked;
      }
      if (status !== 'granted' || cancelled) return;

      // Obtain the Expo push token
      let tokenData: Notifications.ExpoPushToken;
      try {
        tokenData = await Notifications.getExpoPushTokenAsync();
      } catch {
        // Device may not support push (e.g. iOS simulator without push entitlement)
        return;
      }
      if (cancelled) return;

      tokenRef.current = tokenData.data;

      // Register the token with our backend so the API server can fan out notifications
      try {
        await registerPushToken(
          tokenData.data,
          Platform.OS as 'ios' | 'android',
        );
      } catch {
        // Best-effort — a registration failure should never crash the app
      }
    }

    setup();

    return () => {
      cancelled = true;
    };
  }, [user?.id]); // Re-run only when the logged-in user changes

  // ── Unregister on logout ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user && tokenRef.current) {
      const token = tokenRef.current;
      tokenRef.current = null;
      unregisterPushToken(token).catch(() => {});
    }
  }, [user]);

  // ── Notification tap → deep-link to Orders ────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as {
          screen?: string;
          orderId?: string;
        };
        if (data?.screen === 'orders') {
          router.navigate({
            pathname: '/(tabs)/orders',
            params: { highlightId: data.orderId ?? '' },
          });
        }
      },
    );

    return () => sub.remove();
  }, [router]);
}
