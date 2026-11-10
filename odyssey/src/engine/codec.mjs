// Typed arrays travel inside the universe bundle as base64 text.
const TYPES = {
  u8: Uint8Array, u16: Uint16Array, u32: Uint32Array, i16: Int16Array, f32: Float32Array,
};

export function encodeArray(array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decodeArray(text, type) {
  const Type = TYPES[type];
  if (!Type) throw new Error(`Unknown array type ${type}`);
  let bytes;
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(text, 'base64');
    bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();
  } else {
    const binary = atob(text);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  }
  return new Type(bytes.buffer, 0, Math.floor(bytes.byteLength / Type.BYTES_PER_ELEMENT));
}
