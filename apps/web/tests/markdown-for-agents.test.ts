import { describe, expect, it } from 'vitest';

import {
  buildMarkdownResponse,
  estimateMarkdownTokens,
  MARKDOWN_CONTENT_TYPE,
  renderBlogListMarkdown,
  renderBlogPostMarkdown,
  renderPolicyMarkdown,
} from '../lib/markdown-for-agents';

describe('estimateMarkdownTokens', () => {
  it('returns zero for empty text', () => {
    expect(estimateMarkdownTokens('')).toBe(0);
  });

  it('uses a minimum of one token for non-empty text', () => {
    expect(estimateMarkdownTokens('a')).toBe(1);
  });

  it('estimates tokens at roughly four characters per token', () => {
    expect(estimateMarkdownTokens('abcd')).toBe(1);
    expect(estimateMarkdownTokens('abcde')).toBe(2);
    expect(estimateMarkdownTokens('a'.repeat(12))).toBe(3);
  });
});

describe('buildMarkdownResponse', () => {
  it('sets markdown response headers', async () => {
    const response = buildMarkdownResponse('# Hello');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(MARKDOWN_CONTENT_TYPE);
    expect(response.headers.get('x-markdown-tokens')).toBe('2');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, must-revalidate',
    );
    expect(await response.text()).toBe('# Hello');
  });

  it('preserves existing headers and appends Accept to Vary', () => {
    const response = buildMarkdownResponse('body', {
      headers: {
        Vary: 'Origin',
        'Cache-Control': 'private, max-age=60',
        'x-test-header': 'present',
      },
      status: 201,
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('Vary')).toBe('Origin, Accept');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=60');
    expect(response.headers.get('x-test-header')).toBe('present');
    expect(response.headers.get('Content-Type')).toBe(MARKDOWN_CONTENT_TYPE);
  });
});

describe('renderBlogListMarkdown', () => {
  const messages = {
    landing: {
      latestPosts: 'Latest Posts',
      blogDescription: 'Guides and news about voice AI.',
      noPostsAvailable: 'No posts available yet.',
    },
  } as IntlMessages;

  it('renders blog posts with canonical URLs based on slugAsParams', () => {
    const posts = [
      {
        title: 'Hello from SexyVoice.ai',
        description: 'Intro post',
        date: '2025-04-28T00:00:00.000Z',
        slugAsParams: 'hello-from-sexyvoice',
      },
    ] as const;

    const markdown = renderBlogListMarkdown('en', messages, posts as never);

    expect(markdown).toContain('# Latest Posts');
    expect(markdown).toContain('Guides and news about voice AI.');
    expect(markdown).toContain(
      '## [Hello from SexyVoice.ai](https://sexyvoice.ai/en/blog/hello-from-sexyvoice)',
    );
    expect(markdown).toContain('_2025-04-28T00:00:00.000Z_');
    expect(markdown).toContain('Canonical URL: https://sexyvoice.ai/en/blog');
  });

  it('renders the empty state when there are no posts', () => {
    const markdown = renderBlogListMarkdown('en', messages, []);

    expect(markdown).toContain('No posts available yet.');
  });
});

describe('renderBlogPostMarkdown', () => {
  it('renders metadata and canonical URL using slugAsParams', () => {
    const post = {
      title: 'Hello from SexyVoice.ai',
      description: 'Intro post',
      date: '2025-04-28T00:00:00.000Z',
      author: 'SexyVoice.ai',
      locale: 'en',
      slugAsParams: 'hello-from-sexyvoice',
      body: {
        raw: 'Building the next generation of voice AI',
      },
    };

    const markdown = renderBlogPostMarkdown(post as never);

    expect(markdown).toContain('# Hello from SexyVoice.ai');
    expect(markdown).toContain('> Intro post');
    expect(markdown).toContain('Published: 2025-04-28');
    expect(markdown).toContain('Author: SexyVoice.ai');
    expect(markdown).toContain(
      'Canonical: https://sexyvoice.ai/en/blog/hello-from-sexyvoice',
    );
    expect(markdown).toContain('Building the next generation of voice AI');
  });
});

describe('renderPolicyMarkdown', () => {
  it('renders updated date, body, and canonical URL', () => {
    const policy = {
      title: 'Terms & Conditions | SexyVoice.ai',
      updated: '2026-03-02',
      description: 'Terms of service for SexyVoice.ai.',
      locale: 'en',
      slug: 'terms',
      body: {
        raw: '## General Terms\n\nBy using SexyVoice.ai, you agree to these terms.',
      },
    };

    const markdown = renderPolicyMarkdown(policy as never);

    expect(markdown).toContain('# Terms & Conditions | SexyVoice.ai');
    expect(markdown).toContain('_Updated: 2026-03-02_');
    expect(markdown).toContain('Terms of service for SexyVoice.ai.');
    expect(markdown).toContain('## General Terms');
    expect(markdown).toContain('Canonical URL: https://sexyvoice.ai/en/terms');
  });
});
