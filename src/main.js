import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import mqtt from 'mqtt'
import { setSV, getSV } from './sv.js'
import { setPUMP, getPUMP } from './pump.js'

const env = {
  MQTT_URL: process.env.MQTT_URL || 'mqtt://test.nayuki.top',
  MQTT_USER: process.env.MQTT_USER || 'iot',
  MQTT_PASS: process.env.MQTT_PASS || '123',
  HTTPS_CRT: process.env.HTTPS_CRT || 'cert/test.nayuki.top.key',
  HTTPS_KEY: process.env.HTTPS_KEY || 'cert/test.nayuki.top.crt',
}

const options = {
  key: readFileSync(env.HTTPS_CRT),
  cert: readFileSync(env.HTTPS_KEY),
}

const sv1 = {
  sub: 'DZZ-SV1/Post',
  pub: 'DZZ-SV1/Get',
  get: Buffer.from('0103000a000325C9', 'hex'),
}
const sv2 = {
  sub: 'DZZ-SV2/Post',
  pub: 'DZZ-SV2/Get',
  get: Buffer.from('0103000a000325C9', 'hex'),
}
const pump = {
  sub: '/DZZ-PUMP/Post',
  pub: '/DZZ-PUMP/Get',
  get: Buffer.from('010400000004F1C9', 'hex'),
}

const ee = new EventEmitter()
const delay = ms => new Promise(res => setTimeout(res, ms))

const client = mqtt.connect(env.MQTT_URL, { username: env.MQTT_USER, password: env.MQTT_PASS })

client.on('connect', async () => {
  await client.subscribeAsync([sv1.sub, sv2.sub, pump.sub])
  while (true) {
    client.publish(sv1.pub, sv1.get)
    client.publish(sv2.pub, sv2.get)
    client.publish(pump.pub, pump.get)
    await delay(5e3)
  }
})

client.on('message', (topic, msg) => {
  let result
  switch (topic) {
    case sv1.sub:
      result = getSV(msg, true)
      break
    case sv2.sub:
      result = getSV(msg)
      break
    default:
      result = getPUMP(msg)
      if (result?.mode === 'local') {
        const msg = setPUMP(result.coils)
        msg && client.publish(pump.pub, msg, { qos: 1 })
      }
      break
  }
  result && ee.emit('live', topic, result)
})

client.on('error', err => console.log('[mqtt_client_error]', err))

const server = createServer(options, (req, res) => {
  if (req.method === 'GET') {
    // if (req.url === '/') {
    //   res.writeHead(200, { 'Content-Type': 'text/html' })
    //   createReadStream('test/index.html').pipe(res)
    //   return
    // }

    if (req.url === '/api/status') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
      })
      const cb = (topic, result) => {
        res.write(`event: ${topic}\n`)
        res.write(`data: ${JSON.stringify(result)}\n\n`)
      }
      ee.on('live', cb)
      res.once('close', () => ee.off('live', cb))
      return
    }
  }

  if (req.method === 'POST') {
    if (req.headers.authorization !== 'nayukidayo') {
      res.statusCode = 401
      res.end()
      return
    }

    if (req.url === '/api/status') {
      return setStatus(req, res)
    }
  }

  res.statusCode = 404
  res.end()
})

server.listen('3000', () => console.log('Server is running'))

function setStatus(req, res) {
  const buf = []
  req.on('data', chunk => buf.push(chunk))
  req.on('end', async () => {
    try {
      const data = JSON.parse(Buffer.concat(buf).toString())
      if (data.event === sv1.sub) {
        const msg = setSV(data.coils, true)
        if (!msg) throw new Error('sv1 msg is empty')
        await client.publishAsync(sv1.pub, msg, { qos: 1 })
      } else if (data.event === sv2.sub) {
        const msg = setSV(data.coils)
        if (!msg) throw new Error('sv2 msg is empty')
        await client.publishAsync(sv2.pub, msg, { qos: 1 })
      } else if (data.event === pump.sub) {
        const msg = setPUMP(data.coils)
        console.log('msg', msg)
        if (!msg) throw new Error('pump msg is empty')
        await client.publishAsync(pump.pub, msg, { qos: 1 })
      } else {
        throw new Error('unknown event')
      }
      res.statusCode = 200
    } catch (err) {
      console.log('[setStatus]', err)
      res.statusCode = 400
    } finally {
      res.end()
    }
  })
}

process.on('SIGHUP', () => process.exit(128 + 1))
process.on('SIGINT', () => process.exit(128 + 2))
process.on('SIGTERM', () => process.exit(128 + 15))
