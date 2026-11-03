// Inline-SVG-Symbole (übernehmen die Textfarbe über currentColor).

const svg = (body, vb = '0 0 24 24', extra = '') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const ICON = {
  weighted: svg('<circle cx="8.5" cy="14.5" r="5.5" fill="currentColor" fill-opacity=".25"/><circle cx="18" cy="8" r="3" fill="currentColor" fill-opacity=".25"/><path d="M8.5 6v2.5M8.5 20.5V23M2 14.5h-1M16 14.5h-1.5M18 3.5v1.5M18 11v1.5"/>'),
  echolot: svg('<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8" opacity=".6"/>'),
  kompass: svg('<path d="M12 1.5l2.2 8.3L22.5 12l-8.3 2.2L12 22.5l-2.2-8.3L1.5 12l8.3-2.2z" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'),
  magnet: svg('<path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z" fill="currentColor" fill-opacity=".2"/><path d="M5 7h4M15 7h4"/>'),

  flag: svg('<path d="M6 21V4"/><path d="M6 4.5c4-2.5 7 2.5 13 0v9c-6 2.5-9-2.5-13 0" fill="currentColor" fill-opacity=".9"/>'),
  dig: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7" opacity=".0"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  hint: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" fill="currentColor" fill-opacity=".25"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4.1"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/>'),
  soundOn: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fill-opacity=".25"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fill-opacity=".25"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>'),
  vibe: svg('<rect x="7.5" y="3" width="9" height="18" rx="2.5"/><path d="M3.5 8v8M20.5 8v8"/>'),
  trophy: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".25"/><path d="M7 6H3.5a3.5 3.5 0 0 0 3.8 4.3M17 6h3.5a3.5 3.5 0 0 1-3.8 4.3M12 14v4M8 21h8M9.5 18h5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.6 3.8 6 3.8 9.5s-1.2 6.9-3.8 9.5c-2.6-2.6-3.8-6-3.8-9.5S9.4 5.1 12 2.5z"/>'),
  boom: svg('<path d="M12 2l1.8 5.2L19 4.5l-2.3 5L22 12l-5.3 2.5L19 19.5l-5.2-2.7L12 22l-1.8-5.2L5 19.5l2.3-5L2 12l5.3-2.5L5 4.5l5.2 2.7z" fill="currentColor" fill-opacity=".3"/>'),
};

// Minen-Darstellung je nach Wert und Modus.
export function mineIcon(mode, value) {
  if (mode === 'magnet') {
    const c = value === 1 ? '#ff6b7f' : '#63b0ff';
    const sign = value === 1 ? '<path d="M12 7.5v9M7.5 12h9" stroke="#0b1026" stroke-width="2.6"/>' : '<path d="M7.5 12h9" stroke="#0b1026" stroke-width="2.6"/>';
    return svg(`<circle cx="12" cy="12" r="9" fill="${c}" stroke="${c}"/>${sign}`, '0 0 24 24', 'class="ico"');
  }
  const r = mode === 'weighted' && value === 2 ? 7.2 : mode === 'weighted' ? 4.6 : 6;
  const spikes = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, r1 = r + 0.5, r2 = r + (value === 2 ? 3 : 2.6);
    spikes.push(`M${(12 + Math.cos(a) * r1).toFixed(1)} ${(12 + Math.sin(a) * r1).toFixed(1)}L${(12 + Math.cos(a) * r2).toFixed(1)} ${(12 + Math.sin(a) * r2).toFixed(1)}`);
  }
  return svg(
    `<path d="${spikes.join('')}" stroke="#ffd0d8"/><circle cx="12" cy="12" r="${r}" fill="#ff4d6d" stroke="#ffd0d8" stroke-width="1.4"/><circle cx="${12 - r / 3}" cy="${12 - r / 3}" r="${r / 4}" fill="#fff" stroke="none" opacity=".8"/>`,
    '0 0 24 24', 'class="ico"'
  );
}

// Markierung: Fähnchen; bei Schweren Minen mit 1/2, bei Magneten als Pol.
export function flagIcon(mode, value) {
  if (value === 3) {
    // Mine bzw. Magnet, Sorte noch offen
    const q = '<text x="12" y="16.3" font-size="12" font-weight="900" text-anchor="middle" fill="#0b1026" stroke="none" font-family="system-ui, sans-serif">?</text>';
    if (mode === 'magnet') {
      return svg(`<circle cx="12" cy="12" r="8.5" fill="#c9cfee" stroke="#fff" stroke-opacity=".6" stroke-width="1.4"/>${q}`, '0 0 24 24', 'class="ico"');
    }
    return svg(
      `<path d="M6 21V3.5" stroke="#e8ecff"/><path d="M6 4c4-2.5 7 2.5 14 0v10c-7 2.5-10-2.5-14 0z" fill="#e3e7ff" stroke="#e3e7ff"/><text x="13.5" y="12.6" font-size="9.5" font-weight="900" text-anchor="middle" fill="#1a1203" stroke="none" font-family="system-ui, sans-serif">?</text>`,
      '0 0 24 24', 'class="ico"'
    );
  }
  if (mode === 'magnet') {
    const c = value === 1 ? '#ff6b7f' : '#63b0ff';
    const sign = value === 1 ? '<path d="M12 8v8M8 12h8" stroke="#0b1026" stroke-width="2.6"/>' : '<path d="M8 12h8" stroke="#0b1026" stroke-width="2.6"/>';
    return svg(`<circle cx="12" cy="12" r="8.5" fill="${c}" stroke="#fff" stroke-opacity=".6" stroke-width="1.4"/>${sign}`, '0 0 24 24', 'class="ico"');
  }
  const label = mode === 'weighted'
    ? `<text x="15.5" y="12.4" font-size="${value === 2 ? 9.5 : 8.5}" font-weight="900" text-anchor="middle" fill="#1a1203" stroke="none" font-family="system-ui, sans-serif">${value}</text>`
    : '';
  const fill = mode === 'weighted' && value === 2 ? '#ff7a59' : 'var(--accent)';
  return svg(
    `<path d="M6 21V3.5" stroke="#e8ecff"/><path d="M6 4c4-2.5 7 2.5 14 0v10c-7 2.5-10-2.5-14 0z" fill="${fill}" stroke="${fill}"/>${label}`,
    '0 0 24 24', 'class="ico"'
  );
}
