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
  const [innerWidth, setInnerWidth] = React.useState<number>(0);

  React.useEffect(() => {
    const onResize = () => {
      setIsMobile375(window.innerWidth <= BREAKPOINT_375);
      setIsMobile414(window.innerWidth <= BREAKPOINT_414);
      setIsMobile430(window.innerWidth <= BREAKPOINT_430);
      setInnerWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return {
    isMobile375: !!isMobile375,
    isMobile414: !!isMobile414,
    isMobile430: !!isMobile430,
    innerWidth,
  };
}
