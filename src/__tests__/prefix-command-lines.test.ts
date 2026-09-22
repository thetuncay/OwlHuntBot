import { describe, expect, it } from 'vitest';
import { parsePrefixCommandLines } from '../utils/prefix-command-lines';

describe('parsePrefixCommandLines', () => {
  it('returns single command for one-line message', () => {
    expect(parsePrefixCommandLines('w hunt', 'w')).toEqual(['hunt']);
    expect(parsePrefixCommandLines('wh', 'w')).toEqual(['h']);
  });

  it('splits multi-line messages into separate commands', () => {
    expect(parsePrefixCommandLines('w h\nw d', 'w')).toEqual(['h', 'd']);
    expect(parsePrefixCommandLines('w h\nw d\nw s', 'w')).toEqual(['h', 'd', 's']);
  });

  it('ignores non-command lines in multi-line messages', () => {
    expect(parsePrefixCommandLines('hello\nw h', 'w')).toEqual(['h']);
  });

  it('returns null when message is not a command', () => {
    expect(parsePrefixCommandLines('what is up', 'w')).toBeNull();
    expect(parsePrefixCommandLines('w', 'w')).toBeNull();
  });
});
