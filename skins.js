// Ghost Assistant — figurine skins.
// Each skin draws into a 112×128 viewBox. Elements with class "eye" blink,
// "happy-eye" replaces them when every task is done.
// `p` prefixes SVG ids so several previews can sit on one page.
(function () {
  const GHOST = `M56 8 C28 8 12 30 12 56 L12 112
    Q19 122 26 112 Q33 102 40 112 Q47 122 56 112 Q65 102 72 112 Q79 122 86 112 Q93 102 100 112
    L100 56 C100 30 84 8 56 8 Z`;
  const happy = (l, r, y, color, w = 3.5) =>
    `<path class="happy-eye" d="M${l - 7} ${y + 2} Q${l} ${y - 7} ${l + 7} ${y + 2}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
     <path class="happy-eye" d="M${r - 7} ${y + 2} Q${r} ${y - 7} ${r + 7} ${y + 2}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

  const SKINS = [
    {
      id: 'classic', name: 'Boo', anim: 'float', accent: '#7b5cff',
      svg: (p) => `
        <defs><linearGradient id="${p}g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ece6ff"/></linearGradient></defs>
        <path fill="url(#${p}g)" stroke="#d9cfff" stroke-width="2" d="${GHOST}"/>
        <g class="eye"><ellipse cx="42" cy="52" rx="6" ry="8" fill="#2b2540"/><circle cx="44" cy="48.5" r="2" fill="#fff"/></g>
        <g class="eye"><ellipse cx="70" cy="52" rx="6" ry="8" fill="#2b2540"/><circle cx="72" cy="48.5" r="2" fill="#fff"/></g>
        ${happy(42, 70, 52, '#2b2540')}
        <ellipse cx="32" cy="66" rx="7" ry="4" fill="#ffb3cb" opacity=".75"/>
        <ellipse cx="80" cy="66" rx="7" ry="4" fill="#ffb3cb" opacity=".75"/>
        <path d="M50 66 Q56 72 62 66" stroke="#2b2540" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    },
    {
      id: 'neon', name: 'Neon', anim: 'float', accent: '#00d9ff',
      svg: (p) => `
        <defs>
          <linearGradient id="${p}n" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#00f0ff"/><stop offset="1" stop-color="#ff3df2"/></linearGradient>
          <linearGradient id="${p}nb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2a1858"/><stop offset="1" stop-color="#120a26"/></linearGradient>
          <filter id="${p}glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.6" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path d="${GHOST}" fill="url(#${p}nb)" stroke="url(#${p}n)" stroke-width="3.5" filter="url(#${p}glow)"/>
        <path d="M24 40 Q30 22 46 17" stroke="#ffffff" stroke-opacity=".25" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g filter="url(#${p}glow)">
          <g class="eye"><rect x="36" y="43" width="12" height="17" rx="6" fill="#00f0ff"/></g>
          <g class="eye"><rect x="64" y="43" width="12" height="17" rx="6" fill="#00f0ff"/></g>
          ${happy(42, 70, 53, '#00f0ff')}
          <path d="M48 68 Q56 75 64 68" stroke="#ff3df2" stroke-width="3" fill="none" stroke-linecap="round"/>
        </g>`,
    },
    {
      id: 'dog', name: 'Biscuit', anim: 'float', accent: '#e08a3c',
      svg: () => `
        <path class="tail" style="transform-origin:84px 106px" d="M84 106 Q105 100 100 79" stroke="#c98a4b" stroke-width="8" fill="none" stroke-linecap="round"/>
        <ellipse cx="56" cy="102" rx="30" ry="20" fill="#e9b77a"/>
        <ellipse cx="56" cy="106" rx="15" ry="13" fill="#fff6ea"/>
        <ellipse cx="42" cy="119" rx="9" ry="5.5" fill="#fff6ea"/>
        <ellipse cx="70" cy="119" rx="9" ry="5.5" fill="#fff6ea"/>
        <ellipse cx="56" cy="54" rx="36" ry="32" fill="#e9b77a"/>
        <ellipse cx="71" cy="50" rx="11" ry="12" fill="#d49a5c"/>
        <path d="M26 30 C10 34 7 60 15 74 C21 82 31 74 31 60 C31 48 30 38 26 30 Z" fill="#9a6236"/>
        <path d="M86 30 C102 34 105 60 97 74 C91 82 81 74 81 60 C81 48 82 38 86 30 Z" fill="#9a6236"/>
        <ellipse cx="56" cy="68" rx="17" ry="12" fill="#fff6ea"/>
        <g class="eye"><ellipse cx="42" cy="51" rx="5.5" ry="7" fill="#2b2540"/><circle cx="44" cy="48" r="1.8" fill="#fff"/></g>
        <g class="eye"><ellipse cx="70" cy="51" rx="5.5" ry="7" fill="#2b2540"/><circle cx="72" cy="48" r="1.8" fill="#fff"/></g>
        ${happy(42, 70, 52, '#2b2540')}
        <ellipse cx="56" cy="62" rx="6.5" ry="4.5" fill="#2b2540"/>
        <ellipse cx="54" cy="60.5" rx="2" ry="1.2" fill="#fff" opacity=".6"/>
        <path d="M52.5 70.5 Q56 82 59.5 70.5 Z" fill="#ff7aa2"/>
        <path d="M49 68.5 Q52.5 72 56 68.5 Q59.5 72 63 68.5" stroke="#2b2540" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <rect x="35" y="81" width="42" height="6" rx="3" fill="#7b5cff"/>
        <circle cx="56" cy="89" r="4" fill="#ffd34d"/>`,
    },
    {
      id: 'panda', name: 'Bao', anim: 'hover', accent: '#3f9a63',
      svg: () => `
        <rect x="88" y="62" width="6" height="56" rx="3" fill="#7cc576" transform="rotate(12 91 90)"/>
        <path d="M93 66 q10 -6 14 2 q-8 2 -14 -2z" fill="#9ad88f"/>
        <ellipse cx="56" cy="102" rx="30" ry="20" fill="#ffffff" stroke="#e3e3ea" stroke-width="2"/>
        <ellipse cx="42" cy="119" rx="10" ry="6" fill="#2b2b36"/>
        <ellipse cx="70" cy="119" rx="10" ry="6" fill="#2b2b36"/>
        <ellipse cx="30" cy="99" rx="9" ry="14" fill="#2b2b36" transform="rotate(25 30 99)"/>
        <ellipse cx="84" cy="96" rx="9" ry="14" fill="#2b2b36" transform="rotate(-35 84 96)"/>
        <circle cx="25" cy="27" r="12" fill="#2b2b36"/>
        <circle cx="87" cy="27" r="12" fill="#2b2b36"/>
        <ellipse cx="56" cy="54" rx="38" ry="33" fill="#ffffff" stroke="#e3e3ea" stroke-width="2"/>
        <ellipse cx="41" cy="54" rx="10" ry="13" fill="#2b2b36" transform="rotate(-25 41 54)"/>
        <ellipse cx="71" cy="54" rx="10" ry="13" fill="#2b2b36" transform="rotate(25 71 54)"/>
        <g class="eye"><circle cx="42" cy="53" r="4.6" fill="#fff"/><circle cx="43" cy="53.5" r="2.5" fill="#2b2b36"/></g>
        <g class="eye"><circle cx="70" cy="53" r="4.6" fill="#fff"/><circle cx="71" cy="53.5" r="2.5" fill="#2b2b36"/></g>
        ${happy(42, 70, 54, '#ffffff', 3)}
        <ellipse cx="56" cy="66" rx="5" ry="3.5" fill="#2b2b36"/>
        <path d="M51 71 Q53.5 74 56 71 Q58.5 74 61 71" stroke="#2b2b36" stroke-width="2" fill="none" stroke-linecap="round"/>
        <ellipse cx="29" cy="70" rx="6" ry="3.5" fill="#ffb3cb" opacity=".7"/>
        <ellipse cx="83" cy="70" rx="6" ry="3.5" fill="#ffb3cb" opacity=".7"/>`,
    },
    {
      id: 'frog', name: 'Ribbit', anim: 'squish', accent: '#3fae5a',
      svg: () => `
        <ellipse cx="32" cy="119" rx="13" ry="5.5" fill="#4caf50"/>
        <ellipse cx="80" cy="119" rx="13" ry="5.5" fill="#4caf50"/>
        <ellipse cx="56" cy="100" rx="30" ry="20" fill="#6fd36b"/>
        <ellipse cx="56" cy="104" rx="18" ry="13" fill="#e6f9c8"/>
        <ellipse cx="56" cy="62" rx="42" ry="28" fill="#6fd36b"/>
        <circle cx="33" cy="38" r="16" fill="#6fd36b"/>
        <circle cx="79" cy="38" r="16" fill="#6fd36b"/>
        <circle cx="33" cy="38" r="11.5" fill="#fff"/>
        <circle cx="79" cy="38" r="11.5" fill="#fff"/>
        <g class="eye"><circle cx="34" cy="39" r="6.5" fill="#1f3b2a"/><circle cx="36.5" cy="36" r="2.2" fill="#fff"/></g>
        <g class="eye"><circle cx="80" cy="39" r="6.5" fill="#1f3b2a"/><circle cx="82.5" cy="36" r="2.2" fill="#fff"/></g>
        ${happy(33, 79, 40, '#1f3b2a', 3.4)}
        <circle cx="51" cy="58" r="1.6" fill="#2f7a3a"/><circle cx="61" cy="58" r="1.6" fill="#2f7a3a"/>
        <path d="M33 68 Q56 86 79 68" stroke="#1f3b2a" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="24" cy="70" rx="6.5" ry="3.8" fill="#ff9fb8" opacity=".7"/>
        <ellipse cx="88" cy="70" rx="6.5" ry="3.8" fill="#ff9fb8" opacity=".7"/>`,
    },
    {
      id: 'penguin', name: 'Pip', anim: 'hover', accent: '#ff5c8a',
      svg: () => `
        <ellipse cx="44" cy="120" rx="10" ry="5" fill="#ffa53d"/>
        <ellipse cx="68" cy="120" rx="10" ry="5" fill="#ffa53d"/>
        <ellipse cx="19" cy="80" rx="8" ry="20" fill="#23304d" transform="rotate(28 19 80)"/>
        <ellipse cx="93" cy="80" rx="8" ry="20" fill="#23304d" transform="rotate(-28 93 80)"/>
        <path d="M56 12 C84 12 98 44 98 78 C98 106 80 120 56 120 C32 120 14 106 14 78 C14 44 28 12 56 12 Z" fill="#23304d"/>
        <path d="M56 32 C40 24 25 36 28 56 C30 70 35 80 34 96 C36 112 46 116 56 116 C66 116 76 112 78 96 C77 80 82 70 84 56 C87 36 72 24 56 32 Z" fill="#fff"/>
        <path d="M36 20 Q46 13 58 14" stroke="#fff" stroke-opacity=".2" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g class="eye"><ellipse cx="44" cy="52" rx="5" ry="6.5" fill="#23304d"/><circle cx="45.8" cy="49.5" r="1.7" fill="#fff"/></g>
        <g class="eye"><ellipse cx="68" cy="52" rx="5" ry="6.5" fill="#23304d"/><circle cx="69.8" cy="49.5" r="1.7" fill="#fff"/></g>
        ${happy(44, 68, 53, '#23304d', 3.2)}
        <path d="M49 62 Q56 57 63 62 Q56 71 49 62 Z" fill="#ffa53d"/>
        <ellipse cx="35" cy="65" rx="5.5" ry="3.2" fill="#ffb3cb" opacity=".8"/>
        <ellipse cx="77" cy="65" rx="5.5" ry="3.2" fill="#ffb3cb" opacity=".8"/>
        <path d="M22 76 Q56 92 90 76 L90 85 Q56 101 22 85 Z" fill="#ff5c8a"/>
        <path d="M68 88 L80 108 L71 111 L61 91 Z" fill="#e8487a"/>
`,
    },
  ];

  const api = {
    list: SKINS,
    get: (id) => SKINS.find((s) => s.id === id) || SKINS[0],
    render: (id, prefix = 'k') => {
      const s = api.get(id);
      return `<svg viewBox="0 0 112 128" width="100%" height="100%" overflow="visible">${s.svg(prefix + s.id)}</svg>`;
    },
  };
  window.SKINS = api;
})();
