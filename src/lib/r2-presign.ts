interface PresignOptions {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // e.g. https://<account>.r2.cloudflarestorage.com
  bucketName: string;
  key: string;
  method?: string; // 'PUT' or 'GET', default 'PUT'
  expiresIn?: number; // seconds, default 3600
}

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

async function sha256(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(data));
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getPresignedPutUrl(options: PresignOptions): Promise<string> {
  const {
    accessKeyId,
    secretAccessKey,
    endpoint,
    bucketName,
    key,
    method = 'PUT',
    expiresIn = 3600
  } = options;

  // Normalize endpoint: strip trailing slash
  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const url = new URL(`${cleanEndpoint}/${bucketName}/${key}`);

  const datetime = new Date().toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const date = datetime.substring(0, 8);
  const region = 'auto'; // R2 uses 'auto' region
  const service = 's3';

  const credentialScope = `${date}/${region}/${service}/aws4_request`;

  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': datetime,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host'
  });

  // Sort query parameters as required by AWS signature spec
  const sortedKeys = Array.from(queryParams.keys()).sort();
  const canonicalQueryString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams.get(k) || '')}`)
    .join('&');

  const host = url.host;
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const hashedPayload = 'UNSIGNED-PAYLOAD';

  // Path must start with / and be URI-encoded
  const canonicalUri = `/${bucketName}/${key}`.replace(/\/{2,}/g, '/');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join('\n');

  const hashedCanonicalRequest = bufToHex(await sha256(canonicalRequest));

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');

  // Calculate signature
  const kDate = await hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bufToHex(await hmac(kSigning, stringToSign));

  // Construct final URL
  return `${url.toString()}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
