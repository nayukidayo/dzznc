// @ts-check

/**
 * @param {Buffer} buf
 * @returns {number}
 */
export function crc16(buf) {
  let odd = 0
  let crc = 0xffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      odd = crc & 1
      crc >>= 1
      if (odd !== 0) {
        crc ^= 0xa001
      }
    }
  }
  return crc
}
