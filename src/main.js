import { createServer } from 'node:http'
import process from 'node:process'
import mqtt from 'mqtt'
import { setSV, getSV } from './sv.js'
import { setPUMPlocal, setPUMPremote, getPUMP } from './pump.js'

const env = {
  MQTT_URL: process.env.MQTT_URL || 'mqtt://10.0.0.3',
  MQTT_USER: process.env.MQTT_USER || 'iot',
  MQTT_PASS: process.env.MQTT_PASS || '123',
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

const cache = {}
const delay = ms => new Promise(res => setTimeout(res, ms))

const client = mqtt.connect(env.MQTT_URL, {
  username: env.MQTT_USER,
  password: env.MQTT_PASS,
})

client.on('connect', async () => {
  await client.subscribeAsync([sv1.sub, sv2.sub, pump.sub])
  while (true) {
    client.publish(sv1.pub, sv1.get)
    client.publish(sv2.pub, sv2.get)
    client.publish(pump.pub, pump.get)
    await delay(5e3)
  }
})

client.on('message', async (topic, msg) => {
  try {
    switch (topic) {
      case sv1.sub:
        cache.sv1 = getSV(msg, true)
        break
      case sv2.sub:
        cache.sv2 = getSV(msg)
        break
      case pump.sub:
        cache.pump = getPUMP(msg)
        if (cache.pump?.mode === 'local') {
          const msg = setPUMPlocal(cache.pump.coils)
          if (msg) {
            await delay(1e3)
            await client.publishAsync(pump.pub, msg, { qos: 1 })
          }
        }
        break
    }
  } catch (err) {
    console.log('[mqtt_message]', err)
  }
})

client.on('error', err => console.log('[mqtt_error]', err))

const server = createServer((req, res) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`)

  if (req.headers.authorization !== 'nayukidayo') {
    res.statusCode = 401
    res.end()
    return
  }

  if (url.pathname !== '/api/status') {
    res.statusCode = 404
    res.end()
    return
  }

  if (req.method === 'GET') {
    const tab = url.searchParams.get('tab')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(cache[tab]))
    return
  }

  if (req.method === 'POST') {
    return setStatus(req, res)
  }

  res.statusCode = 405
  res.end()
})

server.listen('3000', () => console.log('Server is running'))

function setStatus(req, res) {
  const buf = []
  req.on('data', chunk => buf.push(chunk))
  req.on('end', async () => {
    try {
      const data = JSON.parse(Buffer.concat(buf).toString())
      if (data.tab === 'sv1') {
        const msg = setSV(data.coils, true)
        if (!msg) throw new Error('sv1 msg is empty')
        await client.publishAsync(sv1.pub, msg, { qos: 1 })
      } else if (data.tab === 'sv2') {
        const msg = setSV(data.coils)
        if (!msg) throw new Error('sv2 msg is empty')
        await client.publishAsync(sv2.pub, msg, { qos: 1 })
      } else if (data.tab === 'pump') {
        const msg = setPUMPremote(data.coils, data.status)
        if (!msg) throw new Error('pump msg is empty')
        await client.publishAsync(pump.pub, msg, { qos: 1 })
      } else {
        throw new Error('unknown tab')
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
