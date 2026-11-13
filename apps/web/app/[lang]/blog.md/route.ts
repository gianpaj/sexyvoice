import { markdownRoute, markdownStaticParams } from '@/lib/markdown-for-agents';

export const dynamic = 'force-static';

export const generateStaticParams = markdownStaticParams;

export const GET = markdownRoute('/blog');
