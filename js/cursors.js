/**
 * ANI-Cursor Engine for AeroNet
 * Parses .ani (RIFF) files and renders them as CSS-animated cursors.
 * ROBUST VERSION: Prevents OS crashes on invalid files or security errors.
 */

const CursorEngine = (() => {
    let animations = {};

    class RIFFReader {
        constructor(buffer) {
            this.view = new DataView(buffer);
            this.pos = 0;
        }
        readU32() {
            if (this.pos + 4 > this.view.byteLength) return 0;
            const val = this.view.getUint32(this.pos, true);
            this.pos += 4;
            return val;
        }
        readString(len) {
            if (this.pos + len > this.view.byteLength) return "";
            let str = "";
            for (let i = 0; i < len; i++) str += String.fromCharCode(this.view.getUint8(this.pos + i));
            this.pos += len;
            return str;
        }
        skip(len) { this.pos += len; }
        get isEOF() { return this.pos >= this.view.byteLength; }
    }

    async function loadAni(url) {
        try {
            if (animations[url]) return animations[url];
            const response = await fetch(url);
            if (!response.ok) return null;
            const buffer = await response.arrayBuffer();
            const ani = parseAni(buffer);
            if (ani) animations[url] = ani;
            return ani;
        } catch (e) {
            console.warn("CursorEngine: Failed to load", url, e);
            return null;
        }
    }

    function parseAni(buffer) {
        try {
            const reader = new RIFFReader(buffer);
            if (reader.readString(4) !== "RIFF") return null;
            reader.readU32(); // size
            if (reader.readString(4) !== "ACON") return null;

            let metadata = {}, frames = [], rate = null, seq = null;

            while (!reader.isEOF) {
                const chunkId = reader.readString(4);
                const chunkSize = reader.readU32();
                const chunkEnd = reader.pos + chunkSize;

                if (chunkId === "anih") {
                    metadata = { nFrames: reader.readU32(), nSteps: reader.readU32() };
                    reader.skip(chunkSize - 8);
                } else if (chunkId === "rate") {
                    rate = []; for (let i = 0; i < chunkSize / 4; i++) rate.push(reader.readU32());
                } else if (chunkId === "seq ") {
                    seq = []; for (let i = 0; i < chunkSize / 4; i++) seq.push(reader.readU32());
                } else if (chunkId === "LIST") {
                    if (reader.readString(4) === "fram") {
                        while (reader.pos < chunkEnd) {
                            const subId = reader.readString(4);
                            const subSize = reader.readU32();
                            if (subId === "icon") {
                                const frameData = new Uint8Array(buffer, reader.pos, subSize);
                                try {
                                    frames.push(URL.createObjectURL(new Blob([frameData], { type: 'image/x-icon' })));
                                } catch (err) { console.error("Blob/ObjectURL blocked", err); }
                            }
                            reader.skip(subSize + (subSize % 2));
                        }
                    } else reader.skip(chunkSize - 4);
                } else reader.skip(chunkSize + (chunkSize % 2));

                // Prevent infinite loops if chunkSize is 0
                if (chunkSize === 0 && !reader.isEOF) reader.pos = reader.view.byteLength;
            }
            if (frames.length === 0) return null;
            return {
                frames,
                rate: rate || Array(frames.length).fill(8),
                seq,
                duration: (rate || Array(frames.length).fill(8)).reduce((a, b) => a + b, 0)
            };
        } catch (e) {
            console.warn("CursorEngine: Parse error", e);
            return null;
        }
    }

    function applySet(cursorSet) {
        try {
            const styleId = 'ani-cursor-styles';
            let styleEl = document.getElementById(styleId);
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }
            styleEl.innerHTML = '';

            const selectorMap = {
                'default': 'body, .os-window, .desktop-icon, #desktop',
                'pointer': 'a, button, .btn, [onclick], [data-sm-open], .rom-item, .dock-item, .titlebar-btn',
                'text': 'input, textarea, [contenteditable], .notepad-body',
                'wait': '.is-busy',
                'progress': '.is-working'
            };

            if (!cursorSet) return;

            Object.entries(cursorSet).forEach(([type, url]) => {
                if (!url || !url.endsWith('.ani')) return;
                loadAni(url).then(ani => {
                    if (!ani || !ani.frames || ani.frames.length === 0) return;
                    const animationName = `ani-${type}-${Math.random().toString(36).slice(2, 7)}`;
                    const steps = ani.seq || Array.from({ length: ani.frames.length }, (_, i) => i);
                    const framesCss = steps.map((idx, i) => {
                        const step = (i / steps.length) * 100;
                        const frameUrl = ani.frames[idx] || ani.frames[0];
                        return `${step}% { cursor: url(${frameUrl}), auto; }`;
                    }).join('\n');

                    const durationMs = (ani.duration || steps.length * 8) * (1000 / 60);

                    styleEl.innerHTML += `
                  @keyframes ${animationName} { ${framesCss} }
                  ${selectorMap[type] || type} { 
                      animation: ${animationName} ${durationMs}ms step-end infinite !important; 
                  }
              `;
                }).catch(err => console.warn("CursorEngine: Apply error", type, err));
            });
        } catch (e) {
            console.error("CursorEngine: Fatal apply error", e);
        }
    }

    return { applySet };
})();
window.CursorEngine = CursorEngine;
