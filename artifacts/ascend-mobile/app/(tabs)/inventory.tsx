import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/lib/api';
import type { CatalogListResponse, TerminalProduct } from '@/lib/api';

function fmtCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function ProductRow({ item }: { item: TerminalProduct }) {
  const colors = useColors();
  const isActive = item.status === 'active';
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
        <View style={rowStyles.titleLine}>
          <Text style={[rowStyles.name, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.ageRestricted && (
            <View style={[rowStyles.badge, { backgroundColor: colors.warningMuted }]}>
              <Text style={[rowStyles.badgeText, { color: colors.warning }]}>18+</Text>
            </View>
          )}
        </View>
        <Text style={[rowStyles.sku, { color: colors.mutedForeground }]}>
          {item.sku} · {item.category}
        </Text>
      </View>
      <View style={rowStyles.right}>
        <Text style={[rowStyles.price, { color: colors.foreground }]}>
          {fmtCents(item.priceCents)}
        </Text>
        <View
          style={[
            rowStyles.statusDot,
            { backgroundColor: isActive ? colors.success : colors.destructive },
          ]}
        />
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
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    flex: 1,
  },
  sku: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  right: { alignItems: 'flex-end', gap: 6 },
  price: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function InventoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiFetch<CatalogListResponse>('/api/v1/catalog?limit=100'),
    staleTime: 60_000,
    retry: 1,
  });

  const filtered = (data?.items ?? []).filter(
    (p) =>
      search.trim() === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()),
  );

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const s = makeStyles(colors);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <Text style={s.title}>Inventory</Text>
        {data ? (
          <Text style={[s.count, { color: colors.mutedForeground }]}>
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      {/* ── Search bar ── */}
      <View style={[s.searchWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[s.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, SKU, category…"
          placeholderTextColor={colors.mutedForeground}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── List ── */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            Could not load products
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductRow item={item} />}
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
              <Feather name="box" size={32} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                {search ? 'No products match your search' : 'No products found'}
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
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: colors.radius,
      borderWidth: 1,
    },
    searchInput: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      height: '100%',
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
