/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Gráficos em SVG (sem bibliotecas externas): mapas de calor com escala de cor ajustável, curvas e barras.
 * Cada célula e cada ponto tem dica (title) ao passar o mouse.
 */
'use strict';

const Graficos = (() => {
    const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
    const MARCAS = ['circle', 'square', 'diamond', 'triUp', 'triDown', 'circle', 'square', 'diamond'];
    const TINTA = '#1d2430', SEC = '#52514e', MUDO = '#898781', GRADE = '#e1e0d9', EIXO = '#c3c2b7';

    /** Escalas prontas: lista de paradas [valor, cor]. */
    const PRESETS = {
        ryg90: { nome: 'Vermelho–amarelo–verde (verde a partir de 90%)', paradas: [[0, '#b71c1c'], [75, '#ef6c00'], [85, '#f9d71c'], [90, '#a8d672'], [100, '#1b5e20']] },
        ryg75: { nome: 'Vermelho–amarelo–verde (0–75–100)', paradas: [[0, '#c62828'], [75, '#f9c80e'], [100, '#1b8a3a']] },
        plasma: { nome: 'Plasma (matplotlib)', paradas: [[0, '#0d0887'], [12.5, '#4b03a1'], [25, '#7d03a8'], [37.5, '#a82296'], [50, '#cb4679'], [62.5, '#e56b5d'], [75, '#f89441'], [87.5, '#fdc328'], [100, '#f0f921']] },
        plasma75: { nome: 'Plasma esticado (0–75–100)', paradas: [[0, '#0d0887'], [25, '#5c01a6'], [50, '#9c179e'], [75, '#cc4778'], [85, '#ed7953'], [92, '#fdb42f'], [100, '#f0f921']] },
        viridis: { nome: 'Viridis (matplotlib)', paradas: [[0, '#440154'], [25, '#3b528b'], [50, '#21918c'], [75, '#5ec962'], [100, '#fde725']] }
    };
    const PRESETS_DIV = {
        vng: { nome: 'Vermelho–neutro–verde', paradas: [[-1, '#c62828'], [0, '#f4f3ef'], [1, '#1b8a3a']] },
        azvm: { nome: 'Azul–neutro–vermelho (coolwarm)', paradas: [[-1, '#3b4cc0'], [0, '#f2f2f2'], [1, '#b40426']] },
        rdbu: { nome: 'Vermelho–neutro–azul (RdBu)', paradas: [[-1, '#b2182b'], [0, '#f7f7f7'], [1, '#2166ac']] }
    };

    const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rgb2hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

    /** Função de cor por interpolação linear entre paradas ordenadas. */
    function escala(paradas) {
        const p = [...paradas].sort((a, b) => a[0] - b[0]);
        return (v) => {
            if (!Number.isFinite(v)) return '#dddddd';
            if (v <= p[0][0]) return p[0][1];
            if (v >= p[p.length - 1][0]) return p[p.length - 1][1];
            for (let i = 0; i < p.length - 1; i++) if (v <= p[i + 1][0]) {
                const t = (v - p[i][0]) / (p[i + 1][0] - p[i][0]);
                const a = hex2rgb(p[i][1]), b = hex2rgb(p[i + 1][1]);
                return rgb2hex(a.map((x, k) => x + t * (b[k] - x)));
            }
            return p[p.length - 1][1];
        };
    }
    /** Escala divergente simétrica em torno de zero com limite ±lim. */
    function escalaDiv(paradas, lim) { return escala(paradas.map(([v, c]) => [v * lim, c])); }
    /** Cor de texto legível sobre um fundo. */
    function tintaSobre(h) { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0b0b0b' : '#ffffff'; }

    /**
     * Barra de cores vertical. `esticada`: cada trecho entre paradas ocupa a mesma altura (mais resolução onde há paradas próximas).
     */
    function barraCores(paradas, x, y, alt, rotulo, esticada = true, formato = (v) => fmt(v, 0)) {
        const p = [...paradas].sort((a, b) => a[0] - b[0]);
        const v0 = p[0][0], v1 = p[p.length - 1][0];
        const pos = (v) => {
            if (!esticada) return (v - v0) / (v1 - v0);
            for (let i = 0; i < p.length - 1; i++) if (v <= p[i + 1][0]) return (i + (v - p[i][0]) / (p[i + 1][0] - p[i][0])) / (p.length - 1);
            return 1;
        };
        const id = 'g' + Math.random().toString(36).slice(2, 9);
        const passos = 40;
        let stops = '';
        for (let k = 0; k <= passos; k++) {
            const t = k / passos;
            // valor correspondente à posição t
            let v;
            if (!esticada) v = v0 + t * (v1 - v0);
            else { const seg = Math.min(Math.floor(t * (p.length - 1)), p.length - 2); const loc = t * (p.length - 1) - seg; v = p[seg][0] + loc * (p[seg + 1][0] - p[seg][0]); }
            stops += `<stop offset="${(1 - t) * 100}%" stop-color="${escala(p)(v)}"/>`;
        }
        let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${[...stops.matchAll(/<stop[^>]+>/g)].map((m) => m[0]).reverse().join('')}</linearGradient></defs>`;
        s += `<rect x="${x}" y="${y}" width="12" height="${alt}" fill="url(#${id})" rx="2"/>`;
        for (const [v] of p) {
            const yy = y + alt * (1 - pos(v));
            s += `<line x1="${x + 12}" x2="${x + 16}" y1="${yy}" y2="${yy}" stroke="${MUDO}"/><text x="${x + 19}" y="${yy + 3.5}" font-size="10" fill="${SEC}">${esc(formato(v))}</text>`;
        }
        s += `<text transform="translate(${x + 52},${y + alt / 2}) rotate(90)" text-anchor="middle" font-size="10.5" fill="${TINTA}">${esc(rotulo)}</text>`;
        return s;
    }

    /**
     * Figura com vários mapas de calor.
     * paineis: [{ titulo, linhas:[rótulos], colunas:[rótulos], valores:[[v]], marcas:[[bool]], dicas:[[texto]] }]
     */
    function mapas(paineis, cfg) {
        const ncol = Math.min(cfg.colunas || 3, paineis.length);
        const nl = Math.ceil(paineis.length / ncol);
        const cw = cfg.celula || 13, ch = cfg.alturaCelula || 16;
        const maxCols = Math.max(...paineis.map((p) => p.colunas.length));
        const maxLin = Math.max(...paineis.map((p) => p.linhas.length));
        const pw = 48 + maxCols * cw + 18, ph = 34 + maxLin * ch + 34;
        const W = ncol * pw + 80, H = nl * ph + 10;
        const cor = cfg.cor;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W * 1.25}px" font-family="Carlito, Calibri, 'Segoe UI', Arial, sans-serif" role="img" aria-label="${esc(cfg.titulo || 'Mapa de calor')}">`;
        paineis.forEach((p, k) => {
            const ox = (k % ncol) * pw + 44, oy = Math.floor(k / ncol) * ph + 22;
            s += `<text x="${ox + (p.colunas.length * cw) / 2}" y="${oy - 8}" text-anchor="middle" font-size="11" fill="${TINTA}" font-weight="600">${esc(p.titulo)}</text>`;
            p.linhas.forEach((ln, i) => {
                s += `<text x="${ox - 5}" y="${oy + i * ch + ch / 2 + 3.5}" text-anchor="end" font-size="9.5" fill="${SEC}">${esc(ln)}</text>`;
                p.colunas.forEach((cl, j) => {
                    const v = p.valores[i][j];
                    const c = cor(v);
                    const dica = p.dicas?.[i]?.[j] || `${p.titulo} · ${ln} · ${cl}: ${fmt(v, 1)}`;
                    s += `<rect x="${ox + j * cw}" y="${oy + i * ch}" width="${cw}" height="${ch}" fill="${c}"><title>${esc(dica)}</title></rect>`;
                    if (p.marcas?.[i]?.[j]) s += `<circle cx="${ox + j * cw + cw / 2}" cy="${oy + i * ch + ch / 2}" r="2" fill="${tintaSobre(c)}" pointer-events="none"/>`;
                    if (cfg.valores) s += `<text x="${ox + j * cw + cw / 2}" y="${oy + i * ch + ch / 2 + 3}" text-anchor="middle" font-size="7" fill="${tintaSobre(c)}" pointer-events="none">${fmt(v, 0)}</text>`;
                });
            });
            const passo = p.colunas.length > 10 ? 3 : 1;
            p.colunas.forEach((cl, j) => {
                if (j % passo) return;
                s += `<text x="${ox + j * cw + cw / 2}" y="${oy + p.linhas.length * ch + 12}" text-anchor="middle" font-size="9.5" fill="${SEC}">${esc(cl)}</text>`;
            });
            if (cfg.eixoX) s += `<text x="${ox + (p.colunas.length * cw) / 2}" y="${oy + p.linhas.length * ch + 26}" text-anchor="middle" font-size="10" fill="${TINTA}">${esc(cfg.eixoX)}</text>`;
        });
        s += barraCores(cfg.paradas, W - 70, 22, Math.min(H - 44, 260), cfg.rotuloBarra || '', cfg.esticada !== false, cfg.formatoBarra);
        return s + '</svg>';
    }

    function marcador(tipo, x, y, r, cor) {
        if (tipo === 'square') return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${cor}"/>`;
        if (tipo === 'diamond') return `<polygon points="${x},${y - r * 1.3} ${x + r * 1.3},${y} ${x},${y + r * 1.3} ${x - r * 1.3},${y}" fill="${cor}"/>`;
        if (tipo === 'triUp') return `<polygon points="${x},${y - r * 1.3} ${x + r * 1.2},${y + r} ${x - r * 1.2},${y + r}" fill="${cor}"/>`;
        if (tipo === 'triDown') return `<polygon points="${x},${y + r * 1.3} ${x + r * 1.2},${y - r} ${x - r * 1.2},${y - r}" fill="${cor}"/>`;
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="${cor}"/>`;
    }

    /**
     * Curvas em painéis. paineis: [{ titulo, series:[{nome, pts:[[x,y]], tracejada}] }]
     */
    function curvas(paineis, cfg) {
        const ncol = Math.min(cfg.colunas || 3, paineis.length);
        const nl = Math.ceil(paineis.length / ncol);
        const pw = 250, ph = 190, W = ncol * pw + 10, H = nl * ph + 40;
        const todos = paineis.flatMap((p) => p.series.flatMap((s) => s.pts));
        const xs = todos.map((p) => p[0]), ys = todos.map((p) => p[1]).filter(Number.isFinite);
        const x0 = cfg.xmin ?? Math.min(...xs), x1 = cfg.xmax ?? Math.max(...xs);
        const passoY = (() => { const bruto = (Math.max(...ys) - Math.min(...ys, cfg.limite ?? Infinity)) / 4; return [1, 2, 5, 10, 20, 25, 50].find((p) => p >= bruto) || 50; })();
        const y0 = cfg.ymin ?? Math.floor(Math.min(...ys, cfg.limite ?? Infinity) / passoY) * passoY;
        const y1 = cfg.ymax ?? Math.ceil(Math.max(...ys) / passoY) * passoY;
        const nomes = [...new Set(paineis.flatMap((p) => p.series.map((s) => s.nome)))];
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W * 1.25}px" font-family="Carlito, Calibri, 'Segoe UI', Arial, sans-serif" role="img" aria-label="${esc(cfg.titulo || 'Curvas')}">`;
        // legenda
        let lx = 50;
        nomes.forEach((n, i) => {
            s += marcador(MARCAS[i % 8], lx, 12, 3.5, SERIES[i % 8]) + `<line x1="${lx - 9}" x2="${lx + 9}" y1="12" y2="12" stroke="${SERIES[i % 8]}" stroke-width="2"/><text x="${lx + 14}" y="15.5" font-size="10.5" fill="${TINTA}">${esc(n)}</text>`;
            lx += 24 + n.length * 5.6;
        });
        paineis.forEach((p, k) => {
            const ox = (k % ncol) * pw + 44, oy = Math.floor(k / ncol) * ph + 48;
            const w = pw - 60, h = ph - 62;
            const X = (v) => ox + ((v - x0) / (x1 - x0 || 1)) * w, Y = (v) => oy + h - ((v - y0) / (y1 - y0 || 1)) * h;
            s += `<text x="${ox + w / 2}" y="${oy - 8}" text-anchor="middle" font-size="11" font-weight="600" fill="${TINTA}">${esc(p.titulo)}</text>`;
            for (let v = y0; v <= y1 + 1e-9; v += passoY) {
                s += `<line x1="${ox}" x2="${ox + w}" y1="${Y(v)}" y2="${Y(v)}" stroke="${GRADE}"/><text x="${ox - 4}" y="${Y(v) + 3.5}" text-anchor="end" font-size="9" fill="${SEC}">${fmt(v, 0)}</text>`;
            }
            const xt = cfg.xticks || [x0, (x0 + x1) / 2, x1];
            for (const v of xt) s += `<text x="${X(v)}" y="${oy + h + 13}" text-anchor="middle" font-size="9" fill="${SEC}">${fmt(v, 0)}</text>`;
            s += `<line x1="${ox}" x2="${ox + w}" y1="${oy + h}" y2="${oy + h}" stroke="${EIXO}"/>`;
            if (cfg.limite != null) s += `<line x1="${ox}" x2="${ox + w}" y1="${Y(cfg.limite)}" y2="${Y(cfg.limite)}" stroke="${MUDO}" stroke-dasharray="4 3"/>`;
            if (cfg.eixoX) s += `<text x="${ox + w / 2}" y="${oy + h + 27}" text-anchor="middle" font-size="10" fill="${TINTA}">${esc(cfg.eixoX)}</text>`;
            if (cfg.eixoY && k % ncol === 0) s += `<text transform="translate(${ox - 30},${oy + h / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="${TINTA}">${esc(cfg.eixoY)}</text>`;
            p.series.forEach((se) => {
                const i = nomes.indexOf(se.nome), c = SERIES[i % 8];
                const pts = se.pts.filter((q) => Number.isFinite(q[1])).sort((a, b) => a[0] - b[0]);
                s += `<polyline fill="none" stroke="${c}" stroke-width="2" ${se.tracejada ? 'stroke-dasharray="5 3"' : ''} points="${pts.map((q) => `${X(q[0])},${Y(q[1])}`).join(' ')}"/>`;
                if (!se.semPontos) for (const q of pts) s += `<g>${marcador(MARCAS[i % 8], X(q[0]), Y(q[1]), 2.6, c)}<title>${esc(`${p.titulo} · ${se.nome} · ${fmt(q[0], 1)}: ${fmt(q[1], 1)}`)}</title></g>`;
            });
        });
        return s + '</svg>';
    }

    /** Barras horizontais agrupadas. grupos: [{ titulo, itens:[rótulo], series:[{nome, valores:[v]}] }] */
    function barras(grupos, cfg) {
        const ncol = Math.min(cfg.colunas || 3, grupos.length);
        const nl = Math.ceil(grupos.length / ncol);
        const nItens = Math.max(...grupos.map((g) => g.itens.length));
        const nSer = Math.max(...grupos.map((g) => g.series.length));
        const bh = 8, gap = 6, ph = 40 + nItens * (nSer * bh + gap) + 30, pw = 260;
        const W = ncol * pw + 10, H = nl * ph + 30;
        const vmax = cfg.max ?? Math.max(...grupos.flatMap((g) => g.series.flatMap((s) => s.valores))) * 1.08;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W * 1.25}px" font-family="Carlito, Calibri, 'Segoe UI', Arial, sans-serif" role="img" aria-label="${esc(cfg.titulo || 'Barras')}">`;
        const nomes = grupos[0].series.map((x) => x.nome);
        let lx = 90;
        nomes.forEach((n, i) => { s += `<rect x="${lx}" y="6" width="12" height="9" rx="2" fill="${SERIES[i % 8]}"/><text x="${lx + 16}" y="14.5" font-size="10.5" fill="${TINTA}">${esc(n)}</text>`; lx += 30 + n.length * 5.4; });
        grupos.forEach((g, k) => {
            const ox = (k % ncol) * pw + 78, oy = Math.floor(k / ncol) * ph + 46;
            const w = pw - 100;
            s += `<text x="${ox + w / 2}" y="${oy - 10}" text-anchor="middle" font-size="11" font-weight="600" fill="${TINTA}">${esc(g.titulo)}</text>`;
            g.itens.forEach((it, i) => {
                const y = oy + i * (nSer * bh + gap);
                s += `<text x="${ox - 4}" y="${y + (nSer * bh) / 2 + 3.5}" text-anchor="end" font-size="9.5" fill="${SEC}">${esc(it)}</text>`;
                g.series.forEach((se, j) => {
                    const v = se.valores[i] || 0, bw = Math.max(0, (v / vmax) * w);
                    s += `<rect x="${ox}" y="${y + j * bh}" width="${bw}" height="${bh - 1.5}" rx="1.5" fill="${SERIES[j % 8]}"><title>${esc(`${g.titulo} · ${it} · ${se.nome}: ${fmt(v, 1)}${cfg.sufixo || ''}`)}</title></rect><text x="${ox + bw + 3}" y="${y + j * bh + bh - 2}" font-size="7.5" fill="${SEC}">${fmt(v, 0)}</text>`;
                });
            });
            const base = oy + nItens * (nSer * bh + gap);
            s += `<line x1="${ox}" x2="${ox}" y1="${oy - 2}" y2="${base}" stroke="${EIXO}"/>`;
            if (cfg.eixoX) s += `<text x="${ox + w / 2}" y="${base + 16}" text-anchor="middle" font-size="10" fill="${TINTA}">${esc(cfg.eixoX)}</text>`;
        });
        return s + '</svg>';
    }

    return { PRESETS, PRESETS_DIV, SERIES, escala, escalaDiv, mapas, curvas, barras, barraCores, fmt, esc };
})();

if (typeof module !== 'undefined') module.exports = Graficos;
