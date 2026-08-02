import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, loginError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSignIn() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Navigation handled automatically by auth redirect in _layout.tsx
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  }

  const s = makeStyles(colors, insets);

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo ── */}
        <View style={s.logoArea}>
          <View style={s.logoMark}>
            <Feather name="layers" size={26} color={colors.primaryForeground} />
          </View>
          <Text style={s.logoText}>Ascend</Text>
        </View>

        {/* ── Headline ── */}
        <Text style={s.headline}>Welcome back</Text>
        <Text style={s.subheadline}>Sign in to your store dashboard</Text>

        {/* ── Error ── */}
        {loginError ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={15} color={colors.destructive} />
            <Text style={s.errorText}>{loginError}</Text>
          </View>
        ) : null}

        {/* ── Email ── */}
        <View style={s.fieldGroup}>
          <Text style={s.label}>Email</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="cashier@store.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
        </View>

        {/* ── Password ── */}
        <View style={s.fieldGroup}>
          <Text style={s.label}>Password</Text>
          <View style={s.inputWrap}>
            <TextInput
              ref={passwordRef}
              style={[s.input, s.inputFlex]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={s.eyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Sign in ── */}
        <TouchableOpacity
          style={[s.signInBtn, !canSubmit && s.signInBtnDisabled]}
          onPress={handleSignIn}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={s.signInBtnText}>Sign in</Text>
          )}
        </TouchableOpacity>

        {/* ── Demo hint ── */}
        <Text style={s.hint}>Demo: any email · any password (not "wrong")</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(
  colors: ReturnType<typeof useColors>,
  insets: ReturnType<typeof useSafeAreaInsets>,
) {
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingTop: top + 32,
      paddingBottom: bottom + 32,
    },
    logoArea: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 40,
    },
    logoMark: {
      width: 44,
      height: 44,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    logoText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 24,
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    headline: {
      fontFamily: 'Inter_700Bold',
      fontSize: 30,
      color: colors.foreground,
      marginBottom: 6,
      letterSpacing: -0.5,
    },
    subheadline: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.mutedForeground,
      marginBottom: 32,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.destructiveMuted,
      borderRadius: colors.radius / 2,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.destructive,
    },
    errorText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.destructive,
      flex: 1,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    label: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.mutedForeground,
      marginBottom: 6,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    input: {
      flex: 1,
      height: 48,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: colors.foreground,
    },
    inputFlex: {
      flex: 1,
    },
    eyeBtn: {
      paddingLeft: 8,
    },
    signInBtn: {
      height: 52,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 20,
    },
    signInBtnDisabled: {
      opacity: 0.5,
    },
    signInBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: colors.primaryForeground,
    },
    hint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: 'center',
    },
  });
}
