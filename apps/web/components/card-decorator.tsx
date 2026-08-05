import type { ReactNode } from 'react';

/**
 * Square icon badge used above feature card titles on the marketing pages.
 */
export const CardDecorator = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto grid size-36 place-items-center">
    <div className="flex size-12 items-center justify-center rounded-sm border-t border-l bg-brand-red/65">
      {children}
    </div>
  </div>
);
