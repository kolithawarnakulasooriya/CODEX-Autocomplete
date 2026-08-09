'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { TtlCache } = require('../out/core/cache');
const { SlidingWindowRateLimiter } = require('../out/core/rateLimiter');

test('TTL cache expires and evicts least recently used entries', () => {
  let now = 100;
  const cache = new TtlCache(2, () => now);
  cache.set('a', 1, 50);
  cache.set('b', 2, 50);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3, 50);
  assert.equal(cache.get('b'), undefined);
  now = 151;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('c'), undefined);
});

test('rate limiter uses a rolling time window', () => {
  let now = 0;
  const limiter = new SlidingWindowRateLimiter(2, 1000, () => now);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
  now = 1001;
  assert.equal(limiter.tryAcquire(), true);
});
