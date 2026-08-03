import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { apiFetch, completeOrder, refundOrder, voidOrder } from '@/lib/api';
import type { Order, OrderLine, OrdersListResponse } from '@/lib/api';

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

// ─── Toast ────────────────────────────────────────────────────────────────────
type ToastKind = 'success' | 'error';
interface ToastState {
  message: string;
  kind: ToastKind;
  key: number;
}

function Toast({
  toast,
  colors,
}: {
  toast: ToastState | null;
  colors: ReturnType<typeof useColors>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    translateY.setValue(-12);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();

    const hide = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: true }),
      ]).start();
    }, 2600);
    return () => clearTimeout(hide);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.key]);

  if (!toast) return null;
  const bg = toast.kind === 'success' ? colors.success : colors.destructive;

  return (
    <Animated.View
      style={[
        toastStyles.container,
        { backgroundColor: bg, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <Feather
        name={toast.kind === 'success' ? 'check-circle' : 'alert-circle'}
        size={15}
        color="#fff"
        style={toastStyles.icon}
      />
      <Text style={toastStyles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 100,
    maxWidth: 320,
  },
  icon: { marginRight: 7 },
  text: {
    color: '#fff',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    flexShrink: 1,
  },
});

// ─── Order Row ────────────────────────────────────────────────────────────────
function OrderRow({
  order,
  highlighted,
  onPress,
}: {
  order: Order;
  highlighted?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const chip = chipColors(order.status, colors);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        rowStyles.row,
        {
          backgroundColor: highlighted ? colors.primaryMuted : colors.card,
          borderColor: highlighted ? colors.primary : colors.border,
          borderRadius: colors.radius,
          borderWidth: highlighted ? 2 : 1,
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
      <Feather
        name="chevron-right"
        size={16}
        color={colors.mutedForeground}
        style={rowStyles.chevron}
      />
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  chevron: { marginLeft: 6 },
});

// ─── Line Item Row ────────────────────────────────────────────────────────────
function LineRow({
  line,
  colors,
}: {
  line: OrderLine;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={lineStyles.row}>
      <View style={lineStyles.nameWrap}>
        <Text style={[lineStyles.name, { color: colors.foreground }]} numberOfLines={2}>
          {line.name}
        </Text>
        <Text style={[lineStyles.qty, { color: colors.mutedForeground }]}>
          ×{line.quantity}
        </Text>
      </View>
      <Text style={[lineStyles.amount, { color: colors.foreground }]}>
        {fmtCents(line.lineCents)}
      </Text>
    </View>
  );
}

const lineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  nameWrap: { flex: 1, marginRight: 12 },
  name: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  qty: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  amount: { fontFamily: 'Inter_500Medium', fontSize: 14 },
});

// ─── Detail Sheet ─────────────────────────────────────────────────────────────
function OrderDetailSheet({
  order,
  visible,
  onClose,
  onToast,
}: {
  order: Order | null;
  visible: boolean;
  onClose: () => void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: () => completeOrder(order!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
      onToast('Order marked as complete', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      onToast(err.message || 'Could not complete order', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const refundMutation = useMutation({
    mutationFn: () => refundOrder(order!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
      onToast('Order refunded', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      onToast(err.message || 'Could not refund order', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const voidMutation = useMutation({
    mutationFn: () => voidOrder(order!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
      onToast('Order voided', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      onToast(err.message || 'Could not void order', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const isBusy =
    completeMutation.isPending || refundMutation.isPending || voidMutation.isPending;

  function confirmComplete() {
    Alert.alert(
      'Mark as Complete?',
      `Order #${order?.orderNumber} will be marked as completed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: () => completeMutation.mutate(),
        },
      ],
    );
  }

  function confirmRefund() {
    Alert.alert(
      'Issue Refund?',
      `Order #${order?.orderNumber} will be fully refunded. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Issue Refund',
          style: 'destructive',
          onPress: () => refundMutation.mutate(),
        },
      ],
    );
  }

  function confirmVoid() {
    Alert.alert(
      'Void Order?',
      `Order #${order?.orderNumber} will be permanently voided. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void Order',
          style: 'destructive',
          onPress: () => voidMutation.mutate(),
        },
      ],
    );
  }

  if (!order) return null;
  const chip = chipColors(order.status, colors);
  const canComplete = order.status === 'open';
  const canVoid = order.status === 'open' || order.status === 'completed';
  const canRefund = order.status === 'completed';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[sheetStyles.root, { backgroundColor: colors.background }]}>
        {/* Handle */}
        <View style={sheetStyles.handleWrap}>
          <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={[sheetStyles.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[sheetStyles.orderNum, { color: colors.foreground }]}>
              #{order.orderNumber}
            </Text>
            <Text style={[sheetStyles.date, { color: colors.mutedForeground }]}>
              {fmtDate(order.createdAt)}
            </Text>
          </View>
          <View style={[sheetStyles.chip, { backgroundColor: chip.bg }]}>
            <Text style={[sheetStyles.chipText, { color: chip.text }]}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={sheetStyles.closeBtn} hitSlop={10}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Line items */}
        <ScrollView
          style={sheetStyles.scroll}
          contentContainerStyle={sheetStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[sheetStyles.sectionLabel, { color: colors.mutedForeground }]}>
            Items
          </Text>
          <View style={[sheetStyles.linesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {order.lines.map((line, i) => (
              <React.Fragment key={line.id}>
                <LineRow line={line} colors={colors} />
                {i < order.lines.length - 1 && (
                  <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />
                )}
              </React.Fragment>
            ))}
          </View>

          {/* Totals */}
          <View style={[sheetStyles.totalsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={sheetStyles.totalRow}>
              <Text style={[sheetStyles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
              <Text style={[sheetStyles.totalValue, { color: colors.foreground }]}>{fmtCents(order.subtotalCents)}</Text>
            </View>
            {order.discountCents > 0 && (
              <View style={sheetStyles.totalRow}>
                <Text style={[sheetStyles.totalLabel, { color: colors.mutedForeground }]}>Discount</Text>
                <Text style={[sheetStyles.totalValue, { color: colors.success }]}>−{fmtCents(order.discountCents)}</Text>
              </View>
            )}
            <View style={sheetStyles.totalRow}>
              <Text style={[sheetStyles.totalLabel, { color: colors.mutedForeground }]}>Tax</Text>
              <Text style={[sheetStyles.totalValue, { color: colors.foreground }]}>{fmtCents(order.taxCents)}</Text>
            </View>
            <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />
            <View style={sheetStyles.totalRow}>
              <Text style={[sheetStyles.grandLabel, { color: colors.foreground }]}>Total</Text>
              <Text style={[sheetStyles.grandValue, { color: colors.foreground }]}>{fmtCents(order.totalCents)}</Text>
            </View>
          </View>
        </ScrollView>

        {/* Action buttons */}
        {(canComplete || canRefund || canVoid) && (
          <View
            style={[
              sheetStyles.actions,
              { borderTopColor: colors.border, paddingBottom: insets.bottom + 16 },
            ]}
          >
            {canComplete && (
              <TouchableOpacity
                onPress={confirmComplete}
                disabled={isBusy}
                style={[sheetStyles.actionBtn, { backgroundColor: colors.primary, opacity: isBusy ? 0.6 : 1 }]}
                activeOpacity={0.8}
              >
                {completeMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <>
                    <Feather name="check-circle" size={16} color={colors.primaryForeground} style={sheetStyles.btnIcon} />
                    <Text style={[sheetStyles.actionBtnText, { color: colors.primaryForeground }]}>
                      Mark Complete
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {canRefund && (
              <TouchableOpacity
                onPress={confirmRefund}
                disabled={isBusy}
                style={[sheetStyles.actionBtn, { backgroundColor: colors.primary, opacity: isBusy ? 0.6 : 1 }]}
                activeOpacity={0.8}
              >
                {refundMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <>
                    <Feather name="rotate-ccw" size={16} color={colors.primaryForeground} style={sheetStyles.btnIcon} />
                    <Text style={[sheetStyles.actionBtnText, { color: colors.primaryForeground }]}>
                      Issue Refund
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {canVoid && (
              <TouchableOpacity
                onPress={confirmVoid}
                disabled={isBusy}
                style={[
                  sheetStyles.actionBtn,
                  sheetStyles.actionBtnOutline,
                  { borderColor: colors.destructive, opacity: isBusy ? 0.6 : 1 },
                ]}
                activeOpacity={0.8}
              >
                {voidMutation.isPending ? (
                  <ActivityIndicator color={colors.destructive} size="small" />
                ) : (
                  <>
                    <Feather name="slash" size={16} color={colors.destructive} style={sheetStyles.btnIcon} />
                    <Text style={[sheetStyles.actionBtnText, { color: colors.destructive }]}>
                      Void Order
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  root: { flex: 1 },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  orderNum: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  date: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  closeBtn: { marginLeft: 'auto' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 12 },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -4,
  },
  linesCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  totalsCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginTop: 4,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  totalLabel: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  totalValue: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  grandLabel: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  grandValue: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  actions: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  actionBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  btnIcon: {},
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastKeyRef = useRef(0);

  // Deep-link highlight: tapping a push notification passes highlightId
  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>();
  const [localHighlight, setLocalHighlight] = useState<string | undefined>(
    highlightId,
  );
  const flatListRef = useRef<FlatList<Order>>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => apiFetch<OrdersListResponse>('/api/v1/orders?limit=50&offset=0'),
    staleTime: 20_000,
    retry: 1,
  });

  const displayed = (data?.items ?? []).filter(
    (o) => activeFilter === 'all' || o.status === activeFilter,
  );

  useEffect(() => {
    if (!highlightId) return;
    setLocalHighlight(highlightId);
    setActiveFilter('all');
  }, [highlightId]);

  useEffect(() => {
    if (!localHighlight || !data?.items.length) return;
    const idx = displayed.findIndex((o) => o.id === localHighlight);
    if (idx < 0) return;
    const t = setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
    }, 200);
    const clear = setTimeout(() => setLocalHighlight(undefined), 4000);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localHighlight, data?.items.length]);

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

  const showToast = useCallback((message: string, kind: ToastKind) => {
    toastKeyRef.current += 1;
    setToast({ message, kind, key: toastKeyRef.current });
  }, []);

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
          ref={flatListRef}
          data={displayed}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => (
            <OrderRow
              order={item}
              highlighted={item.id === localHighlight}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedOrder(item);
              }}
            />
          )}
          contentContainerStyle={[s.list, { paddingBottom: botPad + 90 }]}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
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

      {/* ── Detail sheet ── */}
      <OrderDetailSheet
        order={selectedOrder}
        visible={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onToast={showToast}
      />

      {/* ── Toast ── */}
      <Toast toast={toast} colors={colors} />
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
