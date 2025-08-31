import assert from 'node:assert';
import { describe, test } from 'node:test';
import { estimateCredits, getCharactersLimit, getEmotionTags } from './ai';

describe('estimateCredits', async () => {
  test('should correctly estimate credits for Spanish voice with token counting', async () => {
    const text = 'Hello world';
    const credits = await estimateCredits(text, 'javi');
    // Should be based on tokens (2 tokens) multiplied by 8x Spanish multiplier
    assert.ok(credits > 0);
    assert.ok(credits === Math.ceil(2 * 8)); // ~16 credits
  });

  test('should correctly estimate credits for clone voice', async () => {
    const text = 'Hello world test';
    const credits = await estimateCredits(text, 'clone');
    // Should be based on tokens multiplied by 11x clone multiplier
    assert.ok(credits > 0);
    const expectedTokens = 3; // Approximately 3 tokens for this text
    assert.ok(credits === Math.ceil(expectedTokens * 11));
  });

  test('should correctly estimate credits for regular voice', async () => {
    const text = 'This is a test message';
    const credits = await estimateCredits(text, 'tara');
    // Should be based on tokens multiplied by 4x default multiplier
    assert.ok(credits > 0);
    assert.ok(credits >= 4); // At least 4 credits (1 token * 4)
  });

  test('should handle gpro model override', async () => {
    const text = 'Hello world';
    const credits = await estimateCredits(text, 'tara', 'gpro');
    // Should use 4x multiplier regardless of voice
    const expectedTokens = 2;
    assert.ok(credits === Math.ceil(expectedTokens * 4));
  });

  test('should handle empty text', async () => {
    const text = '';
    const credits = await estimateCredits(text, 'tara');
    assert.equal(credits, 0);
  });

  test('should handle whitespace-only text', async () => {
    const text = '   ';
    const credits = await estimateCredits(text, 'tara');
    assert.equal(credits, 0);
  });

  test('should throw error for missing voice parameter', async () => {
    const text = 'Hello world';
    await assert.rejects(
      async () => await estimateCredits(text, ''),
      { message: 'Voice is required' }
    );
  });

  test('should handle special characters and punctuation', async () => {
    const text = 'Hello, world! How are you?';
    const credits = await estimateCredits(text, 'tara');
    assert.ok(credits > 0);
    // Should count tokens, not just words
    assert.ok(credits >= 4); // At least some credits for this text
  });
});

describe('getCharactersLimit', () => {
  test('should return GEMINI_LIMIT for gpro model', () => {
    const limit = getCharactersLimit('gpro');
    assert.equal(limit, 1000);
  });

  test('should return DEFAULT_LIMIT for other models', () => {
    const limit = getCharactersLimit('other-model');
    assert.equal(limit, 500);
  });

  test('should return DEFAULT_LIMIT for undefined model', () => {
    const limit = getCharactersLimit(undefined as any);
    assert.equal(limit, 500);
  });
});

describe('getEmotionTags', () => {
  test('should return Italian emotion tags', () => {
    const tags = getEmotionTags('it-IT');
    assert.equal(tags, '<sigh>, <laugh>, <cough>, <sniffle>, <groan>, <yawn>, <gemito>, <gasp>');
  });

  test('should return Spanish emotion tags', () => {
    const tags = getEmotionTags('es-ES');
    assert.equal(tags, '<groan>, <chuckle>, <gasp>, <resoplido>, <laugh>, <yawn>, <cough>');
  });

  test('should return English emotion tags', () => {
    const tags = getEmotionTags('en-US');
    assert.equal(tags, '<laugh>, <chuckle>, <sigh>, <cough>, <sniffle>, <groan>, <yawn>, <gasp>');
  });

  test('should return undefined for unsupported languages', () => {
    const tags = getEmotionTags('fr-FR');
    assert.equal(tags, undefined);
  });
});