(() => {
  const specs = [
    [7, 22, 11], [20, 13, 8, -3], [38, 30, 13, -6], [52, 16, 9, -1],
    [64, 34, 14, -8], [78, 18, 10, -4], [90, 26, 12, -5]
  ];
  const frag = document.createDocumentFragment();
  for (const [left, size, dur, delay] of specs) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.cssText = `left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;` +
      (delay ? `animation-delay:${delay}s;` : '');
    frag.appendChild(b);
  }
  document.addEventListener('DOMContentLoaded', () => document.body.prepend(frag), { once: true });
})();
