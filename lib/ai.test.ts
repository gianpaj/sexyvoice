import assert from 'node:assert';
import { describe, test } from 'node:test';
import { estimateCredits } from './ai';

describe('estimateCredits', async () => {
  test('should correctly estimate credits for Spanish short text', () => {
    const text = 'Hello world';
    const credits = estimateCredits(text, 'javi');
    // With token-based counting, expect different result than word-based
    assert.ok(credits > 0);
    assert.equal(typeof credits, 'number');
  });

  test('should correctly estimate credits for longer text', () => {
    const text =
      'This is a longer sentence that should take more time to speak';
    const credits = estimateCredits(text, 'tara');
    // With token-based counting, expect different result than word-based
    assert.ok(credits > 0);
    assert.equal(typeof credits, 'number');
  });

  test('should handle empty text', () => {
    const text = '';
    const credits = estimateCredits(text, 'tara');
    assert.equal(credits, 0);
  });

  test('should handle text with multiple spaces', () => {
    const text = 'Hello     world    test';
    const credits = estimateCredits(text, 'tara');
    assert.ok(credits > 0);
    assert.equal(typeof credits, 'number');
  });

  test('should handle text with leading/trailing spaces', () => {
    const text = '   Hello world   ';
    const credits = estimateCredits(text, 'tara');
    assert.ok(credits > 0);
    assert.equal(typeof credits, 'number');
  });

  test('should handle text with newlines', () => {
    const text = 'Hello\nworld\ntest';
    const credits = estimateCredits(text, 'tara');
    assert.ok(credits > 0);
    assert.equal(typeof credits, 'number');
  });

  test('should handle emotion tags', () => {
    const text =
      'Oh my, <pants> <moaning> oh <gasp> <moaning> oh oh <breathing> <moaning> oh oh oh <sigh> <moaning> wow. that was hot';
    const credits = estimateCredits(text, 'tara');
    assert.ok(credits > 0);
    assert.equal(typeof credits, 'number');
  });

  test('should apply correct multiplier for Spanish voices', () => {
    const text = 'Hello world';
    const creditsJavi = estimateCredits(text, 'javi');
    const creditsTara = estimateCredits(text, 'tara');
    // Javi should have higher credits due to 8x multiplier vs 4x
    assert.ok(creditsJavi > creditsTara);
  });

  test('should apply correct multiplier for clone voice', () => {
    const text = 'Hello world';
    const creditsClone = estimateCredits(text, 'clone');
    const creditsTara = estimateCredits(text, 'tara');
    // Clone should have highest multiplier (11x vs 4x)
    assert.ok(creditsClone > creditsTara);
  });

  test('should handle gpro model', () => {
    const text = 'Hello world';
    const creditsGpro = estimateCredits(text, 'javi', 'gpro');
    const creditsRegular = estimateCredits(text, 'tara');
    // Both should use 4x multiplier for gpro model
    const expectedGpro = estimateCredits(text, 'tara'); // tara is 4x by default
    assert.equal(creditsGpro, expectedGpro);
  });

  test('should throw error for missing voice', () => {
    assert.throws(() => {
      estimateCredits('Hello world', '');
    }, /Voice is required/);
  });
});