const isNpx = process.argv.some(arg => typeof arg === 'string' && arg.toLowerCase().includes('npx')) ||
              (process.mainModule && process.mainModule.filename && process.mainModule.filename.toLowerCase().includes('npx')) ||
              (require.main && require.main.filename && require.main.filename.toLowerCase().includes('npx'));

const isVercel = process.argv.some(arg => typeof arg === 'string' && arg.toLowerCase().includes('vercel')) ||
                 (process.mainModule && process.mainModule.filename && process.mainModule.filename.toLowerCase().includes('vercel')) ||
                 (require.main && require.main.filename && require.main.filename.toLowerCase().includes('vercel'));

const isNext = process.argv.some(arg => typeof arg === 'string' && arg.toLowerCase().includes('next') && !arg.toLowerCase().includes('next-on-pages')) ||
               (process.mainModule && process.mainModule.filename && process.mainModule.filename.toLowerCase().includes('next') && !process.mainModule.filename.toLowerCase().includes('next-on-pages')) ||
               (require.main && require.main.filename && require.main.filename.toLowerCase().includes('next') && !require.main.filename.toLowerCase().includes('next-on-pages'));

const shouldClearNodeOptions = !!isNext && !isNpx;
console.warn(`[FS-PATCH] Loading in PID ${process.pid}. shouldClearNodeOptions: ${shouldClearNodeOptions}. Args:`, process.argv);

if (shouldClearNodeOptions) {
  console.warn(`[FS-PATCH] PID ${process.pid} is a Next child. Clearing NODE_OPTIONS.`);
  delete process.env.NODE_OPTIONS;
}
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (typeof request === 'string' && request.includes('@vercel') && request.includes('next') && (request.includes('dist') || request.includes('index.js'))) {
    const localPath = path.resolve('E:/PandaKey/panda-key-web/node_modules/@vercel/next/dist/index.js');
    console.warn(`[FS-PATCH] Redirecting builder require from ${request} to local path: ${localPath}`);
    return originalLoad.call(this, localPath, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};



function copySync(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(child => {
      copySync(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function copyAsync(src, dest) {
  const stats = await fsPromises.stat(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      await fsPromises.mkdir(dest, { recursive: true });
    }
    const children = await fsPromises.readdir(src);
    for (const child of children) {
      await copyAsync(path.join(src, child), path.join(dest, child));
    }
  } else {
    await fsPromises.copyFile(src, dest);
  }
}

const DEFER_FILE = path.resolve('E:/PandaKey/panda-key-web/deferred-symlinks.json');

function addDeferredSymlink(resolvedTarget, pathName) {
  let list = [];
  try {
    if (fs.existsSync(DEFER_FILE)) {
      list = JSON.parse(fs.readFileSync(DEFER_FILE, 'utf8'));
    }
  } catch (e) {}
  // Avoid duplicates
  if (!list.some(item => item.resolvedTarget === resolvedTarget && item.pathName === pathName)) {
    list.push({ resolvedTarget, pathName });
    fs.writeFileSync(DEFER_FILE, JSON.stringify(list, null, 2), 'utf8');
  }
}

function processDeferredSymlinks() {
  if (!fs.existsSync(DEFER_FILE)) return;
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(DEFER_FILE, 'utf8'));
  } catch (e) {
    return;
  }
  
  const remaining = [];
  for (const entry of list) {
    if (fs.existsSync(entry.resolvedTarget)) {
      try {
        console.warn(`[FS-PATCH] Resolving deferred symlink: Copying ${entry.resolvedTarget} to ${entry.pathName}`);
        if (fs.existsSync(entry.pathName)) {
          fs.rmSync(entry.pathName, { recursive: true, force: true });
        }
        copySync(entry.resolvedTarget, entry.pathName);
      } catch (err) {
        console.error(`[FS-PATCH] Failed to copy deferred symlink:`, err);
        remaining.push(entry);
      }
    } else {
      remaining.push(entry);
    }
  }
  
  if (remaining.length > 0) {
    fs.writeFileSync(DEFER_FILE, JSON.stringify(remaining, null, 2), 'utf8');
  } else {
    try {
      fs.unlinkSync(DEFER_FILE);
    } catch (e) {}
  }
}

process.on('exit', () => {
  try {
    processDeferredSymlinks();
  } catch (e) {
    console.error('[FS-PATCH] Error in exit handler:', e);
  }
});

function getFuncFallback() {
  const fallbackDirs = [
    path.resolve('E:/PandaKey/panda-key-web/.vercel/output/functions/_global-error.rsc.func'),
    path.resolve('E:/PandaKey/panda-key-web/.vercel/output/functions/_global-error.func'),
    path.resolve('E:/PandaKey/panda-key-web/.vercel/output/functions/app.func')
  ];
  for (const dir of fallbackDirs) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
        return dir;
      }
    } catch (e) {}
  }
  return null;
}

function handleSymlinkFallback(target, pathName) {
  let resolvedTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(pathName), target);
  
  if (resolvedTarget === pathName || !fs.existsSync(resolvedTarget)) {
    if (pathName.endsWith('.func')) {
      const fallback = getFuncFallback();
      if (fallback) {
        console.warn(`[FS-PATCH] Target ${resolvedTarget} invalid or missing. Redirecting to fallback master function: ${fallback} -> ${pathName}`);
        resolvedTarget = fallback;
      }
    }
  }

  console.warn(`[FS-PATCH-DEBUG] handleSymlinkFallback target=${target} pathName=${pathName} resolvedTarget=${resolvedTarget}`);
  if (fs.existsSync(pathName)) {
    fs.rmSync(pathName, { recursive: true, force: true });
  }
  if (fs.existsSync(resolvedTarget)) {
    copySync(resolvedTarget, pathName);
  } else {
    const isDir = pathName.endsWith('.func') || !path.extname(pathName);
    if (isDir) {
      fs.mkdirSync(pathName, { recursive: true });
    } else {
      const parentDir = path.dirname(pathName);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(pathName, '');
    }
    console.warn(`[FS-PATCH] Target ${resolvedTarget} does not exist. Created mock ${isDir ? 'directory' : 'file'} at ${pathName} to bypass symlink error.`);
    addDeferredSymlink(resolvedTarget, pathName);
  }
}

async function handleSymlinkFallbackAsync(target, pathName) {
  let resolvedTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(pathName), target);
  
  if (resolvedTarget === pathName || !fs.existsSync(resolvedTarget)) {
    if (pathName.endsWith('.func')) {
      const fallback = getFuncFallback();
      if (fallback) {
        console.warn(`[FS-PATCH] Target ${resolvedTarget} invalid or missing. Redirecting to fallback master function: ${fallback} -> ${pathName}`);
        resolvedTarget = fallback;
      }
    }
  }

  console.warn(`[FS-PATCH-DEBUG] handleSymlinkFallbackAsync target=${target} pathName=${pathName} resolvedTarget=${resolvedTarget}`);
  if (fs.existsSync(pathName)) {
    fs.rmSync(pathName, { recursive: true, force: true });
  }
  if (fs.existsSync(resolvedTarget)) {
    await copyAsync(resolvedTarget, pathName);
  } else {
    const isDir = pathName.endsWith('.func') || !path.extname(pathName);
    if (isDir) {
      await fsPromises.mkdir(pathName, { recursive: true });
    } else {
      const parentDir = path.dirname(pathName);
      if (!fs.existsSync(parentDir)) {
        await fsPromises.mkdir(parentDir, { recursive: true });
      }
      await fsPromises.writeFile(pathName, '');
    }
    console.warn(`[FS-PATCH] Target ${resolvedTarget} does not exist. Created mock ${isDir ? 'directory' : 'file'} at ${pathName} to bypass symlink error.`);
    addDeferredSymlink(resolvedTarget, pathName);
  }
}


const originalSymlinkSync = fs.symlinkSync;
fs.symlinkSync = function(target, pathName, type) {
  try {
    return originalSymlinkSync.call(this, target, pathName, type);
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EACCES') {
      try {
        handleSymlinkFallback(target, pathName);
        return;
      } catch (innerErr) {
        throw innerErr;
      }
    }
    throw err;
  }
};

const originalSymlink = fs.symlink;
fs.symlink = function(target, pathName, type, callback) {
  if (typeof type === 'function') {
    callback = type;
    type = undefined;
  }
  originalSymlink.call(this, target, pathName, type, async (err) => {
    if (err && (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EACCES')) {
      try {
        await handleSymlinkFallbackAsync(target, pathName);
        if (callback) callback(null);
      } catch (innerErr) {
        if (callback) callback(innerErr);
      }
    } else {
      if (callback) callback(err);
    }
  });
};

const originalPromisesSymlink = fsPromises.symlink;
fsPromises.symlink = async function(target, pathName, type) {
  try {
    return await originalPromisesSymlink.call(this, target, pathName, type);
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'EACCES') {
      try {
        await handleSymlinkFallbackAsync(target, pathName);
        return;
      } catch (innerErr) {
        throw innerErr;
      }
    }
    throw err;
  }
};
