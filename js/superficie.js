/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Curva do processo de cada dosador (característica estática, "função de transferência" em regime permanente):
 * 1) Superfície contínua por processo gaussiano (GP) ajustado às médias dos tratamentos, com o ruído de cada média
 *    fixado pelo QM do erro da ANOVA (QM/n). Dá a resposta e a incerteza em qualquer ponto dentro da faixa ensaiada,
 *    a sensibilidade à velocidade (∂y/∂V) e a relevância de cada fator (comprimentos de escala).
 * 2) Double/debiased machine learning (DML, Chernozhukov et al., 2018): efeito de cada fator pelo modelo parcialmente
 *    linear com ajuste cruzado, e curva dose-resposta de cada nível por AIPW. Em ensaio fatorial balanceado, a curva do
 *    DML deve reproduzir as médias marginais da ANOVA (serve de conferência); o método é útil em dados de campo.
 */
'use strict';

const Superficie = (() => {
    const F = (typeof Floresta !== 'undefined') ? Floresta : require('./floresta.js');
    const J = (typeof jStat !== 'undefined') ? jStat : require('./vendor/jstat.min.js');
    const media = (a) => a.reduce((s, v) => s + v, 0) / a.length;

    // ---------- álgebra ----------
    function cholesky(A) {
        const n = A.length, L = Array.from({ length: n }, () => new Float64Array(n));
        for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
            let s = A[i][j];
            for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
            if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
        }
        return L;
    }
    const resolverL = (L, b) => { const n = b.length, x = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * x[k]; x[i] = s / L[i][i]; } return x; };
    const resolverLt = (L, b) => { const n = b.length, x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; } return x; };

    function neldermead(f, x0, iter = 200) {
        const n = x0.length;
        let pts = [x0.slice()].concat(x0.map((_, i) => { const p = x0.slice(); p[i] += 0.5; return p; }));
        let val = pts.map(f);
        for (let it = 0; it < iter; it++) {
            const ord = val.map((v, i) => i).sort((a, b) => val[a] - val[b]);
            pts = ord.map((i) => pts[i]); val = ord.map((i) => val[i]);
            if (Math.abs(val[n] - val[0]) < 1e-7) break;
            const c = x0.map((_, j) => media(pts.slice(0, n).map((p) => p[j])));
            const ref = c.map((v, j) => v + (v - pts[n][j])); const fr = f(ref);
            if (fr < val[0]) { const exp = c.map((v, j) => v + 2 * (v - pts[n][j])); const fe = f(exp); if (fe < fr) { pts[n] = exp; val[n] = fe; } else { pts[n] = ref; val[n] = fr; } }
            else if (fr < val[n - 1]) { pts[n] = ref; val[n] = fr; }
            else {
                const con = c.map((v, j) => v + 0.5 * (pts[n][j] - v)); const fc = f(con);
                if (fc < val[n]) { pts[n] = con; val[n] = fc; }
                else for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); val[i] = f(pts[i]); }
            }
        }
        return pts[0];
    }

    // ---------- codificação das entradas ----------
    function preparar(fatores, niveis) {
        return fatores.map((f) => {
            const lv = niveis[f];
            if (lv.every((v) => typeof v === 'number')) { const a = Math.min(...lv), b = Math.max(...lv); return { f, tipo: 'num', a, b: b === a ? a + 1 : b }; }
            return { f, tipo: 'cat', lv };
        });
    }
    function entrada(enc, valores) {
        const x = [];
        enc.forEach((e, i) => {
            const v = valores[i];
            if (e.tipo === 'num') x.push((v - e.a) / (e.b - e.a));
            else if (e.lv.length === 2) x.push(v === e.lv[1] ? 1 : 0);
            else e.lv.forEach((l) => x.push(v === l ? 1 : 0));
        });
        return x;
    }
    function dimensoes(enc) { const d = []; enc.forEach((e, i) => { const n = e.tipo === 'num' || e.lv.length === 2 ? 1 : e.lv.length; for (let k = 0; k < n; k++) d.push(i); }); return d; }

    // ---------- processo gaussiano ----------
    /**
     * Ajusta o GP às médias dos tratamentos.
     * celulas: [{ niveis:[...], media, n }], qmErro: QM do erro da ANOVA (ruído de cada média = qm/n).
     */
    function ajustarGP(celulas, fatores, niveis, qmErro) {
        const enc = preparar(fatores, niveis);
        const dimF = dimensoes(enc);
        const X = celulas.map((c) => entrada(enc, c.niveis));
        const y0 = celulas.map((c) => c.media);
        const mu = media(y0);
        const y = y0.map((v) => v - mu);
        const ruido = celulas.map((c) => qmErro / c.n + 1e-6);
        const D = X[0].length, n = X.length;
        const sd = Math.sqrt(media(y.map((v) => v * v))) || 1;
        const kern = (a, b, sf2, ell) => { let s = 0; for (let d = 0; d < D; d++) { const z = (a[d] - b[d]) / ell[d]; s += z * z; } return sf2 * Math.exp(-0.5 * s); };
        const montar = (th) => {
            const sf2 = Math.exp(2 * th[0]), ell = th.slice(1).map(Math.exp);
            const K = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => kern(X[i], X[j], sf2, ell) + (i === j ? ruido[i] : 0)));
            return { K, sf2, ell };
        };
        const nlml = (th) => {
            if (th.some((v) => Math.abs(v) > 8)) return 1e12;
            const { K } = montar(th);
            const L = cholesky(K); if (!L) return 1e12;
            const a = resolverLt(L, resolverL(L, y));
            let lg = 0; for (let i = 0; i < n; i++) lg += Math.log(L[i][i]);
            return 0.5 * y.reduce((s, v, i) => s + v * a[i], 0) + lg;
        };
        const th = neldermead(nlml, [Math.log(sd)].concat(new Array(D).fill(Math.log(0.4))), 250);
        const { K, sf2, ell } = montar(th);
        const L = cholesky(K);
        const alfa = resolverLt(L, resolverL(L, y));
        // inversa (para o erro de deixar um de fora, fórmula fechada)
        const Kinv = Array.from({ length: n }, (_, j) => { const e = new Float64Array(n); e[j] = 1; return resolverLt(L, resolverL(L, e)); });
        const loo = y.map((v, i) => v - alfa[i] / Kinv[i][i] + mu);
        const ym = media(y0);
        const r2loo = 1 - y0.reduce((s, v, i) => s + (v - loo[i]) ** 2, 0) / y0.reduce((s, v) => s + (v - ym) ** 2, 0);
        const rmseLoo = Math.sqrt(media(y0.map((v, i) => (v - loo[i]) ** 2)));
        /** Média, desvio-padrão e derivada em relação a um fator numérico (por unidade do fator). */
        function prever(valores, comVar = true, derivFator = null) {
            const x = entrada(enc, valores);
            const k = X.map((xi) => kern(x, xi, sf2, ell));
            const m = mu + k.reduce((s, v, i) => s + v * alfa[i], 0);
            let sdv = NaN;
            if (comVar) { const v = resolverL(L, k); sdv = Math.sqrt(Math.max(sf2 - v.reduce((s, z) => s + z * z, 0), 0)); }
            let der = NaN;
            if (derivFator !== null) {
                const iF = fatores.indexOf(derivFator), e = enc[iF], d = dimF.indexOf(iF);
                if (e && e.tipo === 'num') der = k.reduce((s, kv, i) => s + kv * (-(x[d] - X[i][d]) / (ell[d] ** 2)) * alfa[i], 0) / (e.b - e.a);
            }
            return { m, sd: sdv, der };
        }
        const relev = fatores.map((f, i) => { const ds = dimF.map((q, d) => (q === i ? d : -1)).filter((d) => d >= 0); return { fator: f, ell: Math.min(...ds.map((d) => ell[d])), rel: Math.max(...ds.map((d) => 1 / ell[d])) }; });
        const somaRel = relev.reduce((s, r) => s + r.rel, 0);
        relev.forEach((r) => { r.parcela = 100 * r.rel / somaRel; });
        return { prever, enc, sf: Math.sqrt(sf2), relevancia: relev, r2loo, rmseLoo, loo, mu, n };
    }

    /** Grade fina para curvas e mapas: velocidade a cada 0,25 km/h e ângulos a cada 1°. */
    function grade(gp, fatores, niveis, opc = {}) {
        const passo = (f) => (f === 'vel' ? (opc.passoVel || 0.25) : (f === 'long' || f === 'lat' ? 1 : null));
        const eixo = (f) => {
            const lv = niveis[f];
            const p = passo(f);
            if (!p || !lv.every((v) => typeof v === 'number')) return lv;
            const a = Math.min(...lv), b = Math.max(...lv), out = [];
            for (let v = a; v <= b + 1e-9; v += p) out.push(+v.toFixed(4));
            return out;
        };
        return { eixo };
    }

    // ---------- DML ----------
    function kfold(n, k, semente) {
        const idx = Array.from({ length: n }, (_, i) => i), r = F.rng(semente);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        return idx.map((_, p) => p % k).reduce((acc, f, p) => { acc[idx[p]] = f; return acc; }, new Array(n));
    }
    /**
     * DML modelo parcialmente linear: y = θ·d + g(X) + e, d = m(X) + v; θ = Σ ỹ·d̃ / Σ d̃², com ỹ e d̃ residualizados
     * por Random Forest com ajuste cruzado (k grupos). Erro-padrão pelo sanduíche (escore ortogonal de Neyman).
     */
    async function dmlPLR(rows, fatores, niveis, y, fator, opc, pausa) {
        const outros = fatores.filter((f) => f !== fator);
        const cod = F.codificar(rows, outros, niveis);
        const lvF = niveis[fator];
        const dv = rows.map((r) => (lvF.every((v) => typeof v === 'number') ? r[fator] : (r[fator] === lvF[lvF.length - 1] ? 1 : 0)));
        const yv = rows.map((r) => r[y]);
        const fold = kfold(rows.length, opc.folds, 31);
        const yt = new Array(rows.length), dt = new Array(rows.length);
        for (let k = 0; k < opc.folds; k++) {
            const tr = [], te = [];
            fold.forEach((f, i) => (f === k ? te : tr).push(i));
            if (outros.length) {
                const my = F.treinar(tr.map((i) => cod.X[i]), tr.map((i) => yv[i]), { arvores: opc.arvores, minFolha: 5, semente: 100 + k });
                const md = F.treinar(tr.map((i) => cod.X[i]), tr.map((i) => dv[i]), { arvores: opc.arvores, minFolha: 5, semente: 200 + k });
                for (const i of te) { yt[i] = yv[i] - my.prever(cod.X[i]); dt[i] = dv[i] - md.prever(cod.X[i]); }
            } else {
                const my = media(tr.map((i) => yv[i])), md = media(tr.map((i) => dv[i]));
                for (const i of te) { yt[i] = yv[i] - my; dt[i] = dv[i] - md; }
            }
            if (pausa) await pausa();
        }
        const sdd = dt.reduce((s, v) => s + v * v, 0);
        const theta = dt.reduce((s, v, i) => s + v * yt[i], 0) / sdd;
        const n = rows.length;
        const J0 = sdd / n;
        const psi2 = dt.reduce((s, v, i) => s + (v * (yt[i] - theta * v)) ** 2, 0) / n;
        const se = Math.sqrt(psi2 / (J0 * J0) / n);
        const z = theta / se;
        return { fator, theta, se, lo: theta - 1.96 * se, hi: theta + 1.96 * se, p: 2 * (1 - J.normal.cdf(Math.abs(z), 0, 1)), binario: !lvF.every((v) => typeof v === 'number'), niveis: lvF };
    }

    /**
     * Curva dose-resposta por AIPW (escore duplamente robusto) para cada nível de um fator:
     * ψ_v = m̂(v, X) + 1{D = v}·(y − m̂(v, X)) / p̂(v | X), com m̂ por Random Forest em ajuste cruzado e p̂ pela
     * frequência do nível entre as parcelas com os mesmos demais fatores (conhecida no ensaio fatorial).
     */
    async function dmlCurva(rows, fatores, niveis, y, fator, opc, pausa) {
        const cod = F.codificar(rows, fatores, niveis);
        const outros = fatores.filter((f) => f !== fator);
        const chaveX = (r) => outros.map((f) => r[f]).join('|');
        const contX = new Map(), contXD = new Map();
        for (const r of rows) { const k = chaveX(r); contX.set(k, (contX.get(k) || 0) + 1); const kd = k + '§' + r[fator]; contXD.set(kd, (contXD.get(kd) || 0) + 1); }
        const fold = kfold(rows.length, opc.folds, 47);
        const lv = niveis[fator];
        const psi = lv.map(() => new Array(rows.length));
        for (let k = 0; k < opc.folds; k++) {
            const tr = [], te = [];
            fold.forEach((f, i) => (f === k ? te : tr).push(i));
            const m = F.treinar(tr.map((i) => cod.X[i]), tr.map((i) => rows[i][y]), { arvores: opc.arvores, minFolha: 3, semente: 300 + k });
            for (const i of te) {
                const r = rows[i], kx = chaveX(r);
                lv.forEach((v, j) => {
                    const mv = m.prever(cod.linha({ ...r, [fator]: v }));
                    const p = (contXD.get(kx + '§' + v) || 0) / contX.get(kx);
                    psi[j][i] = mv + (r[fator] === v && p > 0 ? (r[y] - mv) / p : 0);
                });
            }
            if (pausa) await pausa();
        }
        return lv.map((v, j) => {
            const m = media(psi[j]), sd = Math.sqrt(psi[j].reduce((s, z) => s + (z - m) ** 2, 0) / (psi[j].length - 1));
            const se = sd / Math.sqrt(psi[j].length);
            return { nivel: v, media: m, se, lo: m - 1.96 * se, hi: m + 1.96 * se };
        });
    }

    return { ajustarGP, grade, dmlPLR, dmlCurva, cholesky, neldermead };
})();

if (typeof module !== 'undefined') module.exports = Superficie;
