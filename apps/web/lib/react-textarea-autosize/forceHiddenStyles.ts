const HIDDEN_TEXTAREA_STYLE = {
  'min-height': '0',
  'max-height': 'none',
  height: '0',
  visibility: 'hidden',
  overflow: 'hidden',
  position: 'absolute',
  'z-index': '-1000',
  top: '0',
  right: '0',
  display: 'block',
} as const;

const forceHiddenStyles = (node: HTMLElement) => {
  for (const [key, value] of Object.entries(HIDDEN_TEXTAREA_STYLE)) {
    node.style.setProperty(key, value, 'important');
  }
};

export default forceHiddenStyles;
