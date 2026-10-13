import test from 'node:test';
import assert from 'node:assert/strict';
import { extractShortcode, decodeEntities, parseCaption, parseComments, supportsTemperature } from './lib.js';

test('extractShortcode', () => {
  assert.equal(extractShortcode('https://www.instagram.com/p/ABC_12-x/?igsh=1'), 'ABC_12-x');
  assert.equal(extractShortcode('https://instagram.com/reel/XYZ/'), 'XYZ');
  assert.equal(extractShortcode('https://instagram.com/user/p/QQ1/'), 'QQ1');
  assert.equal(extractShortcode('https://example.com/p/ABC'), null);
});

test('decodeEntities handles emoji and ampersand', () => {
  assert.equal(decodeEntities('&#x1F600; &amp;lt; &quot;a&quot;'), '😀 &lt; "a"');
});

test('parseCaption strips stats prefix', () => {
  const html = '<meta property="og:description" content="1,234 likes, 5 comments - user on March 3, 2024: &quot;오늘 카페: 좋아요&quot;." />';
  assert.equal(parseCaption(html), '오늘 카페: 좋아요');
});

test('parseCaption keeps caption without prefix', () => {
  const html = '<meta property="og:description" content="맛집: 여기 최고" />';
  assert.equal(parseCaption(html), '맛집: 여기 최고');
});

test('parseCaption returns null without meta', () => {
  assert.equal(parseCaption('<html></html>'), null);
});

test('parseComments strips list markers only at line start', () => {
  const out = parseComments('1. 좋아요\n- 멋져요\n2024년 여행 기대돼요\n\n', 5);
  assert.deepEqual(out, ['좋아요', '멋져요', '2024년 여행 기대돼요']);
  assert.equal(parseComments('a\nb\nc', 2).length, 2);
});

test('supportsTemperature', () => {
  assert.equal(supportsTemperature('gpt-4o-mini'), true);
  assert.equal(supportsTemperature('gpt-5.4-mini'), false);
});
