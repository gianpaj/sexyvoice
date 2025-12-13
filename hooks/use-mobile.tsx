import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const BREAKPOINT_375 = 375;
const BREAKPOINT_414 = 414;
const BREAKPOINT_430 = 430;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}

export function useIsMobileSizes() {
  const [isMobile375, setIsMobile375] = React.useState<boolean | undefined>(
    undefined,
  );
  const [isMobile414, setIsMobile414] = React.useState<boolean | undefined>(
    undefined,
  );
  const [isMobile430, setIsMobile430] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql375 = window.matchMedia(`(max-width: ${BREAKPOINT_375 - 1}px)`);
    const mql414 = window.matchMedia(`(max-width: ${BREAKPOINT_414 - 1}px)`);
    const mql430 = window.matchMedia(`(max-width: ${BREAKPOINT_430 - 1}px)`);

    const onChange = () => {
      setIsMobile375(window.innerWidth <= BREAKPOINT_375);
      setIsMobile414(window.innerWidth <= BREAKPOINT_414);
      setIsMobile430(window.innerWidth <= BREAKPOINT_430);
    };

    mql375.addEventListener('change', onChange);
    mql414.addEventListener('change', onChange);
    mql430.addEventListener('change', onChange);

    onChange();

    return () => {
      mql375.removeEventListener('change', onChange);
      mql414.removeEventListener('change', onChange);
      mql430.removeEventListener('change', onChange);
    };
  }, []);

  return {
    isMobile375: !!isMobile375,
    isMobile414: !!isMobile414,
    isMobile430: !!isMobile430,
  };
}
