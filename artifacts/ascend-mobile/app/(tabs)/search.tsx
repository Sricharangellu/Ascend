import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/lib/api';
import type { CatalogListResponse, TerminalProduct } from '@/lib/api';

function fmtCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

const CATEGORIES = ['Coffee', 'Pastry', 'Cold Drinks', 'Specialty', 'Other'];

function ProductCard({ item }: { item: TerminalProduct }) {
  const colors = useColors();
  return (
    <View
      style={[
        cardStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={cardStyles.top}>
        <Text style={[cardStyles.name, { color: colors.foreground }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[cardStyles.price, { color: colors.primary }]}>
          {fmtCents(item.priceCents)}
        </Text>
      </View>
      <View style={cardStyles.bottom}>
        <View style={[cardStyles.catBadge, { backgroundColor: colors.primaryMuted }]}>
          <Text style={[cardStyles.catText, { color: colors.primary }]}>
            {item.category}
          </Text>
        </View>
        <Text style={[cardStyles.sku, { color: colors.mutedForeground }]}>
          {item.sku}
        </Text>
        {item.ageRestricted && (
          <View style={[cardStyles.ageBadge, { backgroundColor: colors.warningMuted }]}>
            <Text style={[cardStyles.ageText, { color: colors.warning }]}>18+</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  price: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  sku: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    flex: 1,
  },
  ageBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ageText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Auto-focus search on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiFetch<CatalogListResponse>('/api/v1/catalog?limit=100'),
    staleTime: 60_000,
    retry: 1,
  });

  const results = useMemo(() => {
    const all = data?.items ?? [];
    return all.filter((p) => {
      const matchesQuery =
        query.trim() === '' ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase());
      const matchesCat =
        activeCategory === null ||
        p.category.toLowerCase() === activeCategory.toLowerCase();
      return matchesQuery && matchesCat;
    });
  }, [data, query, activeCategory]);

  const handleCategoryPress = useCallback(
    async (cat: string) => {
      await Haptics.selectionAsync();
      setActiveCategory((prev) => (prev === cat ? null : cat));
    },
    [],
  );

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const s = makeStyles(colors);
  const hasInput = query.trim().length > 0 || activeCategory !== null;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Search header ── */}
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <Text style={s.title}>Search</Text>
        <View
          style={[
            s.inputWrap,
            { backgroundColor: colors.input, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            ref={inputRef}
            style={[s.input, { color: colors.foreground }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search products, SKU…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category filter pills */}
        <View style={s.catRow}>
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => handleCategoryPress(cat)}
                style={[
                  s.catChip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    s.catChipText,
                    {
                      color: active
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Results ── */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !hasInput ? (
        <View style={s.center}>
          <View style={[s.iconCircle, { backgroundColor: colors.primaryMuted }]}>
            <Feather name="search" size={28} color={colors.primary} />
          </View>
          <Text style={[s.promptTitle, { color: colors.foreground }]}>
            Search products
          </Text>
          <Text style={[s.promptSub, { color: colors.mutedForeground }]}>
            Find any item by name, SKU, or category
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={s.center}>
          <Feather name="search" size={32} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            No products match "{query}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductCard item={item} />}
          contentContainerStyle={[s.list, { paddingBottom: botPad + 90 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <Text style={[s.resultCount, { color: colors.mutedForeground }]}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </Text>
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
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    title: {
      fontFamily: 'Inter_700Bold',
      fontSize: 28,
      color: colors.foreground,
      letterSpacing: -0.5,
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      height: 46,
      borderRadius: colors.radius,
      borderWidth: 1,
      marginBottom: 12,
    },
    input: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      height: '100%',
    },
    catRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingBottom: 4,
    },
    catChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
    },
    catChipText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
    },
    list: {
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    resultCount: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      marginBottom: 8,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 32,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    promptTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 17,
    },
    promptSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      textAlign: 'center',
    },
  });
}
