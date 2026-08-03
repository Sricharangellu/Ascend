/**
 * Pre-warm Expo 54's lazy WinterCG globals (URL, TextDecoder, structuredClone, …)
 * so they resolve via require() NOW — before Jest 30's throwIfBetweenTests guard
 * is active — instead of on first access inside a test file.
 *
 * This file runs in `setupFiles` (after jest-expo's own setup.js installs the
 * lazy getters, but still before any test module is evaluated).
 */
'use strict';

/* eslint-disable no-unused-expressions */
// Touch each global that expo/src/winter installs lazily.
// The access resolves the lazy getter immediately and safely.
void (typeof URL !== 'undefined' ? URL : undefined);
void (typeof URLSearchParams !== 'undefined' ? URLSearchParams : undefined);
void (typeof TextDecoder !== 'undefined' ? TextDecoder : undefined);
void (typeof TextEncoder !== 'undefined' ? TextEncoder : undefined);
void (typeof structuredClone !== 'undefined' ? structuredClone : undefined);
void (typeof ReadableStream !== 'undefined' ? ReadableStream : undefined);
void (typeof WritableStream !== 'undefined' ? WritableStream : undefined);
void (typeof TransformStream !== 'undefined' ? TransformStream : undefined);
void (typeof globalThis.__ExpoImportMetaRegistry !== 'undefined'
  ? globalThis.__ExpoImportMetaRegistry
  : undefined);
