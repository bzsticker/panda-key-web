// src/lib/auth.ts

const JWT_SECRET = 'pandakey_jwt_signing_secret_key_change_me_in_prod';

function base64urlEncode(strOrBuf: string | ArrayBuffer): string {
  let base64 = '';
  if (typeof strOrBuf === 'string') {
    base64 = btoa(unescape(encodeURIComponent(strOrBuf)));
  } else {
    const bytes = new Uint8Array(strOrBuf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    256 // 32 bytes
  );
  
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return false;
    
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      256
    );
    
    const calcHashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return calcHashHex === hashHex;
  } catch (e) {
    return false;
  }
}

export async function signToken(userId: string, email: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 days
  };
  
  const headerStr = base64urlEncode(JSON.stringify(header));
  const payloadStr = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerStr}.${payloadStr}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_SECRET);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(unsignedToken)
  );
  
  const signatureStr = base64urlEncode(signature);
  return `${unsignedToken}.${signatureStr}`;
}

export async function verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [headerStr, payloadStr, signatureStr] = parts;
    const unsignedToken = `${headerStr}.${payloadStr}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(JWT_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    // Decode signature
    const signatureBase64 = signatureStr.replace(/-/g, '+').replace(/_/g, '/');
    const signatureBinary = atob(signatureBase64);
    const signatureBytes = new Uint8Array(signatureBinary.length);
    for (let i = 0; i < signatureBinary.length; i++) {
      signatureBytes[i] = signatureBinary.charCodeAt(i);
    }
    
    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBytes,
      encoder.encode(unsignedToken)
    );
    
    if (!isValid) return null;
    
    const payload = JSON.parse(base64urlDecode(payloadStr));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null; // Expired
    }
    
    return { userId: payload.userId, email: payload.email };
  } catch (e) {
    return null;
  }
}

export async function getUserFromRequest(request: Request): Promise<{ id: string; email: string } | null> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const parts = c.trim().split('=');
        return [parts[0], parts[1]];
      })
    );

    const token = cookies['pandakey_session'];
    if (!token) return null;

    const decoded = await verifyToken(token);
    if (!decoded) return null;

    return { id: decoded.userId, email: decoded.email };
  } catch (error) {
    return null;
  }
}
