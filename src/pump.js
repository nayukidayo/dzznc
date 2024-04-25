// @ts-check

import { Buffer } from 'node:buffer'
import { crc16 } from './crc.js'

/**
 * @param {number[]} bit
 * @returns {Buffer}
 */
function bitToHex(bit) {
  const buf = Buffer.allocUnsafe(4)
  buf.writeUInt16BE(bit[0])
  buf.writeUInt16BE(bit[1], 2)
  return buf
}

/**
 * @param {Buffer} msg
 * @returns {{mode:string,coils:number[]}|undefined}
 */
export function getPUMP(msg) {
  if (msg.length !== 13 || msg[1] !== 4) return
  return { mode: msg[10] ? 'local' : 'remote', coils: [msg[4], msg[6]] }
}

/**
 * @param {number[]} coils
 * @returns {Buffer|undefined}
 */
export function setPUMP(coils) {
  if (coils.length !== 2) return
  const hex = bitToHex(coils)
  const buf = Buffer.from(`01100000000204${hex.toString('hex')}0000`, 'hex')
  const crc = crc16(buf.subarray(0, buf.length - 2))
  buf.writeUInt16LE(crc, buf.length - 2)
  return buf
}
