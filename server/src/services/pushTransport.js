import webpush from 'web-push';
import https from 'node:https';
import dns from 'node:dns';
import ipaddr from 'ipaddr.js';
import { validPushEndpoint } from './pushSubscriptions.js';

export function publicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export async function sendWebPush(subscription, payload, config, ttl) {
  if (!config.enabled || !config.confirmed || !validPushEndpoint(subscription.endpoint)) throw Object.assign(new Error('Push transport blocked.'), { pushCode: 'transport_blocked' });
  const host = new URL(subscription.endpoint).hostname;
  const agent = new https.Agent({ keepAlive: false, lookup(hostname, options, callback) {
    if (hostname !== host) return callback(new Error('Endpoint blocked.'));
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error || !addresses?.length || addresses.some(({ address }) => !publicAddress(address))) return callback(new Error('Endpoint resolution blocked.'));
      if (options.all) callback(null, addresses); else callback(null, addresses[0].address, addresses[0].family);
    });
  } });
  try {
    const details = webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      TTL: Math.max(1, Math.min(ttl, 3600)), urgency: 'normal', topic: payload.eventId.slice(0, 32),
    });
    return await new Promise((resolve, reject) => {
      const request = https.request(details.endpoint, { method: details.method, headers: details.headers, agent, signal: AbortSignal.timeout(8000) }, (response) => {
        response.resume(); response.on('end', () => resolve({ statusCode: response.statusCode, retryAfter: response.headers['retry-after'] }));
        response.on('error', () => reject(new Error('Push response unavailable.')));
      });
      request.on('error', () => reject(new Error('Push transport unavailable.')));
      request.end(details.body);
    });
  } finally { agent.destroy(); }
}
