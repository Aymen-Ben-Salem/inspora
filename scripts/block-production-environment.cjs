/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");

const forbiddenName = ".env.production.local";

function isForbidden(target) {
  if (typeof target !== "string" && !Buffer.isBuffer(target)) return false;
  return path.basename(String(target)).toLowerCase() === forbiddenName;
}

function missing(target) {
  const error = new Error(`ENOENT: no such file or directory, open '${target}'`);
  error.code = "ENOENT";
  error.errno = -4058;
  error.path = target;
  error.syscall = "open";
  return error;
}

const readFileSync = fs.readFileSync.bind(fs);
fs.readFileSync = function guardedReadFileSync(target, ...args) {
  if (isForbidden(target)) throw missing(target);
  return readFileSync(target, ...args);
};

const openSync = fs.openSync.bind(fs);
fs.openSync = function guardedOpenSync(target, ...args) {
  if (isForbidden(target)) throw missing(target);
  return openSync(target, ...args);
};

const createReadStream = fs.createReadStream.bind(fs);
fs.createReadStream = function guardedCreateReadStream(target, ...args) {
  if (isForbidden(target)) throw missing(target);
  return createReadStream(target, ...args);
};
