'use client';

import Image from 'next/image';
// biome-ignore lint/performance/noNamespaceImport: namespace import required for Object.keys/values injection into new Function scope
import * as React from 'react';
import { useMemo } from 'react';
// biome-ignore lint/performance/noNamespaceImport: namespace import required for Object.keys/values injection into new Function scope
import * as _jsx_runtime from 'react/jsx-runtime';
// biome-ignore lint/performance/noNamespaceImport: namespace import required for Object.keys/values injection into new Function scope
import * as ReactDOM from 'react-dom';

// Replicates mdx-bundler/client getMDXComponent without requiring react as a
// standalone CJS module (which fails in the Vercel Lambda with pnpm layout).
// The scope matches mdx-bundler's exact signature: { React, ReactDOM, _jsx_runtime }.
// The compiled body.code from contentlayer2 is a self-executing IIFE that uses
// exports.default, so we call fn(...scope) and return its result directly.
function getMDXComponent(
  code: string,
  globals: Record<string, unknown> = {},
): React.ComponentType<Record<string, unknown>> {
  const scope = { React, ReactDOM, _jsx_runtime, ...globals };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(...Object.keys(scope), code);
  return fn(...Object.values(scope)).default;
}

const components = {
  Image,
};

interface MdxProps {
  code: string;
}

export function Mdx({ code }: MdxProps) {
  const Component = useMemo(() => getMDXComponent(code), [code]);

  return <Component components={components} />;
}
