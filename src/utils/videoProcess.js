const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const logger = require('./logger');

/**
 * Server-side work on an uploaded gallery video, with the bundled ffmpeg:
 *   - MUTE: the host turned the sound off on the Trim screen (WhatsApp's
 *     speaker icon) → the sound track is dropped, the picture copied untouched.
 *   - PLAYABLE: a picture every phone cannot play (HEVC "hev1", 10-bit, 4:4:4)
 *     is converted to plain H.264.
 *   - POSTER: the first frame as a JPEG, the gallery tile's picture.
 *
 * There is NO sound processing: noise cancellation was removed (Jamal,
 * 2026-10-15) — a video's sound goes up exactly as recorded.
 */

// ffmpeg-static returns its path even when the download at `npm install` never
// happened, so check the file is really there; otherwise try an ffmpeg on PATH.
let staticPath = null;
try {
    staticPath = require('ffmpeg-static');
} catch (_) {
    staticPath = null;
}
let ffmpegPath = staticPath && fs.existsSync(staticPath) ? staticPath : 'ffmpeg';

/**
 * Self-repair when `npm install` skipped the binary download (e.g. a build that
 * ran with --ignore-scripts or restored a cache): run ffmpeg-static's own
 * install script once at boot, then switch to the downloaded file.
 */
const ensureBinary = () => new Promise((resolve) => {
    if (!staticPath || fs.existsSync(staticPath)) return resolve();
    logger.warn(`[video] ffmpeg-static binary missing (${staticPath}); downloading it now`);
    const script = path.join(path.dirname(require.resolve('ffmpeg-static')), 'install.js');
    const child = spawn(process.execPath, [script], {
        cwd: path.dirname(script), windowsHide: true, env: { ...process.env, CI: '1' },
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { logger.error(`[video] download failed: ${e.message}`); resolve(); });
    child.on('close', (code) => {
        if (fs.existsSync(staticPath)) {
            ffmpegPath = staticPath;
            logger.info('[video] ffmpeg-static binary downloaded');
        } else {
            logger.error(`[video] download failed (exit ${code}): ${err.slice(-300)}`);
        }
        resolve();
    });
});

const TIMEOUT_MS = 60 * 1000;

/**
 * The file's streams, read from ffmpeg's stderr (it exits non-zero with no
 * output file, but prints them): video codec + pixel format, audio codec.
 */
const probe = (file) => new Promise((resolve) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', () => resolve({}));
    child.on('close', () => {
        const v = err.match(/Video: (\w+)[^\n]*?, (yuv\w+|nv12|gbrp|rgb\w*)/);
        const a = err.match(/Audio: (\w+)/);
        const d = err.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
        const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;
        // The picture's stored size, and the turn a phone applies when it
        // plays it ("rotate: 90" / "displaymatrix: rotation of -90.00").
        const line = (err.match(/Video: [^\n]*/) || [''])[0];
        const size = line.match(/, (\d{2,5})x(\d{2,5})/);
        const turn = err.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) || err.match(/rotate\s*:\s*(-?\d+)/);
        resolve({
            codec: v && v[1],
            pixFmt: v && v[2],
            audio: a ? a[1] : null,
            duration,
            width: size ? Number(size[1]) : null,
            height: size ? Number(size[2]) : null,
            rotation: turn ? Math.round(Number(turn[1])) : 0,
        });
    });
});

const run = (args, timeoutMs = TIMEOUT_MS) => new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ffmpeg timed out')); }, timeoutMs);
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 8000) stderr = stderr.slice(-4000); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
});

const tempPaths = (prefix, ext) => {
    const id = crypto.randomBytes(8).toString('hex');
    return [path.join(os.tmpdir(), `${prefix}-${id}-in`), path.join(os.tmpdir(), `${prefix}-${id}-out.${ext}`)];
};
const cleanup = (...files) => files.forEach((f) => { try { fs.unlinkSync(f); } catch (_) { /* gone */ } });

/**
 * Mute and / or make playable. Only what is needed is touched: a playable
 * video with its sound kept is returned AS IS (`applied: false`, no ffmpeg
 * run); muting a playable one copies the picture and drops the sound (no
 * quality loss, a second or so).
 *
 * Never throws: on any problem (no ffmpeg, unreadable file, timeout) it
 * returns the ORIGINAL with `applied: false` — and `muted: false`, so the
 * caller knows the sound is still there.
 */
const processVideo = async (buffer, mimetype, { mute = false } = {}) => {
    const original = { buffer, mimetype, applied: false, muted: false };
    if (!ffmpegPath || !buffer || !buffer.length) return original;

    const isWebm = mimetype === 'video/webm';
    const [inFile, outFile] = tempPaths('vp', isWebm ? 'webm' : 'mp4');

    try {
        fs.writeFileSync(inFile, buffer);
        const { codec, pixFmt, audio } = await probe(inFile);

        // Copy the picture ONLY when every phone can play it as-is: 8-bit
        // 4:2:0 H.264 (or VP8 / VP9 in webm).
        const playable = isWebm ? ['vp8', 'vp9'].includes(codec) : codec === 'h264' && pixFmt === 'yuv420p';
        // Sound already in a codec its container plays everywhere.
        const soundOk = !audio || (isWebm ? ['opus', 'vorbis'].includes(audio) : ['aac', 'mp3'].includes(audio));

        if (playable && !mute) return original; // nothing to do
        if (playable && mute && !audio) return { ...original, muted: true }; // already silent

        const videoArgs = playable
            ? ['-c:v', 'copy']
            : isWebm
                ? ['-c:v', 'libvpx', '-b:v', '600k', '-pix_fmt', 'yuv420p']
                : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-profile:v', 'main'];
        const audioArgs = mute || !audio
            ? ['-an']
            : ['-map', '0:a:0', ...(soundOk
                ? ['-c:a', 'copy']
                : isWebm ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '128k'])];

        await run([
            '-y', '-i', inFile,
            '-map', '0:v:0',
            ...videoArgs,
            ...audioArgs,
            ...(isWebm ? [] : ['-movflags', '+faststart']),
            outFile,
        ]);
        const out = fs.readFileSync(outFile);
        if (!out.length) return original;
        return { buffer: out, mimetype: isWebm ? 'video/webm' : 'video/mp4', applied: true, muted: mute || !audio };
    } catch (e) {
        logger.warn(`[video] processing skipped, original kept: ${e.message}`);
        return original;
    } finally {
        cleanup(inFile, outFile);
    }
};

/**
 * The video's FIRST frame as a JPEG (max 720 px wide) — the gallery tile's
 * poster. Returns a Buffer, or null on any problem (never throws).
 */
const videoPoster = async (buffer) => {
    if (!ffmpegPath || !buffer || !buffer.length) return null;
    const [inFile, outFile] = tempPaths('vposter', 'jpg');
    try {
        fs.writeFileSync(inFile, buffer);
        await run([
            '-y', '-i', inFile,
            '-frames:v', '1',
            '-vf', "scale='min(720,iw)':-2",
            '-q:v', '4',
            outFile,
        ]);
        const out = fs.readFileSync(outFile);
        return out.length ? out : null;
    } catch (e) {
        logger.warn(`[video] poster skipped: ${e.message}`);
        return null;
    } finally {
        cleanup(inFile, outFile);
    }
};

/**
 * A video's length in seconds and whether it plays PORTRAIT (taller than
 * wide, the phone's rotation counted). Either is null when it cannot be read
 * (never throws). Shorts are refused over a minute or when landscape.
 */
const videoInfo = async (buffer) => {
    const none = { duration: null, portrait: null };
    if (!ffmpegPath || !buffer || !buffer.length) return none;
    const [inFile] = tempPaths('vinfo', 'mp4');
    try {
        fs.writeFileSync(inFile, buffer);
        const { duration, width, height, rotation } = await probe(inFile);
        const turned = Math.abs(rotation || 0) % 180 === 90;
        const shownW = turned ? height : width;
        const shownH = turned ? width : height;
        return {
            duration: Number.isFinite(duration) ? duration : null,
            portrait: shownW && shownH ? shownH > shownW : null,
        };
    } catch (_) {
        return none;
    } finally {
        cleanup(inFile);
    }
};

/** A video's length in seconds, or null when it cannot be read. */
const videoDuration = async (buffer) => (await videoInfo(buffer)).duration;

/**
 * A short's background music (Jamal, 2026-10-23): the song REPLACES the
 * video's own sound, fitted to the video — looped when the song is shorter,
 * cut at the video's end when longer, with a short fade-out at the end. The
 * picture is copied when every phone can already play it, else made plain
 * H.264. Always an MP4.
 *
 * THROWS on failure — unlike processVideo, a short the host asked to carry
 * music must not quietly go up without it. The caller turns it into a 400.
 */
const addMusic = async (videoBuffer, videoMime, musicBuffer, { start = 0 } = {}) => {
    if (!ffmpegPath) throw new Error('ffmpeg is not available');
    const [vIn, outFile] = tempPaths('vm', 'mp4');
    const [mIn] = tempPaths('vm-music', 'audio');
    try {
        fs.writeFileSync(vIn, videoBuffer);
        fs.writeFileSync(mIn, musicBuffer);
        const [{ codec, pixFmt, duration }, music] = await Promise.all([probe(vIn), probe(mIn)]);
        if (!duration) throw new Error('the video could not be read');
        if (!music.audio) throw new Error('the music file has no sound');

        const playable = videoMime !== 'video/webm' && codec === 'h264' && pixFmt === 'yuv420p';
        const fade = Math.min(1.5, duration / 4);
        // The music trim: the song starts this far in. Ignored when it would
        // leave less song than the clip (the app sends 0 then).
        const from = Number(start) > 0 && music.duration && Number(start) + duration <= music.duration + 0.5
            ? Number(start)
            : 0;
        await run([
            '-y',
            '-i', vIn,
            // Loop the song for as long as the picture needs it, starting at
            // the chosen second.
            '-stream_loop', '-1',
            ...(from > 0 ? ['-ss', from.toFixed(2)] : []),
            '-i', mIn,
            '-map', '0:v:0', '-map', '1:a:0',
            ...(playable
                ? ['-c:v', 'copy']
                : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-profile:v', 'main']),
            '-af', `afade=t=out:st=${Math.max(0, duration - fade).toFixed(2)}:d=${fade.toFixed(2)}`,
            '-c:a', 'aac', '-b:a', '128k',
            // Exactly the picture's length.
            '-t', duration.toFixed(2),
            '-movflags', '+faststart',
            outFile,
        ]);
        const out = fs.readFileSync(outFile);
        if (!out.length) throw new Error('ffmpeg wrote nothing');
        return { buffer: out, mimetype: 'video/mp4', duration };
    } finally {
        cleanup(vIn, mIn, outFile);
    }
};

/** Boot-time check, one log line: is ffmpeg runnable, and which version. */
const selfCheck = () => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-version'], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', (e) => logger.error(`[video] ffmpeg NOT runnable (${ffmpegPath}): ${e.message}`));
    child.on('close', (code) => {
        if (code !== 0) return logger.error(`[video] ffmpeg exited ${code} on -version`);
        const version = (out.match(/ffmpeg version (\S+)/) || [])[1] || 'unknown';
        logger.info(`[video] ffmpeg ${version} OK (${ffmpegPath})`);
    });
};
ensureBinary().then(selfCheck);

/**
 * Keep only [start, end] seconds of a video (Upload Short's trim, 2026-11-03 —
 * the web portal cannot cut a file in the browser as the app does on the
 * phone, so the server cuts it). Re-encoded to H.264 / AAC MP4 so the cut is
 * exact and every phone plays it. THROWS on failure: a short that was meant to
 * be cut must never be stored whole.
 */
/** A re-encoded trim may take this long (Render's free plan has very little CPU). */
const TRIM_TIMEOUT_MS = 170 * 1000;

/**
 * Cuts `start`–`end` seconds out of a video (web Upload Short, 2026-11-03). THROWS on failure.
 *
 * FAST PATH (Jamal, 2026-11-05 — on Render a 50 s re-encode ran past the 60 s ffmpeg limit, so
 * every trimmed short failed with "ffmpeg timed out"): a picture every phone already plays
 * (H.264, yuv420p) is COPIED, not re-encoded — only the sound is re-encoded. A second or so on
 * any server. The cut starts at the key frame at or just before `start` (phones record one
 * every 1–2 s); the length stays `end − start`.
 * Anything else (HEVC, 10-bit…) is re-encoded with the fastest preset, at most 1280 px.
 */
const trimVideo = async (buffer, start, end) => {
    if (!ffmpegPath) throw new Error('Video trimming is not available on this server.');
    const from = Math.max(0, Number(start) || 0);
    const length = Number(end) - from;
    if (!(length > 0)) throw new Error('The end of the trim must be after its start.');
    const [inFile, outFile] = tempPaths('trim', 'mp4');
    try {
        fs.writeFileSync(inFile, buffer);
        const { codec, pixFmt } = await probe(inFile);
        const cut = (copy) => run([
            '-y', '-ss', String(from), '-i', inFile, '-t', String(length),
            '-map', '0:v:0', '-map', '0:a:0?',
            ...(copy
                ? ['-c:v', 'copy']
                : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '27', '-pix_fmt', 'yuv420p', '-profile:v', 'main',
                    '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'"]),
            '-c:a', 'aac', '-b:a', '128k',
            '-avoid_negative_ts', 'make_zero',
            '-movflags', '+faststart',
            outFile,
        ], copy ? TIMEOUT_MS : TRIM_TIMEOUT_MS);

        let copied = codec === 'h264' && pixFmt === 'yuv420p';
        if (copied) {
            await cut(true);
            // A copy can only start on a key frame; when the nearest one is far before `start`
            // (a video with few key frames) the clip comes out too long — then re-encode.
            const got = (await probe(outFile)).duration;
            if (!Number.isFinite(got) || got > length + 1.5) copied = false;
        }
        if (!copied) await cut(false);
        const out = fs.readFileSync(outFile);
        if (!out.length) throw new Error('The trimmed video came out empty.');
        return { buffer: out, mimetype: 'video/mp4', copied };
    } finally {
        cleanup(inFile, outFile);
    }
};

/* ─────────────────────────────────────────────────────────────────────────────
 * EDIT VIDEO / SHORTS (web gallery design 03, 2026-11-06) — OFF until a paid server.
 * Used only by services/galleryVideoEditor.service.js, whose route is mounted only
 * when VIDEO_EDITOR_ENABLED=true (see session.md 8g). A full re-encode with text
 * drawn into the picture: far heavier than a trim, so it needs real CPU.
 * ───────────────────────────────────────────────────────────────────────────── */

/** A full render may take this long (override with VIDEO_EDITOR_TIMEOUT_MS). */
const EDIT_TIMEOUT_MS = Number(process.env.VIDEO_EDITOR_TIMEOUT_MS) || 10 * 60 * 1000;

/**
 * Fonts for the burned-in text. Put the .ttf files in `assets/fonts/` named
 * `<Family without spaces>-<Regular|Bold|Italic|BoldItalic>.ttf` (e.g.
 * `Poppins-BoldItalic.ttf`). A missing file falls back to the system font of
 * that family (fontconfig), then to Regular.
 */
const FONT_DIR = path.join(__dirname, '../../assets/fonts');
const EDIT_FONTS = ['Poppins', 'Montserrat', 'Playfair Display', 'Great Vibes', 'Dancing Script', 'Cormorant Garamond'];

/** A path or text inside a filter option: forward slashes, `:` and `'` escaped. */
const filterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

const fontOption = (family, bold, italic) => {
    const fam = EDIT_FONTS.includes(family) ? family : 'Poppins';
    const base = fam.replace(/\s+/g, '');
    const variant = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
    for (const v of [variant, 'Regular']) {
        const file = path.join(FONT_DIR, `${base}-${v}.ttf`);
        if (fs.existsSync(file)) return `fontfile='${filterPath(file)}'`;
    }
    const style = bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
    return `font='${fam}\\:style=${style}'`;
};

/**
 * Render an edit of `buffer`.
 *   spec = {
 *     trim: { start, end },            seconds of the source to keep
 *     mute, video_volume (0–2), music_volume (0–2), music_start (s),
 *     texts: [{ text, animation: fade|slide|zoom|typewriter, duration (s),
 *               direction: in|out|in_out (fade) · left|right|up|down (slide),
 *               font, color '#RRGGBB', bold, italic, underline,
 *               position 0–8 (3×3 grid, row by row), from, to (s, on the KEPT clip) }],
 *     max_bytes                        the stored file's cap — the bitrate is fitted to it
 *   }
 * THROWS on failure (the caller turns it into a 400).
 */
const renderEdit = async (buffer, spec, musicBuffer = null) => {
    if (!ffmpegPath) throw new Error('Video editing is not available on this server.');
    const [inFile, outFile] = tempPaths('edit', 'mp4');
    const [musicFile] = tempPaths('edit-music', 'audio');
    const [scriptFile] = tempPaths('edit-graph', 'txt');
    const textFiles = [];
    try {
        fs.writeFileSync(inFile, buffer);
        if (musicBuffer) fs.writeFileSync(musicFile, musicBuffer);
        const src = await probe(inFile);
        if (!src.duration) throw new Error('The video could not be read.');

        const start = Math.max(0, Math.min(Number(spec.trim?.start) || 0, src.duration));
        const end = Math.min(src.duration, Number(spec.trim?.end) || src.duration);
        const len = end - start;
        if (!(len > 0.2)) throw new Error('The kept part of the video is too short.');

        // ── Picture: at most 1280 px on the long side, then every text layer. ──
        const S = 'h/14'; // text size: a fixed share of the picture height
        const chain = ["scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", 'format=yuv420p'];
        const texts = Array.isArray(spec.texts) ? spec.texts.slice(0, 10) : [];
        texts.forEach((t, idx) => {
            const text = String(t.text || '').slice(0, 100);
            if (!text.trim()) return;
            const F = Math.max(0, Math.min(len, Number(t.from) || 0));
            const T = Math.max(F + 0.1, Math.min(len, Number(t.to) || len));
            const D = Math.max(0.1, Math.min(3, Number(t.duration) || 1, (T - F) / 2));
            const pos = Number.isInteger(t.position) && t.position >= 0 && t.position <= 8 ? t.position : 4;
            const col = pos % 3;
            const row = Math.floor(pos / 3);
            const baseX = col === 0 ? 'w*0.06' : col === 1 ? '(w-text_w)/2' : 'w-text_w-w*0.06';
            const baseY = row === 0 ? 'h*0.08' : row === 1 ? `(h-${S})/2` : `h-${S}-h*0.1`;
            const color = /^#[0-9a-f]{6}$/i.test(t.color || '') ? `0x${t.color.slice(1)}` : 'white';
            const font = fontOption(t.font, !!t.bold, !!t.italic);
            const p = `min(1,max(0,(t-${F})/${D}))`;
            const ease = `(1-pow(1-${p},3))`;
            const fadeIn = `min(1,max(0,(t-${F})/${D}))`;
            const fadeOut = `min(1,max(0,(${T}-t)/${D}))`;
            const anim = ['fade', 'slide', 'zoom', 'typewriter'].includes(t.animation) ? t.animation : 'fade';
            const dir = String(t.direction || '');
            let alpha = fadeIn;
            let x = baseX;
            let y = baseY;
            let size = S;
            if (anim === 'fade') alpha = dir === 'out' ? fadeOut : dir === 'in_out' ? `min(${fadeIn},${fadeOut})` : fadeIn;
            if (anim === 'slide') {
                if (dir === 'right') x = `${baseX}+(1-${ease})*w*0.3`;
                else if (dir === 'up') y = `${baseY}+(1-${ease})*h*0.3`;
                else if (dir === 'down') y = `${baseY}-(1-${ease})*h*0.3`;
                else x = `${baseX}-(1-${ease})*w*0.3`;
            }
            if (anim === 'zoom') size = `${S}*(0.4+0.6*${ease})`;
            const layer = (content, enable, a = alpha) => {
                const file = path.join(os.tmpdir(), `edit-text-${crypto.randomBytes(6).toString('hex')}-${idx}.txt`);
                fs.writeFileSync(file, content, 'utf8');
                textFiles.push(file);
                return `drawtext=${font}:textfile='${filterPath(file)}':fontsize='${size}':fontcolor=${color}:alpha='${a}'`
                    + `:x='${x}':y='${y}':shadowcolor=black@0.45:shadowx=2:shadowy=2:enable='${enable}'`;
            };
            if (anim === 'typewriter') {
                // One layer per step of typed characters (at most 40 steps), the full text after.
                const steps = Math.min(text.length, 40);
                const per = D / steps;
                for (let k = 1; k <= steps; k++) {
                    const shown = text.slice(0, Math.ceil((text.length * k) / steps));
                    const a = F + (k - 1) * per;
                    const b = k === steps ? T : F + k * per;
                    chain.push(layer(shown, `between(t,${a.toFixed(3)},${b.toFixed(3)})`, '1'));
                }
            } else {
                chain.push(layer(text, `between(t,${F},${T})`));
            }
            if (t.underline) {
                // drawbox cannot measure text, so the line is sized from the character count.
                const w = `${text.length}*${S}*0.5`;
                const bx = col === 0 ? 'iw*0.06' : col === 1 ? `(iw-${w})/2` : `iw-${w}-iw*0.06`;
                const by = row === 0 ? `ih*0.08+${S}*1.05` : row === 1 ? `(ih-${S})/2+${S}*1.05` : `ih-${S}-ih*0.1+${S}*1.05`;
                chain.push(`drawbox=x='${bx.replace(/\bh\b/g, 'ih')}':y='${by.replace(/\bh\b/g, 'ih')}':w='${w.replace(/\bh\b/g, 'ih')}':h='max(2,ih/220)':color=${color}@1:t=fill:enable='between(t,${F},${T})'`);
            }
        });
        const graph = [`[0:v]${chain.join(',')}[vout]`];

        // ── Sound: the clip's own (volume, or muted) mixed with the background music. ──
        const vVol = Math.max(0, Math.min(2, spec.video_volume === undefined ? 1 : Number(spec.video_volume)));
        const mVol = Math.max(0, Math.min(2, spec.music_volume === undefined ? 0.8 : Number(spec.music_volume)));
        const keepOwn = !!src.audio && !spec.mute && vVol > 0;
        const withMusic = !!musicBuffer && mVol > 0;
        const fade = Math.min(1.5, len / 4).toFixed(2);
        const fadeAt = Math.max(0, len - Number(fade)).toFixed(2);
        if (keepOwn && withMusic) {
            graph.push(`[0:a]volume=${vVol}[a0]`, `[1:a]volume=${mVol},afade=t=out:st=${fadeAt}:d=${fade}[a1]`,
                '[a0][a1]amix=inputs=2:duration=first:normalize=0[aout]');
        } else if (keepOwn) {
            graph.push(`[0:a]volume=${vVol}[aout]`);
        } else if (withMusic) {
            graph.push(`[1:a]volume=${mVol},atrim=0:${len.toFixed(2)},afade=t=out:st=${fadeAt}:d=${fade}[aout]`);
        }
        const hasAudio = keepOwn || withMusic;
        fs.writeFileSync(scriptFile, graph.join(';\n'), 'utf8');

        // Fit the bitrate to the stored file's cap (gallery videos are small on purpose).
        const cap = Number(spec.max_bytes) || 10 * 1024 * 1024;
        const totalK = Math.floor((cap * 8 * 0.9) / len / 1000);
        const videoK = Math.max(250, totalK - (hasAudio ? 128 : 0));

        const musicStart = Math.max(0, Math.min(3600, Number(spec.music_start) || 0));
        await run([
            '-y',
            '-ss', start.toFixed(3), '-t', len.toFixed(3), '-i', inFile,
            ...(withMusic ? ['-stream_loop', '-1', ...(musicStart > 0 ? ['-ss', musicStart.toFixed(2)] : []), '-i', musicFile] : []),
            '-filter_complex_script', scriptFile,
            '-map', '[vout]', ...(hasAudio ? ['-map', '[aout]'] : ['-an']),
            '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${videoK}k`, '-maxrate', `${Math.round(videoK * 1.2)}k`,
            '-bufsize', `${videoK * 2}k`, '-profile:v', 'main',
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
            '-t', len.toFixed(3),
            '-movflags', '+faststart',
            outFile,
        ], EDIT_TIMEOUT_MS);
        const out = fs.readFileSync(outFile);
        if (!out.length) throw new Error('The edited video came out empty.');
        return { buffer: out, mimetype: 'video/mp4', duration: len };
    } finally {
        cleanup(inFile, outFile, musicFile, scriptFile, ...textFiles);
    }
};

module.exports = { processVideo, videoPoster, videoDuration, videoInfo, addMusic, trimVideo, renderEdit, EDIT_FONTS };
