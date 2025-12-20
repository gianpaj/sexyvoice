import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;
const BREAKPOINT_375 = 375;
const BREAKPOINT_414 = 414;
const BREAKPOINT_430 = 430;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
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
  const [isMobile375, setIsMobile375] = useState<boolean | undefined>(
    undefined,
  );
  const [isMobile414, setIsMobile414] = useState<boolean | undefined>(
    undefined,
  );
  const [isMobile430, setIsMobile430] = useState<boolean | undefined>(
    undefined,
  );

  useEffect(() => {
    const onResize = () => {
      setIsMobile375(window.innerWidth <= BREAKPOINT_375);
      setIsMobile414(window.innerWidth <= BREAKPOINT_414);
      setIsMobile430(window.innerWidth <= BREAKPOINT_430);
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
  };
}
