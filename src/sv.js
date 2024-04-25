// @ts-check

import { Buffer } from 'node:buffer'
import { crc16 } from './crc.js'

/**
 * @param {Buffer} hex
 * @param {boolean} [r9To18]
 * @returns {number[]}
 */
function hexToBit(hex, r9To18) {
  const arr = new Array(27)
  const val = hex.readInt32LE()
  for (let i = 0; i < arr.length; i++) {
    arr[i] = (val >> i) & 1
  }
  if (r9To18) {
    arr.splice(9, 9, ...arr.slice(9, 18).reverse())
  }
  return arr
}

/**
 * @param {number[]} bit
 * @param {boolean} [r9To18]
 * @returns {Buffer}
 */
function bitToHex(bit, r9To18) {
  let arr
  if (r9To18) {
    // @ts-expect-error
    arr = bit.toSpliced(9, 9, ...bit.slice(9, 18).reverse())
  } else {
    arr = [...bit]
  }
  const val = Number(`0b${arr.reverse().join('')}`)
  const buf = Buffer.allocUnsafe(4)
  buf.writeUint32LE(val)
  return buf
}

/**
 * @param {Buffer} msg
 * @param {boolean} [r9To18]
 * @returns {{mode:string,coils:number[]}|undefined}
 */
export function getSV(msg, r9To18) {
  if (msg.length !== 11 || msg[1] !== 3) return
  try {
    return {
      mode: msg[7] === 4 ? 'remote' : 'local',
      coils: hexToBit(msg.subarray(3, 7), r9To18),
    }
  } catch (err) {
    console.log('[getSV]', err)
  }
}

/**
 * @param {number[]} coils
 * @param {boolean} [r9To18]
 * @returns {Buffer|undefined}
 */
export function setSV(coils, r9To18) {
  if (coils.length !== 27) return
  try {
    const hex = bitToHex(coils, r9To18)
    const buf = Buffer.from(`01100000000204${hex.toString('hex')}0000`, 'hex')
    const crc = crc16(buf.subarray(0, buf.length - 2))
    buf.writeUInt16LE(crc, buf.length - 2)
    return buf
  } catch (err) {
    console.log('[setSV]', err)
  }
}
