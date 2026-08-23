'use strict';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;

function asBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('image-size compatibility shim expects a Buffer or Uint8Array');
}

function jpegSize(bytes) {
  let offset = 2;
  let steps = 0;
  while (offset + 4 <= bytes.length && steps++ < bytes.length / 2) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && length >= 7) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3), type: 'jpg' };
    offset += length;
  }
  return null;
}

function imageSize(input) {
  const bytes = asBytes(input);
  if (bytes.length > MAX_INPUT_BYTES) throw new RangeError(`image input exceeds ${MAX_INPUT_BYTES} bytes`);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), type: 'png' };
  }
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), type: 'gif' };
  }
  if (bytes.length >= 26 && bytes.subarray(0, 2).toString('ascii') === 'BM') {
    return { width: bytes.readUInt32LE(18), height: Math.abs(bytes.readInt32LE(22)), type: 'bmp' };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const result = jpegSize(bytes);
    if (result) return result;
  }
  throw new TypeError('Unsupported or invalid raster image; ICNS, JXL, and HEIF are intentionally unsupported');
}

module.exports = imageSize;
module.exports.imageSize = imageSize;
module.exports.default = imageSize;
module.exports.types = ['bmp', 'gif', 'jpg', 'png'];
module.exports.disableTypes = () => {};
