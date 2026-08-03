import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { getQuietHours, updateQuietHours } from '@/lib/api';
import type { QuietHours } from '@/lib/api';

// ─── Time helpers ─────────────────────────────────────────────────────────────
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function fmt12h(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ─── Time stepper row ─────────────────────────────────────────────────────────
function TimeRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const colors = useColors();

  function step(deltaMinutes: number) {
    Haptics.selectionAsync();
    onChange(toHHMM(toMinutes(value) + deltaMinutes));
  }

  return (
    <View style={[rowStyles.row, { borderColor: colors.border, opacity: disabled ? 0.4 : 1 }]}>
      <Text style={[rowStyles.label, { color: colors.foreground }]}>{label}</Text>
      <View style={rowStyles.stepper}>
        <TouchableOpacity
          onPress={() => step(-30)}
          disabled={disabled}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[rowStyles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <Feather name="minus" size={16} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[rowStyles.timeText, { color: colors.foreground }]}>{fmt12h(value)}</Text>
        <TouchableOpacity
          onPress={() => step(30)}
          disabled={disabled}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[rowStyles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <Feather name="plus" size={16} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    minWidth: 84,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});

// ─── Sheet ────────────────────────────────────────────────────────────────────
export function QuietHoursSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<QuietHours | null>(null);

  const configQ = useQuery({
    queryKey: ['quiet-hours'],
    queryFn: getQuietHours,
    enabled: visible,
    retry: 1,
  });

  // Seed the local draft whenever fresh server data arrives
  useEffect(() => {
    if (configQ.data) setDraft(configQ.data);
  }, [configQ.data]);

  const saveM = useMutation({
    mutationFn: updateQuietHours,
    onSuccess: (saved) => {
      queryClient.setQueryData(['quiet-hours'], saved);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    },
  });

  const config = draft;
  const dirty =
    config && configQ.data && JSON.stringify(config) !== JSON.stringify(configQ.data);
  const tz = deviceTimezone();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      transparent={Platform.OS !== 'ios'}
      onRequestClose={onClose}
    >
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Text style={[s.title, { color: colors.foreground }]}>Quiet Hours</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[s.closeBtn, { backgroundColor: colors.secondary }]}
          >
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {configQ.isLoading || !config ? (
          <View style={s.loadingBox}>
            {configQ.isError ? (
              <Text style={[s.helpText, { color: colors.mutedForeground }]}>
                Couldn't load quiet hours. Check your connection and try again.
              </Text>
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
          </View>
        ) : (
          <View style={s.body}>
            <Text style={[s.helpText, { color: colors.mutedForeground }]}>
              Pause order notifications overnight so they don't wake you. Orders still
              come in — you just won't get pinged.
            </Text>

            {/* Enable toggle */}
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[rowStyles.row, { borderBottomWidth: config.enabled ? 1 : 0, borderColor: colors.border }]}>
                <Text style={[rowStyles.label, { color: colors.foreground }]}>
                  Silence notifications
                </Text>
                <Switch
                  value={config.enabled}
                  onValueChange={(enabled) => {
                    Haptics.selectionAsync();
                    // First enable: pin the window to the device's timezone so
                    // "10 PM" means the owner's 10 PM, not UTC.
                    setDraft({
                      ...config,
                      enabled,
                      timezone: enabled && config.timezone === 'UTC' ? tz : config.timezone,
                    });
                  }}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              {config.enabled ? (
                <>
                  <TimeRow
                    label="From"
                    value={config.start}
                    onChange={(start) => setDraft({ ...config, start })}
                    disabled={!config.enabled}
                  />
                  <TimeRow
                    label="Until"
                    value={config.end}
                    onChange={(end) => setDraft({ ...config, end })}
                    disabled={!config.enabled}
                  />
                  <View style={[rowStyles.row, { borderBottomWidth: 0, borderColor: colors.border }]}>
                    <Text style={[rowStyles.label, { color: colors.foreground }]}>Timezone</Text>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDraft({ ...config, timezone: tz });
                      }}
                      disabled={config.timezone === tz}
                    >
                      <Text
                        style={[
                          s.tzText,
                          { color: config.timezone === tz ? colors.mutedForeground : colors.primary },
                        ]}
                      >
                        {config.timezone === tz
                          ? config.timezone.replace(/_/g, ' ')
                          : `Use ${tz.replace(/_/g, ' ')}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>

            {config.enabled && config.timezone !== tz ? (
              <Text style={[s.tzNote, { color: colors.mutedForeground }]}>
                Currently set to {config.timezone.replace(/_/g, ' ')} time.
              </Text>
            ) : null}

            {saveM.isError ? (
              <Text style={[s.errorText, { color: colors.destructive }]}>
                Couldn't save. Please try again.
              </Text>
            ) : null}

            {/* Save */}
            <TouchableOpacity
              onPress={() => saveM.mutate(config)}
              disabled={!dirty || saveM.isPending}
              style={[
                s.saveBtn,
                {
                  backgroundColor: colors.primary,
                  borderRadius: colors.radius,
                  opacity: !dirty || saveM.isPending ? 0.4 : 1,
                },
              ]}
            >
              {saveM.isPending ? (
                <ActivityIndicator color={colors.primaryForeground ?? '#fff'} size="small" />
              ) : (
                <Text style={[s.saveText, { color: colors.primaryForeground ?? '#fff' }]}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  body: {
    padding: 20,
  },
  helpText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  tzText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  tzNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 8,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginTop: 12,
  },
  saveBtn: {
    marginTop: 20,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});
