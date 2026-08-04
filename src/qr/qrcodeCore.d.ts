/**
 * Types for `qrcode/lib/core/qrcode`.
 *
 * The `qrcode` package's public entry points target Node (`lib/server.js`,
 * which pulls in `pngjs`) and the browser (`lib/browser.js`, which needs a
 * DOM). Neither exists in React Native, so the core encoder is imported
 * directly — see docs/decisions/0002-qr-library-selection.md.
 *
 * `@types/qrcode` describes only the public entries, so the small surface used
 * here is declared instead. Narrow on purpose: if a future version changes any
 * of it, this file is where the break appears, and the encoder's tests catch it.
 */
declare module 'qrcode/lib/core/qrcode' {
  /** A byte-mode segment carrying binary data exactly as given. */
  export interface ByteSegment {
    readonly data: Uint8Array;
    readonly mode: 'byte';
  }

  export interface CreateOptions {
    /** Error correction level, QR_SPEC §7. */
    readonly errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    /** QR version 1–40, or omitted for automatic selection (QR_SPEC §6). */
    readonly version?: number;
    /** Mask pattern 0–7. Omitted to let the encoder score and choose. */
    readonly maskPattern?: number;
  }

  export interface QrCodeModules {
    /** Modules per side. */
    readonly size: number;
    /** Row-major modules, one byte each: 1 is dark, 0 is light. */
    readonly data: Uint8Array;
  }

  export interface QrCode {
    readonly modules: QrCodeModules;
    readonly version: number;
    readonly maskPattern: number;
  }

  export function create(data: readonly ByteSegment[] | string, options?: CreateOptions): QrCode;
}
