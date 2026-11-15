import { describe, expect, it } from 'vitest';
import {
  bumpVersion,
  floatForms,
  formatFloat,
  formatVersion,
  nextUid,
  parseRef,
  parseVersion,
  resolveFloat,
  resolveRef,
  toTypeId,
  type Version,
} from '../src/lib/eid.ts';
import { findWikilinks, parseTarget, parseWikilink } from '../src/lib/wikilink.ts';

const v = (s: string) => parseVersion(s)!;

describe('versions', () => {
  it('omits trailing zero components', () => {
    expect(formatVersion([1, 0, 0])).toBe('1');
    expect(formatVersion([3, 2, 0])).toBe('3.2');
    expect(formatVersion([5, 0, 1])).toBe('5.0.1');
  });
  it('parses and rejects', () => {
    expect(v('3.2')).toEqual([3, 2, 0]);
    expect(parseVersion('01')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
  it('bumps', () => {
    expect(bumpVersion([1, 2, 3], 0)).toEqual([2, 0, 0]);
    expect(bumpVersion([1, 2, 3], 1)).toEqual([1, 3, 0]);
    expect(bumpVersion([1, 2, 3], 2)).toEqual([1, 2, 4]);
  });
});

describe('uids', () => {
  it('count in hex from zero', () => {
    expect(nextUid([])).toBe('0');
    expect(nextUid(['0', '9'])).toBe('a');
    expect(nextUid(['f', '3'])).toBe('10');
  });
});

describe('floating versions', () => {
  it('writes the + on the floating component', () => {
    expect(floatForms([6, 2, 3])).toEqual(['6+.2.3', '6.2+.3', '6.2.3+']);
    expect(floatForms([1, 0, 0])).toEqual(['1+', '1.0+', '1.0.0+']);
    expect(formatFloat([3, 2, 0], 0)).toBe('3+.2');
  });
  it('floats from the + down and keeps what is above it', () => {
    const all = ['5.9', '6.2.3', '6.2.7', '6.5.12', '7'].map(v);
    expect(resolveFloat(all, v('6.2.3'), 0)).toEqual([7, 0, 0]);
    expect(resolveFloat(all, v('6.2.3'), 1)).toEqual([6, 5, 12]);
    expect(resolveFloat(all, v('6.2.3'), 2)).toEqual([6, 2, 7]);
  });
  it('a patch float stays within its minor', () => {
    const all = ['6.2.3', '6.2.7', '6.5.12'].map(v);
    const patch = parseRef('5v6.2.3+')!;
    expect(resolveRef(patch, all)).toEqual([6, 2, 7]);
  });
});

describe('refs', () => {
  it('recognises every form', () => {
    expect(parseRef('5')).toEqual({ kind: 'list', uid: '5' });
    expect(parseRef('1al')).toEqual({ kind: 'latest', uid: '1a' });
    expect(parseRef('5v1.2')).toEqual({ kind: 'exact', uid: '5', version: [1, 2, 0] });
    expect(parseRef('5v6+.2.3')).toEqual({ kind: 'float', uid: '5', version: [6, 2, 3], level: 0 });
    expect(parseRef('5v6.2+.3')).toEqual({ kind: 'float', uid: '5', version: [6, 2, 3], level: 1 });
    expect(parseRef('5v6.2.3+')).toEqual({ kind: 'float', uid: '5', version: [6, 2, 3], level: 2 });
  });
  it('is lenient about abbreviated floats and case', () => {
    expect(parseRef('5v6.+')).toEqual({ kind: 'float', uid: '5', version: [6, 0, 0], level: 1 });
    expect(parseRef('5V1')).toEqual({ kind: 'exact', uid: '5', version: [1, 0, 0] });
  });
  it('rejects nonsense', () => {
    for (const s of ['', 'v1', '05', '5v', '5v1+.2+', '5vx', 'g', '5v1.2.3.4+']) expect(parseRef(s)).toBeNull();
  });
  it('maps type names', () => {
    expect(toTypeId('post')).toBe('p');
    expect(toTypeId('RFC')).toBe('rfc');
    expect(toTypeId('respaper')).toBe('rp');
    expect(toTypeId('nope')).toBeNull();
  });
});

describe('wikilinks', () => {
  it('splits path, anchor and alias', () => {
    expect(parseWikilink('[[rfc/5/v1.2#^abc|text]]')).toMatchObject({
      embed: false,
      path: 'rfc/5/v1.2',
      anchor: '^abc',
      alias: 'text',
    });
    expect(parseWikilink('![[fig.png|300]]')).toMatchObject({ embed: true, path: 'fig.png', alias: '300' });
  });
  it('classifies targets', () => {
    const exact = { kind: 'entry', type: 'rfc', ref: { kind: 'exact', uid: '5', version: [1, 2, 0] as Version } };
    expect(parseTarget('rfc/5/v1.2')).toEqual(exact);
    expect(parseTarget('rfc/5v1.2')).toEqual(exact);
    expect(parseTarget('rfc/5/v1.2.md')).toEqual(exact);
    expect(parseTarget('post/5')).toEqual({ kind: 'entry', type: 'p', ref: { kind: 'list', uid: '5' } });
    expect(parseTarget('fig.png')).toEqual({ kind: 'file', path: 'fig.png' });
    expect(parseTarget('')).toEqual({ kind: 'self' });
  });
  it('ignores links inside code', () => {
    const md = 'a [[p/1]] b `[[p/2]]`\n```\n[[p/3]]\n```\n';
    expect(findWikilinks(md).map((l) => l.path)).toEqual(['p/1']);
  });
});
