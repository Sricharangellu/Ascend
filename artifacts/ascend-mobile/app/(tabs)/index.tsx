import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/lib/api';
import type { Order, OrdersListResponse, SalesSummary } from '@/lib/api';
import { QuietHoursSheet } from '@/components/QuietHoursSheet';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusChipColors(
  status: Order['status'],
  colors: ReturnType<typeof useColors>,
) {
  switch (status) {
    case 'completed':
      return { bg: colors.successMuted, text: colors.success };
    case 'open':
      return { bg: colors.primaryMuted, text: colors.primary };
    case 'refunded':
      return { bg: colors.warningMuted, text: colors.warning };
    case 'voided':
      return { bg: colors.destructiveMuted, text: colors.destructive };
    default:
      return { bg: colors.muted, text: colors.mutedForeground };
  }
}

// ─── Components ───────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        kpiStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <Text style={[kpiStyles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[kpiStyles.value, { color: colors.foreground }]}>{value}</Text>
      {sub ? (
        <Text style={[kpiStyles.sub, { color: colors.mutedForeground }]}>{sub}</Text>
      ) : null}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [quietHoursOpen, setQuietHoursOpen] = useState(false);

  const summaryQ = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => apiFetch<SalesSummary>('/api/v1/reports/summary'),
    retry: 1,
    staleTime: 30_000,
  });

  const ordersQ = useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: () =>
      apiFetch<OrdersListResponse>('/api/v1/orders?limit=4&offset=0'),
    retry: 1,
    staleTime: 30_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([summaryQ.refetch(), ordersQ.refetch()]);
    setRefreshing(false);
  }, [summaryQ, ordersQ]);

  async function handleLogout() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logout();
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const s = makeStyles(colors);

  const summary = summaryQ.data;
  const orders = ordersQ.data?.items ?? [];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={s.greetText}>{greeting()},</Text>
          <Text style={s.nameText}>{user?.name ?? 'Store Owner'}</Text>
        </View>
        <View style={s.headerActions}>
        {user?.role === 'owner' ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setQuietHoursOpen(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[s.logoutBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          >
            <Feather name="moon" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={handleLogout}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[s.logoutBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <Feather name="log-out" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        </View>
      </View>

      <QuietHoursSheet visible={quietHoursOpen} onClose={() => setQuietHoursOpen(false)} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: botPad + 90 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── KPI row ── */}
        <Text style={s.sectionTitle}>Today's Overview</Text>

        {summaryQ.isLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : summaryQ.isError ? (
          <View style={[s.errorBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="wifi-off" size={18} color={colors.mutedForeground} />
            <Text style={[s.errorText, { color: colors.mutedForeground }]}>
              Connect to the database to see live data
            </Text>
          </View>
        ) : summary ? (
          <View style={s.kpiRow}>
            <KpiCard
              label="Revenue"
              value={fmtCents(summary.revenue.grossCents)}
              sub={`${summary.orders.completed} sales`}
            />
            <View style={s.kpiGap} />
            <KpiCard
              label="Transactions"
              value={String(summary.kpi.saleCount)}
              sub={`${summary.orders.open} open`}
            />
            <View style={s.kpiGap} />
            <KpiCard
              label="Avg Sale"
              value={fmtCents(summary.kpi.avgSaleValueCents)}
            />
          </View>
        ) : null}

        {/* ── Recent orders ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Recent Orders</Text>
        </View>

        {ordersQ.isLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : orders.length === 0 ? (
          <View style={[s.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="inbox" size={24} color={colors.mutedForeground} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              No orders yet
            </Text>
          </View>
        ) : (
          orders.map((order) => {
            const chip = statusChipColors(order.status, colors);
            return (
              <View
                key={order.id}
                style={[
                  s.orderRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <View style={s.orderLeft}>
                  <Text style={[s.orderNum, { color: colors.foreground }]}>
                    #{order.orderNumber}
                  </Text>
                  <Text style={[s.orderDate, { color: colors.mutedForeground }]}>
                    {fmtDate(order.createdAt)} · {order.lines.length} item
                    {order.lines.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={s.orderRight}>
                  <Text style={[s.orderTotal, { color: colors.foreground }]}>
                    {fmtCents(order.totalCents)}
                  </Text>
                  <View
                    style={[s.chip, { backgroundColor: chip.bg }]}
                  >
                    <Text style={[s.chipText, { color: chip.text }]}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    greetText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: colors.mutedForeground,
    },
    nameText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 22,
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    logoutBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      paddingHorizontal: 16,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
      marginTop: 4,
    },
    kpiRow: {
      flexDirection: 'row',
      marginBottom: 24,
    },
    kpiGap: { width: 10 },
    loadingBox: {
      height: 80,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 16,
      borderRadius: colors.radius,
      borderWidth: 1,
      marginBottom: 20,
    },
    errorText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      flex: 1,
    },
    emptyBox: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 32,
      borderRadius: colors.radius,
      borderWidth: 1,
      marginBottom: 16,
    },
    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
    },
    orderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderWidth: 1,
      marginBottom: 8,
    },
    orderLeft: { flex: 1 },
    orderRight: { alignItems: 'flex-end', gap: 6 },
    orderNum: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      marginBottom: 2,
    },
    orderDate: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
    },
    orderTotal: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
    },
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    chipText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
    },
  });
}
