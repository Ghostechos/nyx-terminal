/* Thèmes de Nyx Terminal — partagés entre le processus principal (require) et l'interface (<script>). */
(function (root) {
  'use strict';

  const THEMES = {
    nyx: {
      name: 'Nyx',
      colors: {
        background: '#0c0a14', foreground: '#e2def3', cursor: '#b69cff', cursorAccent: '#0c0a14',
        selectionBackground: '#8b5cf640',
        black: '#1a1626', red: '#ff6b8b', green: '#6ee7b7', yellow: '#fcd581',
        blue: '#7aa2ff', magenta: '#c084fc', cyan: '#67e8f9', white: '#cdc8e0',
        brightBlack: '#4c4566', brightRed: '#ff8fa8', brightGreen: '#9af5d3', brightYellow: '#ffe4a3',
        brightBlue: '#a5c0ff', brightMagenta: '#d8b4fe', brightCyan: '#a5f3fc', brightWhite: '#f5f3ff'
      },
      ui: { tabBar: '#07060c', surface: '#17131f', accent: '#a78bfa', accent2: '#f0abfc', text: '#e2def3', muted: '#6b6485' }
    },

    aurora: {
      name: 'Aurora',
      colors: {
        background: '#0b0e14', foreground: '#d6deeb', cursor: '#2ee6c5', cursorAccent: '#0b0e14',
        selectionBackground: '#2ee6c540',
        black: '#1b1f2a', red: '#ff5f87', green: '#3ee6a8', yellow: '#ffd479',
        blue: '#5ab0f6', magenta: '#b48cff', cyan: '#29e0e0', white: '#c8d3f5',
        brightBlack: '#4b5568', brightRed: '#ff86a3', brightGreen: '#6dffc4', brightYellow: '#ffe39e',
        brightBlue: '#86c8ff', brightMagenta: '#cdb0ff', brightCyan: '#6ff3f3', brightWhite: '#f2f6ff'
      },
      ui: { tabBar: '#07090e', surface: '#141a26', accent: '#2ee6c5', accent2: '#a277ff', text: '#d6deeb', muted: '#5d6b85' }
    },

    'tokyo-night': {
      name: 'Tokyo Night',
      colors: {
        background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', cursorAccent: '#1a1b26',
        selectionBackground: '#33467c99',
        black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
        blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
        brightBlack: '#414868', brightRed: '#ff899d', brightGreen: '#b3e57f', brightYellow: '#f0c283',
        brightBlue: '#8db0ff', brightMagenta: '#c9aaff', brightCyan: '#9ad8ff', brightWhite: '#c0caf5'
      },
      ui: { tabBar: '#16161e', surface: '#24283b', accent: '#7aa2f7', accent2: '#bb9af7', text: '#c0caf5', muted: '#565f89' }
    },

    'catppuccin-mocha': {
      name: 'Catppuccin Mocha',
      colors: {
        background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
        selectionBackground: '#585b7080',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
        blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
        brightBlack: '#585b70', brightRed: '#f5a0b8', brightGreen: '#b8ebb4', brightYellow: '#fbe9c2',
        brightBlue: '#a2c4fb', brightMagenta: '#f8d1ed', brightCyan: '#aeeade', brightWhite: '#a6adc8'
      },
      ui: { tabBar: '#181825', surface: '#313244', accent: '#cba6f7', accent2: '#89b4fa', text: '#cdd6f4', muted: '#6c7086' }
    },

    dracula: {
      name: 'Dracula',
      colors: {
        background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
        selectionBackground: '#44475acc',
        black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
        blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
        brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
        brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff'
      },
      ui: { tabBar: '#1e1f29', surface: '#343746', accent: '#ff79c6', accent2: '#bd93f9', text: '#f8f8f2', muted: '#6272a4' }
    },

    synthwave: {
      name: "Synthwave '84",
      colors: {
        background: '#241b2f', foreground: '#f0eff1', cursor: '#ff7edb', cursorAccent: '#241b2f',
        selectionBackground: '#ff7edb33',
        black: '#2a2139', red: '#fe4450', green: '#72f1b8', yellow: '#fede5d',
        blue: '#36f9f6', magenta: '#ff7edb', cyan: '#03edf9', white: '#f0eff1',
        brightBlack: '#614d85', brightRed: '#ff6b74', brightGreen: '#97ffd0', brightYellow: '#f97e72',
        brightBlue: '#7afffc', brightMagenta: '#ffa3e7', brightCyan: '#5df4fb', brightWhite: '#ffffff'
      },
      ui: { tabBar: '#1a1424', surface: '#34294f', accent: '#ff7edb', accent2: '#03edf9', text: '#f0eff1', muted: '#8a7fa8' }
    },

    'rose-pine': {
      name: 'Rosé Pine',
      colors: {
        background: '#191724', foreground: '#e0def4', cursor: '#ebbcba', cursorAccent: '#191724',
        selectionBackground: '#403d5299',
        black: '#26233a', red: '#eb6f92', green: '#31748f', yellow: '#f6c177',
        blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4',
        brightBlack: '#6e6a86', brightRed: '#f08aa8', brightGreen: '#4a90ab', brightYellow: '#f9d29c',
        brightBlue: '#b7dde4', brightMagenta: '#d5c0ef', brightCyan: '#f2d0ce', brightWhite: '#f4f2ff'
      },
      ui: { tabBar: '#12101a', surface: '#26233a', accent: '#ebbcba', accent2: '#c4a7e7', text: '#e0def4', muted: '#6e6a86' }
    },

    nord: {
      name: 'Nord',
      colors: {
        background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
        selectionBackground: '#4c566acc',
        black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
        blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
        brightBlack: '#4c566a', brightRed: '#d0777f', brightGreen: '#b5cfa0', brightYellow: '#f2d9a6',
        brightBlue: '#97b4d1', brightMagenta: '#c5a3bf', brightCyan: '#8fbcbb', brightWhite: '#eceff4'
      },
      ui: { tabBar: '#262b35', surface: '#3b4252', accent: '#88c0d0', accent2: '#b48ead', text: '#eceff4', muted: '#6b7589' }
    },

    gruvbox: {
      name: 'Gruvbox',
      colors: {
        background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828',
        selectionBackground: '#504945cc',
        black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
        blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
        brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
        brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
      },
      ui: { tabBar: '#1d2021', surface: '#3c3836', accent: '#fabd2f', accent2: '#fe8019', text: '#ebdbb2', muted: '#928374' }
    },

    'one-dark': {
      name: 'One Dark',
      colors: {
        background: '#21252b', foreground: '#abb2bf', cursor: '#528bff', cursorAccent: '#21252b',
        selectionBackground: '#3e4451cc',
        black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
        blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
        brightBlack: '#5c6370', brightRed: '#ef8189', brightGreen: '#addb8e', brightYellow: '#f0d197',
        brightBlue: '#7cc0ff', brightMagenta: '#d68fec', brightCyan: '#6ccad6', brightWhite: '#e6e6e6'
      },
      ui: { tabBar: '#1b1e23', surface: '#2c313a', accent: '#61afef', accent2: '#c678dd', text: '#d7dae0', muted: '#5c6370' }
    },

    'catppuccin-latte': {
      name: 'Catppuccin Latte (clair)',
      light: true,
      colors: {
        background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', cursorAccent: '#eff1f5',
        selectionBackground: '#acb0be80',
        black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
        blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
        brightBlack: '#6c6f85', brightRed: '#de3a5c', brightGreen: '#55b23f', brightYellow: '#e9a23d',
        brightBlue: '#4a85f7', brightMagenta: '#ef93d6', brightCyan: '#2aa9b0', brightWhite: '#bcc0cc'
      },
      ui: { tabBar: '#e6e9ef', surface: '#ffffff', accent: '#8839ef', accent2: '#1e66f5', text: '#4c4f69', muted: '#8c8fa1' }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = THEMES;
  else root.NYX_THEMES = THEMES;
})(typeof globalThis !== 'undefined' ? globalThis : this);
