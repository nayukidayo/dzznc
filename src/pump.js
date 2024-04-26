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
export function setPUMPlocal(coils) {
  if (coils.length !== 2) return
  const hex = bitToHex(coils)
  const buf = Buffer.from(`01100000000204${hex.toString('hex')}0000`, 'hex')
  const crc = crc16(buf.subarray(0, buf.length - 2))
  buf.writeUInt16LE(crc, buf.length - 2)
  return buf
}

/**
 * @param {number[]} coils
 * @param {number} status
 * @returns {Buffer|undefined}
 */
export function setPUMPremote(coils, status = 0) {
  if (coils.length !== 2) return
  let buf
  if (coils[0] === 1 && coils[1] === 0) {
    if (status === 0) {
      buf = Buffer.from('01060000000089CA', 'hex')
    } else {
      buf = Buffer.from('010600000001480A', 'hex')
    }
    return buf
  }
  if (coils[0] === 0 && coils[1] === 1) {
    if (status === 0) {
      buf = Buffer.from('010600010000D80A', 'hex')
    } else {
      buf = Buffer.from('01060001000119CA', 'hex')
    }
    return buf
  }
  if (coils[0] === 1 && coils[1] === 1) {
    if (status === 0) {
      buf = Buffer.from('0110000000020400000000F3AF', 'hex')
    } else {
      buf = Buffer.from('011000000002040001000163AF', 'hex')
    }
    return buf
  }
}
