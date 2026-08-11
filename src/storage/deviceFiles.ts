/**
 * Device file access (A12-02) — TRD §3 Storage.
 *
 * Choosing a file to send and saving one that arrived. Both are platform
 * capabilities, so they live in the adapter layer and reach the application
 * through plain functions the composition root injects — no screen imports
 * this module, and the layer boundary forbids one trying.
 *
 * **Bytes, not text.** `File.arrayBuffer()` reads and `writableStream()` writes
 * raw bytes. Nothing here goes through a string or Base64: PROTOCOL_SPEC §3.8
 * admits any byte sequence as a file, and a text round-trip would quietly
 * exclude every file that is not valid UTF-8 — the same defect SI-013 records
 * on the camera side.
 *
 * Loaded through a guarded `require` for the same reason the camera is
 * (ADR-0005): these packages need a native runtime, and importing them under
 * Node would break the test suite on a machine with no device.
 */
/** A file the user chose, with its bytes already read. */
export interface PickedFile {
  readonly name: string;
  readonly mimeType?: string;
  readonly extension?: string;
  readonly content: Uint8Array;
}

/** Picks files to send. Resolves empty when the user cancels. */
export type FilePicker = () => Promise<readonly PickedFile[]>;

/** Saves a received file, returning where it was written. */
export type FileSaver = (name: string, bytes: Uint8Array) => Promise<string>;

export interface DeviceFiles {
  readonly pickFiles: FilePicker;
  readonly saveFile: FileSaver;
  /** Whether a real platform implementation was found. */
  readonly isDevice: boolean;
}

/**
 * A picker and saver that report their own absence.
 *
 * Used under Node and on the web. They resolve rather than throw — a Send
 * screen asking to pick a file on a platform without a picker should get an
 * empty selection, not an unhandled rejection.
 */
function unavailable(): DeviceFiles {
  return {
    pickFiles: async () => [],
    saveFile: async () => {
      throw new Error('Saving files is not supported on this platform.');
    },
    isDevice: false,
  };
}

/** Resolves the platform's file capabilities. */
export function createDeviceFiles(): DeviceFiles {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const picker = require('expo-document-picker') as {
      getDocumentAsync(options: {
        multiple?: boolean;
        copyToCacheDirectory?: boolean;
        type?: string;
      }): Promise<{
        canceled: boolean;
        assets?: { uri: string; name: string; mimeType?: string; size?: number }[] | null;
      }>;
    };

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('expo-file-system') as {
      File: new (uri: string) => {
        arrayBuffer(): Promise<ArrayBuffer>;
        create(options?: { overwrite?: boolean; intermediates?: boolean }): void;
        write(contents: Uint8Array): void;
        readonly uri: string;
      };
      Paths: { document: { uri: string } };
    };

    return {
      isDevice: true,

      async pickFiles() {
        const result = await picker.getDocumentAsync({
          multiple: true,
          // Required: the picked URI is a transient content:// handle that the
          // provider may revoke, and reading it later would fail.
          copyToCacheDirectory: true,
          type: '*/*',
        });

        if (result.canceled || result.assets == null) {
          return [];
        }

        const picked: PickedFile[] = [];

        for (const asset of result.assets) {
          const bytes = new Uint8Array(await new fs.File(asset.uri).arrayBuffer());
          const dot = asset.name.lastIndexOf('.');

          picked.push({
            name: asset.name,
            content: bytes,
            ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }),
            ...(dot > 0 ? { extension: asset.name.slice(dot + 1) } : {}),
          });
        }

        return picked;
      },

      async saveFile(name, bytes) {
        // The document directory, which §9 of SECURITY.md calls a place safe
        // from being reclaimed by the system.
        const target = new fs.File(`${fs.Paths.document.uri}${name}`);

        target.create({ overwrite: true, intermediates: true });
        target.write(bytes);

        return target.uri;
      },
    };
  } catch {
    return unavailable();
  }
}
