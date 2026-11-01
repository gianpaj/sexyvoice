// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { UpgradeCrown } from '@/components/upgrade-crown';

afterEach(cleanup);

describe('UpgradeCrown', () => {
  it('links to the credits page, named by its tooltip', () => {
    render(<UpgradeCrown tooltip="Upgrade for 2× limit" />);

    expect(
      screen.getByRole('link', { name: 'Upgrade for 2× limit' }),
    ).toHaveAttribute('href', '/dashboard/credits');
  });
});
