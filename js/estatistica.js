/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Núcleo estatístico: ANOVA fatorial (todas as interações), testes de Tukey com o QM do erro do modelo completo,
 * desdobramentos de interações, pressupostos (Shapiro-Wilk e Levene/Brown-Forsythe), transformação arco-seno
 * e ajuste sigmoidal de três parâmetros, como no trabalho de Andrade.
 */
'use strict';

const Estat = (() => {
    const J = (typeof jStat !== 'undefined') ? jStat : (typeof require !== 'undefined' ? require('./vendor/jstat.min.js') : null);

    const soma = (a) => a.reduce((s, x) => s + x, 0);
    const media = (a) => (a.length ? soma(a) / a.length : NaN);
    const variancia = (a) => { const m = media(a); return a.length > 1 ? soma(a.map((x) => (x - m) ** 2)) / (a.length - 1) : NaN; };
    const dp = (a) => Math.sqrt(variancia(a));
    const mediana = (a) => { const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    const pF = (F, d1, d2) => (Number.isFinite(F) && F >= 0 ? 1 - J.centralF.cdf(F, d1, d2) : NaN);

    /** Todos os subconjuntos não vazios de uma lista, em ordem de tamanho (efeitos principais, duplas, triplas...). */
    function subconjuntos(lista) {
        const out = [];
        for (let m = 1; m < (1 << lista.length); m++) out.push(lista.filter((_, i) => m & (1 << i)));
        return out.sort((a, b) => a.length - b.length);
    }
    const chave = (row, fatores) => fatores.map((f) => row[f]).join('|');
    const niveisDe = (rows, f) => {
        const v = [...new Set(rows.map((r) => r[f]))];
        return v.every((x) => typeof x === 'number') ? v.sort((a, b) => a - b) : v.sort();
    };

    function agrupar(rows, fatores, y) {
        const g = new Map();
        for (const r of rows) {
            const k = chave(r, fatores);
            if (!g.has(k)) g.set(k, { soma: 0, n: 0, vals: [], niveis: fatores.map((f) => r[f]) });
            const o = g.get(k); o.soma += r[y]; o.n++; o.vals.push(r[y]);
        }
        for (const o of g.values()) o.media = o.soma / o.n;
        return g;
    }

    /**
     * ANOVA fatorial com todas as interações.
     * Delineamento balanceado: somas de quadrados pelas médias marginais (idênticas aos tipos I, II e III).
     * Desbalanceado: mínimos quadrados com codificação por efeitos e SQ tipo II.
     */
    function anova(rows, fatores, y) {
        const fat = fatores.filter((f) => niveisDe(rows, f).length > 1);
        const N = rows.length;
        const niveis = Object.fromEntries(fat.map((f) => [f, niveisDe(rows, f)]));
        const nCel = fat.reduce((p, f) => p * niveis[f].length, 1);
        const celulas = agrupar(rows, fat, y);
        const contagens = [...celulas.values()].map((c) => c.n);
        const balanceado = celulas.size === nCel && contagens.every((n) => n === contagens[0]) && contagens[0] > 1;
        const gm = media(rows.map((r) => r[y]));
        const sqTotal = soma(rows.map((r) => (r[y] - gm) ** 2));
        let sqErro = 0;
        for (const r of rows) sqErro += (r[y] - celulas.get(chave(r, fat)).media) ** 2;
        const glErro = N - celulas.size;
        const termos = subconjuntos(fat);
        let tabela;
        if (balanceado) tabela = termos.map((t) => sqBalanceada(rows, t, y, niveis, N, gm));
        else tabela = sqTipoII(rows, fat, termos, y, niveis);
        const qmErro = sqErro / glErro;
        const sqEfeitos = soma(tabela.map((t) => t.sq));
        for (const t of tabela) {
            t.qm = t.sq / t.gl;
            t.F = t.qm / qmErro;
            t.p = pF(t.F, t.gl, glErro);
            t.eta2p = t.sq / (t.sq + sqErro);
            t.parcela = sqEfeitos > 0 ? t.sq / sqEfeitos : 0;
            t.nome = t.fatores.join('×');
        }
        return {
            fatores: fat, niveis, tabela, balanceado, N, celulas, mediaGeral: gm,
            erro: { sq: sqErro, gl: glErro, qm: qmErro }, total: { sq: sqTotal, gl: N - 1 },
            r2: 1 - sqErro / sqTotal, cv: 100 * Math.sqrt(qmErro) / gm,
            residuos: rows.map((r) => r[y] - celulas.get(chave(r, fat)).media)
        };
    }

    function sqBalanceada(rows, termo, y, niveis, N, gm) {
        // médias marginais de todos os subconjuntos do termo
        const subs = [[]].concat(subconjuntos(termo));
        const marg = new Map();
        for (const s of subs) marg.set(s.join('|'), s.length ? agrupar(rows, s, y) : null);
        const combos = produto(termo.map((f) => niveis[f]));
        let ss = 0;
        for (const c of combos) {
            const val = Object.fromEntries(termo.map((f, i) => [f, c[i]]));
            let ef = 0;
            for (const s of subs) {
                const sinal = (termo.length - s.length) % 2 ? -1 : 1;
                const m = s.length ? marg.get(s.join('|')).get(s.map((f) => val[f]).join('|')).media : gm;
                ef += sinal * m;
            }
            ss += ef * ef;
        }
        ss *= N / combos.length;
        const gl = termo.reduce((p, f) => p * (niveis[f].length - 1), 1);
        return { fatores: termo, sq: ss, gl };
    }

    function produto(listas) {
        return listas.reduce((acc, l) => acc.flatMap((a) => l.map((x) => a.concat([x]))), [[]]);
    }

    // ---------- mínimos quadrados para o caso desbalanceado ----------
    function colunasTermo(rows, termo, niveis) {
        // codificação por efeitos (soma zero) e produto das colunas para interações
        let cols = [rows.map(() => 1)];
        for (const f of termo) {
            const lv = niveis[f];
            const fc = lv.slice(0, -1).map((l) => rows.map((r) => (r[f] === l ? 1 : (r[f] === lv[lv.length - 1] ? -1 : 0))));
            const novas = [];
            for (const a of cols) for (const b of fc) novas.push(a.map((v, i) => v * b[i]));
            cols = novas;
        }
        return cols;
    }
    function rss(colunas, yv) {
        // Gram-Schmidt modificado: resíduo da projeção de y no espaço das colunas
        const base = [];
        for (const c0 of colunas) {
            const c = c0.slice();
            for (const q of base) { let d = 0; for (let i = 0; i < c.length; i++) d += q[i] * c[i]; for (let i = 0; i < c.length; i++) c[i] -= d * q[i]; }
            let nrm = 0; for (const v of c) nrm += v * v; nrm = Math.sqrt(nrm);
            if (nrm > 1e-8) base.push(c.map((v) => v / nrm));
        }
        const r = yv.slice();
        for (const q of base) { let d = 0; for (let i = 0; i < r.length; i++) d += q[i] * r[i]; for (let i = 0; i < r.length; i++) r[i] -= d * q[i]; }
        return soma(r.map((v) => v * v));
    }
    function sqTipoII(rows, fat, termos, y, niveis) {
        const p = fat.reduce((a, f) => a * niveis[f].length, 1);
        if (p > 800) throw new Error('Delineamento desbalanceado grande demais para o ajuste por mínimos quadrados no navegador. Remova tratamentos incompletos ou reduza os fatores.');
        const yv = rows.map((r) => r[y]);
        const colsDe = new Map(termos.map((t) => [t.join('|'), colunasTermo(rows, t, niveis)]));
        const intercepto = [rows.map(() => 1)];
        const contem = (a, b) => b.every((f) => a.includes(f));
        return termos.map((t) => {
            const semT = termos.filter((u) => !contem(u, t));
            const base = intercepto.concat(...semT.map((u) => colsDe.get(u.join('|'))));
            const comT = base.concat(colsDe.get(t.join('|')));
            const sq = rss(base, yv) - rss(comT, yv);
            const gl = t.reduce((a, f) => a * (niveis[f].length - 1), 1);
            return { fatores: t, sq: Math.max(sq, 0), gl };
        });
    }

    // ---------- Tukey ----------
    /** Médias de um conjunto de fatores (marginal) com n por média. */
    function mediasMarginais(rows, fatores, y) {
        const g = agrupar(rows, fatores, y);
        return [...g.values()].map((o) => ({ niveis: o.niveis, rotulo: o.niveis.join(' · '), media: o.media, n: o.n }));
    }

    /** Teste de Tukey (Tukey-Kramer se n diferir) usando QM e GL do erro do modelo completo; devolve letras. */
    function tukey(medias, qm, gl, alfa = 0.05) {
        const k = medias.length;
        if (k < 2) return { medias: medias.map((m) => ({ ...m, letras: 'a' })), dms: NaN, pares: [] };
        const q = J.tukey.inv(1 - alfa, k, gl);
        const ord = [...medias].sort((a, b) => b.media - a.media);
        const pares = [];
        const sig = (a, b) => {
            const dms = q * Math.sqrt((qm / 2) * (1 / a.n + 1 / b.n));
            return Math.abs(a.media - b.media) > dms;
        };
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
            const a = ord[i], b = ord[j];
            const se = Math.sqrt((qm / 2) * (1 / a.n + 1 / b.n));
            const qobs = Math.abs(a.media - b.media) / se;
            pares.push({ a: a.rotulo, b: b.rotulo, dif: a.media - b.media, p: 1 - J.tukey.cdf(qobs, k, gl), sig: sig(a, b) });
        }
        // letras pelo método das linhas: grupos máximos de médias consecutivas sem diferença
        const grupos = [];
        for (let i = 0; i < k; i++) {
            let j = i;
            while (j + 1 < k && !sig(ord[i], ord[j + 1])) j++;
            if (!grupos.length || j > grupos[grupos.length - 1][1]) grupos.push([i, j]);
        }
        const alfabeto = 'abcdefghijklmnopqrstuvwxyz';
        const letras = ord.map(() => '');
        grupos.forEach(([i, j], gi) => { for (let t = i; t <= j; t++) letras[t] += alfabeto[gi % 26]; });
        const comLetras = ord.map((m, i) => ({ ...m, letras: letras[i] }));
        const dms = q * Math.sqrt(qm / ord[0].n);
        return { medias: comLetras, dms, q, pares };
    }

    /**
     * Desdobramento de uma interação: compara os níveis de `fator` dentro de cada combinação dos `dentro`.
     */
    function desdobrar(rows, fator, dentro, y, qm, gl, alfa) {
        const fat = [fator].concat(dentro);
        const ms = mediasMarginais(rows, fat, y);
        const grupos = new Map();
        for (const m of ms) {
            const k = m.niveis.slice(1).join(' · ');
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push({ ...m, rotulo: String(m.niveis[0]) });
        }
        return [...grupos.entries()].map(([k, lista]) => ({ dentro: k, ...tukey(lista, qm, gl, alfa) }));
    }

    // ---------- pressupostos ----------
    function shapiroWilk(x0) {
        let x = x0.filter(Number.isFinite);
        let amostrado = false;
        if (x.length > 5000) { // o algoritmo vale até 5000: usa amostra sistemática
            const passo = x.length / 5000; x = Array.from({ length: 5000 }, (_, i) => x[Math.floor(i * passo)]); amostrado = true;
        }
        x.sort((a, b) => a - b);
        const n = x.length;
        if (n < 3) return { W: NaN, p: NaN, n };
        const m = Array.from({ length: n }, (_, i) => J.normal.inv((i + 1 - 0.375) / (n + 0.25), 0, 1));
        const mm = soma(m.map((v) => v * v));
        const u = 1 / Math.sqrt(n);
        const a = new Array(n).fill(0);
        const cn = m[n - 1] / Math.sqrt(mm);
        const an = cn + 0.221157 * u - 0.147981 * u ** 2 - 2.071190 * u ** 3 + 4.434685 * u ** 4 - 2.706056 * u ** 5;
        if (n > 5) {
            const cn1 = m[n - 2] / Math.sqrt(mm);
            const an1 = cn1 + 0.042981 * u - 0.293762 * u ** 2 - 1.752461 * u ** 3 + 5.682633 * u ** 4 - 3.582633 * u ** 5;
            const phi = (mm - 2 * m[n - 1] ** 2 - 2 * m[n - 2] ** 2) / (1 - 2 * an ** 2 - 2 * an1 ** 2);
            for (let i = 2; i < n - 2; i++) a[i] = m[i] / Math.sqrt(phi);
            a[n - 1] = an; a[0] = -an; a[n - 2] = an1; a[1] = -an1;
        } else {
            const phi = (mm - 2 * m[n - 1] ** 2) / (1 - 2 * an ** 2);
            for (let i = 1; i < n - 1; i++) a[i] = m[i] / Math.sqrt(phi);
            a[n - 1] = an; a[0] = -an;
        }
        const xm = media(x);
        const W = soma(a.map((ai, i) => ai * x[i])) ** 2 / soma(x.map((v) => (v - xm) ** 2));
        let p;
        if (n >= 12) {
            const ln = Math.log(n);
            const mu = 0.0038915 * ln ** 3 - 0.083751 * ln ** 2 - 0.31082 * ln - 1.5861;
            const sg = Math.exp(0.0030302 * ln ** 2 - 0.082676 * ln - 0.4803);
            p = 1 - J.normal.cdf((Math.log(1 - W) - mu) / sg, 0, 1);
        } else if (n >= 4) {
            const g = 0.459 * n - 2.273;
            const mu = 0.5440 - 0.39978 * n + 0.025054 * n ** 2 - 0.0006714 * n ** 3;
            const sg = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n ** 2 - 0.0020322 * n ** 3);
            p = 1 - J.normal.cdf((-Math.log(g - Math.log(1 - W)) - mu) / sg, 0, 1);
        } else p = Math.max(0, Math.min(1, (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75)))));
        return { W, p, n, amostrado };
    }

    /** Levene com centro na mediana (Brown-Forsythe), entre os tratamentos. */
    function levene(rows, fatores, y) {
        const g = agrupar(rows, fatores, y);
        const z = [];
        for (const o of g.values()) { const md = mediana(o.vals); z.push(o.vals.map((v) => Math.abs(v - md))); }
        const todos = z.flat(); const gm = media(todos);
        const k = z.length, N = todos.length;
        let sqe = 0, sqd = 0;
        for (const grp of z) { const m = media(grp); sqe += grp.length * (m - gm) ** 2; for (const v of grp) sqd += (v - m) ** 2; }
        const F = (sqe / (k - 1)) / (sqd / (N - k));
        return { F, gl1: k - 1, gl2: N - k, p: pF(F, k - 1, N - k) };
    }

    const arcoSeno = (pct) => (180 / Math.PI) * Math.asin(Math.sqrt(Math.min(Math.max(pct / 100, 0), 1)));

    // ---------- sigmoide de 3 parâmetros: f = a / (1 + exp(-(x - x0)/b)) ----------
    function sigmoide(xs, ys) {
        const f = (p, x) => p[0] / (1 + Math.exp(-(x - p[2]) / p[1]));
        const ymax = Math.max(...ys), ymin = Math.min(...ys);
        const crescente = ys[ys.length - 1] >= ys[0];
        let p = [ymax * 1.02, crescente ? (xs[xs.length - 1] - xs[0]) / 6 : -(xs[xs.length - 1] - xs[0]) / 6, media(xs)];
        const sse = (pp) => soma(xs.map((x, i) => (ys[i] - f(pp, x)) ** 2));
        let lam = 1e-2, atual = sse(p);
        for (let it = 0; it < 300; it++) {
            const Jm = xs.map((x) => p.map((_, k) => { const h = 1e-6 * Math.max(1, Math.abs(p[k])); const q = p.slice(); q[k] += h; return (f(q, x) - f(p, x)) / h; }));
            const r = xs.map((x, i) => ys[i] - f(p, x));
            const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => soma(Jm.map((row) => row[i] * row[j])) * (i === j ? 1 + lam : 1)));
            const g = [0, 1, 2].map((i) => soma(Jm.map((row, t) => row[i] * r[t])));
            const d = resolver3(A, g);
            if (!d) break;
            const novo = p.map((v, i) => v + d[i]);
            const s = sse(novo);
            if (s < atual) { p = novo; lam /= 3; if (atual - s < 1e-10) { atual = s; break; } atual = s; } else lam *= 4;
        }
        const ym = media(ys);
        const r2 = 1 - atual / soma(ys.map((v) => (v - ym) ** 2));
        return { a: p[0], b: p[1], x0: p[2], r2, f: (x) => f(p, x), ymin };
    }
    function resolver3(A, b) {
        const M = A.map((r, i) => r.concat([b[i]]));
        for (let c = 0; c < 3; c++) {
            let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
            if (Math.abs(M[piv][c]) < 1e-14) return null;
            [M[c], M[piv]] = [M[piv], M[c]];
            for (let r = 0; r < 3; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let t = c; t < 4; t++) M[r][t] -= k * M[c][t]; }
        }
        return M.map((r, i) => r[3] / r[i]);
    }

    /** Intervalo de confiança de cada média de tratamento com o QM do erro (para marcar abaixo do limite). */
    function icMedias(an, alfa = 0.05) {
        const t = J.studentt.inv(1 - alfa / 2, an.erro.gl);
        return [...an.celulas.values()].map((c) => {
            const meia = t * Math.sqrt(an.erro.qm / c.n);
            return { niveis: c.niveis, media: c.media, n: c.n, lo: c.media - meia, hi: c.media + meia, meia };
        });
    }

    return { anova, tukey, desdobrar, mediasMarginais, shapiroWilk, levene, arcoSeno, sigmoide, icMedias, niveisDe, subconjuntos, media, dp, mediana, variancia, pF };
})();

if (typeof module !== 'undefined') module.exports = Estat;
