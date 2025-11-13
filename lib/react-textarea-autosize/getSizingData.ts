// import isBrowser from '#is-browser';
export const noop = () => {};

// biome-ignore lint/suspicious/noExplicitAny: it's grand
export const pick = <Obj extends { [key: string]: any }, Key extends keyof Obj>(
  props: Key[],
  obj: Obj,
): Pick<Obj, Key> =>
  props.reduce(
    (acc, prop) => {
      acc[prop] = obj[prop];
      return acc;
    },
    {} as Pick<Obj, Key>,
  );

const SIZING_STYLE = [
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderTopWidth',
  'boxSizing',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  // non-standard
  'tabSize',
  'textIndent',
  // non-standard
  'textRendering',
  'textTransform',
  'width',
  'wordBreak',
  'wordSpacing',
  'scrollbarGutter',
] as const;

type SizingProps = Extract<
  (typeof SIZING_STYLE)[number],
  keyof CSSStyleDeclaration
>;

type SizingStyle = Pick<CSSStyleDeclaration, SizingProps>;

export interface SizingData {
  sizingStyle: SizingStyle;
  paddingSize: number;
  borderSize: number;
}

const isIE =
  typeof window !== 'undefined'
    ? !!(document.documentElement as any).currentStyle
    : false;

const getSizingData = (node: HTMLElement): SizingData | null => {
  const style = window.getComputedStyle(node);

  if (style === null) {
    return null;
  }

  const sizingStyle = pick(SIZING_STYLE as unknown as SizingProps[], style);
  const { boxSizing } = sizingStyle;

  // probably node is detached from DOM, can't read computed dimensions
  if (boxSizing === '') {
    return null;
  }

  // IE (Edge has already correct behaviour) returns content width as computed width
  // so we need to add manually padding and border widths
  if (isIE && boxSizing === 'border-box') {
    sizingStyle.width =
      Number.parseFloat(sizingStyle.width!) +
      Number.parseFloat(sizingStyle.borderRightWidth!) +
      Number.parseFloat(sizingStyle.borderLeftWidth!) +
      Number.parseFloat(sizingStyle.paddingRight!) +
      Number.parseFloat(sizingStyle.paddingLeft!) +
      'px';
  }

  const paddingSize =
    Number.parseFloat(sizingStyle.paddingBottom!) +
    Number.parseFloat(sizingStyle.paddingTop!);

  const borderSize =
    Number.parseFloat(sizingStyle.borderBottomWidth!) +
    Number.parseFloat(sizingStyle.borderTopWidth!);

  return {
    sizingStyle,
    paddingSize,
    borderSize,
  };
};

export default getSizingData;
