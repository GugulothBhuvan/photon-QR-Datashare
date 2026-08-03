/**
 * FileMetadata model — PROTOCOL_SPEC §3.8, §10.5.
 */
import { createFileMetadata, fileMetadataEquals } from '@domain/fileMetadata';
import { fileId } from '@domain/ids';
import { AppError } from '@utils/errors';

const baseInput = {
  id: fileId('f-1'),
  name: 'holiday.jpg',
  extension: 'jpg',
  mimeType: 'image/jpeg',
  size: 2048,
  hash: 'a1b2c3',
};

describe('createFileMetadata', () => {
  it('keeps every supplied field', () => {
    expect(createFileMetadata(baseInput)).toEqual(baseInput);
  });

  it('is frozen', () => {
    const file = createFileMetadata(baseInput);

    expect(Object.isFrozen(file)).toBe(true);
    (file as { size: number }).size = 0;
    expect(file.size).toBe(2048);
  });

  it('defaults an unknown MIME type to the generic binary type', () => {
    const file = createFileMetadata({ id: fileId('f-1'), name: 'blob', size: 1, hash: 'h' });

    expect(file.mimeType).toBe('application/octet-stream');
    expect(file.extension).toBe('');
  });

  it('accepts a zero-byte file — any byte sequence is a file (§3.8)', () => {
    expect(createFileMetadata({ ...baseInput, size: 0 }).size).toBe(0);
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a negative size', { size: -1 }],
    ['a fractional size', { size: 1.5 }],
    ['an empty hash', { hash: '' }],
  ])('rejects %s', (_label, change) => {
    expect(() => createFileMetadata({ ...baseInput, ...change })).toThrow(AppError);
  });

  it('does not inspect file contents (§3.8) — any name and type are accepted', () => {
    const odd = createFileMetadata({
      ...baseInput,
      name: 'archive.tar.gz',
      extension: 'gz',
      mimeType: 'application/x-gzip',
    });

    expect(odd.name).toBe('archive.tar.gz');
  });
});

describe('fileMetadataEquals', () => {
  it('compares structurally', () => {
    expect(fileMetadataEquals(createFileMetadata(baseInput), createFileMetadata(baseInput))).toBe(
      true,
    );
  });

  it.each([
    ['id', { id: fileId('f-2') }],
    ['name', { name: 'other.jpg' }],
    ['extension', { extension: 'png' }],
    ['mimeType', { mimeType: 'image/png' }],
    ['size', { size: 1 }],
    ['hash', { hash: 'different' }],
  ])('detects a difference in %s', (_label, change) => {
    expect(
      fileMetadataEquals(
        createFileMetadata(baseInput),
        createFileMetadata({ ...baseInput, ...change }),
      ),
    ).toBe(false);
  });
});
