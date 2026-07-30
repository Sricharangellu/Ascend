import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/lib/api';
import type { Order, OrdersListResponse } from '@/lib/api';

type StatusFilter = 'all' | Order['status'];

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'completed', label: 'Completed' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'voided', label: 'Voided' },
];

function fmtCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function chipColors(
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

function OrderRow({ order }: { order: Order }) {
  const colors = useColors();
  const chip = chipColors(order.status, colors);
  return (
    <View
      style={[
        rowStyles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={rowStyles.left}>
        <Text style={[rowStyles.num, { color: colors.foreground }]}>
          #{order.orderNumber}
        </Text>
        <Text style={[rowStyles.meta, { color: colors.mutedForeground }]}>
          {fmtDate(order.createdAt)} · {order.lines.length} item
          {order.lines.length !== 1 ? 's' : ''}
        </Text>
      </View>
      <View style={rowStyles.right}>
        <Text style={[rowStyles.total, { color: colors.foreground }]}>
          {fmtCents(order.totalCents)}
        </Text>
        <View style={[rowStyles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[rowStyles.chipText, { color: chip.text }]}>
            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  left: { flex: 1, marginRight: 12 },
  num: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    marginBottom: 2,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  right: { alignItems: 'flex-end', gap: 6 },
  total: {
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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => apiFetch<OrdersListResponse>('/api/v1/orders?limit=50&offset=0'),
    staleTime: 20_000,
    retry: 1,
  });

  const displayed = (data?.items ?? []).filter(
    (o) => activeFilter === 'all' || o.status === activeFilter,
  );

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  async function selectFilter(f: StatusFilter) {
    if (f === activeFilter) return;
    await Haptics.selectionAsync();
    setActiveFilter(f);
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const s = makeStyles(colors);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <Text style={s.title}>Orders</Text>
        {data ? (
          <Text style={[s.count, { color: colors.mutedForeground }]}>
            {displayed.length} order{displayed.length !== 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {FILTERS.map((f) => {
          const active = f.key === activeFilter;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => selectFilter(f.key)}
              style={[
                s.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  s.filterText,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── List ── */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            Could not load orders
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow order={item} />}
          contentContainerStyle={[s.list, { paddingBottom: botPad + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Feather name="clipboard" size={32} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                {activeFilter === 'all' ? 'No orders yet' : `No ${activeFilter} orders`}
              </Text>
            </View>
          }
        />
      )}
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
      paddingBottom: 12,
    },
    title: {
      fontFamily: 'Inter_700Bold',
      fontSize: 28,
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    count: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      paddingBottom: 4,
    },
    filterRow: {
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 12,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
    },
    filterText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
    },
    list: {
      paddingHorizontal: 16,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 60,
    },
    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
    },
  });
}
