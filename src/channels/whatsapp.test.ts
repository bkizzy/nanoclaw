import { describe, it, expect } from 'vitest';
import { isOwnEcho } from './whatsapp.js';

describe('isOwnEcho', () => {
  const ASSISTANT_NAME = 'Bot';

  function cache(...ids: string[]): { has(id: string): boolean } {
    const set = new Set(ids);
    return { has: (id: string) => set.has(id) };
  }

  it('drops messages whose id is in the sent-message cache', () => {
    expect(
      isOwnEcho({
        messageId: 'msg-42',
        text: 'anything',
        sentMessageCache: cache('msg-42'),
        assistantHasOwnNumber: false,
        assistantName: ASSISTANT_NAME,
      }),
    ).toBe(true);
  });

  it('drops messages whose text carries the assistant prefix when bot rides on user number', () => {
    expect(
      isOwnEcho({
        messageId: 'msg-uncached',
        text: 'Bot: here is your answer',
        sentMessageCache: cache(),
        assistantHasOwnNumber: false,
        assistantName: ASSISTANT_NAME,
      }),
    ).toBe(true);
  });

  it('keeps prefix-matching messages when bot has its own number (prefix not added on outbound)', () => {
    expect(
      isOwnEcho({
        messageId: 'msg-uncached',
        text: 'Bot: said someone else',
        sentMessageCache: cache(),
        assistantHasOwnNumber: true,
        assistantName: ASSISTANT_NAME,
      }),
    ).toBe(false);
  });

  it('keeps a non-echo fromMe message (user typing in a group the bot moderates)', () => {
    expect(
      isOwnEcho({
        messageId: 'msg-uncached',
        text: 'hey everyone, what do you think?',
        sentMessageCache: cache('different-msg'),
        assistantHasOwnNumber: false,
        assistantName: ASSISTANT_NAME,
      }),
    ).toBe(false);
  });

  it('keeps messages that start with the assistant name but not as a prefix (no colon)', () => {
    expect(
      isOwnEcho({
        messageId: 'msg-uncached',
        text: 'Bot was helpful yesterday',
        sentMessageCache: cache(),
        assistantHasOwnNumber: false,
        assistantName: ASSISTANT_NAME,
      }),
    ).toBe(false);
  });

  it('handles missing message id (treated as cache miss)', () => {
    expect(
      isOwnEcho({
        messageId: undefined,
        text: 'no id at all',
        sentMessageCache: cache(),
        assistantHasOwnNumber: false,
        assistantName: ASSISTANT_NAME,
      }),
    ).toBe(false);
  });

  it('handles null message id (treated as cache miss)', () => {
    expect(
      isOwnEcho({
        messageId: null,
        text: 'no id at all',
        sentMessageCache: cache(),
        assistantHasOwnNumber: false,
        assistantName: ASSISTANT_NAME,
      }),
    ).toBe(false);
  });
});
