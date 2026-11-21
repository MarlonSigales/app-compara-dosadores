/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Random Forest de regressão e SHAP na forma proposta para corrigir a abordagem RF+SHAP:
 * - resposta por parcela (a mesma da ANOVA), nunca o intervalo de cada semente;
 * - cada fator é um "jogador": condução vira uma coluna 0/1 (sem a coluna redundante), ângulos e velocidade
 *   ficam numéricos e o dosador vira colunas one-hot agrupadas;
 * - validação cruzada agrupada por tratamento (o modelo não vê nenhuma repetição do tratamento previsto);
 * - importância por permutação (não por impureza) e SHAP exato intervencional, com interações de pares,
 *   tendo como fundo os tratamentos observados.
 */
'use strict';

const Floresta = (() => {
    function rng(semente) {
        let a = semente >>> 0;
        return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }

    // ---------- árvore de regressão ----------
    function arvore(X, y, idx, minFolha, sorteio, mtry) {
        const p = X[0].length;
        const no = (ids) => {
            let s = 0; for (const i of ids) s += y[i];
            const m = s / ids.length;
            if (ids.length < 2 * minFolha) return { v: m };
            let sse0 = 0; for (const i of ids) sse0 += (y[i] - m) ** 2;
            if (sse0 < 1e-12) return { v: m };
            let melhor = null;
            const feats = sortearFeatures(p, mtry, sorteio);
            for (const f of feats) {
                const ord = ids.slice().sort((a, b) => X[a][f] - X[b][f]);
                let sl = 0, sl2 = 0, st = 0, st2 = 0;
                for (const i of ord) { st += y[i]; st2 += y[i] * y[i]; }
                for (let k = 0; k < ord.length - 1; k++) {
                    const yi = y[ord[k]]; sl += yi; sl2 += yi * yi;
                    const nl = k + 1, nr = ord.length - nl;
                    if (X[ord[k]][f] === X[ord[k + 1]][f] || nl < minFolha || nr < minFolha) continue;
                    const sr = st - sl, sr2 = st2 - sl2;
                    const sse = (sl2 - sl * sl / nl) + (sr2 - sr * sr / nr);
                    if (!melhor || sse < melhor.sse) melhor = { sse, f, t: (X[ord[k]][f] + X[ord[k + 1]][f]) / 2 };
                }
            }
            if (!melhor || melhor.sse >= sse0 - 1e-12) return { v: m };
            const esq = [], dir = [];
            for (const i of ids) (X[i][melhor.f] <= melhor.t ? esq : dir).push(i);
            return { f: melhor.f, t: melhor.t, e: no(esq), d: no(dir) };
        };
        return no(idx);
    }
    function sortearFeatures(p, mtry, sorteio) {
        const todas = Array.from({ length: p }, (_, i) => i);
        if (!mtry || mtry >= p) return todas;
        for (let i = p - 1; i > 0; i--) { const j = Math.floor(sorteio() * (i + 1)); [todas[i], todas[j]] = [todas[j], todas[i]]; }
        return todas.slice(0, mtry);
    }
    function preverArvore(no, x) { while (no.v === undefined) no = x[no.f] <= no.t ? no.e : no.d; return no.v; }

    function treinar(X, y, opc = {}) {
        const nArv = opc.arvores || 200, minFolha = opc.minFolha || 2, sorteio = rng(opc.semente || 1);
        const n = X.length, arvs = [];
        for (let a = 0; a < nArv; a++) {
            const idx = Array.from({ length: n }, () => Math.floor(sorteio() * n));
            arvs.push(arvore(X, y, idx, minFolha, sorteio, opc.mtry));
        }
        return { arvs, prever: (x) => { let s = 0; for (const t of arvs) s += preverArvore(t, x); return s / arvs.length; } };
    }

    const r2 = (y, yh) => { const m = y.reduce((s, v) => s + v, 0) / y.length; let a = 0, b = 0; y.forEach((v, i) => { a += (v - yh[i]) ** 2; b += (v - m) ** 2; }); return 1 - a / b; };

    // ---------- codificação dos fatores ----------
    /** Monta X: cada fator é um jogador; o dosador (categórico com mais de 2 níveis) vira várias colunas. */
    function codificar(rows, fatores, niveis) {
        const jogadores = [];
        let col = 0;
        for (const f of fatores) {
            const lv = niveis[f];
            const numerico = lv.every((v) => typeof v === 'number');
            if (numerico) { jogadores.push({ fator: f, cols: [col], tipo: 'num' }); col++; }
            else if (lv.length === 2) { jogadores.push({ fator: f, cols: [col], tipo: 'bin', um: lv[1] }); col++; }
            else { jogadores.push({ fator: f, cols: lv.map((_, i) => col + i), tipo: 'cat', lv }); col += lv.length; }
        }
        const linha = (r) => {
            const x = new Array(col).fill(0);
            for (const j of jogadores) {
                if (j.tipo === 'num') x[j.cols[0]] = r[j.fator];
                else if (j.tipo === 'bin') x[j.cols[0]] = r[j.fator] === j.um ? 1 : 0;
                else x[j.cols[j.lv.indexOf(r[j.fator])]] = 1;
            }
            return x;
        };
        return { jogadores, X: rows.map(linha), linha };
    }

    /** Validação cruzada agrupada: cada tratamento inteiro vai para um único fold. */
    async function cvAgrupada(rows, fatores, y, cod, opc, k = 10, progresso) {
        const trat = rows.map((r) => fatores.map((f) => r[f]).join('|'));
        const unicos = [...new Set(trat)];
        const sorteio = rng(7);
        for (let i = unicos.length - 1; i > 0; i--) { const j = Math.floor(sorteio() * (i + 1)); [unicos[i], unicos[j]] = [unicos[j], unicos[i]]; }
        const fold = new Map(unicos.map((u, i) => [u, i % k]));
        const pred = new Array(rows.length);
        for (let f = 0; f < k; f++) {
            const tr = [], te = [];
            trat.forEach((t, i) => (fold.get(t) === f ? te : tr).push(i));
            if (!te.length) continue;
            const m = treinar(tr.map((i) => cod.X[i]), tr.map((i) => rows[i][y]), { ...opc, semente: 11 + f });
            for (const i of te) pred[i] = m.prever(cod.X[i]);
            if (progresso) await progresso((f + 1) / k);
        }
        return pred;
    }

    /** Importância por permutação de cada jogador (queda de R²), com as colunas do jogador permutadas juntas. */
    function importanciaPermutacao(modelo, X, y, jogadores, repet = 10) {
        const base = r2(y, X.map(modelo.prever));
        const sorteio = rng(3);
        return jogadores.map((j) => {
            let qd = 0;
            for (let r = 0; r < repet; r++) {
                const perm = Array.from({ length: X.length }, (_, i) => i);
                for (let i = perm.length - 1; i > 0; i--) { const t = Math.floor(sorteio() * (i + 1)); [perm[i], perm[t]] = [perm[t], perm[i]]; }
                const Xp = X.map((x, i) => { const z = x.slice(); for (const c of j.cols) z[c] = X[perm[i]][c]; return z; });
                qd += base - r2(y, Xp.map(modelo.prever));
            }
            return { fator: j.fator, valor: qd / repet };
        });
    }

    const fat = (n) => (n <= 1 ? 1 : n * fat(n - 1));

    /**
     * SHAP exato intervencional: v(S) = média, sobre os tratamentos observados (fundo), da previsão com os
     * jogadores de S fixados no ponto explicado. Como tudo é combinação de níveis, as previsões são memorizadas.
     * Devolve, por tratamento, φ de cada jogador e a matriz de interações (convenção do pacote shap).
     */
    function shap(modelo, cod, tratamentos, fatores) {
        const M = cod.jogadores.length;
        const memo = new Map();
        const prev = (combo) => {
            const k = combo.join('|');
            if (!memo.has(k)) memo.set(k, modelo.prever(cod.linha(Object.fromEntries(fatores.map((f, i) => [f, combo[i]])))));
            return memo.get(k);
        };
        const idxJog = cod.jogadores.map((j) => fatores.indexOf(j.fator));
        const fundo = tratamentos.map((t) => fatores.map((f) => t[f]));
        const subs = 1 << M;
        const base = fundo.reduce((s, b) => s + prev(b), 0) / fundo.length;
        return tratamentos.map((t) => {
            const x = fatores.map((f) => t[f]);
            const v = new Float64Array(subs);
            for (let S = 0; S < subs; S++) {
                let s = 0;
                for (const b of fundo) {
                    const c = b.slice();
                    for (let j = 0; j < M; j++) if (S & (1 << j)) c[idxJog[j]] = x[idxJog[j]];
                    s += prev(c);
                }
                v[S] = s / fundo.length;
            }
            const phi = new Array(M).fill(0);
            const inter = Array.from({ length: M }, () => new Array(M).fill(0));
            const card = (S) => { let c = 0; for (let j = 0; j < M; j++) if (S & (1 << j)) c++; return c; };
            for (let i = 0; i < M; i++) for (let S = 0; S < subs; S++) {
                if (S & (1 << i)) continue;
                const s = card(S);
                phi[i] += (fat(s) * fat(M - s - 1) / fat(M)) * (v[S | (1 << i)] - v[S]);
            }
            if (M >= 2) for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
                let acc = 0;
                for (let S = 0; S < subs; S++) {
                    if (S & (1 << i) || S & (1 << j)) continue;
                    const s = card(S);
                    acc += (fat(s) * fat(M - s - 2) / (2 * fat(M - 1))) * (v[S | (1 << i) | (1 << j)] - v[S | (1 << i)] - v[S | (1 << j)] + v[S]);
                }
                inter[i][j] = inter[j][i] = acc;
            }
            for (let i = 0; i < M; i++) inter[i][i] = phi[i] - inter[i].reduce((s, z, j) => (j === i ? s : s + z), 0);
            return { niveis: x, phi, inter, base, previsao: v[subs - 1] };
        });
    }

    return { treinar, codificar, cvAgrupada, importanciaPermutacao, shap, r2, rng };
})();

if (typeof module !== 'undefined') module.exports = Floresta;
