import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useNetwork } from '@/contexts/NetworkContext';

/**
 * Global banner shown when the API server is unreachable.
 * Rendered above the navigator so it appears on every screen and gives
 * the owner a way to retry without force-quitting the app.
 */
export function OfflineBanner() {
  const { isOffline, isRetrying, retry } = useNetwork();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  if (!isOffline) return null;

  const handleRetry = async () => {
    await retry();
    // Re-run any queries that failed while the server was unreachable.
    queryClient.invalidateQueries();
  };

  return (
    <View
      style={[
        styles.banner,
        {
          paddingTop: insets.top + 10,
          backgroundColor: colors.destructive,
        },
      ]}
      accessibilityRole="alert"
    >
      <Feather name="wifi-off" size={16} color={colors.destructiveForeground} />
      <Text style={[styles.text, { color: colors.destructiveForeground }]}>
        Can’t reach the server
      </Text>
      <Pressable
        onPress={handleRetry}
        disabled={isRetrying}
        accessibilityRole="button"
        accessibilityLabel="Retry connection"
        style={({ pressed }) => [
          styles.retryButton,
          {
            backgroundColor: colors.destructiveForeground,
            opacity: pressed || isRetrying ? 0.7 : 1,
          },
        ]}
      >
        {isRetrying ? (
          <ActivityIndicator size="small" color={colors.destructive} />
        ) : (
          <Text style={[styles.retryText, { color: colors.destructive }]}>
            Retry
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  retryButton: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
