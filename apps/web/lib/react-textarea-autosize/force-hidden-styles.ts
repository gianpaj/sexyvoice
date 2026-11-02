const HIDDEN_TEXTAREA_STYLE = {
  display: 'block',
  height: '0',
  'max-height': 'none',
  'min-height': '0',
  overflow: 'hidden',
  position: 'absolute',
  right: '0',
  top: '0',
  visibility: 'hidden',
  'z-index': '-1000',
} as const;

const forceHiddenStyles = (node: HTMLElement) => {
  for (const [key, value] of Object.entries(HIDDEN_TEXTAREA_STYLE)) {
    node.style.setProperty(key, value, 'important');
  }
};

export default forceHiddenStyles;
